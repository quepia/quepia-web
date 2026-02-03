-- =====================================================
-- MÓDULO DE CONTABILIDAD INTERNA
-- Migración: 036_accounting_module.sql
-- =====================================================

-- =====================================================
-- TABLA: Categorías de gastos
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categorías por defecto
INSERT INTO accounting_expense_categories (name, color, is_default) VALUES
  ('Software', '#8b5cf6', true),
  ('Marketing', '#ec4899', true),
  ('Oficina', '#f59e0b', true),
  ('Sueldos', '#10b981', true),
  ('Impuestos', '#ef4444', true),
  ('Servicios', '#3b82f6', true),
  ('Otros', '#6b7280', true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TABLA: Pagos de clientes
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES sistema_projects(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  expected_payment_date DATE,
  payment_date DATE,
  payment_method VARCHAR(50),
  invoice_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES sistema_users(id)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_payments_project ON accounting_client_payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON accounting_client_payments(year, month);
CREATE INDEX IF NOT EXISTS idx_payments_status ON accounting_client_payments(status);

-- =====================================================
-- TABLA: Gastos
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category_id UUID REFERENCES accounting_expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  provider VARCHAR(200),
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES sistema_users(id)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON accounting_expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON accounting_expenses(category_id);

-- =====================================================
-- TRIGGERS: Actualizar updated_at automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_accounting_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payments_updated_at ON accounting_client_payments;
CREATE TRIGGER trigger_payments_updated_at
  BEFORE UPDATE ON accounting_client_payments
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

DROP TRIGGER IF EXISTS trigger_expenses_updated_at ON accounting_expenses;
CREATE TRIGGER trigger_expenses_updated_at
  BEFORE UPDATE ON accounting_expenses
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- =====================================================
-- RPC: Obtener resumen de contabilidad
-- =====================================================
CREATE OR REPLACE FUNCTION get_accounting_summary(
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_income_ars', COALESCE((
      SELECT SUM(amount) FROM accounting_client_payments 
      WHERE year = p_year AND status = 'paid' AND currency = 'ARS'
    ), 0),
    'total_income_usd', COALESCE((
      SELECT SUM(amount) FROM accounting_client_payments 
      WHERE year = p_year AND status = 'paid' AND currency = 'USD'
    ), 0),
    'total_expenses_ars', COALESCE((
      SELECT SUM(amount) FROM accounting_expenses 
      WHERE EXTRACT(YEAR FROM date) = p_year AND currency = 'ARS'
    ), 0),
    'total_expenses_usd', COALESCE((
      SELECT SUM(amount) FROM accounting_expenses 
      WHERE EXTRACT(YEAR FROM date) = p_year AND currency = 'USD'
    ), 0),
    'pending_payments', (
      SELECT COUNT(*) FROM accounting_client_payments 
      WHERE year = p_year AND status = 'pending'
    ),
    'overdue_payments', (
      SELECT COUNT(*) FROM accounting_client_payments 
      WHERE year = p_year AND status = 'overdue'
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: Obtener pagos con datos del proyecto
-- =====================================================
CREATE OR REPLACE FUNCTION get_accounting_payments(
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_status VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  project_name VARCHAR,
  project_color VARCHAR,
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
  WHERE 
    (p_year IS NULL OR p.year = p_year)
    AND (p_month IS NULL OR p.month = p_month)
    AND (p_project_id IS NULL OR p.project_id = p_project_id)
    AND (p_status IS NULL OR p.status = p_status)
  ORDER BY p.year DESC, p.month DESC, p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: Obtener gastos con categoría
-- =====================================================
CREATE OR REPLACE FUNCTION get_accounting_expenses(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  date DATE,
  category_id UUID,
  category_name VARCHAR,
  category_color VARCHAR,
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
    e.description,
    e.amount,
    e.currency::VARCHAR,
    e.provider::VARCHAR,
    e.receipt_url,
    e.notes,
    e.created_at
  FROM accounting_expenses e
  LEFT JOIN accounting_expense_categories c ON e.category_id = c.id
  WHERE 
    (p_start_date IS NULL OR e.date >= p_start_date)
    AND (p_end_date IS NULL OR e.date <= p_end_date)
    AND (p_category_id IS NULL OR e.category_id = p_category_id)
  ORDER BY e.date DESC, e.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Habilitar RLS en las tablas
ALTER TABLE accounting_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_expenses ENABLE ROW LEVEL SECURITY;

-- Políticas para expense_categories (lectura para todos autenticados, escritura para admins)
DROP POLICY IF EXISTS "Allow authenticated read categories" ON accounting_expense_categories;
CREATE POLICY "Allow authenticated read categories" ON accounting_expense_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write categories" ON accounting_expense_categories;
CREATE POLICY "Allow authenticated write categories" ON accounting_expense_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para client_payments (acceso completo para autenticados)
DROP POLICY IF EXISTS "Allow authenticated read payments" ON accounting_client_payments;
CREATE POLICY "Allow authenticated read payments" ON accounting_client_payments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write payments" ON accounting_client_payments;
CREATE POLICY "Allow authenticated write payments" ON accounting_client_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para expenses (acceso completo para autenticados)
DROP POLICY IF EXISTS "Allow authenticated read expenses" ON accounting_expenses;
CREATE POLICY "Allow authenticated read expenses" ON accounting_expenses
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated write expenses" ON accounting_expenses;
CREATE POLICY "Allow authenticated write expenses" ON accounting_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

