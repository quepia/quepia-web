-- Fix recursion in RLS policies
-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. Create helper function to check membership without triggering RLS (recursion breaker)
CREATE OR REPLACE FUNCTION is_project_member(p_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sistema_project_members
        WHERE project_id = p_id AND user_id = u_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create helper function to check admin role without triggering RLS
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

-- 3. Update sistema_project_members policies
DROP POLICY IF EXISTS "Members can view project members" ON sistema_project_members;
CREATE POLICY "Members can view project members" ON sistema_project_members
    FOR SELECT USING (
        -- User can see their own membership OR is a member of the project
        user_id = auth.uid() OR
        is_project_member(project_id, auth.uid())
    );

DROP POLICY IF EXISTS "Admins can manage members" ON sistema_project_members;
CREATE POLICY "Admins can manage members" ON sistema_project_members
    FOR ALL USING (
        -- Project owner
        EXISTS (SELECT 1 FROM sistema_projects WHERE id = project_id AND owner_id = auth.uid())
        OR 
        -- Project admin
        is_project_admin(project_id, auth.uid())
    );

-- 4. Update sistema_projects policies to utilize recursion-safe check
DROP POLICY IF EXISTS "Users can view their projects" ON sistema_projects;
CREATE POLICY "Users can view their projects" ON sistema_projects
    FOR SELECT USING (
        owner_id = auth.uid() OR
        is_project_member(id, auth.uid())
    );

-- 5. Update other polices that might benefit from safe checks

-- Columns
DROP POLICY IF EXISTS "Users can view project columns" ON sistema_columns;
CREATE POLICY "Users can view project columns" ON sistema_columns
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_columns.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

-- Tasks
DROP POLICY IF EXISTS "Members can view tasks" ON sistema_tasks;
CREATE POLICY "Members can view tasks" ON sistema_tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_tasks.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );
