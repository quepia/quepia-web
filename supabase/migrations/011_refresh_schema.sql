-- Force Supabase PostgREST to reload the schema cache
-- Run this in SQL Editor
NOTIFY pgrst, 'reload schema';
