-- FIX: Reset Policies for Project Members and Assets to prevent recursion/hangs
-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. Ensure Recursion Helper Function Exists
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

-- 2. RESET Project Members Policies (Force recursion fix)
DROP POLICY IF EXISTS "Members can view project members" ON sistema_project_members;
DROP POLICY IF EXISTS "Admins can manage members" ON sistema_project_members;
-- Also drop potential duplicates or older named policies if unsure, but standard names are above

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

-- 3. RESET Assets Policies (Force clean state)
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
            AND (p.owner_id = auth.uid() OR is_project_admin(p.id, auth.uid()) OR is_project_member(p.id, auth.uid()))
        )
    );

-- 4. RESET Asset Versions Policies
DROP POLICY IF EXISTS "Members can view asset versions" ON sistema_asset_versions;
DROP POLICY IF EXISTS "Members can manage asset versions" ON sistema_asset_versions;

CREATE POLICY "Members can view asset versions" ON sistema_asset_versions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_assets a
            JOIN sistema_projects p ON p.id = a.project_id
            WHERE a.id = sistema_asset_versions.asset_id
            AND (p.owner_id = auth.uid() OR is_project_member(p.id, auth.uid()))
        )
    );

CREATE POLICY "Members can manage asset versions" ON sistema_asset_versions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_assets a
            JOIN sistema_projects p ON p.id = a.project_id
            WHERE a.id = sistema_asset_versions.asset_id
            AND (p.owner_id = auth.uid() OR is_project_admin(p.id, auth.uid()) OR is_project_member(p.id, auth.uid()))
        )
    );
