-- Definitive fix for Calendar Sharing and Comments
-- Replaces previous buggy implementations

-- 1. Ensure comments table exists and has RLS
CREATE TABLE IF NOT EXISTS sistema_calendar_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES sistema_calendar_events(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    author_name TEXT NOT NULL, -- Can be client name or user name
    is_client BOOLEAN DEFAULT FALSE, -- True if posted by client via public link
    user_id UUID REFERENCES auth.users(id) -- Optional, if posted by logged-in user
);

ALTER TABLE sistema_calendar_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view comments on their projects (if they are members)
DROP POLICY IF EXISTS "Users can view comments on their projects" ON sistema_calendar_comments;
CREATE POLICY "Users can view comments on their projects" ON sistema_calendar_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_calendar_events e
            JOIN sistema_projects p ON p.id = e.project_id
            WHERE e.id = sistema_calendar_comments.event_id
            AND (
                p.owner_id = auth.uid() 
                OR EXISTS (
                    SELECT 1 FROM sistema_project_members pm 
                    WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                )
            )
        )
    );

-- Policy: Users can insert comments on their projects
DROP POLICY IF EXISTS "Users can insert comments on their projects" ON sistema_calendar_comments;
CREATE POLICY "Users can insert comments on their projects" ON sistema_calendar_comments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sistema_calendar_events e
            JOIN sistema_projects p ON p.id = e.project_id
            WHERE e.id = sistema_calendar_comments.event_id
            AND (
                p.owner_id = auth.uid() 
                OR EXISTS (
                    SELECT 1 FROM sistema_project_members pm 
                    WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                )
            )
        )
    );


-- 2. FIX: public_add_calendar_comment
-- This function was previously comparing `token` (text) with `id` (uuid) which caused errors.
-- Now it correctly compares `token` with `access_token` column.

CREATE OR REPLACE FUNCTION public_add_calendar_comment(
  token text,
  event_id uuid,
  content text,
  author_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  access_record record;
  event_record record;
BEGIN
  -- 1. Verify token (Fixed: compare with access_token column)
  SELECT * INTO access_record
  FROM sistema_client_access
  WHERE access_token = token
  AND (expires_at IS NULL OR expires_at > NOW());

  IF access_record IS NULL THEN
    RETURN json_build_object('error', 'Invalid or expired token');
  END IF;

  IF NOT access_record.can_comment THEN
    RETURN json_build_object('error', 'Commenting not allowed');
  END IF;

  -- 2. Verify event belongs to the project associated with the token
  SELECT * INTO event_record
  FROM sistema_calendar_events
  WHERE id = event_id
  AND project_id = access_record.project_id;

  IF event_record IS NULL THEN
     RETURN json_build_object('error', 'Event not found or access denied');
  END IF;

  -- 3. Insert comment
  INSERT INTO sistema_calendar_comments (event_id, content, created_at, author_name, is_client)
  VALUES (event_id, content, NOW(), author_name, TRUE);

  RETURN json_build_object('success', TRUE);
END;
$$;


-- 3. FIX: get_client_project_data
-- Ensures robust retrieval of project data including comments

CREATE OR REPLACE FUNCTION get_client_project_data(token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    access_record record;
    project_record record;
    events_json json;
    tasks_json json;
BEGIN
    -- 1. Get access record
    SELECT * INTO access_record
    FROM sistema_client_access
    WHERE access_token = token
    AND (expires_at IS NULL OR expires_at > NOW());

    IF access_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired token');
    END IF;

    -- Update last accessed
    UPDATE sistema_client_access
    SET last_accessed = NOW()
    WHERE id = access_record.id;

    -- 2. Get project info
    SELECT id, nombre, color, owner_id INTO project_record
    FROM sistema_projects
    WHERE id = access_record.project_id;

    IF project_record IS NULL THEN
        RETURN json_build_object('error', 'Project not found');
    END IF;

    -- 3. Get events (with comments) if allowed
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
                    SELECT COALESCE(json_agg(
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

    -- 4. Get tasks if allowed
    IF access_record.can_view_tasks THEN
        SELECT json_agg(
            json_build_object(
                'id', t.id,
                'titulo', t.titulo,
                'descripcion', t.descripcion,
                'column', c.nombre,
                'priority', t.priority,
                'due_date', t.due_date,
                'completed', t.completed
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
            'can_view_calendar', access_record.can_view_calendar,
            'can_view_tasks', access_record.can_view_tasks,
            'can_comment', access_record.can_comment
        ),
        'calendar_events', COALESCE(events_json, '[]'::json),
        'tasks', COALESCE(tasks_json, '[]'::json)
    );
END;
$$;
