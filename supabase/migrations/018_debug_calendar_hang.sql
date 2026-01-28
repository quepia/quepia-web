-- DEBUG: Remove all complexity to find the hang cause
-- This temporarily allows ALL inserts to calendar_events to see if the policy logic is the block.

-- 1. DROP ALL POLICIES on sistema_calendar_events
DROP POLICY IF EXISTS "Members can view calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can create calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can update calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can delete calendar events" ON sistema_calendar_events;

-- 2. CREATE A "PERMISSIVE" INSERT POLICY
-- This removes the check for project membership entirely for the INSERT operation.
-- If this works, we know the "EXISTS (SELECT ...)" part was the problem.
CREATE POLICY "Debug: Allow All Inserts" ON sistema_calendar_events
    FOR INSERT WITH CHECK (true);

-- 3. KEEP VIEW POLICY SIMPLE (So you can see them)
CREATE POLICY "Debug: View Own or Public" ON sistema_calendar_events
    FOR SELECT USING (true);
    
-- 4. REMOVE UPDATE/DELETE for now (safe mode)

NOTIFY pgrst, 'reload schema';
