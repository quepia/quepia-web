-- =====================================================
-- PLANTILLAS DE PROPUESTAS
-- Migración: 040_proposal_templates.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS sistema_proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  currency VARCHAR(3) DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD', 'EUR')),
  created_by UUID REFERENCES sistema_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sistema_proposal_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES sistema_proposal_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sistema_proposal_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES sistema_proposal_templates(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sistema_proposal_template_sections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  quantity DECIMAL(12,2) DEFAULT 1,
  unit_price DECIMAL(12,2) DEFAULT 0,
  total_price DECIMAL(12,2) DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_templates_name ON sistema_proposal_templates(name);
CREATE INDEX IF NOT EXISTS idx_proposal_template_sections_template ON sistema_proposal_template_sections(template_id);
CREATE INDEX IF NOT EXISTS idx_proposal_template_items_template ON sistema_proposal_template_items(template_id);

DROP TRIGGER IF EXISTS update_sistema_proposal_templates_updated_at ON sistema_proposal_templates;
CREATE TRIGGER update_sistema_proposal_templates_updated_at
  BEFORE UPDATE ON sistema_proposal_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_proposal_template_sections_updated_at ON sistema_proposal_template_sections;
CREATE TRIGGER update_sistema_proposal_template_sections_updated_at
  BEFORE UPDATE ON sistema_proposal_template_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_proposal_template_items_updated_at ON sistema_proposal_template_items;
CREATE TRIGGER update_sistema_proposal_template_items_updated_at
  BEFORE UPDATE ON sistema_proposal_template_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PLANTILLAS BASE (opcional)
-- =====================================================
WITH t AS (
  INSERT INTO sistema_proposal_templates (name, description, currency)
  VALUES
    ('Branding + Identidad', 'Plantilla base para branding completo', 'USD'),
    ('Web Corporativa', 'Plantilla base para sitios web', 'USD')
  ON CONFLICT DO NOTHING
  RETURNING id, name
),
sections AS (
  INSERT INTO sistema_proposal_template_sections (template_id, title, description, position)
  SELECT t.id, s.title, s.description, s.position
  FROM t
  JOIN (VALUES
    ('Branding + Identidad', 'Diagnóstico y estrategia', 'Análisis de marca y posicionamiento.', 0),
    ('Branding + Identidad', 'Identidad visual', 'Logo, paleta, tipografías y aplicaciones.', 1),
    ('Branding + Identidad', 'Entregables finales', 'Manual y recursos finales.', 2),
    ('Web Corporativa', 'Arquitectura y UX', 'Mapa del sitio y wireframes.', 0),
    ('Web Corporativa', 'Diseño UI', 'Diseño visual de páginas clave.', 1),
    ('Web Corporativa', 'Desarrollo', 'Implementación y despliegue.', 2)
  ) AS s(template_name, title, description, position)
  ON t.name = s.template_name
  RETURNING id, template_id, title
),
items AS (
  INSERT INTO sistema_proposal_template_items (template_id, section_id, title, description, quantity, unit_price, total_price, position)
  SELECT s.template_id, s.id,
    CASE
      WHEN s.title = 'Diagnóstico y estrategia' THEN 'Workshop estratégico'
      WHEN s.title = 'Identidad visual' THEN 'Sistema de marca'
      WHEN s.title = 'Entregables finales' THEN 'Manual de marca'
      WHEN s.title = 'Arquitectura y UX' THEN 'Wireframes'
      WHEN s.title = 'Diseño UI' THEN 'Diseño visual'
      WHEN s.title = 'Desarrollo' THEN 'Desarrollo web'
      ELSE 'Item'
    END AS title,
    NULL AS description,
    1 AS quantity,
    0 AS unit_price,
    0 AS total_price,
    0 AS position
  FROM sections s
)
SELECT 1;

NOTIFY pgrst, 'reload schema';
