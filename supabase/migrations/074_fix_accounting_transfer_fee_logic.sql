-- =====================================================
-- FIX: logica de comisiones/impuestos en transferencias
-- =====================================================
-- Convencion:
-- - accounting_transfers.amount es el monto que sale de la cuenta origen.
-- - commission/tax reducen lo que recibe la cuenta destino.
-- - El patrimonio baja una sola vez por commission + tax.

CREATE OR REPLACE FUNCTION accounting_transfer_received_amount(
  p_amount DECIMAL,
  p_exchange_rate DECIMAL,
  p_commission DECIMAL,
  p_tax DECIMAL,
  p_target_currency VARCHAR
)
RETURNS DECIMAL AS $accounting_transfer_received_amount$
  SELECT
    CASE
      WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN
        CASE
          WHEN p_target_currency = 'USD' THEN
            GREATEST(0, COALESCE(p_amount, 0) - COALESCE(p_commission, 0) - COALESCE(p_tax, 0)) / p_exchange_rate
          ELSE
            GREATEST(0, COALESCE(p_amount, 0) - COALESCE(p_commission, 0) - COALESCE(p_tax, 0)) * p_exchange_rate
        END
      ELSE
        GREATEST(0, COALESCE(p_amount, 0) - COALESCE(p_commission, 0) - COALESCE(p_tax, 0))
    END;
$accounting_transfer_received_amount$ LANGUAGE SQL IMMUTABLE;

DROP FUNCTION IF EXISTS get_accounting_accounts();

