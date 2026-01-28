-- Migration 024: Client Asset Review (Rating, Status, Annotations)

-- 1. Add client_rating to system_assets
ALTER TABLE sistema_assets ADD COLUMN IF NOT EXISTS client_rating INTEGER CHECK (client_rating >= 1 AND client_rating <= 5);

-- 2. RPC: Public function to update asset status and rating
CREATE OR REPLACE FUNCTION public_update_asset_status(
    token text,
    asset_id uuid,
    status text, -- 'approved_final', 'changes_requested'
    rating integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    access_record record;
    asset_record record;
BEGIN
    -- Verify token
    SELECT * INTO access_record
    FROM sistema_client_access
    WHERE access_token = token
    AND (expires_at IS NULL OR expires_at > NOW());

    IF access_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired token');
    END IF;

    -- Verify asset belongs to project
    SELECT * INTO asset_record
    FROM sistema_assets
    WHERE id = asset_id
    AND project_id = access_record.project_id;

    IF asset_record IS NULL THEN
        RETURN json_build_object('error', 'Asset not found or access denied');
    END IF;

    -- Update asset
    UPDATE sistema_assets
    SET 
        approval_status = status,
        client_rating = COALESCE(rating, client_rating),
        updated_at = NOW()
    WHERE id = asset_id;

    RETURN json_build_object('success', TRUE);
END;
$$;

-- 3. RPC: Public function to add annotation (comment) on asset
CREATE OR REPLACE FUNCTION public_add_asset_annotation(
    token text,
    asset_version_id uuid,
    x_percent numeric,
    y_percent numeric,
    content text,
    feedback_type text DEFAULT 'correction_minor',
    author_name text DEFAULT 'Client'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    access_record record;
    version_record record;
    new_id uuid;
BEGIN
    -- Verify token
    SELECT * INTO access_record
    FROM sistema_client_access
    WHERE access_token = token
    AND (expires_at IS NULL OR expires_at > NOW());

    IF access_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired token');
    END IF;

    -- Verify version -> asset -> project
    SELECT av.id 
    INTO version_record
    FROM sistema_asset_versions av
    JOIN sistema_assets a ON a.id = av.asset_id
    WHERE av.id = asset_version_id
    AND a.project_id = access_record.project_id;

    IF version_record IS NULL THEN
        RETURN json_build_object('error', 'Asset version not found or access denied');
    END IF;

    -- Insert annotation
    INSERT INTO sistema_annotations (
        asset_version_id,
        x_percent,
        y_percent,
        feedback_type,
        contenido,
        author_name,
        created_at
    ) VALUES (
        asset_version_id,
        x_percent,
        y_percent,
        feedback_type,
        content,
        author_name,
        NOW()
    ) RETURNING id INTO new_id;

    RETURN json_build_object('success', TRUE, 'id', new_id);
END;
$$;

-- 4. Update get_client_project_data to include assets
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

    -- 4. Get tasks if allowed (NOW WITH ASSETS)
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
