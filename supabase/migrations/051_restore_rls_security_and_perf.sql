-- =====================================================
-- 051_restore_rls_security_and_perf.sql
-- Re-enable RLS safely (without recursive policies) and add
-- query-performance indexes for /sistema critical paths.
-- =====================================================

-- -----------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.sistema_is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sistema_users su
    WHERE su.id = p_user_id
      AND su.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.sistema_can_access_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.sistema_is_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.sistema_projects p
      WHERE p.id = p_project_id
        AND (
          p.owner_id = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public.sistema_project_members pm
            WHERE pm.project_id = p_project_id
              AND pm.user_id = p_user_id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.sistema_can_write_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.sistema_is_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.sistema_projects p
      WHERE p.id = p_project_id
        AND (
          p.owner_id = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public.sistema_project_members pm
            WHERE pm.project_id = p_project_id
              AND pm.user_id = p_user_id
              AND pm.role IN ('owner', 'admin', 'member')
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.sistema_can_manage_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.sistema_is_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.sistema_projects p
      WHERE p.id = p_project_id
        AND p.owner_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.sistema_project_members pm
      WHERE pm.project_id = p_project_id
        AND pm.user_id = p_user_id
        AND pm.role IN ('owner', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.sistema_can_access_proposal(p_proposal_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sistema_proposals sp
    WHERE sp.id = p_proposal_id
      AND (
        public.sistema_is_admin(p_user_id)
        OR sp.created_by = p_user_id
        OR (
          sp.project_id IS NOT NULL
          AND public.sistema_can_access_project(sp.project_id, p_user_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.sistema_can_manage_proposal(p_proposal_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sistema_proposals sp
    WHERE sp.id = p_proposal_id
      AND (
        public.sistema_is_admin(p_user_id)
        OR sp.created_by = p_user_id
        OR (
          sp.project_id IS NOT NULL
          AND public.sistema_can_manage_project(sp.project_id, p_user_id)
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.sistema_is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_can_access_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_can_write_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_can_manage_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_can_access_proposal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_can_manage_proposal(UUID, UUID) TO authenticated;

-- -----------------------------------------------------
-- Enable RLS (including non-sistema public tables flagged by linter)
-- -----------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sistema_users',
    'sistema_projects',
    'sistema_project_members',
    'sistema_columns',
    'sistema_tasks',
    'sistema_subtasks',
    'sistema_task_links',
    'sistema_comments',
    'sistema_favorites',
    'sistema_labels',
    'sistema_calendar_events',
    'sistema_client_access',
    'sistema_client_sessions',
    'sistema_assets',
    'sistema_asset_versions',
    'sistema_annotations',
    'sistema_approval_log',
    'sistema_proposals',
    'sistema_proposal_sections',
    'sistema_proposal_items',
    'sistema_proposal_comments',
    'sistema_proposal_templates',
    'sistema_proposal_template_sections',
    'sistema_proposal_template_items',
    'sistema_crm_stages',
    'sistema_crm_leads',
    'user_profiles',
    'news_queue',
    'asset_versions',
    'annotations',
    'magic_links',
    'time_entries',
    'project_milestones',
    'activity_log'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------
-- Drop existing policies on critical tables (to prevent recursive hangs)
-- -----------------------------------------------------
DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sistema_users',
    'sistema_projects',
    'sistema_project_members',
    'sistema_columns',
    'sistema_tasks',
    'sistema_favorites',
    'sistema_calendar_events',
    'sistema_client_access',
    'sistema_client_sessions',
    'sistema_assets',
    'sistema_proposals',
    'sistema_proposal_sections',
    'sistema_proposal_items',
    'sistema_proposal_comments',
    'sistema_proposal_templates',
    'sistema_proposal_template_sections',
    'sistema_proposal_template_items',
    'sistema_crm_stages',
    'sistema_crm_leads'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------
-- Core sistema policies (non-recursive)
-- -----------------------------------------------------

-- sistema_users
CREATE POLICY sistema_users_select_authenticated
ON public.sistema_users
FOR SELECT TO authenticated
USING (true);

CREATE POLICY sistema_users_insert_self_or_admin
ON public.sistema_users
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id OR public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_users_update_self_or_admin
ON public.sistema_users
FOR UPDATE TO authenticated
USING (auth.uid() = id OR public.sistema_is_admin(auth.uid()))
WITH CHECK (auth.uid() = id OR public.sistema_is_admin(auth.uid()));

-- sistema_projects
CREATE POLICY sistema_projects_select
ON public.sistema_projects
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(id, auth.uid()));

CREATE POLICY sistema_projects_insert
ON public.sistema_projects
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() OR public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_projects_update
ON public.sistema_projects
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_project(id, auth.uid()))
WITH CHECK (public.sistema_can_manage_project(id, auth.uid()));

CREATE POLICY sistema_projects_delete
ON public.sistema_projects
FOR DELETE TO authenticated
USING (public.sistema_can_manage_project(id, auth.uid()));

-- sistema_project_members
CREATE POLICY sistema_project_members_select
ON public.sistema_project_members
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, auth.uid()));

CREATE POLICY sistema_project_members_insert
ON public.sistema_project_members
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_manage_project(project_id, auth.uid()));

CREATE POLICY sistema_project_members_update
ON public.sistema_project_members
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_project(project_id, auth.uid()))
WITH CHECK (public.sistema_can_manage_project(project_id, auth.uid()));

CREATE POLICY sistema_project_members_delete
ON public.sistema_project_members
FOR DELETE TO authenticated
USING (public.sistema_can_manage_project(project_id, auth.uid()));

-- sistema_columns
CREATE POLICY sistema_columns_select
ON public.sistema_columns
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, auth.uid()));

CREATE POLICY sistema_columns_insert
ON public.sistema_columns
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_columns_update
ON public.sistema_columns
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()))
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_columns_delete
ON public.sistema_columns
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()));

