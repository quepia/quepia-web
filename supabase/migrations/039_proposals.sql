-- =====================================================
-- PROPUESTAS COMERCIALES
-- Migración: 039_proposals.sql
-- =====================================================

-- =====================================================
-- TABLA: Propuestas
-- =====================================================
CREATE TABLE IF NOT EXISTS sistema_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_number BIGSERIAL UNIQUE,
  project_id UUID REFERENCES sistema_projects(id) ON DELETE SET NULL,
  client_access_id UUID REFERENCES sistema_client_access(id) ON DELETE SET NULL,
  client_name TEXT,
  client_email TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  currency VARCHAR(3) DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD', 'EUR')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'changes_requested', 'accepted', 'rejected')),
  public_token UUID UNIQUE DEFAULT gen_random_uuid(),
  total_amount DECIMAL(12,2) DEFAULT 0,
  sent_at TIMESTAMPTZ,
  changes_requested_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  auto_create_payment BOOLEAN DEFAULT false,
  accounting_payment_id UUID REFERENCES accounting_client_payments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES sistema_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_project ON sistema_proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON sistema_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_token ON sistema_proposals(public_token);

-- =====================================================
-- TABLA: Secciones de propuestas
-- =====================================================
CREATE TABLE IF NOT EXISTS sistema_proposal_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES sistema_proposals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_sections_proposal ON sistema_proposal_sections(proposal_id);

-- =====================================================
-- TABLA: Items de propuestas
-- =====================================================
CREATE TABLE IF NOT EXISTS sistema_proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES sistema_proposals(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sistema_proposal_sections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  quantity DECIMAL(12,2) DEFAULT 1,
  unit_price DECIMAL(12,2) DEFAULT 0,
  total_price DECIMAL(12,2) DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_items_proposal ON sistema_proposal_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_items_section ON sistema_proposal_items(section_id);

-- =====================================================
-- TABLA: Comentarios de propuestas (cambios solicitados)
-- =====================================================
CREATE TABLE IF NOT EXISTS sistema_proposal_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES sistema_proposals(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_client BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal ON sistema_proposal_comments(proposal_id);

-- =====================================================
-- TRIGGERS: updated_at
-- =====================================================
DROP TRIGGER IF EXISTS update_sistema_proposals_updated_at ON sistema_proposals;
CREATE TRIGGER update_sistema_proposals_updated_at
  BEFORE UPDATE ON sistema_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_proposal_sections_updated_at ON sistema_proposal_sections;
CREATE TRIGGER update_sistema_proposal_sections_updated_at
  BEFORE UPDATE ON sistema_proposal_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_proposal_items_updated_at ON sistema_proposal_items;
CREATE TRIGGER update_sistema_proposal_items_updated_at
  BEFORE UPDATE ON sistema_proposal_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
