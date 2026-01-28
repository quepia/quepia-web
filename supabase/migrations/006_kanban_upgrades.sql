-- Migration 006: Kanban Upgrades
-- Adds: WIP limits, task types, estimated hours, user roles, project templates, subtask blocking

-- ============ USER ROLES (Organization-level) ============
CREATE TABLE IF NOT EXISTS sistema_user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'team_member' CHECK (role IN ('superadmin', 'admin_org', 'team_member', 'client_guest')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

ALTER TABLE sistema_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view roles" ON sistema_user_roles
    FOR SELECT USING (true);

CREATE POLICY "Superadmins can manage roles" ON sistema_user_roles
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sistema_user_roles WHERE user_id = auth.uid() AND role = 'superadmin')
    );

-- ============ COLUMN UPGRADES: WIP Limits + Color ============
ALTER TABLE sistema_columns ADD COLUMN IF NOT EXISTS wip_limit INTEGER DEFAULT NULL;
ALTER TABLE sistema_columns ADD COLUMN IF NOT EXISTS color TEXT DEFAULT NULL;

-- ============ TASK UPGRADES: Type, Estimated Hours, Blocking Subtasks ============
ALTER TABLE sistema_tasks ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT NULL
    CHECK (task_type IN ('diseno', 'copy', 'video', 'strategy', 'revision', 'otro'));
ALTER TABLE sistema_tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,1) DEFAULT NULL;
ALTER TABLE sistema_tasks ADD COLUMN IF NOT EXISTS blocking_subtasks BOOLEAN DEFAULT FALSE;

-- Type-specific metadata stored as JSONB
ALTER TABLE sistema_tasks ADD COLUMN IF NOT EXISTS type_metadata JSONB DEFAULT NULL;
-- Example type_metadata for 'diseno': {"dimensions": "1080x1080", "format": "PNG", "references": ["url1"]}
-- Example type_metadata for 'copy': {"tone": "profesional", "char_limit": 280, "keywords": ["seo", "brand"]}
-- Example type_metadata for 'video': {"duration": "30s", "format": "vertical", "subtitles": true}

-- ============ TASK DEPENDENCIES ============
CREATE TABLE IF NOT EXISTS sistema_task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES sistema_tasks(id) ON DELETE CASCADE,
    depends_on_id UUID NOT NULL REFERENCES sistema_tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_id, depends_on_id),
    CHECK (task_id != depends_on_id)
);

CREATE INDEX IF NOT EXISTS idx_task_deps_task ON sistema_task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON sistema_task_dependencies(depends_on_id);

ALTER TABLE sistema_task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view task dependencies" ON sistema_task_dependencies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_task_dependencies.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage task dependencies" ON sistema_task_dependencies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_task_dependencies.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- ============ PROJECT TEMPLATES ============
CREATE TABLE IF NOT EXISTS sistema_project_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    created_by UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    structure JSONB NOT NULL DEFAULT '{}',
    -- structure: { columns: [{name, order, wip_limit?}], default_tasks: [{title, column_index, type?, priority?, estimated_hours?}] }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sistema_project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view templates" ON sistema_project_templates
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage templates" ON sistema_project_templates
    FOR ALL USING (
        created_by = auth.uid() OR
        EXISTS (SELECT 1 FROM sistema_user_roles WHERE user_id = auth.uid() AND role IN ('superadmin', 'admin_org'))
    );

CREATE INDEX IF NOT EXISTS idx_templates_creator ON sistema_project_templates(created_by);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_tasks_type ON sistema_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_estimated ON sistema_tasks(estimated_hours);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON sistema_user_roles(user_id);
