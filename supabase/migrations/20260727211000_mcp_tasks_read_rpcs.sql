-- Lectura de tareas por MCP.
--
-- Cinco proyecciones angostas: proyectos, columnas, miembros, busqueda de
-- tareas y detalle de una tarea. Todas paginan con cursor opaco y ninguna
-- acepta filtros abiertos, para que el asistente no pueda pedir "todo".
--
-- El orden de la busqueda es `created_at DESC, id DESC` y no el del tablero:
-- el orden del tablero cambia cada vez que alguien arrastra una tarjeta, y un
-- cursor sobre una clave inestable saltea o repite filas entre paginas.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Proyectos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_list_projects(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_list_projects$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  page_size INTEGER := 50;
  query_filter TEXT;
  cursor_value JSONB;
  cursor_name TEXT;
  cursor_id UUID;
  fetched_count INTEGER;
  project_list JSONB;
  next_cursor_value JSONB;
  next_cursor_text TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['query', 'page_size', 'cursor']
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Only query, page_size, and cursor are accepted.'
    );
  END IF;

  IF p_request ? 'page_size' THEN
    IF jsonb_typeof(p_request -> 'page_size') <> 'number'
      OR (p_request ->> 'page_size') !~ '^[0-9]+$'
    THEN
      RETURN private.mcp_error('invalid_page_size', 'page_size must be an integer.');
    END IF;
    page_size := (p_request ->> 'page_size')::INTEGER;
  END IF;
  IF page_size NOT BETWEEN 1 AND 100 THEN
    RETURN private.mcp_error(
      'invalid_page_size',
      'page_size must be between 1 and 100.'
    );
  END IF;

  IF (p_request ? 'query') AND jsonb_typeof(p_request -> 'query') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'query') <> 'string' THEN
      RETURN private.mcp_error('invalid_query', 'query must be a string.');
    END IF;
    query_filter := BTRIM(p_request ->> 'query');
    IF char_length(query_filter) NOT BETWEEN 1 AND 200 THEN
      RETURN private.mcp_error(
        'invalid_query',
        'query must contain 1-200 characters.'
      );
    END IF;
  END IF;

  IF (p_request ? 'cursor') AND jsonb_typeof(p_request -> 'cursor') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'cursor') <> 'string' THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor must be a string.');
    END IF;
    cursor_value := private.mcp_decode_cursor(p_request ->> 'cursor');
    IF cursor_value IS NULL
      OR jsonb_typeof(cursor_value) <> 'object'
      OR NOT private.mcp_json_has_only_keys(cursor_value, ARRAY['name', 'id'])
      OR NOT (cursor_value ? 'name' AND cursor_value ? 'id')
      OR jsonb_typeof(cursor_value -> 'name') <> 'string'
    THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
    END IF;
    cursor_name := cursor_value ->> 'name';
    cursor_id := private.mcp_parse_uuid(cursor_value ->> 'id');
    IF cursor_id IS NULL THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
    END IF;
  END IF;

  authorization_result := private.mcp_authorize(
    'tasks.read',
    'mcp_tasks_list_projects',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  WITH visible AS (
    SELECT
      project.id,
      project.nombre,
      project.descripcion,
      project.parent_id,
      project.owner_id,
      project.created_at,
      (
        SELECT COUNT(*)
        FROM public.sistema_tasks AS task
        WHERE task.project_id = project.id
          AND NOT COALESCE(task.completed, false)
      ) AS open_task_count
    FROM public.sistema_projects AS project
    WHERE (query_filter IS NULL OR project.nombre ILIKE '%' || query_filter || '%')
      AND (
        cursor_id IS NULL
        OR project.nombre > cursor_name
        OR (project.nombre = cursor_name AND project.id > cursor_id)
      )
  ),
  page AS (
    SELECT *
    FROM visible
    ORDER BY nombre, id
    LIMIT page_size + 1
  ),
  numbered AS (
    SELECT page.*, row_number() OVER (ORDER BY nombre, id) AS row_number
    FROM page
  )
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', numbered.id,
          'name', numbered.nombre,
          'description', numbered.descripcion,
          'parent_id', numbered.parent_id,
          'owner_id', numbered.owner_id,
          'open_task_count', numbered.open_task_count,
          'created_at', numbered.created_at
        )
        ORDER BY numbered.nombre, numbered.id
      ) FILTER (WHERE numbered.row_number <= page_size),
      '[]'::JSONB
    ),
    (
      jsonb_agg(
        jsonb_build_object('name', numbered.nombre, 'id', numbered.id)
      ) FILTER (WHERE numbered.row_number = page_size)
    ) -> 0
  INTO fetched_count, project_list, next_cursor_value
  FROM numbered;

  IF fetched_count > page_size THEN
    next_cursor_text := private.mcp_encode_cursor(next_cursor_value);
  END IF;

  PERFORM private.mcp_audit_event(
    'tasks.projects.listed',
    'mcp_tasks_list_projects',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'tasks.read',
    jsonb_build_object('result_count', jsonb_array_length(project_list))
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'items', project_list,
      'count', jsonb_array_length(project_list),
      'page_size', page_size,
      'has_more', fetched_count > page_size,
      'next_cursor', next_cursor_text
    )
  );
