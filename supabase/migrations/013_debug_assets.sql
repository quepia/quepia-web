-- DEBUG: Disable RLS and List Triggers
-- Run this in Supabase SQL Editor

-- 1. Temporarily disable RLS on sistema_assets to rule out policy recursion
ALTER TABLE sistema_assets DISABLE ROW LEVEL SECURITY;

-- 2. List all triggers on this table (to check for zombies)
SELECT 
    tgname as trigger_name,
    tgtype,
    tgenabled
FROM pg_trigger
WHERE tgrelid = 'sistema_assets'::regclass;

-- 3. Force schema reload
NOTIFY pgrst, 'reload schema';
