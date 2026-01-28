-- FIX: Calendar Import Hang (Infinite Recursion on INSERT)
-- Uses SECURITY DEFINER functions to break RLS loops

-- 1. Helper Functions (SECURITY DEFINER = Bypasses RLS)
-- Ensure these are robust and don't trigger recursion
CREATE OR REPLACE FUNCTION is_project_member(p_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sistema_project_members
        WHERE project_id = p_id AND user_id = u_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_project_editor(p_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sistema_project_members
        WHERE project_id = p_id 
        AND user_id = u_id
        AND role IN ('owner', 'admin', 'member')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. CALENDAR EVENTS POLICIES
DROP POLICY IF EXISTS "Members can view calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can create calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can update calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can delete calendar events" ON sistema_calendar_events;

-- View: Allow owners and all members
CREATE POLICY "Members can view calendar events" ON sistema_calendar_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (
                p.owner_id = auth.uid() 
                OR is_project_member(p.id, auth.uid()) -- Safe check
            )
        )
    );

-- Create: Allow owners and editors
CREATE POLICY "Members can create calendar events" ON sistema_calendar_events
    FOR INSERT WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (
                p.owner_id = auth.uid() 
                OR is_project_editor(p.id, auth.uid()) -- Safe check
            )
        )
    );

-- Update: Allow owners and editors
CREATE POLICY "Members can update calendar events" ON sistema_calendar_events
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (
                p.owner_id = auth.uid() 
                OR is_project_editor(p.id, auth.uid()) -- Safe check
            )
        )
    );

-- Delete: Allow owners and editors
CREATE POLICY "Members can delete calendar events" ON sistema_calendar_events
    FOR DELETE USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (
                p.owner_id = auth.uid() 
                OR is_project_editor(p.id, auth.uid()) -- Safe check
            )
        )
    );

-- 3. NOTIFY RELOAD
NOTIFY pgrst, 'reload schema';
