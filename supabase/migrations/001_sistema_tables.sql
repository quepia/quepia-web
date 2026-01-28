-- Sistema de Gestión de Proyectos - Database Schema
-- Run this in Supabase SQL Editor

-- ============ SISTEMA USERS ============
-- This extends auth.users with additional profile info
CREATE TABLE IF NOT EXISTS sistema_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ PROJECTS ============
CREATE TABLE IF NOT EXISTS sistema_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    color TEXT DEFAULT '#dc4a3e',
    icon TEXT DEFAULT 'folder' CHECK (icon IN ('folder', 'hash')),
    parent_id UUID REFERENCES sistema_projects(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ PROJECT MEMBERS ============
CREATE TABLE IF NOT EXISTS sistema_project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- ============ COLUMNS (Kanban) ============
CREATE TABLE IF NOT EXISTS sistema_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ TASKS ============
CREATE TABLE IF NOT EXISTS sistema_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES sistema_columns(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    link TEXT,
    assignee_id UUID REFERENCES sistema_users(id) ON DELETE SET NULL,
    priority TEXT DEFAULT 'P4' CHECK (priority IN ('P1', 'P2', 'P3', 'P4')),
    due_date DATE,
    deadline TIMESTAMPTZ,
    labels TEXT[] DEFAULT '{}',
    orden INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ SUBTASKS ============
CREATE TABLE IF NOT EXISTS sistema_subtasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES sistema_tasks(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    assignee_id UUID REFERENCES sistema_users(id) ON DELETE SET NULL,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ TASK LINKS ============
CREATE TABLE IF NOT EXISTS sistema_task_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES sistema_tasks(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    titulo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ COMMENTS ============
CREATE TABLE IF NOT EXISTS sistema_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES sistema_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ FAVORITES ============
CREATE TABLE IF NOT EXISTS sistema_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, project_id)
);

-- ============ LABELS ============
CREATE TABLE IF NOT EXISTS sistema_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES sistema_projects(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_projects_parent ON sistema_projects(parent_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON sistema_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON sistema_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column ON sistema_tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON sistema_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON sistema_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON sistema_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON sistema_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON sistema_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON sistema_project_members(user_id);

-- ============ ROW LEVEL SECURITY ============
ALTER TABLE sistema_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_labels ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- Users can see all sistema users (for assignee selection)
CREATE POLICY "Users can view all sistema users" ON sistema_users
    FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON sistema_users
    FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON sistema_users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects: Users can view projects they own or are members of
CREATE POLICY "Users can view their projects" ON sistema_projects
    FOR SELECT USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM sistema_project_members
            WHERE project_id = sistema_projects.id AND user_id = auth.uid()
        )
    );

-- Projects: Users can create projects
CREATE POLICY "Users can create projects" ON sistema_projects
    FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Projects: Owners and admins can update projects
CREATE POLICY "Owners can update projects" ON sistema_projects
    FOR UPDATE USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM sistema_project_members
            WHERE project_id = sistema_projects.id
            AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Projects: Only owners can delete projects
CREATE POLICY "Owners can delete projects" ON sistema_projects
    FOR DELETE USING (owner_id = auth.uid());

-- Project Members: Members can view other members
CREATE POLICY "Members can view project members" ON sistema_project_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_project_members pm
            WHERE pm.project_id = sistema_project_members.project_id AND pm.user_id = auth.uid()
        )
    );

-- Project Members: Owners and admins can manage members
CREATE POLICY "Admins can manage members" ON sistema_project_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects
            WHERE id = sistema_project_members.project_id AND owner_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM sistema_project_members pm
            WHERE pm.project_id = sistema_project_members.project_id
            AND pm.user_id = auth.uid()
            AND pm.role IN ('owner', 'admin')
        )
    );

-- Columns: Same as projects
CREATE POLICY "Users can view project columns" ON sistema_columns
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_columns.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage columns" ON sistema_columns
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_columns.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Tasks: Members can view and manage tasks
CREATE POLICY "Members can view tasks" ON sistema_tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_tasks.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage tasks" ON sistema_tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_tasks.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Subtasks: Same as tasks
CREATE POLICY "Members can view subtasks" ON sistema_subtasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_subtasks.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage subtasks" ON sistema_subtasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_subtasks.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Task Links: Same as subtasks
CREATE POLICY "Members can view task links" ON sistema_task_links
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_task_links.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage task links" ON sistema_task_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_task_links.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Comments: Members can view and create comments
CREATE POLICY "Members can view comments" ON sistema_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_comments.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can create comments" ON sistema_comments
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM sistema_tasks t
            JOIN sistema_projects p ON p.id = t.project_id
            WHERE t.id = sistema_comments.task_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

-- Users can update/delete their own comments
CREATE POLICY "Users can update own comments" ON sistema_comments
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own comments" ON sistema_comments
    FOR DELETE USING (user_id = auth.uid());

-- Favorites: Users can manage their own favorites
CREATE POLICY "Users can view own favorites" ON sistema_favorites
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own favorites" ON sistema_favorites
    FOR ALL USING (user_id = auth.uid());

-- Labels: Project members can view and manage labels
CREATE POLICY "Members can view labels" ON sistema_labels
    FOR SELECT USING (
        project_id IS NULL OR
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_labels.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Admins can manage labels" ON sistema_labels
    FOR ALL USING (
        project_id IS NULL OR
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_labels.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin')
            ))
        )
    );

-- ============ FUNCTIONS ============

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for projects
CREATE TRIGGER update_sistema_projects_updated_at
    BEFORE UPDATE ON sistema_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tasks
CREATE TRIGGER update_sistema_tasks_updated_at
    BEFORE UPDATE ON sistema_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for comments
CREATE TRIGGER update_sistema_comments_updated_at
    BEFORE UPDATE ON sistema_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to create default columns when a project is created
CREATE OR REPLACE FUNCTION create_default_columns()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sistema_columns (project_id, nombre, orden)
    VALUES
        (NEW.id, 'PLANIFICACION', 0),
        (NEW.id, 'MATERIAL A PRODUCIR', 1),
        (NEW.id, 'EDICION', 2),
        (NEW.id, 'LISTO PARA PUBLICAR', 3);
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Only create default columns for leaf projects (with icon = 'hash')
CREATE TRIGGER create_default_columns_trigger
    AFTER INSERT ON sistema_projects
    FOR EACH ROW
    WHEN (NEW.icon = 'hash')
    EXECUTE FUNCTION create_default_columns();

-- Function to add owner as project member
CREATE OR REPLACE FUNCTION add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sistema_project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER add_owner_as_member_trigger
    AFTER INSERT ON sistema_projects
    FOR EACH ROW
    EXECUTE FUNCTION add_owner_as_member();

-- Function to get task count per project
CREATE OR REPLACE FUNCTION get_project_task_count(p_id UUID)
RETURNS INTEGER AS $$
DECLARE
    count INTEGER;
BEGIN
    SELECT COUNT(*) INTO count
    FROM sistema_tasks
    WHERE project_id = p_id AND completed = FALSE;
    RETURN count;
END;
$$ language 'plpgsql';
