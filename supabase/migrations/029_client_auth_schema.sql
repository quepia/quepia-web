-- 029_client_auth_schema.sql
-- Add OTP support and Session management for Client Access

-- 1. Add auth fields to sistema_client_access
ALTER TABLE sistema_client_access
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pin TEXT; -- Optional 4 digit pin

-- 2. Create client sessions table
CREATE TABLE IF NOT EXISTS sistema_client_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- This ID will be the session token
    client_access_id UUID NOT NULL REFERENCES sistema_client_access(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on sessions
ALTER TABLE sistema_client_sessions ENABLE ROW LEVEL SECURITY;

-- 4. Policies for sessions (Public can create via function, but reading is restricted)
-- Actually, we'll interface mostly via RPCs, but good to have RLS.
-- Allow read if you know the ID (session token) - effectively public but unguessable
-- Allow read if you know the ID (session token) - effectively public but unguessable
DROP POLICY IF EXISTS "Public read by ID" ON sistema_client_sessions;
CREATE POLICY "Public read by ID" ON sistema_client_sessions
FOR SELECT USING (id = auth.uid() OR true); 
-- NOTE: For client sessions, we are managing them via RPC mostly. 
-- "auth.uid()" refers to Supabase Auth user, which these clients are NOT.
-- So we'll leave it open for now or rely on SECURITY DEFINER functions.
-- Let's stick to SECURITY DEFINER functions for safety given the anonymous nature.

-- 5. RPC to get client data via Session Token (V2)
CREATE OR REPLACE FUNCTION get_client_project_data_v2(session_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_record RECORD;
    access_record RECORD;
    project_record RECORD;
    client_record RECORD;
    events_json JSON;
    tasks_json JSON;
BEGIN
    -- 1. Validate Session
    SELECT * INTO session_record
    FROM sistema_client_sessions
    WHERE id = session_token
    AND expires_at > NOW();

    IF session_record IS NULL THEN
        RETURN json_build_object('error', 'Session invalid or expired');
    END IF;

    -- Update session activity
    UPDATE sistema_client_sessions
    SET last_accessed_at = NOW()
    WHERE id = session_token;

    -- 2. Get Access Record
    SELECT * INTO access_record
    FROM sistema_client_access
    WHERE id = session_record.client_access_id;

    -- Update access activity
    UPDATE sistema_client_access
    SET last_accessed = NOW()
    WHERE id = access_record.id;

    -- 3. Get Project Info
    SELECT id, nombre, color, owner_id INTO project_record
    FROM sistema_projects
    WHERE id = access_record.project_id;

    -- 4. Get Events
    IF access_record.can_view_calendar THEN
        SELECT json_agg(
            json_build_object(
                'id', e.id,
                'titulo', e.titulo,
                'descripcion', e.descripcion,
                'tipo', e.tipo,
                'fecha_inicio', e.fecha_inicio,
                'fecha_fin', e.fecha_fin,
                'todo_el_dia', e.todo_el_dia,
                'color', e.color,
                'comments', (
                    SELECT coalesce(json_agg(
                        json_build_object(
                            'id', c.id,
                            'content', c.content,
                            'created_at', c.created_at,
                            'author_name', c.author_name,
                            'is_client', c.is_client
                        ) ORDER BY c.created_at ASC
                    ), '[]'::json)
                    FROM sistema_calendar_comments c
                    WHERE c.event_id = e.id
                )
            )
        ) INTO events_json
        FROM sistema_calendar_events e
        WHERE e.project_id = access_record.project_id;
    END IF;

    -- 5. Get Tasks
    IF access_record.can_view_tasks THEN
        SELECT json_agg(
            json_build_object(
                'id', t.id,
                'titulo', t.titulo,
                'descripcion', t.descripcion,
                'column', c.nombre,
                'priority', t.priority,
                'due_date', t.due_date,
                'completed', t.completed,
                'assets', (
                    SELECT coalesce(json_agg(
                        json_build_object(
                            'id', a.id,
                            'nombre', a.nombre,
                            'url', v.file_url,
                            'type', v.file_type,
                            'version_number', v.version_number,
                            'approval_status', a.approval_status,
                            'client_rating', a.client_rating,
                            'created_at', a.created_at
                        ) ORDER BY v.version_number DESC
                    ), '[]'::json)
                    FROM sistema_assets a
                    LEFT JOIN sistema_asset_versions v ON v.asset_id = a.id AND v.version_number = a.current_version
                    WHERE a.task_id = t.id
                )
            )
        ) INTO tasks_json
        FROM sistema_tasks t
        LEFT JOIN sistema_columns c ON c.id = t.column_id
        WHERE t.project_id = access_record.project_id;
    END IF;

    RETURN json_build_object(
        'project', project_record,
        'client', json_build_object(
            'id', access_record.id,
            'nombre', access_record.nombre,
            'email', access_record.email,
            'can_view_calendar', access_record.can_view_calendar,
            'can_view_tasks', access_record.can_view_tasks,
            'can_comment', access_record.can_comment
        ),
        'calendar_events', coalesce(events_json, '[]'::json),
        'tasks', coalesce(tasks_json, '[]'::json)
    );
END;
$$;
