-- =====================================================
-- HISTORIAL UNIFICADO DE MOVIMIENTOS
-- Migración: 048_unified_history.sql
-- Consolida todos los movimientos de dinero del sistema
-- =====================================================

-- =====================================================
-- RPC: get_unified_history
-- Retorna todos los movimientos de dinero ordenados por fecha
-- =====================================================
CREATE OR REPLACE FUNCTION get_unified_history(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_movement_type VARCHAR DEFAULT NULL,  -- 'payment', 'expense', 'transfer', 'adjustment'
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

    ORDER BY date DESC, created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: get_history_summary
-- Resumen de totales para el historial
-- =====================================================
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
    movement_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Ingresos ARS (pagos)
        COALESCE(SUM(
            CASE WHEN p.currency = 'ARS' AND p.status = 'paid'
                AND (p_start_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) >= p_start_date)
                AND (p_end_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) <= p_end_date)
                AND (p_account_id IS NULL OR p.account_id = p_account_id)
            THEN p.amount ELSE 0 END
        ), 0) AS total_income_ars,

        -- Ingresos USD (pagos)
        COALESCE(SUM(
            CASE WHEN p.currency = 'USD' AND p.status = 'paid'
                AND (p_start_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) >= p_start_date)
                AND (p_end_date IS NULL OR COALESCE(p.payment_date::DATE, MAKE_DATE(p.year, p.month, 1)) <= p_end_date)
                AND (p_account_id IS NULL OR p.account_id = p_account_id)
            THEN p.amount ELSE 0 END
        ), 0) AS total_income_usd,

        -- Gastos ARS
        (SELECT COALESCE(SUM(e.amount), 0) FROM accounting_expenses e
         WHERE e.currency = 'ARS'
            AND (p_start_date IS NULL OR e.date >= p_start_date)
            AND (p_end_date IS NULL OR e.date <= p_end_date)
            AND (p_account_id IS NULL OR e.account_id = p_account_id)
        ) AS total_expenses_ars,

        -- Gastos USD
        (SELECT COALESCE(SUM(e.amount), 0) FROM accounting_expenses e
         WHERE e.currency = 'USD'
            AND (p_start_date IS NULL OR e.date >= p_start_date)
            AND (p_end_date IS NULL OR e.date <= p_end_date)
            AND (p_account_id IS NULL OR e.account_id = p_account_id)
        ) AS total_expenses_usd,

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
        ) AS movement_count

    FROM accounting_client_payments p;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
