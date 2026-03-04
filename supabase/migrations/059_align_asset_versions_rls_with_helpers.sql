-- 059_align_asset_versions_rls_with_helpers.sql
-- Align asset version RLS with helper-function model from migration 051.
-- This keeps project write access checks consistent between sistema_assets
-- and sistema_asset_versions.

ALTER TABLE public.sistema_asset_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view asset versions" ON public.sistema_asset_versions;
DROP POLICY IF EXISTS "Members can manage asset versions" ON public.sistema_asset_versions;
DROP POLICY IF EXISTS sistema_asset_versions_select ON public.sistema_asset_versions;
DROP POLICY IF EXISTS sistema_asset_versions_insert ON public.sistema_asset_versions;
DROP POLICY IF EXISTS sistema_asset_versions_update ON public.sistema_asset_versions;
DROP POLICY IF EXISTS sistema_asset_versions_delete ON public.sistema_asset_versions;

CREATE POLICY sistema_asset_versions_select
ON public.sistema_asset_versions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_assets a
    WHERE a.id = public.sistema_asset_versions.asset_id
      AND public.sistema_can_access_project(a.project_id, auth.uid())
  )
);

CREATE POLICY sistema_asset_versions_insert
ON public.sistema_asset_versions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sistema_assets a
    WHERE a.id = public.sistema_asset_versions.asset_id
      AND public.sistema_can_write_project(a.project_id, auth.uid())
  )
);

CREATE POLICY sistema_asset_versions_update
ON public.sistema_asset_versions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_assets a
    WHERE a.id = public.sistema_asset_versions.asset_id
      AND public.sistema_can_write_project(a.project_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sistema_assets a
    WHERE a.id = public.sistema_asset_versions.asset_id
      AND public.sistema_can_write_project(a.project_id, auth.uid())
  )
);

CREATE POLICY sistema_asset_versions_delete
ON public.sistema_asset_versions
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_assets a
    WHERE a.id = public.sistema_asset_versions.asset_id
      AND public.sistema_can_write_project(a.project_id, auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
