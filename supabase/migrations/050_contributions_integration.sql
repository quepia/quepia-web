-- =====================================================
-- INTEGRACIÓN DE APORTES CON SISTEMA CONTABLE
-- Migración: 050_contributions_integration.sql
-- - Actualizar balances de cuentas con aportes/devoluciones
-- - Agregar aportes/devoluciones al historial unificado
-- =====================================================

-- =====================================================
-- RPC ACTUALIZADO: get_accounting_accounts
-- Incluir aportes y devoluciones en el cálculo de balance
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
    -- Balance actual = inicial + ingresos - gastos + transferencias + aportes - devoluciones
    COALESCE(a.initial_balance, 0) +
    -- Ingresos: pagos recibidos
    COALESCE((SELECT SUM(p.amount) FROM accounting_client_payments p WHERE p.account_id = a.id AND p.status = 'paid'), 0) -
    -- Gastos: solo con fecha <= hoy
    COALESCE((SELECT SUM(e.amount) FROM accounting_expenses e WHERE e.account_id = a.id AND e.date <= CURRENT_DATE), 0) +
    -- Transferencias entrantes
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
    -- Transferencias salientes
    COALESCE((SELECT SUM(t.amount + COALESCE(t.commission, 0) + COALESCE(t.tax, 0)) FROM accounting_transfers t WHERE t.from_account_id = a.id), 0) +
    -- Ajustes de balance
    COALESCE((SELECT SUM(adj.adjustment_amount) FROM accounting_balance_adjustments adj WHERE adj.account_id = a.id), 0) +
    -- Aportes de socios (ingresan a la cuenta)
    COALESCE((SELECT SUM(c.amount) FROM accounting_partner_contributions c WHERE c.account_id = a.id), 0) -
    -- Devoluciones de aportes (salen de la cuenta)
    COALESCE((SELECT SUM(r.amount) FROM accounting_contribution_repayments r WHERE r.account_id = a.id), 0) AS current_balance,
    a.icon::VARCHAR,
    a.color::VARCHAR,
    a.is_default,
    a.is_active,
    a.created_at,
    -- Ingresos del mes actual (incluyendo aportes)
    COALESCE((
      SELECT SUM(p.amount) FROM accounting_client_payments p
      WHERE p.account_id = a.id AND p.status = 'paid'
      AND EXTRACT(MONTH FROM p.payment_date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM p.payment_date) = EXTRACT(YEAR FROM NOW())
    ), 0) +
    COALESCE((
      SELECT SUM(c.amount) FROM accounting_partner_contributions c
      WHERE c.account_id = a.id
      AND EXTRACT(MONTH FROM c.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM c.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_income,
    -- Gastos del mes actual (incluyendo devoluciones)
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
    -- Transferencias entrantes del mes
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
    -- Transferencias salientes del mes
    COALESCE((
      SELECT SUM(t.amount + COALESCE(t.commission, 0) + COALESCE(t.tax, 0)) FROM accounting_transfers t
      WHERE t.from_account_id = a.id
      AND EXTRACT(MONTH FROM t.date) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS month_transfers_out,
    -- Transferencias entrantes del año
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
    -- Transferencias salientes del año
    COALESCE((
      SELECT SUM(t.amount + COALESCE(t.commission, 0) + COALESCE(t.tax, 0)) FROM accounting_transfers t
      WHERE t.from_account_id = a.id
      AND EXTRACT(YEAR FROM t.date) = EXTRACT(YEAR FROM NOW())
    ), 0) AS year_transfers_out,
    -- Ajustes del año
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
-- RPC ACTUALIZADO: get_unified_history
-- Incluir aportes y devoluciones en el historial
-- =====================================================
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
) AS $$
BEGIN
    RETURN QUERY

    -- PAGOS DE CLIENTES (Ingresos)
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

    -- GASTOS
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
        COALESCE(c.name, 'Sin categoría')::VARCHAR AS related_entity,
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

    -- TRANSFERENCIAS (Salientes)
    SELECT
        t.id,
        'transfer_out'::VARCHAR AS movement_type,
        t.date,
        ('Transferencia a ' || COALESCE(ta.name, 'otra cuenta'))::TEXT AS description,
        t.amount + COALESCE(t.commission, 0) + COALESCE(t.tax, 0),
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

    -- TRANSFERENCIAS (Entrantes)
    SELECT
        t.id,
        'transfer_in'::VARCHAR AS movement_type,
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

    -- AJUSTES DE BALANCE
    SELECT
        adj.id,
        'adjustment'::VARCHAR AS movement_type,
        adj.date,
        ('Ajuste de balance: ' || COALESCE(adj.reason, 'Arqueo de caja'))::TEXT AS description,
        ABS(adj.adjustment_amount),
        a.currency::VARCHAR,
        adj.adjustment_amount > 0 AS is_income,
        adj.account_id,
        a.name::VARCHAR AS account_name,
        a.color::VARCHAR AS account_color,
        'Ajuste'::VARCHAR AS related_entity,
        '#f59e0b'::VARCHAR AS related_color,
        'Ajuste de balance'::VARCHAR AS category,
        adj.reason,
        adj.created_at
    FROM accounting_balance_adjustments adj
    LEFT JOIN accounting_accounts a ON adj.account_id = a.id
    WHERE (p_start_date IS NULL OR adj.date >= p_start_date)
        AND (p_end_date IS NULL OR adj.date <= p_end_date)
        AND (p_account_id IS NULL OR adj.account_id = p_account_id)
        AND (p_movement_type IS NULL OR p_movement_type = 'adjustment')

    UNION ALL

    -- APORTES DE SOCIOS (Ingresos)
    SELECT
        c.id,
        'contribution'::VARCHAR AS movement_type,
        c.date,
        ('Aporte de ' || c.partner_name)::TEXT AS description,
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

    -- DEVOLUCIONES DE APORTES (Egresos)
    SELECT
        r.id,
        'repayment'::VARCHAR AS movement_type,
        r.date,
        ('Devolución a ' || c.partner_name)::TEXT AS description,
        r.amount,
        c.currency::VARCHAR,
        false AS is_income,
        r.account_id,
        a.name::VARCHAR AS account_name,
        a.color::VARCHAR AS account_color,
        c.partner_name::VARCHAR AS related_entity,
        '#06b6d4'::VARCHAR AS related_color,
        'Devolución de aporte'::VARCHAR AS category,
        r.notes,
        r.created_at
    FROM accounting_contribution_repayments r
    LEFT JOIN accounting_partner_contributions c ON r.contribution_id = c.id
    LEFT JOIN accounting_accounts a ON r.account_id = a.id
    WHERE (p_start_date IS NULL OR r.date >= p_start_date)
        AND (p_end_date IS NULL OR r.date <= p_end_date)
        AND (p_account_id IS NULL OR r.account_id = p_account_id)
        AND (p_movement_type IS NULL OR p_movement_type = 'repayment')

    ORDER BY date DESC, created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC ACTUALIZADO: get_history_summary
-- Incluir aportes y devoluciones en el resumen
-- =====================================================
DROP FUNCTION IF EXISTS get_history_summary(DATE, DATE, UUID);

CREATE OR REPLACE FUNCTION get_history_summary(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_income_ars DECIMAL,
    total_income_usd DECIMAL,
    total_expenses_ars DECIMAL,
    total_expenses_usd DECIMAL,
    total_transfers BIGINT,
    total_adjustments BIGINT,
    total_contributions BIGINT,
    total_repayments BIGINT,
    movement_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Ingresos ARS (pagos + aportes)
        COALESCE((
            SELECT SUM(p.amount) FROM accounting_client_payments p
            WHERE p.currency = 'ARS' AND p.status = 'paid'
                AND (p_start_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) >= p_start_date)
                AND (p_end_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) <= p_end_date)
                AND (p_account_id IS NULL OR p.account_id = p_account_id)
        ), 0) +
        COALESCE((
            SELECT SUM(c.amount) FROM accounting_partner_contributions c
            WHERE c.currency = 'ARS'
                AND (p_start_date IS NULL OR c.date >= p_start_date)
                AND (p_end_date IS NULL OR c.date <= p_end_date)
                AND (p_account_id IS NULL OR c.account_id = p_account_id)
        ), 0) AS total_income_ars,

        -- Ingresos USD (pagos + aportes)
        COALESCE((
            SELECT SUM(p.amount) FROM accounting_client_payments p
            WHERE p.currency = 'USD' AND p.status = 'paid'
                AND (p_start_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) >= p_start_date)
                AND (p_end_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) <= p_end_date)
                AND (p_account_id IS NULL OR p.account_id = p_account_id)
        ), 0) +
        COALESCE((
            SELECT SUM(c.amount) FROM accounting_partner_contributions c
            WHERE c.currency = 'USD'
                AND (p_start_date IS NULL OR c.date >= p_start_date)
                AND (p_end_date IS NULL OR c.date <= p_end_date)
                AND (p_account_id IS NULL OR c.account_id = p_account_id)
        ), 0) AS total_income_usd,

        -- Gastos ARS (gastos + devoluciones)
        COALESCE((
            SELECT SUM(e.amount) FROM accounting_expenses e
            WHERE e.currency = 'ARS'
                AND (p_start_date IS NULL OR e.date >= p_start_date)
                AND (p_end_date IS NULL OR e.date <= p_end_date)
                AND (p_account_id IS NULL OR e.account_id = p_account_id)
        ), 0) +
        COALESCE((
            SELECT SUM(r.amount) FROM accounting_contribution_repayments r
            JOIN accounting_partner_contributions c ON r.contribution_id = c.id
            WHERE c.currency = 'ARS'
                AND (p_start_date IS NULL OR r.date >= p_start_date)
                AND (p_end_date IS NULL OR r.date <= p_end_date)
                AND (p_account_id IS NULL OR r.account_id = p_account_id)
        ), 0) AS total_expenses_ars,

        -- Gastos USD (gastos + devoluciones)
        COALESCE((
            SELECT SUM(e.amount) FROM accounting_expenses e
            WHERE e.currency = 'USD'
                AND (p_start_date IS NULL OR e.date >= p_start_date)
                AND (p_end_date IS NULL OR e.date <= p_end_date)
                AND (p_account_id IS NULL OR e.account_id = p_account_id)
        ), 0) +
        COALESCE((
            SELECT SUM(r.amount) FROM accounting_contribution_repayments r
            JOIN accounting_partner_contributions c ON r.contribution_id = c.id
            WHERE c.currency = 'USD'
                AND (p_start_date IS NULL OR r.date >= p_start_date)
                AND (p_end_date IS NULL OR r.date <= p_end_date)
                AND (p_account_id IS NULL OR r.account_id = p_account_id)
        ), 0) AS total_expenses_usd,

        -- Cantidad de transferencias
        (SELECT COUNT(*) FROM accounting_transfers t
         WHERE (p_start_date IS NULL OR t.date >= p_start_date)
            AND (p_end_date IS NULL OR t.date <= p_end_date)
            AND (p_account_id IS NULL OR t.from_account_id = p_account_id OR t.to_account_id = p_account_id)
        ) AS total_transfers,

        -- Cantidad de ajustes
        (SELECT COUNT(*) FROM accounting_balance_adjustments adj
         WHERE (p_start_date IS NULL OR adj.date >= p_start_date)
            AND (p_end_date IS NULL OR adj.date <= p_end_date)
            AND (p_account_id IS NULL OR adj.account_id = p_account_id)
        ) AS total_adjustments,

        -- Cantidad de aportes
        (SELECT COUNT(*) FROM accounting_partner_contributions c
         WHERE (p_start_date IS NULL OR c.date >= p_start_date)
            AND (p_end_date IS NULL OR c.date <= p_end_date)
            AND (p_account_id IS NULL OR c.account_id = p_account_id)
        ) AS total_contributions,

        -- Cantidad de devoluciones
        (SELECT COUNT(*) FROM accounting_contribution_repayments r
         WHERE (p_start_date IS NULL OR r.date >= p_start_date)
            AND (p_end_date IS NULL OR r.date <= p_end_date)
            AND (p_account_id IS NULL OR r.account_id = p_account_id)
        ) AS total_repayments,

        -- Total de movimientos
        (
            (SELECT COUNT(*) FROM accounting_client_payments p
             WHERE p.status = 'paid'
                AND (p_start_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) >= p_start_date)
                AND (p_end_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) <= p_end_date)
                AND (p_account_id IS NULL OR p.account_id = p_account_id))
            +
            (SELECT COUNT(*) FROM accounting_expenses e
             WHERE (p_start_date IS NULL OR e.date >= p_start_date)
                AND (p_end_date IS NULL OR e.date <= p_end_date)
                AND (p_account_id IS NULL OR e.account_id = p_account_id))
            +
            (SELECT COUNT(*) * 2 FROM accounting_transfers t
             WHERE (p_start_date IS NULL OR t.date >= p_start_date)
                AND (p_end_date IS NULL OR t.date <= p_end_date)
                AND (p_account_id IS NULL OR t.from_account_id = p_account_id OR t.to_account_id = p_account_id))
            +
            (SELECT COUNT(*) FROM accounting_balance_adjustments adj
             WHERE (p_start_date IS NULL OR adj.date >= p_start_date)
                AND (p_end_date IS NULL OR adj.date <= p_end_date)
                AND (p_account_id IS NULL OR adj.account_id = p_account_id))
            +
            (SELECT COUNT(*) FROM accounting_partner_contributions c
             WHERE (p_start_date IS NULL OR c.date >= p_start_date)
                AND (p_end_date IS NULL OR c.date <= p_end_date)
                AND (p_account_id IS NULL OR c.account_id = p_account_id))
            +
            (SELECT COUNT(*) FROM accounting_contribution_repayments r
             WHERE (p_start_date IS NULL OR r.date >= p_start_date)
                AND (p_end_date IS NULL OR r.date <= p_end_date)
                AND (p_account_id IS NULL OR r.account_id = p_account_id))
        ) AS movement_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
