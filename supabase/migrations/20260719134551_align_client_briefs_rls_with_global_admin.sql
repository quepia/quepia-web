-- Align client brief access with the centralized project permission helpers.
-- Global admins can access every project in the UI, so brief RLS must use the
-- same helper model as projects, tasks, comments, links, and assets.

BEGIN;

ALTER TABLE public.sistema_client_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view briefs" ON public.sistema_client_briefs;
DROP POLICY IF EXISTS "Members can manage briefs" ON public.sistema_client_briefs;
DROP POLICY IF EXISTS sistema_client_briefs_select ON public.sistema_client_briefs;
DROP POLICY IF EXISTS sistema_client_briefs_insert ON public.sistema_client_briefs;
DROP POLICY IF EXISTS sistema_client_briefs_update ON public.sistema_client_briefs;
DROP POLICY IF EXISTS sistema_client_briefs_delete ON public.sistema_client_briefs;

CREATE POLICY sistema_client_briefs_select
ON public.sistema_client_briefs
FOR SELECT TO authenticated
USING (
  public.sistema_can_access_project(project_id, (SELECT auth.uid()))
);

CREATE POLICY sistema_client_briefs_insert
ON public.sistema_client_briefs
FOR INSERT TO authenticated
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
);

CREATE POLICY sistema_client_briefs_update
ON public.sistema_client_briefs
FOR UPDATE TO authenticated
USING (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
)
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
);

CREATE POLICY sistema_client_briefs_delete
ON public.sistema_client_briefs
FOR DELETE TO authenticated
USING (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
);

-- Brief logos use a dedicated prefix in the private sistema-assets bucket.
-- Keep their read access aligned with the brief row itself, including global admins.
DROP POLICY IF EXISTS "Project members can read brief brand files" ON storage.objects;
DROP POLICY IF EXISTS sistema_brief_brand_files_select ON storage.objects;

CREATE POLICY sistema_brief_brand_files_select
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'sistema-assets'
  AND (storage.foldername(name))[1] = 'briefs'
  AND EXISTS (
    SELECT 1
    FROM public.sistema_projects project
    WHERE project.id::text = (storage.foldername(name))[2]
      AND public.sistema_can_access_project(project.id, (SELECT auth.uid()))
  )
);

COMMIT;

NOTIFY pgrst, 'reload schema';
