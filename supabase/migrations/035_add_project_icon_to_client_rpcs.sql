-- Migration 035: Add project icon and logo_url to client-facing RPCs
--
-- The client page was showing a generic Quepia logo instead of the project's
-- actual icon/logo. This adds icon and logo_url to both V1 and V2 RPCs.

-- 1. Fix V1: get_client_project_data - add icon and logo_url to SELECT
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

    -- 2. Get project info (now including icon and logo_url)
    SELECT id, nombre, color, icon, logo_url, owner_id INTO project_record
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

    -- 4. Get tasks with assets
    IF access_record.can_view_tasks THEN
        SELECT json_agg(
            json_build_object(
                'id', t.id,
                'titulo', t.titulo,
                'descripcion', t.descripcion,
                'social_copy', t.social_copy,
                'column', c.nombre,
                'priority', t.priority,
                'due_date', t.due_date,
                'completed', t.completed,
                'assets', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', a.id,
                            'nombre', a.nombre,
                            'approval_status', a.approval_status,
                            'client_rating', a.client_rating,
                            'current_version_id', v.id,
                            'file_url', v.file_url,
                            'file_type', v.file_type,
                            'version_number', v.version_number,
                            'annotations', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', ann.id,
                                        'x_percent', ann.x_percent,
                                        'y_percent', ann.y_percent,
                                        'contenido', ann.contenido,
                                        'feedback_type', ann.feedback_type,
                                        'author_name', ann.author_name,
                                        'created_at', ann.created_at,
                                        'resolved', ann.resolved
                                    )
                                ), '[]'::json)
                                FROM sistema_annotations ann
                                WHERE ann.asset_version_id = v.id
                            )
                        )
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
            'can_view_calendar', access_record.can_view_calendar,
            'can_view_tasks', access_record.can_view_tasks,
            'can_comment', access_record.can_comment
        ),
        'calendar_events', COALESCE(events_json, '[]'::json),
        'tasks', COALESCE(tasks_json, '[]'::json)
    );
END;
$$;


-- 2. Fix V2: get_client_project_data_v2 - add icon and logo_url to json_build_object
DROP FUNCTION IF EXISTS get_client_project_data_v2(text);
DROP FUNCTION IF EXISTS get_client_project_data_v2(uuid);

CREATE OR REPLACE FUNCTION get_client_project_data_v2(p_session_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_record record;
    client_record record;
    project_record record;
    events_json json;
    tasks_json json;
BEGIN
    -- 1. Validate Session
    SELECT * INTO session_record
    FROM sistema_client_sessions
    WHERE id = p_session_token::uuid
    AND (expires_at > NOW());

    IF session_record IS NULL THEN
        RETURN json_build_object('error', 'Session invalid or expired');
    END IF;

    -- Update last accessed timestamp
    UPDATE sistema_client_sessions
    SET last_accessed_at = NOW()
    WHERE id = session_record.id;

    -- 2. Get Client & Project Info
    SELECT * INTO client_record
    FROM sistema_client_access
    WHERE id = session_record.client_access_id;

    UPDATE sistema_client_access
    SET last_accessed = NOW()
    WHERE id = client_record.id;

    SELECT * INTO project_record
    FROM sistema_projects
    WHERE id = client_record.project_id;

    -- 3. Get Events
    IF client_record.can_view_calendar THEN
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
        WHERE e.project_id = client_record.project_id;
    END IF;

    -- 4. Get Tasks with assets
    IF client_record.can_view_tasks THEN
        SELECT json_agg(
            json_build_object(
                'id', t.id,
                'titulo', t.titulo,
                'descripcion', t.descripcion,
                'social_copy', t.social_copy,
                'column', c.nombre,
                'priority', t.priority,
                'due_date', t.due_date,
                'completed', t.completed,
                'assets', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', a.id,
                            'nombre', a.nombre,
                            'approval_status', a.approval_status,
                            'client_rating', a.client_rating,
                            'current_version_id', v.id,
                            'file_url', v.file_url,
                            'file_type', v.file_type,
                            'version_number', v.version_number,
                            'annotations', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', ann.id,
                                        'x_percent', ann.x_percent,
                                        'y_percent', ann.y_percent,
                                        'contenido', ann.contenido,
                                        'feedback_type', ann.feedback_type,
                                        'author_name', ann.author_name,
                                        'created_at', ann.created_at,
                                        'resolved', ann.resolved
                                    )
                                ), '[]'::json)
                                FROM sistema_annotations ann
                                WHERE ann.asset_version_id = v.id
                            )
                        )
                    ), '[]'::json)
                    FROM sistema_assets a
                    LEFT JOIN sistema_asset_versions v ON v.asset_id = a.id AND v.version_number = a.current_version
                    WHERE a.task_id = t.id
                )
            )
        ) INTO tasks_json
        FROM sistema_tasks t
        LEFT JOIN sistema_columns c ON c.id = t.column_id
        WHERE t.project_id = client_record.project_id;
    END IF;

    RETURN json_build_object(
        'project', json_build_object(
            'id', project_record.id,
            'nombre', project_record.nombre,
            'color', project_record.color,
            'icon', project_record.icon,
            'logo_url', project_record.logo_url
        ),
        'client', json_build_object(
            'id', client_record.id,
            'nombre', client_record.nombre,
            'email', client_record.email,
            'can_view_calendar', client_record.can_view_calendar,
            'can_view_tasks', client_record.can_view_tasks,
            'can_comment', client_record.can_comment
        ),
        'calendar_events', COALESCE(events_json, '[]'::json),
        'tasks', COALESCE(tasks_json, '[]'::json)
    );
END;
$$;