EXCEPTION
  WHEN invalid_text_representation
    OR invalid_parameter_value
    OR character_not_in_repertoire
  THEN
    RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'tasks_read_failed',
      'Projects could not be read.'
    );
END
$mcp_tasks_list_projects$;

-- ---------------------------------------------------------------------------
-- 2. Columnas de un proyecto
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_list_columns(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_list_columns$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  project_id_value UUID;
  column_list JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['project_id', 'project_query']
    )
    OR NOT (p_request ? 'project_id' OR p_request ? 'project_query')
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Exactly one project selector is required.'
    );
  END IF;

  authorization_result := private.mcp_authorize(
    'tasks.read',
    'mcp_tasks_list_columns',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  reference_result := private.mcp_tasks_resolve_reference(
    'project', p_request, 'project_id', 'project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  project_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', board_column.id,
        'name', board_column.nombre,
        'position', board_column.orden,
        'wip_limit', board_column.wip_limit,
        'task_count', (
          SELECT COUNT(*)
          FROM public.sistema_tasks AS task
          WHERE task.column_id = board_column.id
        ),
        'open_task_count', (
          SELECT COUNT(*)
          FROM public.sistema_tasks AS task
          WHERE task.column_id = board_column.id
            AND NOT COALESCE(task.completed, false)
        )
      )
      ORDER BY board_column.orden, board_column.nombre, board_column.id
    ),
    '[]'::JSONB
  )
  INTO column_list
  FROM public.sistema_columns AS board_column
  WHERE board_column.project_id = project_id_value;

  PERFORM private.mcp_audit_event(
    'tasks.columns.listed',
    'mcp_tasks_list_columns',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'tasks.read',
    jsonb_build_object(
      'project_id', project_id_value,
      'result_count', jsonb_array_length(column_list)
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'project_id', project_id_value,
      'items', column_list,
      'count', jsonb_array_length(column_list)
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'tasks_read_failed',
      'Columns could not be read.'
    );
END
$mcp_tasks_list_columns$;

-- ---------------------------------------------------------------------------
-- 3. Miembros asignables
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_list_members(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_list_members$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  project_id_value UUID;
  member_list JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['project_id', 'project_query']
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Only an optional project selector is accepted.'
    );
  END IF;

  authorization_result := private.mcp_authorize(
    'tasks.read',
    'mcp_tasks_list_members',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  reference_result := private.mcp_tasks_resolve_reference(
    'project', p_request, 'project_id', 'project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  project_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', member.id,
        'name', member.nombre,
        'email', member.email,
        'open_task_count', (
          SELECT COUNT(*)
          FROM public.sistema_tasks AS task
          WHERE task.assignee_id = member.id
            AND NOT COALESCE(task.completed, false)
            AND (
              project_id_value IS NULL
              OR task.project_id = project_id_value
            )
        )
      )
      ORDER BY member.nombre, member.id
    ),
    '[]'::JSONB
  )
  INTO member_list
  FROM public.sistema_users AS member
  WHERE member.is_active
    AND member.deleted_at IS NULL
    AND (
      project_id_value IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.sistema_project_members AS membership
        WHERE membership.project_id = project_id_value
          AND membership.user_id = member.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.sistema_projects AS project
        WHERE project.id = project_id_value
          AND project.owner_id = member.id
      )
    );

  PERFORM private.mcp_audit_event(
    'tasks.members.listed',
    'mcp_tasks_list_members',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'tasks.read',
    jsonb_build_object('result_count', jsonb_array_length(member_list))
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'project_id', project_id_value,
      'items', member_list,
      'count', jsonb_array_length(member_list)
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'tasks_read_failed',
      'Members could not be read.'
    );
END
$mcp_tasks_list_members$;

