-- FIX: Update Calendar Events policies to prevent recursion/hangs use helper functions
-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. Create helper function to check editor permission (owner, admin, member) - excluding viewer
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RESET Calendar Events Policies
DROP POLICY IF EXISTS "Members can view calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can create calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can update calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can delete calendar events" ON sistema_calendar_events;

-- View: Allow owners and all members (including viewers)
CREATE POLICY "Members can view calendar events" ON sistema_calendar_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

-- Create: Allow owners and editors (admin, member)
CREATE POLICY "Members can create calendar events" ON sistema_calendar_events
    FOR INSERT WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR is_project_editor(p.id, auth.uid()))
        )
    );

-- Update: Allow owners and editors (admin, member)
CREATE POLICY "Members can update calendar events" ON sistema_calendar_events
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR is_project_editor(p.id, auth.uid()))
        )
    );

-- Delete: Allow owners and editors (admin, member) - or creator?
-- Original was: created_by = auth.uid() OR ...
CREATE POLICY "Members can delete calendar events" ON sistema_calendar_events
    FOR DELETE USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR is_project_editor(p.id, auth.uid()))
        )
    );
