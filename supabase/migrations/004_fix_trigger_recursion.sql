-- Fix recursion in project creation trigger
-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. Update the trigger function to be SECURITY DEFINER
-- This ensures the automatic member addition bypasses RLS checks on sistema_project_members table
-- This breaks the cycle: Insert Project -> Trigger -> Insert Member -> Check RLS -> Check Project -> ...
CREATE OR REPLACE FUNCTION add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sistema_project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- 2. Ensure related helper functions are present and correct (from 003)
CREATE OR REPLACE FUNCTION is_project_member(p_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sistema_project_members
        WHERE project_id = p_id AND user_id = u_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_project_admin(p_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sistema_project_members
        WHERE project_id = p_id 
        AND user_id = u_id
        AND role IN ('owner', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-apply key policies to ensuring robust logic
DROP POLICY IF EXISTS "Users can view their projects" ON sistema_projects;
CREATE POLICY "Users can view their projects" ON sistema_projects
    FOR SELECT USING (
        owner_id = auth.uid() OR
        is_project_member(id, auth.uid())
    );

DROP POLICY IF EXISTS "Admins can manage members" ON sistema_project_members;
CREATE POLICY "Admins can manage members" ON sistema_project_members
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sistema_projects WHERE id = project_id AND owner_id = auth.uid())
        OR 
        is_project_admin(project_id, auth.uid())
    );