-- ---------------------------------------------------------------------------
-- 4. Busqueda de tareas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_search_tasks(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_search_tasks$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  project_id_value UUID;
  column_id_value UUID;
  assignee_id_value UUID;
  completed_filter BOOLEAN;
  priority_filter TEXT;
  deadline_from TIMESTAMPTZ;
  deadline_to TIMESTAMPTZ;
  query_filter TEXT;
  page_size INTEGER := 50;
  cursor_value JSONB;
  cursor_created_at TIMESTAMPTZ;
  cursor_id UUID;
  fetched_count INTEGER;
  task_list JSONB;
  next_cursor_value JSONB;
  next_cursor_text TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY[
        'project_id',
        'project_query',
        'column_id',
        'column_query',
        'assignee_id',
        'assignee_query',
        'completed',
        'priority',
        'deadline_from',
        'deadline_to',
        'query',
        'page_size',
        'cursor'
      ]
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'The request carries a field this search does not accept.'
    );
  END IF;

  IF p_request ? 'page_size' THEN
    IF jsonb_typeof(p_request -> 'page_size') <> 'number'
      OR (p_request ->> 'page_size') !~ '^[0-9]+$'
    THEN
      RETURN private.mcp_error('invalid_page_size', 'page_size must be an integer.');
    END IF;
    page_size := (p_request ->> 'page_size')::INTEGER;
  END IF;
  IF page_size NOT BETWEEN 1 AND 100 THEN
    RETURN private.mcp_error(
      'invalid_page_size',
      'page_size must be between 1 and 100.'
    );
  END IF;

  IF (p_request ? 'completed')
    AND jsonb_typeof(p_request -> 'completed') <> 'null'
  THEN
    IF jsonb_typeof(p_request -> 'completed') <> 'boolean' THEN
      RETURN private.mcp_error(
        'invalid_completed',
        'completed must be a boolean.'
      );
    END IF;
    completed_filter := (p_request ->> 'completed')::BOOLEAN;
  END IF;

  IF (p_request ? 'priority')
    AND jsonb_typeof(p_request -> 'priority') <> 'null'
  THEN
    priority_filter := private.mcp_tasks_priority_value(p_request -> 'priority');
    IF priority_filter IS NULL THEN
      RETURN private.mcp_error(
        'invalid_priority',
        'priority must be P1, P2, P3 or P4.'
      );
    END IF;
  END IF;

  IF (p_request ? 'deadline_from')
    AND jsonb_typeof(p_request -> 'deadline_from') <> 'null'
  THEN
    deadline_from := private.mcp_tasks_deadline_value(p_request -> 'deadline_from');
    IF deadline_from IS NULL THEN
      RETURN private.mcp_error(
        'invalid_deadline_from',
        'deadline_from must be a date or an ISO instant.'
      );
    END IF;
  END IF;

  IF (p_request ? 'deadline_to')
    AND jsonb_typeof(p_request -> 'deadline_to') <> 'null'
  THEN
    deadline_to := private.mcp_tasks_deadline_value(p_request -> 'deadline_to');
    IF deadline_to IS NULL THEN
      RETURN private.mcp_error(
        'invalid_deadline_to',
        'deadline_to must be a date or an ISO instant.'
      );
    END IF;
  END IF;

  IF deadline_from IS NOT NULL
    AND deadline_to IS NOT NULL
    AND deadline_from > deadline_to
  THEN
    RETURN private.mcp_error(
      'invalid_deadline_range',
      'deadline_from must not be after deadline_to.'
    );
  END IF;

  IF (p_request ? 'query') AND jsonb_typeof(p_request -> 'query') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'query') <> 'string' THEN
      RETURN private.mcp_error('invalid_query', 'query must be a string.');
    END IF;
    query_filter := BTRIM(p_request ->> 'query');
    IF char_length(query_filter) NOT BETWEEN 1 AND 200 THEN
      RETURN private.mcp_error(
        'invalid_query',
        'query must contain 1-200 characters.'
      );
    END IF;
  END IF;

  IF (p_request ? 'cursor') AND jsonb_typeof(p_request -> 'cursor') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'cursor') <> 'string' THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor must be a string.');
    END IF;
    cursor_value := private.mcp_decode_cursor(p_request ->> 'cursor');
    IF cursor_value IS NULL
      OR jsonb_typeof(cursor_value) <> 'object'
      OR NOT private.mcp_json_has_only_keys(cursor_value, ARRAY['created_at', 'id'])
      OR NOT (cursor_value ? 'created_at' AND cursor_value ? 'id')
      OR jsonb_typeof(cursor_value -> 'created_at') <> 'string'
    THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
    END IF;
    cursor_created_at := (cursor_value ->> 'created_at')::TIMESTAMPTZ;
    cursor_id := private.mcp_parse_uuid(cursor_value ->> 'id');
    IF cursor_id IS NULL THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
    END IF;
  END IF;

  authorization_result := private.mcp_authorize(
    'tasks.read',
    'mcp_tasks_search_tasks',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  reference_result := private.mcp_tasks_resolve_reference(
    'project', p_request, 'project_id', 'project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  project_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  reference_result := private.mcp_tasks_resolve_reference(
    'column', p_request, 'column_id', 'column_query', project_id_value
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  column_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  reference_result := private.mcp_tasks_resolve_reference(
    'member', p_request, 'assignee_id', 'assignee_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  assignee_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  WITH visible AS (
    SELECT
      task.id,
      task.project_id,
      task.column_id,
      task.titulo,
      task.descripcion,
      task.priority,
      task.deadline,
      task.labels,
      task.assignee_id,
      task.estimated_hours,
      task.completed,
      task.completed_at,
      task.parent_task_id,
      task.created_at
    FROM public.sistema_tasks AS task
    WHERE (project_id_value IS NULL OR task.project_id = project_id_value)
      AND (column_id_value IS NULL OR task.column_id = column_id_value)
      AND (assignee_id_value IS NULL OR task.assignee_id = assignee_id_value)
      AND (
        completed_filter IS NULL
        OR COALESCE(task.completed, false) = completed_filter
      )
      AND (priority_filter IS NULL OR task.priority = priority_filter)
      AND (deadline_from IS NULL OR task.deadline >= deadline_from)
      AND (deadline_to IS NULL OR task.deadline <= deadline_to)
      AND (
        query_filter IS NULL
        OR task.titulo ILIKE '%' || query_filter || '%'
        OR task.descripcion ILIKE '%' || query_filter || '%'
      )
      AND (
        cursor_id IS NULL
        OR task.created_at < cursor_created_at
        OR (task.created_at = cursor_created_at AND task.id < cursor_id)
      )
  ),
  page AS (
    SELECT *
    FROM visible
    ORDER BY created_at DESC, id DESC
    LIMIT page_size + 1
  ),
  numbered AS (
    SELECT
      page.*,
      row_number() OVER (ORDER BY created_at DESC, id DESC) AS row_number
    FROM page
  )
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', numbered.id,
          'project_id', numbered.project_id,
          'column_id', numbered.column_id,
          'title', numbered.titulo,
          'description', numbered.descripcion,
          'priority', numbered.priority,
          'deadline', numbered.deadline,
          'labels', to_jsonb(numbered.labels),
          'assignee_id', numbered.assignee_id,
          'estimated_hours', numbered.estimated_hours,
          'completed', COALESCE(numbered.completed, false),
          'completed_at', numbered.completed_at,
          'parent_task_id', numbered.parent_task_id,
          'created_at', numbered.created_at
        )
        ORDER BY numbered.created_at DESC, numbered.id DESC
      ) FILTER (WHERE numbered.row_number <= page_size),
      '[]'::JSONB
    ),
    (
      jsonb_agg(
        jsonb_build_object(
          'created_at', numbered.created_at,
          'id', numbered.id
        )
      ) FILTER (WHERE numbered.row_number = page_size)
    ) -> 0
  INTO fetched_count, task_list, next_cursor_value
  FROM numbered;

  IF fetched_count > page_size THEN
    next_cursor_text := private.mcp_encode_cursor(next_cursor_value);
  END IF;

  PERFORM private.mcp_audit_event(
    'tasks.tasks.searched',
    'mcp_tasks_search_tasks',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'tasks.read',
    jsonb_build_object(
      'project_id', project_id_value,
      'result_count', jsonb_array_length(task_list),
      'has_more', fetched_count > page_size
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'items', task_list,
      'count', jsonb_array_length(task_list),
      'page_size', page_size,
      'has_more', fetched_count > page_size,
      'next_cursor', next_cursor_text
    )
  );
