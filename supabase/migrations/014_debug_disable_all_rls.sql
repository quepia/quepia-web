-- DEBUG: Disable RLS on ALL Project Tables
-- Run this in Supabase SQL Editor

-- If this fixes the hang, the issue is definitely RLS recursion via Foreign Keys
ALTER TABLE sistema_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_project_members DISABLE ROW LEVEL SECURITY;
-- assets already disabled, but good to ensure
ALTER TABLE sistema_assets DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
