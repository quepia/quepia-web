-- =====================================================
-- CRM / PIPELINE
-- Migración: 042_crm_pipeline.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS sistema_crm_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sistema_crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  service_interest TEXT,
  estimated_budget DECIMAL(12,2),
  status_id UUID REFERENCES sistema_crm_stages(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES sistema_users(id),
  notes TEXT,
  proposal_id UUID REFERENCES sistema_proposals(id) ON DELETE SET NULL,
  project_id UUID REFERENCES sistema_projects(id) ON DELETE SET NULL,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON sistema_crm_leads(status_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_owner ON sistema_crm_leads(owner_id);

DROP TRIGGER IF EXISTS update_sistema_crm_stages_updated_at ON sistema_crm_stages;
CREATE TRIGGER update_sistema_crm_stages_updated_at
  BEFORE UPDATE ON sistema_crm_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_crm_leads_updated_at ON sistema_crm_leads;
CREATE TRIGGER update_sistema_crm_leads_updated_at
  BEFORE UPDATE ON sistema_crm_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Default stages
INSERT INTO sistema_crm_stages (name, position, is_default)
VALUES
  ('Lead', 0, true),
  ('Contactado', 1, false),
  ('Reunión', 2, false),
  ('Propuesta enviada', 3, false),
  ('Negociación', 4, false),
  ('Ganado', 5, false),
  ('Perdido', 6, false)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
