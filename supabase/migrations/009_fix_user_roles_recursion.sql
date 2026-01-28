-- Fix recursion in User Roles RLS
-- RUN THIS IN SUPABASE SQL EDITOR

-- 1. Create a helper function to check admin role without triggering RLS
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sistema_user_roles
        WHERE user_id = auth.uid() 
        AND role IN ('superadmin', 'admin_org')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update sistema_user_roles policies
DROP POLICY IF EXISTS "Superadmins can manage roles" ON sistema_user_roles;

CREATE POLICY "Superadmins can manage roles" ON sistema_user_roles
    FOR ALL USING (
        -- Check role via SECURITY DEFINER function to avoid recursion
        is_org_admin()
    );

-- 3. Update sistema_project_templates policies (to be safe)
DROP POLICY IF EXISTS "Admins can manage templates" ON sistema_project_templates;

CREATE POLICY "Admins can manage templates" ON sistema_project_templates
    FOR ALL USING (
        created_by = auth.uid() OR
        is_org_admin()
    );
