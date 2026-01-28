-- Calendar Events and Client Access - Database Schema
-- Run this in Supabase SQL Editor

-- ============ CALENDAR EVENTS ============
CREATE TABLE IF NOT EXISTS sistema_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT DEFAULT 'otro' CHECK (tipo IN ('publicacion', 'reunion', 'deadline', 'entrega', 'otro')),
    fecha_inicio TIMESTAMPTZ NOT NULL,
    fecha_fin TIMESTAMPTZ,
    todo_el_dia BOOLEAN DEFAULT TRUE,
    color TEXT DEFAULT '#6b7280',
    task_id UUID REFERENCES sistema_tasks(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ CLIENT ACCESS (Public shareable links) ============
CREATE TABLE IF NOT EXISTS sistema_client_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre TEXT NOT NULL,
    access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    can_view_calendar BOOLEAN DEFAULT TRUE,
    can_view_tasks BOOLEAN DEFAULT TRUE,
    can_comment BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    last_accessed TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON sistema_calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_fecha ON sistema_calendar_events(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_client_access_token ON sistema_client_access(access_token);
CREATE INDEX IF NOT EXISTS idx_client_access_project ON sistema_client_access(project_id);

-- ============ ROW LEVEL SECURITY ============
ALTER TABLE sistema_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_client_access ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES FOR CALENDAR EVENTS ============

-- Members can view calendar events
CREATE POLICY "Members can view calendar events" ON sistema_calendar_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

-- Members can create calendar events
CREATE POLICY "Members can create calendar events" ON sistema_calendar_events
    FOR INSERT WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Members can update calendar events
CREATE POLICY "Members can update calendar events" ON sistema_calendar_events
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Members can delete calendar events
CREATE POLICY "Members can delete calendar events" ON sistema_calendar_events
    FOR DELETE USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_calendar_events.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin')
            ))
        )
    );

-- ============ RLS POLICIES FOR CLIENT ACCESS ============

-- Project owners and admins can view client access
CREATE POLICY "Admins can view client access" ON sistema_client_access
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_client_access.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin')
            ))
        )
    );

-- Project owners and admins can create client access
CREATE POLICY "Admins can create client access" ON sistema_client_access
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_client_access.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin')
            ))
        )
    );

-- Project owners and admins can update client access
CREATE POLICY "Admins can update client access" ON sistema_client_access
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_client_access.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin')
            ))
        )
    );

-- Project owners and admins can delete client access
CREATE POLICY "Admins can delete client access" ON sistema_client_access
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_client_access.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin')
            ))
        )
    );

-- ============ PUBLIC ACCESS FUNCTION ============
-- This function allows public access to project data via token (no auth required)

CREATE OR REPLACE FUNCTION get_client_project_data(token TEXT)
RETURNS JSON AS $$
DECLARE
    client_record RECORD;
    result JSON;
BEGIN
    -- Get client access record
    SELECT * INTO client_record
    FROM sistema_client_access
    WHERE access_token = token
    AND (expires_at IS NULL OR expires_at > NOW());

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Invalid or expired token');
    END IF;

    -- Update last accessed
    UPDATE sistema_client_access
    SET last_accessed = NOW()
    WHERE id = client_record.id;

    -- Build result based on permissions
    SELECT json_build_object(
        'project', (
            SELECT json_build_object(
                'id', p.id,
                'nombre', p.nombre,
                'color', p.color
            )
            FROM sistema_projects p
            WHERE p.id = client_record.project_id
        ),
        'client', json_build_object(
            'nombre', client_record.nombre,
            'can_view_calendar', client_record.can_view_calendar,
            'can_view_tasks', client_record.can_view_tasks,
            'can_comment', client_record.can_comment
        ),
        'calendar_events', CASE WHEN client_record.can_view_calendar THEN (
            SELECT json_agg(json_build_object(
                'id', e.id,
                'titulo', e.titulo,
                'descripcion', e.descripcion,
                'tipo', e.tipo,
                'fecha_inicio', e.fecha_inicio,
                'fecha_fin', e.fecha_fin,
                'todo_el_dia', e.todo_el_dia,
                'color', e.color
            ))
            FROM sistema_calendar_events e
            WHERE e.project_id = client_record.project_id
        ) ELSE NULL END,
        'tasks', CASE WHEN client_record.can_view_tasks THEN (
            SELECT json_agg(json_build_object(
                'id', t.id,
                'titulo', t.titulo,
                'descripcion', t.descripcion,
                'column', (SELECT nombre FROM sistema_columns WHERE id = t.column_id),
                'priority', t.priority,
                'due_date', t.due_date,
                'completed', t.completed
            ))
            FROM sistema_tasks t
            WHERE t.project_id = client_record.project_id
        ) ELSE NULL END
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ TRIGGER FOR UPDATED_AT ============

CREATE TRIGGER update_sistema_calendar_events_updated_at
    BEFORE UPDATE ON sistema_calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
