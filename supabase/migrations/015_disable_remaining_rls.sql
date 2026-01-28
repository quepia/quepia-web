-- DEBUG: Disable RLS on EVERYTHING to find the blocker
-- Run this in Supabase SQL Editor

-- We already disabled Projects, Tasks, Assets, Members.
-- Now disabling the rest of the dependency chain:

ALTER TABLE sistema_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_asset_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_annotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_approval_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_columns DISABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_comments DISABLE ROW LEVEL SECURITY;

-- Force schema reload
NOTIFY pgrst, 'reload schema';
