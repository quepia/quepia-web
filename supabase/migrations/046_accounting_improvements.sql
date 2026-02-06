-- =====================================================
-- MEJORAS MÓDULO DE CONTABILIDAD
-- Migración: 046_accounting_improvements.sql
-- - Filtrar gastos futuros del balance
-- - Mejorar transferencias cross-currency
-- - Agregar comisiones e impuestos a transferencias
-- =====================================================

-- =====================================================
-- AGREGAR COLUMNAS COMMISSION Y TAX A TRANSFERENCIAS
-- =====================================================
ALTER TABLE accounting_transfers ADD COLUMN IF NOT EXISTS commission DECIMAL DEFAULT 0;
ALTER TABLE accounting_transfers ADD COLUMN IF NOT EXISTS tax DECIMAL DEFAULT 0;

-- =====================================================
-- RPC ACTUALIZADO: get_accounting_accounts
-- Excluir gastos futuros del cálculo de balance
-- Manejar transferencias cross-currency correctamente
-- Restar comisiones e impuestos del balance origen
-- =====================================================
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
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name::VARCHAR,
    a.type::VARCHAR,
    a.currency::VARCHAR,
    a.initial_balance,
    -- Balance actual = inicial + ingresos - gastos (solo pasados/hoy) + transferencias
    COALESCE(a.initial_balance, 0) +
    -- Ingresos: pagos recibidos
    COALESCE((SELECT SUM(p.amount) FROM accounting_client_payments p WHERE p.account_id = a.id AND p.status = 'paid'), 0) -
    -- Gastos: solo con fecha <= hoy (excluir gastos futuros)
    COALESCE((SELECT SUM(e.amount) FROM accounting_expenses e WHERE e.account_id = a.id AND e.date <= CURRENT_DATE), 0) +
    -- Transferencias entrantes: exchange_rate es "1 USD = X ARS"
    -- Si cuenta destino es USD (from ARS): dividir por exchange_rate
    -- Si cuenta destino es ARS (from USD): multiplicar por exchange_rate
    COALESCE((
      SELECT SUM(
        CASE 
          WHEN t.exchange_rate IS NOT NULL AND t.exchange_rate > 0 THEN
            CASE 
              WHEN a.currency = 'USD' THEN (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) / t.exchange_rate
              ELSE (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) * t.exchange_rate
            END
          ELSE t.amount
        END
      ) 
      FROM accounting_transfers t 
      WHERE t.to_account_id = a.id
    ), 0) -
    -- Transferencias salientes (monto + comisiones + impuestos)
    COALESCE((SELECT SUM(t.amount + COALESCE(t.commission, 0) + COALESCE(t.tax, 0)) FROM accounting_transfers t WHERE t.from_account_id = a.id), 0) +
    -- Ajustes de balance (arqueos de caja)
    COALESCE((SELECT SUM(adj.adjustment_amount) FROM accounting_balance_adjustments adj WHERE adj.account_id = a.id), 0) AS current_balance,
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
    -- Gastos del mes actual (solo pasados/hoy)
    COALESCE((
      SELECT SUM(e.amount) FROM accounting_expenses e 
      WHERE e.account_id = a.id 
      AND e.date <= CURRENT_DATE
      AND EXTRACT(MONTH FROM e.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM e.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_expenses,
    -- Transferencias entrantes del mes (con exchange_rate correcto)
    COALESCE((
      SELECT SUM(
        CASE 
          WHEN t.exchange_rate IS NOT NULL AND t.exchange_rate > 0 THEN
            CASE 
              WHEN a.currency = 'USD' THEN (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) / t.exchange_rate
              ELSE (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) * t.exchange_rate
            END
          ELSE t.amount
        END
      ) 
      FROM accounting_transfers t 
      WHERE t.to_account_id = a.id 
      AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_transfers_in,
    -- Transferencias salientes del mes (con comisiones)
    COALESCE((
      SELECT SUM(t.amount + COALESCE(t.commission, 0) + COALESCE(t.tax, 0)) FROM accounting_transfers t 
      WHERE t.from_account_id = a.id 
      AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_transfers_out,
    -- Transferencias entrantes del año (para cálculo de saldo sin distribuir)
    COALESCE((
      SELECT SUM(
        CASE 
          WHEN t.exchange_rate IS NOT NULL AND t.exchange_rate > 0 THEN
            CASE 
              WHEN a.currency = 'USD' THEN (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) / t.exchange_rate
              ELSE (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) * t.exchange_rate
            END
          ELSE t.amount
        END
      ) 
      FROM accounting_transfers t 
      WHERE t.to_account_id = a.id 
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS year_transfers_in,
    -- Transferencias salientes del año (con comisiones)
    COALESCE((
      SELECT SUM(t.amount + COALESCE(t.commission, 0) + COALESCE(t.tax, 0)) FROM accounting_transfers t 
      WHERE t.from_account_id = a.id 
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS year_transfers_out,
    -- Ajustes de balance del año (para cálculo de saldo sin distribuir)
    COALESCE((
      SELECT SUM(adj.adjustment_amount) FROM accounting_balance_adjustments adj 
      WHERE adj.account_id = a.id 
      AND EXTRACT(YEAR FROM adj.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS year_adjustments
  FROM accounting_accounts a
  WHERE a.is_active = true
  ORDER BY a.is_default DESC, a.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC ACTUALIZADO: get_accounting_monthly_chart
-- Excluir gastos futuros del gráfico mensual
-- =====================================================
DROP FUNCTION IF EXISTS get_accounting_monthly_chart(INTEGER);

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
      AND e.date <= CURRENT_DATE  -- Solo gastos pasados o de hoy
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
-- RPC ACTUALIZADO: get_account_movements
-- Mostrar indicador de gasto futuro
-- =====================================================
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
    COALESCE(pr.color, '#6366f1')::VARCHAR AS related_color,
    false AS is_future
  FROM accounting_client_payments p
  LEFT JOIN sistema_projects pr ON p.project_id = pr.id
  WHERE p.account_id = p_account_id AND p.status = 'paid'
  
  UNION ALL
  
  -- Gastos (con indicador de futuro)
  SELECT 
    'expense'::VARCHAR AS movement_type,
    e.id AS movement_id,
    e.date,
    e.description,
    e.amount,
    false AS is_income,
    COALESCE(c.name, 'Sin categoría')::VARCHAR AS related_entity,
    COALESCE(c.color, '#6b7280')::VARCHAR AS related_color,
    e.date > CURRENT_DATE AS is_future
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
    CASE 
      WHEN t.exchange_rate IS NOT NULL AND t.exchange_rate > 0 THEN
        CASE 
          WHEN ta.currency = 'USD' THEN (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) / t.exchange_rate
          ELSE (t.amount - COALESCE(t.commission, 0) - COALESCE(t.tax, 0)) * t.exchange_rate
        END
      ELSE t.amount
    END AS amount,
    true AS is_income,
    COALESCE(fa.name, 'Cuenta')::VARCHAR AS related_entity,
    COALESCE(fa.color, '#6366f1')::VARCHAR AS related_color,
    false AS is_future
  FROM accounting_transfers t
  LEFT JOIN accounting_accounts fa ON t.from_account_id = fa.id
  LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
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
    COALESCE(ta.color, '#6366f1')::VARCHAR AS related_color,
    false AS is_future
  FROM accounting_transfers t
  LEFT JOIN accounting_accounts ta ON t.to_account_id = ta.id
  WHERE t.from_account_id = p_account_id
  
  ORDER BY date DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC ACTUALIZADO: get_expense_distribution
-- Excluir gastos futuros de la distribución
-- =====================================================
DROP FUNCTION IF EXISTS get_expense_distribution(INTEGER, INTEGER);

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
  -- Calcular total primero (solo gastos pasados/hoy)
  SELECT COALESCE(SUM(e.amount), 0) INTO total_sum
  FROM accounting_expenses e
  WHERE EXTRACT(YEAR FROM e.date) = p_year
    AND (p_month IS NULL OR EXTRACT(MONTH FROM e.date) = p_month)
    AND e.date <= CURRENT_DATE;

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
    AND e.date <= CURRENT_DATE
  GROUP BY c.id, c.name, c.color
  HAVING COALESCE(SUM(e.amount), 0) > 0
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TABLA: accounting_balance_adjustments
-- Para registrar arqueos de caja y ajustes manuales
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_balance_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounting_accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    previous_balance DECIMAL NOT NULL,
    new_balance DECIMAL NOT NULL,
    adjustment_amount DECIMAL NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE accounting_balance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON accounting_balance_adjustments;
CREATE POLICY "Allow all for authenticated" ON accounting_balance_adjustments
    FOR ALL USING (auth.role() = 'authenticated');
