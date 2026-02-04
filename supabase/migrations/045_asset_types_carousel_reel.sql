-- Migration 045: Add asset_type, group_id, group_order for carousel and reel support

-- ============ ASSET TYPES ============
ALTER TABLE sistema_assets
  ADD COLUMN IF NOT EXISTS asset_type TEXT NOT NULL DEFAULT 'single'
    CHECK (asset_type IN ('single', 'carousel', 'reel')),
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS group_order INTEGER DEFAULT 0;

-- Index for fast group lookups
CREATE INDEX IF NOT EXISTS idx_assets_group_id ON sistema_assets(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_task_type ON sistema_assets(task_id, asset_type);

-- ============ UPDATE CLIENT DATA RPCs ============

-- V1: get_client_project_data
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
    SELECT * INTO access_record
    FROM sistema_client_access
    WHERE access_token = token
      AND (expires_at IS NULL OR expires_at > NOW());

    IF access_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired token');
    END IF;

    UPDATE sistema_client_access SET last_accessed = NOW() WHERE id = access_record.id;

    SELECT id, nombre, color, owner_id, icon, logo_url
    INTO project_record
    FROM sistema_projects
    WHERE id = access_record.project_id;

    IF project_record IS NULL THEN
        RETURN json_build_object('error', 'Project not found');
    END IF;

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
                            'asset_type', a.asset_type,
                            'group_id', a.group_id,
                            'group_order', a.group_order,
                            'approval_status', a.approval_status,
                            'client_rating', a.client_rating,
                            'access_revoked', a.access_revoked,
                            'current_version_id', v.id,
                            'file_url', v.file_url,
                            'file_type', v.file_type,
                            'file_size', v.file_size,
                            'storage_path', v.storage_path,
                            'thumbnail_path', v.thumbnail_path,
                            'preview_path', v.preview_path,
                            'original_filename', v.original_filename,
                            'version_number', v.version_number,
                            'annotations', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', ann.id,
                                        'x', ann.x_percent,
                                        'y', ann.y_percent,
                                        'content', ann.contenido,
                                        'feedback_type', ann.feedback_type,
                                        'author_name', ann.author_name,
                                        'created_at', ann.created_at,
                                        'resolved', ann.resolved
                                    )
                                ), '[]'::json)
                                FROM sistema_annotations ann
                                WHERE ann.asset_version_id = v.id
                            )
                        ) ORDER BY a.group_order ASC, a.created_at ASC
                    ), '[]'::json)
                    FROM sistema_assets a
                    LEFT JOIN sistema_asset_versions v
                        ON v.asset_id = a.id AND v.version_number = a.current_version
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

-- V2: get_client_project_data_v2
DROP FUNCTION IF EXISTS get_client_project_data_v2(text);
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
    SELECT * INTO session_record
    FROM sistema_client_sessions
    WHERE id = p_session_token::uuid
      AND (expires_at > NOW());

    IF session_record IS NULL THEN
        RETURN json_build_object('error', 'Session invalid or expired');
    END IF;

    UPDATE sistema_client_sessions SET last_accessed_at = NOW() WHERE id = session_record.id;

    SELECT * INTO client_record
    FROM sistema_client_access
    WHERE id = session_record.client_access_id;

    UPDATE sistema_client_access SET last_accessed = NOW() WHERE id = client_record.id;

    SELECT id, nombre, color, owner_id, icon, logo_url
    INTO project_record
    FROM sistema_projects
    WHERE id = client_record.project_id;

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
                            'asset_type', a.asset_type,
                            'group_id', a.group_id,
                            'group_order', a.group_order,
                            'approval_status', a.approval_status,
                            'client_rating', a.client_rating,
                            'access_revoked', a.access_revoked,
                            'current_version_id', v.id,
                            'file_url', v.file_url,
                            'file_type', v.file_type,
                            'file_size', v.file_size,
                            'storage_path', v.storage_path,
                            'thumbnail_path', v.thumbnail_path,
                            'preview_path', v.preview_path,
                            'original_filename', v.original_filename,
                            'version_number', v.version_number,
                            'annotations', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', ann.id,
                                        'x', ann.x_percent,
                                        'y', ann.y_percent,
                                        'content', ann.contenido,
                                        'feedback_type', ann.feedback_type,
                                        'author_name', ann.author_name,
                                        'created_at', ann.created_at,
                                        'resolved', ann.resolved
                                    )
                                ), '[]'::json)
                                FROM sistema_annotations ann
                                WHERE ann.asset_version_id = v.id
                            )
                        ) ORDER BY a.group_order ASC, a.created_at ASC
                    ), '[]'::json)
                    FROM sistema_assets a
                    LEFT JOIN sistema_asset_versions v
                        ON v.asset_id = a.id AND v.version_number = a.current_version
                    WHERE a.task_id = t.id
                )
            )
        ) INTO tasks_json
        FROM sistema_tasks t
        LEFT JOIN sistema_columns c ON c.id = t.column_id
        WHERE t.project_id = client_record.project_id;
    END IF;

    RETURN json_build_object(
        'project', project_record,
        'client', json_build_object(
            'id', client_record.id,
            'nombre', client_record.nombre,
            'can_view_calendar', client_record.can_view_calendar,
            'can_view_tasks', client_record.can_view_tasks,
            'can_comment', client_record.can_comment
        ),
        'calendar_events', COALESCE(events_json, '[]'::json),
        'tasks', COALESCE(tasks_json, '[]'::json)
    );
END;
$$;