-- sistema_tasks
CREATE POLICY sistema_tasks_select
ON public.sistema_tasks
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, auth.uid()));

CREATE POLICY sistema_tasks_insert
ON public.sistema_tasks
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_tasks_update
ON public.sistema_tasks
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()))
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_tasks_delete
ON public.sistema_tasks
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()));

-- sistema_favorites
CREATE POLICY sistema_favorites_select
ON public.sistema_favorites
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY sistema_favorites_insert
ON public.sistema_favorites
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY sistema_favorites_delete
ON public.sistema_favorites
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- sistema_calendar_events
CREATE POLICY sistema_calendar_events_select
ON public.sistema_calendar_events
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, auth.uid()));

CREATE POLICY sistema_calendar_events_insert
ON public.sistema_calendar_events
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_calendar_events_update
ON public.sistema_calendar_events
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()))
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_calendar_events_delete
ON public.sistema_calendar_events
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()));

-- sistema_client_access
CREATE POLICY sistema_client_access_select
ON public.sistema_client_access
FOR SELECT TO authenticated
USING (public.sistema_can_manage_project(project_id, auth.uid()));

CREATE POLICY sistema_client_access_insert
ON public.sistema_client_access
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_manage_project(project_id, auth.uid()));

CREATE POLICY sistema_client_access_update
ON public.sistema_client_access
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_project(project_id, auth.uid()))
WITH CHECK (public.sistema_can_manage_project(project_id, auth.uid()));

CREATE POLICY sistema_client_access_delete
ON public.sistema_client_access
FOR DELETE TO authenticated
USING (public.sistema_can_manage_project(project_id, auth.uid()));

-- sistema_assets
CREATE POLICY sistema_assets_select
ON public.sistema_assets
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, auth.uid()));

CREATE POLICY sistema_assets_insert
ON public.sistema_assets
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_assets_update
ON public.sistema_assets
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()))
WITH CHECK (public.sistema_can_write_project(project_id, auth.uid()));

CREATE POLICY sistema_assets_delete
ON public.sistema_assets
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, auth.uid()));

-- -----------------------------------------------------
-- Proposals + CRM policies
-- Public token flows are handled server-side via service role.
-- -----------------------------------------------------

-- sistema_proposals
CREATE POLICY sistema_proposals_select
ON public.sistema_proposals
FOR SELECT TO authenticated
USING (public.sistema_can_access_proposal(id, auth.uid()));

CREATE POLICY sistema_proposals_insert
ON public.sistema_proposals
FOR INSERT TO authenticated
WITH CHECK (
  (created_by = auth.uid() OR public.sistema_is_admin(auth.uid()))
  AND (project_id IS NULL OR public.sistema_can_manage_project(project_id, auth.uid()))
);

CREATE POLICY sistema_proposals_update
ON public.sistema_proposals
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_proposal(id, auth.uid()))
WITH CHECK (
  public.sistema_can_manage_proposal(id, auth.uid())
  AND (project_id IS NULL OR public.sistema_can_manage_project(project_id, auth.uid()))
);

CREATE POLICY sistema_proposals_delete
ON public.sistema_proposals
FOR DELETE TO authenticated
USING (public.sistema_can_manage_proposal(id, auth.uid()));

