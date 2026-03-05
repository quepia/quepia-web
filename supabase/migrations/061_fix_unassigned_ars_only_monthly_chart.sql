-- =====================================================
-- FIX: evitar mezcla ARS/USD en get_accounting_monthly_chart
-- Migración: 061_fix_unassigned_ars_only_monthly_chart.sql
-- Objetivo: que "Sin distribuir" (ARS) no se desvíe por movimientos en USD
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
      income_rows.m,
      SUM(income_rows.amount) AS total
    FROM (
      -- Ingresos de clientes en ARS
      SELECT
        p.month AS m,
        p.amount
      FROM accounting_client_payments p
      WHERE p.year = p_year
        AND p.status = 'paid'
        AND p.currency = 'ARS'

      UNION ALL

      -- Aportes de socios en ARS
      SELECT
        EXTRACT(MONTH FROM c.date)::INTEGER AS m,
        c.amount
      FROM accounting_partner_contributions c
      WHERE EXTRACT(YEAR FROM c.date) = p_year
        AND c.date <= CURRENT_DATE
        AND c.currency = 'ARS'
    ) AS income_rows
    GROUP BY income_rows.m
  ),
  expense_data AS (
    SELECT
      expense_rows.m,
      SUM(expense_rows.amount) AS total
    FROM (
      -- Gastos en ARS
      SELECT
        EXTRACT(MONTH FROM e.date)::INTEGER AS m,
        e.amount
      FROM accounting_expenses e
      WHERE EXTRACT(YEAR FROM e.date) = p_year
        AND e.date <= CURRENT_DATE
        AND e.currency = 'ARS'

      UNION ALL

      -- Devoluciones de aportes en ARS
      SELECT
        EXTRACT(MONTH FROM r.date)::INTEGER AS m,
        r.amount
      FROM accounting_contribution_repayments r
      JOIN accounting_partner_contributions c ON c.id = r.contribution_id
      WHERE EXTRACT(YEAR FROM r.date) = p_year
        AND r.date <= CURRENT_DATE
        AND c.currency = 'ARS'
    ) AS expense_rows
    GROUP BY expense_rows.m
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
