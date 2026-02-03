-- =====================================================
-- MÓDULO DE CONTABILIDAD - CUENTAS Y MEJORAS
-- Migración: 038_accounting_accounts.sql
-- =====================================================

-- =====================================================
-- TABLA: Cuentas/Reservas de dinero
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) DEFAULT 'bank' CHECK (type IN ('digital_wallet', 'bank', 'cash', 'international')),
  currency VARCHAR(3) DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  initial_balance DECIMAL(12,2) DEFAULT 0,
  icon VARCHAR(50) DEFAULT 'wallet',
  color VARCHAR(7) DEFAULT '#6366f1',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cuentas por defecto
INSERT INTO accounting_accounts (name, type, currency, icon, color, is_default) VALUES
  ('Mercado Pago', 'digital_wallet', 'ARS', 'smartphone', '#00bcff', true),
  ('Cuenta Bancaria', 'bank', 'ARS', 'building', '#10b981', false),
  ('Caja Chica', 'cash', 'ARS', 'banknote', '#f59e0b', false),
  ('PayPal/Wise', 'international', 'USD', 'globe', '#3b82f6', false)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TABLA: Subcategorías de gastos
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_expense_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES accounting_expense_categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, name)
);

-- Subcategorías por defecto
INSERT INTO accounting_expense_subcategories (category_id, name)
SELECT c.id, s.name
FROM accounting_expense_categories c
CROSS JOIN (VALUES
  ('Software', 'Herramientas de diseño'),
  ('Software', 'Hosting y servidores'),
  ('Software', 'APIs y servicios'),
  ('Software', 'Suscripciones'),
  ('Marketing', 'Publicidad pagada'),
  ('Marketing', 'Sponsorships'),
  ('Marketing', 'Eventos'),
  ('Marketing', 'Material promocional'),
  ('Oficina', 'Insumos'),
  ('Oficina', 'Equipamiento'),
  ('Oficina', 'Servicios'),
  ('Sueldos', 'Freelancers'),
  ('Sueldos', 'Empleados'),
  ('Sueldos', 'Bonos'),
  ('Impuestos', 'Monotributo'),
  ('Impuestos', 'Ganancias'),
  ('Impuestos', 'IVA'),
  ('Servicios', 'Luz'),
  ('Servicios', 'Internet'),
  ('Servicios', 'Teléfono')
) AS s(category_name, name)
WHERE c.name = s.category_name
ON CONFLICT DO NOTHING;

-- =====================================================
-- TABLA: Transferencias entre cuentas
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  exchange_rate DECIMAL(10,4),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES sistema_users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_transfers_from ON accounting_transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON accounting_transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_date ON accounting_transfers(date);

-- =====================================================
-- MODIFICAR TABLAS EXISTENTES: Agregar account_id
-- =====================================================

-- Agregar account_id a pagos de clientes
ALTER TABLE accounting_client_payments 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL;

-- Agregar account_id y subcategory_id a gastos
ALTER TABLE accounting_expenses 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL;

ALTER TABLE accounting_expenses 
ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES accounting_expense_subcategories(id) ON DELETE SET NULL;

-- Índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS idx_payments_account ON accounting_client_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account ON accounting_expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_subcategory ON accounting_expenses(subcategory_id);

