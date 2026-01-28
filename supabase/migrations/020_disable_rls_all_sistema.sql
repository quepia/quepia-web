-- FIX: Disable RLS on ALL sistema tables to prevent recursive policy hangs
-- The app already filters by owner_id/userId in every query, providing application-level access control.
-- RLS policies on these tables cause infinite recursion because they cross-reference each other.
-- RUN THIS IN SUPABASE SQL EDITOR

ALTER TABLE sistema_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_project_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_calendar_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_columns DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_users DISABLE ROW LEVEL SECURITY;

-- Also disable on these if they exist
DO $$ BEGIN
  EXECUTE 'ALTER TABLE sistema_favorites DISABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'ALTER TABLE sistema_client_access DISABLE ROW LEVEL SECURITY';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