CREATE OR REPLACE FUNCTION get_accounting_accounts()
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  type VARCHAR,
  currency VARCHAR,
  initial_balance DECIMAL,
  current_balance DECIMAL,
  icon VARCHAR,
  color VARCHAR,
  is_default BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  month_income DECIMAL,
  month_expenses DECIMAL,
  month_transfers_in DECIMAL,
  month_transfers_out DECIMAL,
  year_transfers_in DECIMAL,
  year_transfers_out DECIMAL,
  year_adjustments DECIMAL
) AS $get_accounting_accounts$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name::VARCHAR,
    a.type::VARCHAR,
    a.currency::VARCHAR,
    a.initial_balance,
    COALESCE(a.initial_balance, 0) +
    COALESCE((SELECT SUM(p.amount) FROM accounting_client_payments p WHERE p.account_id = a.id AND p.status = 'paid'), 0) -
    COALESCE((SELECT SUM(e.amount) FROM accounting_expenses e WHERE e.account_id = a.id AND e.date <= CURRENT_DATE), 0) +
    COALESCE((
      SELECT SUM(accounting_transfer_received_amount(t.amount, t.exchange_rate, t.commission, t.tax, a.currency))
      FROM accounting_transfers t
      WHERE t.to_account_id = a.id
    ), 0) -
    COALESCE((SELECT SUM(t.amount) FROM accounting_transfers t WHERE t.from_account_id = a.id), 0) +
    COALESCE((SELECT SUM(adj.adjustment_amount) FROM accounting_balance_adjustments adj WHERE adj.account_id = a.id), 0) +
    COALESCE((SELECT SUM(c.amount) FROM accounting_partner_contributions c WHERE c.account_id = a.id), 0) -
    COALESCE((SELECT SUM(r.amount) FROM accounting_contribution_repayments r WHERE r.account_id = a.id), 0) AS current_balance,
    a.icon::VARCHAR,
    a.color::VARCHAR,
    a.is_default,
    a.is_active,
    a.created_at,
    COALESCE((
      SELECT SUM(p.amount) FROM accounting_client_payments p
      WHERE p.account_id = a.id AND p.status = 'paid'
      AND EXTRACT(MONTH FROM COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1))) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1))) = EXTRACT(YEAR FROM NOW())
    ), 0) +
    COALESCE((
      SELECT SUM(c.amount) FROM accounting_partner_contributions c
      WHERE c.account_id = a.id
      AND EXTRACT(MONTH FROM c.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM c.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_income,
    COALESCE((
      SELECT SUM(e.amount) FROM accounting_expenses e
      WHERE e.account_id = a.id
      AND e.date <= CURRENT_DATE
      AND EXTRACT(MONTH FROM e.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM e.date) = EXTRACT(YEAR FROM NOW())
    ), 0) +
    COALESCE((
      SELECT SUM(r.amount) FROM accounting_contribution_repayments r
      WHERE r.account_id = a.id
      AND EXTRACT(MONTH FROM r.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM r.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_expenses,
    COALESCE((
      SELECT SUM(accounting_transfer_received_amount(t.amount, t.exchange_rate, t.commission, t.tax, a.currency))
      FROM accounting_transfers t
      WHERE t.to_account_id = a.id
      AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_transfers_in,
    COALESCE((
      SELECT SUM(t.amount) FROM accounting_transfers t
      WHERE t.from_account_id = a.id
      AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_transfers_out,
    COALESCE((
      SELECT SUM(accounting_transfer_received_amount(t.amount, t.exchange_rate, t.commission, t.tax, a.currency))
      FROM accounting_transfers t
      WHERE t.to_account_id = a.id
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS year_transfers_in,
    COALESCE((
      SELECT SUM(t.amount) FROM accounting_transfers t
      WHERE t.from_account_id = a.id
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS year_transfers_out,
    COALESCE((
      SELECT SUM(adj.adjustment_amount) FROM accounting_balance_adjustments adj
      WHERE adj.account_id = a.id
      AND EXTRACT(YEAR FROM adj.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS year_adjustments
  FROM accounting_accounts a
  WHERE a.is_active = true
  ORDER BY a.is_default DESC, a.name ASC;
END;
$get_accounting_accounts$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_account_movements(UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_account_movements(
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
    ('Pago de ' || COALESCE(pr.nombre, 'Cliente'))::TEXT AS description,
    p.amount,
    true AS is_income,
    COALESCE(pr.nombre, 'Cliente')::VARCHAR AS related_entity,
    COALESCE(pr.color, '#6366f1')::VARCHAR AS related_color,
    false AS is_future
  FROM accounting_client_payments p
  LEFT JOIN sistema_projects pr ON p.project_id = pr.id
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
  FROM accounting_expenses e
  LEFT JOIN accounting_expense_categories c ON e.category_id = c.id
  WHERE e.account_id = p_account_id

  UNION ALL

  SELECT
    'transfer_in'::VARCHAR AS movement_type,
    t.id AS movement_id,
    t.date,
    ('Transferencia desde ' || COALESCE(fa.name, 'otra cuenta'))::TEXT AS description,
    accounting_transfer_received_amount(t.amount, t.exchange_rate, t.commission, t.tax, ta.currency) AS amount,
    true AS is_income,
    COALESCE(fa.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(fa.color, '#6366f1')::VARCHAR AS related_color,
    false AS is_future
  FROM accounting_transfers t
  LEFT JOIN accounting_accounts fa ON t.from_account_id = fa.id
  LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
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
  FROM accounting_transfers t
  LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
  WHERE t.from_account_id = p_account_id

  ORDER BY date DESC
  LIMIT p_limit;
END;
$get_account_movements$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_unified_history(DATE, DATE, UUID, VARCHAR, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_unified_history(
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
        ('Pago de ' || COALESCE(pr.nombre, 'Cliente') || ' - ' || TO_CHAR(MAKE_DATE(p.year, p.month, 1), 'Month YYYY'))::TEXT AS description,
        p.amount,
        p.currency::VARCHAR,
        true AS is_income,
        p.account_id,
        a.name::VARCHAR AS account_name,
        a.color::VARCHAR AS account_color,
        COALESCE(pr.nombre, 'Cliente')::VARCHAR AS related_entity,
        COALESCE(pr.color, '#6366f1')::VARCHAR AS related_color,
        'Pago de cliente'::VARCHAR AS category,
        p.notes,
        p.created_at
    FROM accounting_client_payments p
    LEFT JOIN sistema_projects pr ON p.project_id = pr.id
    LEFT JOIN accounting_accounts a ON p.account_id = a.id
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
    FROM accounting_expenses e
    LEFT JOIN accounting_expense_categories c ON e.category_id = c.id
    LEFT JOIN accounting_accounts a ON e.account_id = a.id
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
    FROM accounting_transfers t
    LEFT JOIN accounting_accounts fa ON t.from_account_id = fa.id
    LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
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
        accounting_transfer_received_amount(t.amount, t.exchange_rate, t.commission, t.tax, ta.currency) AS amount,
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
    FROM accounting_transfers t
    LEFT JOIN accounting_accounts fa ON t.from_account_id = fa.id
    LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
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
    FROM accounting_balance_adjustments adj
    LEFT JOIN accounting_accounts a ON adj.account_id = a.id
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
    FROM accounting_partner_contributions c
    LEFT JOIN accounting_accounts a ON c.account_id = a.id
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
    FROM accounting_contribution_repayments r
    JOIN accounting_partner_contributions c ON r.contribution_id = c.id
    LEFT JOIN accounting_accounts a ON r.account_id = a.id
    WHERE (p_start_date IS NULL OR r.date >= p_start_date)
        AND (p_end_date IS NULL OR r.date <= p_end_date)
        AND (p_account_id IS NULL OR r.account_id = p_account_id)
        AND (p_movement_type IS NULL OR p_movement_type = 'repayment')

    ORDER BY date DESC, created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$get_unified_history$ LANGUAGE plpgsql SECURITY DEFINER;
