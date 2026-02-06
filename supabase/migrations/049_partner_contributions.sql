-- =====================================================
-- APORTES DE SOCIOS
-- Migración: 049_partner_contributions.sql
-- Módulo para registrar aportes de socios y sus devoluciones
-- =====================================================

-- =====================================================
-- TIPOS ENUM
-- =====================================================
DO $$ BEGIN
    CREATE TYPE contribution_status AS ENUM ('pending', 'partial', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE repayment_type AS ENUM ('salary_deduction', 'manual_payment', 'transfer', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLA: accounting_partner_contributions
-- Registra los aportes de los socios
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_partner_contributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_name VARCHAR(255) NOT NULL,
    amount DECIMAL NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
    notes TEXT,
    status contribution_status DEFAULT 'pending',
    amount_repaid DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_partner_contributions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    -- Actualizar status basado en amount_repaid
    IF NEW.amount_repaid >= NEW.amount THEN
        NEW.status = 'completed';
    ELSIF NEW.amount_repaid > 0 THEN
        NEW.status = 'partial';
    ELSE
        NEW.status = 'pending';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_partner_contributions ON accounting_partner_contributions;
CREATE TRIGGER trigger_update_partner_contributions
    BEFORE UPDATE ON accounting_partner_contributions
    FOR EACH ROW
    EXECUTE FUNCTION update_partner_contributions_updated_at();

-- RLS
ALTER TABLE accounting_partner_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON accounting_partner_contributions
    FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- TABLA: accounting_contribution_repayments
-- Registra las devoluciones/imputaciones a los aportes
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_contribution_repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contribution_id UUID NOT NULL REFERENCES accounting_partner_contributions(id) ON DELETE CASCADE,
    amount DECIMAL NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    repayment_type repayment_type DEFAULT 'manual_payment',
    account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE accounting_contribution_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON accounting_contribution_repayments
    FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- TRIGGER: Actualizar amount_repaid cuando se agrega/elimina una devolución
-- =====================================================
CREATE OR REPLACE FUNCTION update_contribution_repaid_amount()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE accounting_partner_contributions
        SET amount_repaid = amount_repaid + NEW.amount
        WHERE id = NEW.contribution_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE accounting_partner_contributions
        SET amount_repaid = amount_repaid - OLD.amount
        WHERE id = OLD.contribution_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Si cambió el monto o el contribution_id
        IF OLD.contribution_id = NEW.contribution_id THEN
            UPDATE accounting_partner_contributions
            SET amount_repaid = amount_repaid - OLD.amount + NEW.amount
            WHERE id = NEW.contribution_id;
        ELSE
            -- Restar del viejo, sumar al nuevo
            UPDATE accounting_partner_contributions
            SET amount_repaid = amount_repaid - OLD.amount
            WHERE id = OLD.contribution_id;
            UPDATE accounting_partner_contributions
            SET amount_repaid = amount_repaid + NEW.amount
            WHERE id = NEW.contribution_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_repaid_amount ON accounting_contribution_repayments;
CREATE TRIGGER trigger_update_repaid_amount
    AFTER INSERT OR UPDATE OR DELETE ON accounting_contribution_repayments
    FOR EACH ROW
    EXECUTE FUNCTION update_contribution_repaid_amount();

-- =====================================================
-- RPC: get_partner_contributions
-- Obtiene los aportes con datos de cuenta
-- =====================================================
CREATE OR REPLACE FUNCTION get_partner_contributions(
    p_status contribution_status DEFAULT NULL,
    p_partner_name VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    partner_name VARCHAR,
    amount DECIMAL,
    currency VARCHAR,
    date DATE,
    account_id UUID,
    account_name VARCHAR,
    account_color VARCHAR,
    notes TEXT,
    status contribution_status,
    amount_repaid DECIMAL,
    amount_pending DECIMAL,
    repayment_count BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.partner_name,
        c.amount,
        c.currency::VARCHAR,
        c.date,
        c.account_id,
        a.name::VARCHAR AS account_name,
        a.color::VARCHAR AS account_color,
        c.notes,
        c.status,
        c.amount_repaid,
        (c.amount - c.amount_repaid) AS amount_pending,
        (SELECT COUNT(*) FROM accounting_contribution_repayments r WHERE r.contribution_id = c.id) AS repayment_count,
        c.created_at,
        c.updated_at
    FROM accounting_partner_contributions c
    LEFT JOIN accounting_accounts a ON c.account_id = a.id
    WHERE
        (p_status IS NULL OR c.status = p_status)
        AND (p_partner_name IS NULL OR c.partner_name ILIKE '%' || p_partner_name || '%')
    ORDER BY
        CASE c.status
            WHEN 'pending' THEN 1
            WHEN 'partial' THEN 2
            WHEN 'completed' THEN 3
        END,
        c.date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: get_contribution_repayments
-- Obtiene las devoluciones de un aporte
-- =====================================================
CREATE OR REPLACE FUNCTION get_contribution_repayments(
    p_contribution_id UUID
)
RETURNS TABLE (
    id UUID,
    contribution_id UUID,
    amount DECIMAL,
    date DATE,
    repayment_type repayment_type,
    account_id UUID,
    account_name VARCHAR,
    account_color VARCHAR,
    notes TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.contribution_id,
        r.amount,
        r.date,
        r.repayment_type,
        r.account_id,
        a.name::VARCHAR AS account_name,
        a.color::VARCHAR AS account_color,
        r.notes,
        r.created_at
    FROM accounting_contribution_repayments r
    LEFT JOIN accounting_accounts a ON r.account_id = a.id
    WHERE r.contribution_id = p_contribution_id
    ORDER BY r.date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: get_contributions_summary
-- Resumen de aportes por socio
-- =====================================================
CREATE OR REPLACE FUNCTION get_contributions_summary()
RETURNS TABLE (
    partner_name VARCHAR,
    total_contributed_ars DECIMAL,
    total_contributed_usd DECIMAL,
    total_repaid_ars DECIMAL,
    total_repaid_usd DECIMAL,
    total_pending_ars DECIMAL,
    total_pending_usd DECIMAL,
    contribution_count BIGINT,
    pending_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.partner_name,
        COALESCE(SUM(CASE WHEN c.currency = 'ARS' THEN c.amount ELSE 0 END), 0) AS total_contributed_ars,
        COALESCE(SUM(CASE WHEN c.currency = 'USD' THEN c.amount ELSE 0 END), 0) AS total_contributed_usd,
        COALESCE(SUM(CASE WHEN c.currency = 'ARS' THEN c.amount_repaid ELSE 0 END), 0) AS total_repaid_ars,
        COALESCE(SUM(CASE WHEN c.currency = 'USD' THEN c.amount_repaid ELSE 0 END), 0) AS total_repaid_usd,
        COALESCE(SUM(CASE WHEN c.currency = 'ARS' THEN (c.amount - c.amount_repaid) ELSE 0 END), 0) AS total_pending_ars,
        COALESCE(SUM(CASE WHEN c.currency = 'USD' THEN (c.amount - c.amount_repaid) ELSE 0 END), 0) AS total_pending_usd,
        COUNT(*) AS contribution_count,
        COUNT(*) FILTER (WHERE c.status != 'completed') AS pending_count
    FROM accounting_partner_contributions c
    GROUP BY c.partner_name
    ORDER BY total_pending_ars + total_pending_usd DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC: get_contributions_totals
-- Totales globales de aportes
-- =====================================================
CREATE OR REPLACE FUNCTION get_contributions_totals()
RETURNS TABLE (
    total_contributed_ars DECIMAL,
    total_contributed_usd DECIMAL,
    total_repaid_ars DECIMAL,
    total_repaid_usd DECIMAL,
    total_pending_ars DECIMAL,
    total_pending_usd DECIMAL,
    total_contributions BIGINT,
    pending_contributions BIGINT,
    unique_partners BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN c.currency = 'ARS' THEN c.amount ELSE 0 END), 0) AS total_contributed_ars,
        COALESCE(SUM(CASE WHEN c.currency = 'USD' THEN c.amount ELSE 0 END), 0) AS total_contributed_usd,
        COALESCE(SUM(CASE WHEN c.currency = 'ARS' THEN c.amount_repaid ELSE 0 END), 0) AS total_repaid_ars,
        COALESCE(SUM(CASE WHEN c.currency = 'USD' THEN c.amount_repaid ELSE 0 END), 0) AS total_repaid_usd,
        COALESCE(SUM(CASE WHEN c.currency = 'ARS' THEN (c.amount - c.amount_repaid) ELSE 0 END), 0) AS total_pending_ars,
        COALESCE(SUM(CASE WHEN c.currency = 'USD' THEN (c.amount - c.amount_repaid) ELSE 0 END), 0) AS total_pending_usd,
        COUNT(*) AS total_contributions,
        COUNT(*) FILTER (WHERE c.status != 'completed') AS pending_contributions,
        COUNT(DISTINCT c.partner_name) AS unique_partners
    FROM accounting_partner_contributions c;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
