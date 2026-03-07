-- 058_align_comment_and_link_rls_with_global_admin.sql
-- Align comments/link policies with helper-function model introduced in migration 051.
-- Goal: global admins (sistema_users.role = 'admin') can see all project comments and links
-- without requiring explicit per-project membership.

ALTER TABLE public.sistema_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_calendar_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_task_links ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- sistema_comments
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Members can view comments" ON public.sistema_comments;
DROP POLICY IF EXISTS "Members can create comments" ON public.sistema_comments;
DROP POLICY IF EXISTS "Users can update own comments" ON public.sistema_comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.sistema_comments;
DROP POLICY IF EXISTS sistema_comments_select ON public.sistema_comments;
DROP POLICY IF EXISTS sistema_comments_insert ON public.sistema_comments;
DROP POLICY IF EXISTS sistema_comments_update ON public.sistema_comments;
DROP POLICY IF EXISTS sistema_comments_delete ON public.sistema_comments;

CREATE POLICY sistema_comments_select
ON public.sistema_comments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_comments.task_id
      AND public.sistema_can_access_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_comments_insert
ON public.sistema_comments
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_comments.task_id
      AND public.sistema_can_access_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_comments_update
ON public.sistema_comments
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_comments.task_id
      AND public.sistema_can_access_project(t.project_id, auth.uid())
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_comments.task_id
      AND public.sistema_can_access_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_comments_delete
ON public.sistema_comments
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_comments.task_id
      AND public.sistema_can_access_project(t.project_id, auth.uid())
  )
);

-- -----------------------------------------------------
-- sistema_calendar_comments
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Users can view comments on their projects" ON public.sistema_calendar_comments;
DROP POLICY IF EXISTS "Users can insert comments on their projects" ON public.sistema_calendar_comments;
DROP POLICY IF EXISTS sistema_calendar_comments_select ON public.sistema_calendar_comments;
DROP POLICY IF EXISTS sistema_calendar_comments_insert ON public.sistema_calendar_comments;

CREATE POLICY sistema_calendar_comments_select
ON public.sistema_calendar_comments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_calendar_events e
    WHERE e.id = public.sistema_calendar_comments.event_id
      AND public.sistema_can_access_project(e.project_id, auth.uid())
  )
);

CREATE POLICY sistema_calendar_comments_insert
ON public.sistema_calendar_comments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sistema_calendar_events e
    WHERE e.id = public.sistema_calendar_comments.event_id
      AND public.sistema_can_access_project(e.project_id, auth.uid())
  )
);

-- -----------------------------------------------------
-- sistema_task_links
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Members can view task links" ON public.sistema_task_links;
DROP POLICY IF EXISTS "Members can manage task links" ON public.sistema_task_links;
DROP POLICY IF EXISTS sistema_task_links_select ON public.sistema_task_links;
DROP POLICY IF EXISTS sistema_task_links_insert ON public.sistema_task_links;
DROP POLICY IF EXISTS sistema_task_links_update ON public.sistema_task_links;
DROP POLICY IF EXISTS sistema_task_links_delete ON public.sistema_task_links;

CREATE POLICY sistema_task_links_select
ON public.sistema_task_links
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_task_links.task_id
      AND public.sistema_can_access_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_task_links_insert
ON public.sistema_task_links
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_task_links.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_task_links_update
ON public.sistema_task_links
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_task_links.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_task_links.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_task_links_delete
ON public.sistema_task_links
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_task_links.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
