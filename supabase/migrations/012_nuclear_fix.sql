-- NUCLEAR FIX: Reset ALL RLS Policies to use Security Definier functions
-- Prevents infinite recursion deadlocks on Insert/Update

-- 1. Helper Functions (SECURITY DEFINER = Bypasses RLS)
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

-- 2. PROJECTS (The root of the chain)
DROP POLICY IF EXISTS "Users can view their projects" ON sistema_projects;
DROP POLICY IF EXISTS "Users can create projects" ON sistema_projects;
DROP POLICY IF EXISTS "Owners can update projects" ON sistema_projects;
DROP POLICY IF EXISTS "Owners can delete projects" ON sistema_projects;
DROP POLICY IF EXISTS "Users can view projects" ON sistema_projects; -- old names

CREATE POLICY "Users can view projects" ON sistema_projects
    FOR SELECT USING (
        owner_id = auth.uid() OR
        is_project_member(id, auth.uid())
    );

CREATE POLICY "Users can create projects" ON sistema_projects
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update projects" ON sistema_projects
    FOR UPDATE USING (owner_id = auth.uid() OR is_project_admin(id, auth.uid()));

CREATE POLICY "Owners can delete projects" ON sistema_projects
    FOR DELETE USING (owner_id = auth.uid());

-- 3. PROJECT MEMBERS
DROP POLICY IF EXISTS "Members can view project members" ON sistema_project_members;
DROP POLICY IF EXISTS "Admins can manage members" ON sistema_project_members;

CREATE POLICY "Members can view project members" ON sistema_project_members
    FOR SELECT USING (
        user_id = auth.uid() OR
        is_project_member(project_id, auth.uid())
    );

CREATE POLICY "Admins can manage members" ON sistema_project_members
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sistema_projects WHERE id = project_id AND owner_id = auth.uid())
        OR 
        is_project_admin(project_id, auth.uid())
    );

-- 4. TASKS
DROP POLICY IF EXISTS "Members can view tasks" ON sistema_tasks;
DROP POLICY IF EXISTS "Members can manage tasks" ON sistema_tasks;

CREATE POLICY "Members can view tasks" ON sistema_tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_tasks.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

CREATE POLICY "Members can manage tasks" ON sistema_tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_tasks.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

-- 5. ASSETS
DROP POLICY IF EXISTS "Members can view assets" ON sistema_assets;
DROP POLICY IF EXISTS "Members can manage assets" ON sistema_assets;

CREATE POLICY "Members can view assets" ON sistema_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_assets.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

CREATE POLICY "Members can manage assets" ON sistema_assets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_assets.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

-- 6. COLUMNS
DROP POLICY IF EXISTS "Users can view project columns" ON sistema_columns;
DROP POLICY IF EXISTS "Members can manage columns" ON sistema_columns;

CREATE POLICY "Members can view columns" ON sistema_columns
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_columns.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

CREATE POLICY "Members can manage columns" ON sistema_columns
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_columns.project_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

-- Force schema reload at the end
NOTIFY pgrst, 'reload schema';
