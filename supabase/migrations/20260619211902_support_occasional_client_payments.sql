-- Permite registrar cobros de clientes ocasionales sin crear un proyecto.
ALTER TABLE public.accounting_client_payments
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(200);

COMMENT ON COLUMN public.accounting_client_payments.client_name IS
  'Nombre libre del cliente cuando el pago no está asociado a un proyecto habitual.';

ALTER TABLE public.accounting_client_payments
  DROP CONSTRAINT IF EXISTS accounting_client_payments_client_required;

ALTER TABLE public.accounting_client_payments
  ADD CONSTRAINT accounting_client_payments_client_required
  CHECK (
    (project_id IS NOT NULL AND client_name IS NULL)
    OR
    (project_id IS NULL AND NULLIF(BTRIM(client_name), '') IS NOT NULL)
  );

-- Mantiene el contrato actual del RPC: project_name representa el nombre visible
-- tanto para proyectos habituales como para clientes ocasionales.
CREATE OR REPLACE FUNCTION public.get_accounting_payments(
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_status VARCHAR DEFAULT NULL,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  project_name VARCHAR,
  project_color VARCHAR,
  account_id UUID,
  account_name VARCHAR,
  account_color VARCHAR,
  month INTEGER,
  year INTEGER,
  amount DECIMAL,
  currency VARCHAR,
  status VARCHAR,
  expected_payment_date DATE,
  payment_date DATE,
  payment_method VARCHAR,
  invoice_number VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ
) AS $get_accounting_payments$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.project_id,
    COALESCE(pr.nombre, p.client_name, 'Cliente')::VARCHAR AS project_name,
    COALESCE(pr.color, '#f59e0b')::VARCHAR AS project_color,
    p.account_id,
    a.name::VARCHAR AS account_name,
    a.color::VARCHAR AS account_color,
    p.month,
    p.year,
    p.amount,
    p.currency::VARCHAR,
    p.status::VARCHAR,
    p.expected_payment_date,
    p.payment_date,
    p.payment_method::VARCHAR,
    p.invoice_number::VARCHAR,
    p.notes,
    p.created_at
  FROM public.accounting_client_payments p
  LEFT JOIN public.sistema_projects pr ON p.project_id = pr.id
  LEFT JOIN public.accounting_accounts a ON p.account_id = a.id
  WHERE
    (p_year IS NULL OR p.year = p_year)
    AND (p_month IS NULL OR p.month = p_month)
    AND (p_project_id IS NULL OR p.project_id = p_project_id)
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_account_id IS NULL OR p.account_id = p_account_id)
  ORDER BY p.year DESC, p.month DESC, p.created_at DESC;
END;
$get_accounting_payments$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_account_movements(
  p_account_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  movement_type VARCHAR,
  movement_id UUID,
  date DATE,
  description TEXT,
  amount DECIMAL,
  is_income BOOLEAN,
  related_entity VARCHAR,
  related_color VARCHAR,
  is_future BOOLEAN
) AS $get_account_movements$
BEGIN
  RETURN QUERY
  SELECT
    'payment'::VARCHAR AS movement_type,
    p.id AS movement_id,
    COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) AS date,
    ('Pago de ' || COALESCE(pr.nombre, p.client_name, 'Cliente'))::TEXT AS description,
    p.amount,
    true AS is_income,
    COALESCE(pr.nombre, p.client_name, 'Cliente')::VARCHAR AS related_entity,
    COALESCE(pr.color, '#f59e0b')::VARCHAR AS related_color,
    false AS is_future
  FROM public.accounting_client_payments p
  LEFT JOIN public.sistema_projects pr ON p.project_id = pr.id
  WHERE p.account_id = p_account_id AND p.status = 'paid'

  UNION ALL

  SELECT
    'expense'::VARCHAR AS movement_type,
    e.id AS movement_id,
    e.date,
    e.description,
    e.amount,
    false AS is_income,
    COALESCE(c.name, 'Sin categoria')::VARCHAR AS related_entity,
    COALESCE(c.color, '#6b7280')::VARCHAR AS related_color,
    e.date > CURRENT_DATE AS is_future
  FROM public.accounting_expenses e
  LEFT JOIN public.accounting_expense_categories c ON e.category_id = c.id
  WHERE e.account_id = p_account_id

  UNION ALL

  SELECT
    'transfer_in'::VARCHAR AS movement_type,
    t.id AS movement_id,
    t.date,
    ('Transferencia desde ' || COALESCE(fa.name, 'otra cuenta'))::TEXT AS description,
    public.accounting_transfer_received_amount(t.amount, t.exchange_rate, t.commission, t.tax, ta.currency) AS amount,
    true AS is_income,
    COALESCE(fa.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(fa.color, '#6366f1')::VARCHAR AS related_color,
    false AS is_future
  FROM public.accounting_transfers t
  LEFT JOIN public.accounting_accounts fa ON t.from_account_id = fa.id
  LEFT JOIN public.accounting_accounts ta ON t.to_account_id = ta.id
  WHERE t.to_account_id = p_account_id

  UNION ALL

  SELECT
    'transfer_out'::VARCHAR AS movement_type,
    t.id AS movement_id,
    t.date,
    ('Transferencia a ' || COALESCE(ta.name, 'otra cuenta'))::TEXT AS description,
    t.amount,
    false AS is_income,
    COALESCE(ta.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(ta.color, '#6366f1')::VARCHAR AS related_color,
    false AS is_future
  FROM public.accounting_transfers t
  LEFT JOIN public.accounting_accounts ta ON t.to_account_id = ta.id
  WHERE t.from_account_id = p_account_id

  ORDER BY date DESC
  LIMIT p_limit;
END;
$get_account_movements$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_unified_history(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_movement_type VARCHAR DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  movement_type VARCHAR,
  date DATE,
  description TEXT,
  amount DECIMAL,
  currency VARCHAR,
  is_income BOOLEAN,
  account_id UUID,
  account_name VARCHAR,
  account_color VARCHAR,
  related_entity VARCHAR,
  related_color VARCHAR,
  category VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ
) AS $get_unified_history$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    'payment'::VARCHAR AS movement_type,
    COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) AS date,
    ('Pago de ' || COALESCE(pr.nombre, p.client_name, 'Cliente') || ' - ' || TO_CHAR(MAKE_DATE(p.year, p.month, 1), 'Month YYYY'))::TEXT AS description,
    p.amount,
    p.currency::VARCHAR,
    true AS is_income,
    p.account_id,
    a.name::VARCHAR AS account_name,
    a.color::VARCHAR AS account_color,
    COALESCE(pr.nombre, p.client_name, 'Cliente')::VARCHAR AS related_entity,
    COALESCE(pr.color, '#f59e0b')::VARCHAR AS related_color,
    'Pago de cliente'::VARCHAR AS category,
    p.notes,
    p.created_at
  FROM public.accounting_client_payments p
  LEFT JOIN public.sistema_projects pr ON p.project_id = pr.id
  LEFT JOIN public.accounting_accounts a ON p.account_id = a.id
  WHERE p.status = 'paid'
    AND (p_start_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) <= p_end_date)
    AND (p_account_id IS NULL OR p.account_id = p_account_id)
    AND (p_movement_type IS NULL OR p_movement_type = 'payment')

  UNION ALL

  SELECT
    e.id,
    'expense'::VARCHAR AS movement_type,
    e.date,
    e.description::TEXT,
    e.amount,
    e.currency::VARCHAR,
    false AS is_income,
    e.account_id,
    a.name::VARCHAR AS account_name,
    a.color::VARCHAR AS account_color,
    COALESCE(c.name, 'Sin categoria')::VARCHAR AS related_entity,
    COALESCE(c.color, '#6b7280')::VARCHAR AS related_color,
    COALESCE(c.name, 'Gasto')::VARCHAR AS category,
    e.notes,
    e.created_at
  FROM public.accounting_expenses e
  LEFT JOIN public.accounting_expense_categories c ON e.category_id = c.id
  LEFT JOIN public.accounting_accounts a ON e.account_id = a.id
  WHERE (p_start_date IS NULL OR e.date >= p_start_date)
    AND (p_end_date IS NULL OR e.date <= p_end_date)
    AND (p_account_id IS NULL OR e.account_id = p_account_id)
    AND (p_movement_type IS NULL OR p_movement_type = 'expense')

  UNION ALL

  SELECT
    t.id,
    'transfer_out'::VARCHAR AS movement_type,
    t.date,
    ('Transferencia a ' || COALESCE(ta.name, 'otra cuenta'))::TEXT AS description,
    t.amount,
    t.currency::VARCHAR,
    false AS is_income,
    t.from_account_id AS account_id,
    fa.name::VARCHAR AS account_name,
    fa.color::VARCHAR AS account_color,
    COALESCE(ta.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(ta.color, '#6366f1')::VARCHAR AS related_color,
    'Transferencia'::VARCHAR AS category,
    t.notes,
    t.created_at
  FROM public.accounting_transfers t
  LEFT JOIN public.accounting_accounts fa ON t.from_account_id = fa.id
  LEFT JOIN public.accounting_accounts ta ON t.to_account_id = ta.id
  WHERE (p_start_date IS NULL OR t.date >= p_start_date)
    AND (p_end_date IS NULL OR t.date <= p_end_date)
    AND (p_account_id IS NULL OR t.from_account_id = p_account_id)
    AND (p_movement_type IS NULL OR p_movement_type = 'transfer')

  UNION ALL

  SELECT
    t.id,
    'transfer_in'::VARCHAR AS movement_type,
    t.date,
    ('Transferencia desde ' || COALESCE(fa.name, 'otra cuenta'))::TEXT AS description,
    public.accounting_transfer_received_amount(t.amount, t.exchange_rate, t.commission, t.tax, ta.currency) AS amount,
    ta.currency::VARCHAR,
    true AS is_income,
    t.to_account_id AS account_id,
    ta.name::VARCHAR AS account_name,
    ta.color::VARCHAR AS account_color,
    COALESCE(fa.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(fa.color, '#6366f1')::VARCHAR AS related_color,
    'Transferencia'::VARCHAR AS category,
    t.notes,
    t.created_at
  FROM public.accounting_transfers t
  LEFT JOIN public.accounting_accounts fa ON t.from_account_id = fa.id
  LEFT JOIN public.accounting_accounts ta ON t.to_account_id = ta.id
  WHERE (p_start_date IS NULL OR t.date >= p_start_date)
    AND (p_end_date IS NULL OR t.date <= p_end_date)
    AND (p_account_id IS NULL OR t.to_account_id = p_account_id)
    AND (p_movement_type IS NULL OR p_movement_type = 'transfer')

  UNION ALL

  SELECT
    adj.id,
    'adjustment'::VARCHAR AS movement_type,
    adj.date,
    ('Ajuste de balance: ' || COALESCE(adj.reason, 'Arqueo de caja'))::TEXT AS description,
    ABS(adj.adjustment_amount) AS amount,
    a.currency::VARCHAR,
    adj.adjustment_amount >= 0 AS is_income,
    adj.account_id,
    a.name::VARCHAR AS account_name,
    a.color::VARCHAR AS account_color,
    'Arqueo'::VARCHAR AS related_entity,
    '#3b82f6'::VARCHAR AS related_color,
    'Ajuste de balance'::VARCHAR AS category,
    adj.notes,
    adj.created_at
  FROM public.accounting_balance_adjustments adj
  LEFT JOIN public.accounting_accounts a ON adj.account_id = a.id
  WHERE (p_start_date IS NULL OR adj.date >= p_start_date)
    AND (p_end_date IS NULL OR adj.date <= p_end_date)
    AND (p_account_id IS NULL OR adj.account_id = p_account_id)
    AND (p_movement_type IS NULL OR p_movement_type = 'adjustment')

  UNION ALL

  SELECT
    c.id,
    'contribution'::VARCHAR AS movement_type,
    c.date,
    ('Aporte de socio: ' || c.partner_name)::TEXT AS description,
    c.amount,
    c.currency::VARCHAR,
    true AS is_income,
    c.account_id,
    a.name::VARCHAR AS account_name,
    a.color::VARCHAR AS account_color,
    c.partner_name::VARCHAR AS related_entity,
    '#06b6d4'::VARCHAR AS related_color,
    'Aporte de socio'::VARCHAR AS category,
    c.notes,
    c.created_at
  FROM public.accounting_partner_contributions c
  LEFT JOIN public.accounting_accounts a ON c.account_id = a.id
  WHERE (p_start_date IS NULL OR c.date >= p_start_date)
    AND (p_end_date IS NULL OR c.date <= p_end_date)
    AND (p_account_id IS NULL OR c.account_id = p_account_id)
    AND (p_movement_type IS NULL OR p_movement_type = 'contribution')

  UNION ALL

  SELECT
    r.id,
    'repayment'::VARCHAR AS movement_type,
    r.date,
    ('Devolucion a ' || c.partner_name)::TEXT AS description,
    r.amount,
    c.currency::VARCHAR,
    false AS is_income,
    r.account_id,
    a.name::VARCHAR AS account_name,
    a.color::VARCHAR AS account_color,
    c.partner_name::VARCHAR AS related_entity,
    '#10b981'::VARCHAR AS related_color,
    'Devolucion de aporte'::VARCHAR AS category,
    r.notes,
    r.created_at
  FROM public.accounting_contribution_repayments r
  JOIN public.accounting_partner_contributions c ON r.contribution_id = c.id
  LEFT JOIN public.accounting_accounts a ON r.account_id = a.id
  WHERE (p_start_date IS NULL OR r.date >= p_start_date)
    AND (p_end_date IS NULL OR r.date <= p_end_date)
    AND (p_account_id IS NULL OR r.account_id = p_account_id)
    AND (p_movement_type IS NULL OR p_movement_type = 'repayment')

  ORDER BY date DESC, created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$get_unified_history$ LANGUAGE plpgsql SECURITY DEFINER;
