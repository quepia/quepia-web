-- =====================================================
-- Ajuste RLS: propuestas permiten write-level project members
-- Migración: 054_fix_proposals_write_scope.sql
-- =====================================================

BEGIN;

DROP POLICY IF EXISTS sistema_proposals_insert ON public.sistema_proposals;
CREATE POLICY sistema_proposals_insert
ON public.sistema_proposals
FOR INSERT TO authenticated
WITH CHECK (
  (created_by = auth.uid() OR public.sistema_is_admin(auth.uid()))
  AND (
    project_id IS NULL
    OR public.sistema_can_write_project(project_id, auth.uid())
  )
);

DROP POLICY IF EXISTS sistema_proposals_update ON public.sistema_proposals;
CREATE POLICY sistema_proposals_update
ON public.sistema_proposals
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_proposal(id, auth.uid()))
WITH CHECK (
  public.sistema_can_manage_proposal(id, auth.uid())
  AND (
    project_id IS NULL
    OR public.sistema_can_write_project(project_id, auth.uid())
  )
);

COMMIT;

NOTIFY pgrst, 'reload schema';