-- =====================================================
-- TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS trigger_accounts_updated_at ON accounting_accounts;
CREATE TRIGGER trigger_accounts_updated_at
  BEFORE UPDATE ON accounting_accounts
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- =====================================================
-- RPC: Obtener cuentas con balance calculado
-- =====================================================
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
  month_transfers_out DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name::VARCHAR,
    a.type::VARCHAR,
    a.currency::VARCHAR,
    a.initial_balance,
    -- Balance actual = inicial + ingresos - gastos + transferencias entrantes - transferencias salientes
    COALESCE(a.initial_balance, 0) +
    COALESCE((SELECT SUM(p.amount) FROM accounting_client_payments p WHERE p.account_id = a.id AND p.status = 'paid'), 0) -
    COALESCE((SELECT SUM(e.amount) FROM accounting_expenses e WHERE e.account_id = a.id), 0) +
    COALESCE((SELECT SUM(t.amount) FROM accounting_transfers t WHERE t.to_account_id = a.id), 0) -
    COALESCE((SELECT SUM(t.amount) FROM accounting_transfers t WHERE t.from_account_id = a.id), 0) AS current_balance,
    a.icon::VARCHAR,
    a.color::VARCHAR,
    a.is_default,
    a.is_active,
    a.created_at,
    -- Ingresos del mes actual
    COALESCE((
      SELECT SUM(p.amount) FROM accounting_client_payments p 
      WHERE p.account_id = a.id AND p.status = 'paid' 
      AND EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM p.payment_date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_income,
    -- Gastos del mes actual
    COALESCE((
      SELECT SUM(e.amount) FROM accounting_expenses e 
      WHERE e.account_id = a.id 
      AND EXTRACT(MONTH FROM e.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM e.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_expenses,
    -- Transferencias entrantes del mes
    COALESCE((
      SELECT SUM(t.amount) FROM accounting_transfers t 
      WHERE t.to_account_id = a.id 
      AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_transfers_in,
    -- Transferencias salientes del mes
    COALESCE((
      SELECT SUM(t.amount) FROM accounting_transfers t 
      WHERE t.from_account_id = a.id 
      AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_transfers_out
  FROM accounting_accounts a
  WHERE a.is_active = true
  ORDER BY a.is_default DESC, a.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: Obtener subcategorías
-- =====================================================
CREATE OR REPLACE FUNCTION get_expense_subcategories(p_category_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  category_id UUID,
  category_name VARCHAR,
  name VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.category_id,
    c.name::VARCHAR AS category_name,
    s.name::VARCHAR,
    s.created_at
  FROM accounting_expense_subcategories s
  LEFT JOIN accounting_expense_categories c ON s.category_id = c.id
  WHERE (p_category_id IS NULL OR s.category_id = p_category_id)
  ORDER BY c.name, s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: Obtener transferencias
-- =====================================================
CREATE OR REPLACE FUNCTION get_accounting_transfers(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  from_account_id UUID,
  from_account_name VARCHAR,
  from_account_color VARCHAR,
  to_account_id UUID,
  to_account_name VARCHAR,
  to_account_color VARCHAR,
  amount DECIMAL,
  currency VARCHAR,
  exchange_rate DECIMAL,
  date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.from_account_id,
    fa.name::VARCHAR AS from_account_name,
    fa.color::VARCHAR AS from_account_color,
    t.to_account_id,
    ta.name::VARCHAR AS to_account_name,
    ta.color::VARCHAR AS to_account_color,
    t.amount,
    t.currency::VARCHAR,
    t.exchange_rate,
    t.date,
    t.notes,
    t.created_at
  FROM accounting_transfers t
  LEFT JOIN accounting_accounts fa ON t.from_account_id = fa.id
  LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
  WHERE 
    (p_start_date IS NULL OR t.date >= p_start_date)
    AND (p_end_date IS NULL OR t.date <= p_end_date)
    AND (p_account_id IS NULL OR t.from_account_id = p_account_id OR t.to_account_id = p_account_id)
  ORDER BY t.date DESC, t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: Obtener movimientos de una cuenta
-- =====================================================
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
  related_color VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  -- Pagos recibidos
  SELECT 
    'payment'::VARCHAR AS movement_type,
    p.id AS movement_id,
    COALESCE(p.payment_date, MAKE_DATE(p.year, p.month, 1)) AS date,
    ('Pago de ' || COALESCE(pr.nombre, 'Cliente'))::TEXT AS description,
    p.amount,
    true AS is_income,
    COALESCE(pr.nombre, 'Cliente')::VARCHAR AS related_entity,
    COALESCE(pr.color, '#6366f1')::VARCHAR AS related_color
  FROM accounting_client_payments p
  LEFT JOIN sistema_projects pr ON p.project_id = pr.id
  WHERE p.account_id = p_account_id AND p.status = 'paid'
  
  UNION ALL
  
  -- Gastos
  SELECT 
    'expense'::VARCHAR AS movement_type,
    e.id AS movement_id,
    e.date,
    e.description,
    e.amount,
    false AS is_income,
    COALESCE(c.name, 'Sin categoría')::VARCHAR AS related_entity,
    COALESCE(c.color, '#6b7280')::VARCHAR AS related_color
  FROM accounting_expenses e
  LEFT JOIN accounting_expense_categories c ON e.category_id = c.id
  WHERE e.account_id = p_account_id
  
  UNION ALL
  
  -- Transferencias entrantes
  SELECT 
    'transfer_in'::VARCHAR AS movement_type,
    t.id AS movement_id,
    t.date,
    ('Transferencia desde ' || COALESCE(fa.name, 'otra cuenta'))::TEXT AS description,
    t.amount,
    true AS is_income,
    COALESCE(fa.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(fa.color, '#6366f1')::VARCHAR AS related_color
  FROM accounting_transfers t
  LEFT JOIN accounting_accounts fa ON t.from_account_id = fa.id
  WHERE t.to_account_id = p_account_id
  
  UNION ALL
  
  -- Transferencias salientes
  SELECT 
    'transfer_out'::VARCHAR AS movement_type,
    t.id AS movement_id,
    t.date,
    ('Transferencia a ' || COALESCE(ta.name, 'otra cuenta'))::TEXT AS description,
    t.amount,
    false AS is_income,
    COALESCE(ta.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(ta.color, '#6366f1')::VARCHAR AS related_color
  FROM accounting_transfers t
  LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
  WHERE t.from_account_id = p_account_id
  
  ORDER BY date DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: Obtener datos para gráficos mensuales
-- =====================================================
CREATE OR REPLACE FUNCTION get_accounting_monthly_chart(
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TABLE (
  month INTEGER,
  month_name VARCHAR,
  total_income DECIMAL,
  total_expenses DECIMAL,
  balance DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(1, 12) AS m
  ),
  income_data AS (
    SELECT 
      p.month AS m,
      SUM(p.amount) AS total
    FROM accounting_client_payments p
    WHERE p.year = p_year AND p.status = 'paid'
    GROUP BY p.month
  ),
  expense_data AS (
    SELECT 
      EXTRACT(MONTH FROM e.date)::INTEGER AS m,
      SUM(e.amount) AS total
    FROM accounting_expenses e
    WHERE EXTRACT(YEAR FROM e.date) = p_year
    GROUP BY EXTRACT(MONTH FROM e.date)
  )
  SELECT 
    months.m AS month,
    TO_CHAR(MAKE_DATE(p_year, months.m, 1), 'Mon')::VARCHAR AS month_name,
    COALESCE(i.total, 0) AS total_income,
    COALESCE(e.total, 0) AS total_expenses,
    COALESCE(i.total, 0) - COALESCE(e.total, 0) AS balance
  FROM months
  LEFT JOIN income_data i ON months.m = i.m
  LEFT JOIN expense_data e ON months.m = e.m
  ORDER BY months.m;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: Obtener distribución de gastos por categoría
-- =====================================================
CREATE OR REPLACE FUNCTION get_expense_distribution(
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  p_month INTEGER DEFAULT NULL
)
RETURNS TABLE (
  category_id UUID,
  category_name VARCHAR,
  category_color VARCHAR,
  total_amount DECIMAL,
  percentage DECIMAL,
  expense_count BIGINT
) AS $$
DECLARE
  total_sum DECIMAL;
BEGIN
  -- Calcular total primero
  SELECT COALESCE(SUM(e.amount), 0) INTO total_sum
  FROM accounting_expenses e
  WHERE EXTRACT(YEAR FROM e.date) = p_year
    AND (p_month IS NULL OR EXTRACT(MONTH FROM e.date) = p_month);

  RETURN QUERY
  SELECT 
    c.id AS category_id,
    c.name::VARCHAR AS category_name,
    c.color::VARCHAR AS category_color,
    COALESCE(SUM(e.amount), 0) AS total_amount,
    CASE WHEN total_sum > 0 
      THEN ROUND((COALESCE(SUM(e.amount), 0) / total_sum * 100)::NUMERIC, 1)
      ELSE 0 
    END AS percentage,
    COUNT(e.id) AS expense_count
  FROM accounting_expense_categories c
  LEFT JOIN accounting_expenses e ON c.id = e.category_id
    AND EXTRACT(YEAR FROM e.date) = p_year
    AND (p_month IS NULL OR EXTRACT(MONTH FROM e.date) = p_month)
  GROUP BY c.id, c.name, c.color
  HAVING COALESCE(SUM(e.amount), 0) > 0
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ACTUALIZAR RPC: get_accounting_expenses con subcategoría
-- =====================================================
DROP FUNCTION IF EXISTS get_accounting_expenses(DATE, DATE, UUID);

CREATE OR REPLACE FUNCTION get_accounting_expenses(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  date DATE,
  category_id UUID,
  category_name VARCHAR,
  category_color VARCHAR,
  subcategory_id UUID,
  subcategory_name VARCHAR,
  account_id UUID,
  account_name VARCHAR,
  account_color VARCHAR,
  description TEXT,
  amount DECIMAL,
  currency VARCHAR,
  provider VARCHAR,
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.date,
    e.category_id,
    c.name::VARCHAR AS category_name,
    c.color::VARCHAR AS category_color,
    e.subcategory_id,
    s.name::VARCHAR AS subcategory_name,
    e.account_id,
    a.name::VARCHAR AS account_name,
    a.color::VARCHAR AS account_color,
    e.description,
    e.amount,
    e.currency::VARCHAR,
    e.provider::VARCHAR,
    e.receipt_url,
    e.notes,
    e.created_at
  FROM accounting_expenses e
  LEFT JOIN accounting_expense_categories c ON e.category_id = c.id
  LEFT JOIN accounting_expense_subcategories s ON e.subcategory_id = s.id
  LEFT JOIN accounting_accounts a ON e.account_id = a.id
  WHERE 
    (p_start_date IS NULL OR e.date >= p_start_date)
    AND (p_end_date IS NULL OR e.date <= p_end_date)
    AND (p_category_id IS NULL OR e.category_id = p_category_id)
    AND (p_account_id IS NULL OR e.account_id = p_account_id)
  ORDER BY e.date DESC, e.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ACTUALIZAR RPC: get_accounting_payments con cuenta
-- =====================================================
DROP FUNCTION IF EXISTS get_accounting_payments(INTEGER, INTEGER, UUID, VARCHAR);

CREATE OR REPLACE FUNCTION get_accounting_payments(
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
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.project_id,
    pr.nombre::VARCHAR AS project_name,
    pr.color::VARCHAR AS project_color,
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
  FROM accounting_client_payments p
  LEFT JOIN sistema_projects pr ON p.project_id = pr.id
  LEFT JOIN accounting_accounts a ON p.account_id = a.id
  WHERE 
    (p_year IS NULL OR p.year = p_year)
    AND (p_month IS NULL OR p.month = p_month)
    AND (p_project_id IS NULL OR p.project_id = p_project_id)
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_account_id IS NULL OR p.account_id = p_account_id)
  ORDER BY p.year DESC, p.month DESC, p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Habilitar RLS en nuevas tablas
ALTER TABLE accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_expense_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transfers ENABLE ROW LEVEL SECURITY;

-- Políticas para accounts
DROP POLICY IF EXISTS "Allow authenticated read accounts" ON accounting_accounts;
CREATE POLICY "Allow authenticated read accounts" ON accounting_accounts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write accounts" ON accounting_accounts;
CREATE POLICY "Allow authenticated write accounts" ON accounting_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para subcategories
DROP POLICY IF EXISTS "Allow authenticated read subcategories" ON accounting_expense_subcategories;
CREATE POLICY "Allow authenticated read subcategories" ON accounting_expense_subcategories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write subcategories" ON accounting_expense_subcategories;
CREATE POLICY "Allow authenticated write subcategories" ON accounting_expense_subcategories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para transfers
DROP POLICY IF EXISTS "Allow authenticated read transfers" ON accounting_transfers;
CREATE POLICY "Allow authenticated read transfers" ON accounting_transfers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write transfers" ON accounting_transfers;
CREATE POLICY "Allow authenticated write transfers" ON accounting_transfers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
