-- =====================================================
-- FUTURAS INVERSIONES
-- Migración: 047_future_investments.sql
-- Módulo para registrar productos/equipos que se planean comprar
-- =====================================================

-- =====================================================
-- TIPOS ENUM
-- =====================================================
DO $$ BEGIN
    CREATE TYPE investment_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE investment_category AS ENUM ('equipment', 'subscription', 'accessory', 'software', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLA: accounting_future_investments
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_future_investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    url TEXT,
    estimated_price DECIMAL,
    currency VARCHAR(3) DEFAULT 'ARS',
    priority investment_priority DEFAULT 'medium',
    category investment_category DEFAULT 'equipment',
    notes TEXT,
    is_purchased BOOLEAN DEFAULT false,
    purchased_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_future_investments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_future_investments ON accounting_future_investments;
CREATE TRIGGER trigger_update_future_investments
    BEFORE UPDATE ON accounting_future_investments
    FOR EACH ROW
    EXECUTE FUNCTION update_future_investments_updated_at();

-- RLS
ALTER TABLE accounting_future_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON accounting_future_investments
    FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- RPC: get_future_investments
-- =====================================================
CREATE OR REPLACE FUNCTION get_future_investments(
    p_include_purchased BOOLEAN DEFAULT false,
    p_category investment_category DEFAULT NULL,
    p_priority investment_priority DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    url TEXT,
    estimated_price DECIMAL,
    currency VARCHAR,
    priority investment_priority,
    category investment_category,
    notes TEXT,
    is_purchased BOOLEAN,
    purchased_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        fi.id,
        fi.name,
        fi.url,
        fi.estimated_price,
        fi.currency,
        fi.priority,
        fi.category,
        fi.notes,
        fi.is_purchased,
        fi.purchased_at,
        fi.created_at,
        fi.updated_at
    FROM accounting_future_investments fi
    WHERE
        (p_include_purchased OR fi.is_purchased = false)
        AND (p_category IS NULL OR fi.category = p_category)
        AND (p_priority IS NULL OR fi.priority = p_priority)
    ORDER BY
        fi.is_purchased ASC,
        CASE fi.priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
        END,
        fi.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: get_future_investments_summary
-- Resumen de inversiones pendientes por categoría
-- =====================================================
CREATE OR REPLACE FUNCTION get_future_investments_summary()
RETURNS TABLE (
    total_pending_ars DECIMAL,
    total_pending_usd DECIMAL,
    count_pending BIGINT,
    count_purchased BIGINT,
    by_category JSONB,
    by_priority JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN fi.currency = 'ARS' AND NOT fi.is_purchased THEN fi.estimated_price ELSE 0 END), 0) AS total_pending_ars,
        COALESCE(SUM(CASE WHEN fi.currency = 'USD' AND NOT fi.is_purchased THEN fi.estimated_price ELSE 0 END), 0) AS total_pending_usd,
        COUNT(*) FILTER (WHERE NOT fi.is_purchased) AS count_pending,
        COUNT(*) FILTER (WHERE fi.is_purchased) AS count_purchased,
        (
            SELECT jsonb_object_agg(category, cnt)
            FROM (
                SELECT fi2.category, COUNT(*) as cnt
                FROM accounting_future_investments fi2
                WHERE NOT fi2.is_purchased
                GROUP BY fi2.category
            ) sub
        ) AS by_category,
        (
            SELECT jsonb_object_agg(priority, cnt)
            FROM (
                SELECT fi3.priority, COUNT(*) as cnt
                FROM accounting_future_investments fi3
                WHERE NOT fi3.is_purchased
                GROUP BY fi3.priority
            ) sub
        ) AS by_priority
    FROM accounting_future_investments fi;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
