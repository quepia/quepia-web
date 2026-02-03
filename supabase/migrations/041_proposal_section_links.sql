-- =====================================================
-- LINKS EN SECCIONES DE PROPUESTAS
-- Migración: 041_proposal_section_links.sql
-- =====================================================

ALTER TABLE sistema_proposal_sections
  ADD COLUMN IF NOT EXISTS moodboard_links JSONB DEFAULT '[]'::jsonb;

ALTER TABLE sistema_proposal_template_sections
  ADD COLUMN IF NOT EXISTS moodboard_links JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