-- sistema_proposal_sections
CREATE POLICY sistema_proposal_sections_select
ON public.sistema_proposal_sections
FOR SELECT TO authenticated
USING (public.sistema_can_access_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_sections_insert
ON public.sistema_proposal_sections
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_sections_update
ON public.sistema_proposal_sections
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_proposal(proposal_id, auth.uid()))
WITH CHECK (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_sections_delete
ON public.sistema_proposal_sections
FOR DELETE TO authenticated
USING (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

-- sistema_proposal_items
CREATE POLICY sistema_proposal_items_select
ON public.sistema_proposal_items
FOR SELECT TO authenticated
USING (public.sistema_can_access_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_items_insert
ON public.sistema_proposal_items
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_items_update
ON public.sistema_proposal_items
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_proposal(proposal_id, auth.uid()))
WITH CHECK (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_items_delete
ON public.sistema_proposal_items
FOR DELETE TO authenticated
USING (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

-- sistema_proposal_comments
CREATE POLICY sistema_proposal_comments_select
ON public.sistema_proposal_comments
FOR SELECT TO authenticated
USING (public.sistema_can_access_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_comments_insert
ON public.sistema_proposal_comments
FOR INSERT TO authenticated
WITH CHECK (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_comments_update
ON public.sistema_proposal_comments
FOR UPDATE TO authenticated
USING (public.sistema_can_manage_proposal(proposal_id, auth.uid()))
WITH CHECK (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

CREATE POLICY sistema_proposal_comments_delete
ON public.sistema_proposal_comments
FOR DELETE TO authenticated
USING (public.sistema_can_manage_proposal(proposal_id, auth.uid()));

-- sistema_proposal_templates (read for authenticated, write for admins)
CREATE POLICY sistema_proposal_templates_select
ON public.sistema_proposal_templates
FOR SELECT TO authenticated
USING (true);

CREATE POLICY sistema_proposal_templates_insert
ON public.sistema_proposal_templates
FOR INSERT TO authenticated
WITH CHECK (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_proposal_templates_update
ON public.sistema_proposal_templates
FOR UPDATE TO authenticated
USING (public.sistema_is_admin(auth.uid()))
WITH CHECK (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_proposal_templates_delete
ON public.sistema_proposal_templates
FOR DELETE TO authenticated
USING (public.sistema_is_admin(auth.uid()));

-- sistema_proposal_template_sections
CREATE POLICY sistema_proposal_template_sections_select
ON public.sistema_proposal_template_sections
FOR SELECT TO authenticated
USING (true);

CREATE POLICY sistema_proposal_template_sections_insert
ON public.sistema_proposal_template_sections
FOR INSERT TO authenticated
WITH CHECK (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_proposal_template_sections_update
ON public.sistema_proposal_template_sections
FOR UPDATE TO authenticated
USING (public.sistema_is_admin(auth.uid()))
WITH CHECK (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_proposal_template_sections_delete
ON public.sistema_proposal_template_sections
FOR DELETE TO authenticated
USING (public.sistema_is_admin(auth.uid()));

-- sistema_proposal_template_items
CREATE POLICY sistema_proposal_template_items_select
ON public.sistema_proposal_template_items
FOR SELECT TO authenticated
USING (true);

CREATE POLICY sistema_proposal_template_items_insert
ON public.sistema_proposal_template_items
FOR INSERT TO authenticated
WITH CHECK (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_proposal_template_items_update
ON public.sistema_proposal_template_items
FOR UPDATE TO authenticated
USING (public.sistema_is_admin(auth.uid()))
WITH CHECK (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_proposal_template_items_delete
ON public.sistema_proposal_template_items
FOR DELETE TO authenticated
USING (public.sistema_is_admin(auth.uid()));

-- CRM (admin-only)
CREATE POLICY sistema_crm_stages_admin_select
ON public.sistema_crm_stages
FOR SELECT TO authenticated
USING (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_crm_stages_admin_manage
ON public.sistema_crm_stages
FOR ALL TO authenticated
USING (public.sistema_is_admin(auth.uid()))
WITH CHECK (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_crm_leads_admin_select
ON public.sistema_crm_leads
FOR SELECT TO authenticated
USING (public.sistema_is_admin(auth.uid()));

CREATE POLICY sistema_crm_leads_admin_manage
ON public.sistema_crm_leads
FOR ALL TO authenticated
USING (public.sistema_is_admin(auth.uid()))
WITH CHECK (public.sistema_is_admin(auth.uid()));

-- -----------------------------------------------------
-- Performance indexes for critical /sistema queries
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sistema_tasks_project_due_date
  ON public.sistema_tasks (project_id, due_date);

CREATE INDEX IF NOT EXISTS idx_sistema_tasks_project_completed_due_date
  ON public.sistema_tasks (project_id, completed, due_date);

CREATE INDEX IF NOT EXISTS idx_sistema_tasks_project_updated_at
  ON public.sistema_tasks (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_calendar_events_project_start
  ON public.sistema_calendar_events (project_id, fecha_inicio);

CREATE INDEX IF NOT EXISTS idx_sistema_project_members_user_project_role
  ON public.sistema_project_members (user_id, project_id, role);

CREATE INDEX IF NOT EXISTS idx_sistema_client_access_project_created
  ON public.sistema_client_access (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_proposals_project_created
  ON public.sistema_proposals (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_crm_leads_owner_status
  ON public.sistema_crm_leads (owner_id, status_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