EXCEPTION
  WHEN invalid_text_representation
    OR invalid_parameter_value
    OR invalid_datetime_format
    OR character_not_in_repertoire
  THEN
    RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
  WHEN OTHERS THEN
    RETURN private.mcp_error('tasks_read_failed', 'Tasks could not be read.');
END
$mcp_tasks_search_tasks$;

-- ---------------------------------------------------------------------------
-- 5. Detalle de una tarea
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_get_task(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_get_task$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  task_id_value UUID;
  task_row public.sistema_tasks%ROWTYPE;
  detail JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['task_id', 'task_query', 'project_id', 'project_query']
    )
    OR NOT (p_request ? 'task_id' OR p_request ? 'task_query')
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Exactly one task selector is required.'
    );
  END IF;

  authorization_result := private.mcp_authorize(
    'tasks.read',
    'mcp_tasks_get_task',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  reference_result := private.mcp_tasks_resolve_reference(
    'task', p_request, 'task_id', 'task_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  task_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  SELECT task.*
  INTO task_row
  FROM public.sistema_tasks AS task
  WHERE task.id = task_id_value;

  IF NOT FOUND THEN
    RETURN private.mcp_error('task_not_found', 'The task no longer exists.');
  END IF;

  detail := jsonb_build_object(
    'id', task_row.id,
    'project_id', task_row.project_id,
    'column_id', task_row.column_id,
    'title', task_row.titulo,
    'description', task_row.descripcion,
    'priority', task_row.priority,
    'deadline', task_row.deadline,
    'labels', to_jsonb(task_row.labels),
    'assignee_id', task_row.assignee_id,
    'estimated_hours', task_row.estimated_hours,
    'completed', COALESCE(task_row.completed, false),
    'completed_at', task_row.completed_at,
    'parent_task_id', task_row.parent_task_id,
    'social_copy', task_row.social_copy,
    'created_at', task_row.created_at,
    'updated_at', task_row.updated_at,
    'project_name', (
      SELECT project.nombre
      FROM public.sistema_projects AS project
      WHERE project.id = task_row.project_id
    ),
    'column_name', (
      SELECT board_column.nombre
      FROM public.sistema_columns AS board_column
      WHERE board_column.id = task_row.column_id
    ),
    'assignee_name', (
      SELECT member.nombre
      FROM public.sistema_users AS member
      WHERE member.id = task_row.assignee_id
    ),
    'subtasks', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', subtask.id,
            'title', subtask.titulo,
            'completed', COALESCE(subtask.completed, false),
            'assignee_id', subtask.assignee_id,
            'position', subtask.orden
          )
          ORDER BY subtask.orden, subtask.created_at, subtask.id
        ),
        '[]'::JSONB
      )
      FROM public.sistema_subtasks AS subtask
      WHERE subtask.task_id = task_row.id
    ),
    'links', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', link.id,
            'url', link.url,
            'title', link.titulo
          )
          ORDER BY link.created_at, link.id
        ),
        '[]'::JSONB
      )
      FROM public.sistema_task_links AS link
      WHERE link.task_id = task_row.id
    ),
    'depends_on', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'task_id', dependency.depends_on_id,
            'title', blocker.titulo,
            'completed', COALESCE(blocker.completed, false)
          )
          ORDER BY blocker.titulo, dependency.depends_on_id
        ),
        '[]'::JSONB
      )
      FROM public.sistema_task_dependencies AS dependency
      LEFT JOIN public.sistema_tasks AS blocker
        ON blocker.id = dependency.depends_on_id
      WHERE dependency.task_id = task_row.id
    ),
    'recent_comments', (
      SELECT COALESCE(
        jsonb_agg(recent.entry ORDER BY recent.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT
          comment.created_at,
          jsonb_build_object(
            'id', comment.id,
            'content', comment.contenido,
            'author_name', COALESCE(
              comment.author_name,
              (
                SELECT member.nombre
                FROM public.sistema_users AS member
                WHERE member.id = comment.user_id
              )
            ),
            'is_client', comment.is_client,
            'created_at', comment.created_at
          ) AS entry
        FROM public.sistema_comments AS comment
        WHERE comment.task_id = task_row.id
        ORDER BY comment.created_at DESC
        LIMIT 20
      ) AS recent
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.task.read',
    'mcp_tasks_get_task',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'tasks.read',
    jsonb_build_object('task_id', task_id_value)
  );

  RETURN private.mcp_ok(detail);
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'tasks_read_failed',
      'The task could not be read.'
    );
END
$mcp_tasks_get_task$;

COMMENT ON FUNCTION public.mcp_tasks_search_tasks(JSONB) IS
  'Busca tareas con filtros acotados y cursor estable sobre created_at, no sobre el orden del tablero.';

NOTIFY pgrst, 'reload schema';
