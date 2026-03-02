-- 055_fix_subtasks_rls_with_helper_functions.sql
-- Align subtasks RLS with tasks helper-function model from migration 051.
-- This fixes cases where global admins can manage tasks but cannot insert subtasks.

ALTER TABLE public.sistema_subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view subtasks" ON public.sistema_subtasks;
DROP POLICY IF EXISTS "Members can manage subtasks" ON public.sistema_subtasks;
DROP POLICY IF EXISTS sistema_subtasks_select ON public.sistema_subtasks;
DROP POLICY IF EXISTS sistema_subtasks_insert ON public.sistema_subtasks;
DROP POLICY IF EXISTS sistema_subtasks_update ON public.sistema_subtasks;
DROP POLICY IF EXISTS sistema_subtasks_delete ON public.sistema_subtasks;

CREATE POLICY sistema_subtasks_select
ON public.sistema_subtasks
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_subtasks.task_id
      AND public.sistema_can_access_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_subtasks_insert
ON public.sistema_subtasks
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_subtasks.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_subtasks_update
ON public.sistema_subtasks
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_subtasks.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_subtasks.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
);

CREATE POLICY sistema_subtasks_delete
ON public.sistema_subtasks
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sistema_tasks t
    WHERE t.id = public.sistema_subtasks.task_id
      AND public.sistema_can_write_project(t.project_id, auth.uid())
  )
);
