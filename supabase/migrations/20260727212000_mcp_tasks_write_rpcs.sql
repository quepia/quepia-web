-- Escritura de tareas por MCP: alta individual, alta en lote y actualizacion.
--
-- El lote es la excepcion deliberada a "una mutacion, un id" del plan maestro:
-- pasar una planificacion a tarjetas de a una llamada por tarjeta es inusable.
-- Se acota asi:
--
--   * un solo proyecto por llamada y un maximo configurable de tareas;
--   * todo o nada, dentro de la misma transaccion de la RPC;
--   * una sola operacion MCP, con una fila de undo por tarea, de modo que el
--     lote entero se anula con un `operation_id`.
--
-- Actualizar no crea filas, asi que su undo guarda el estado previo y se niega
-- a restaurar si una persona edito la tarea despues del MCP.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Normalizacion de una tarea
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.mcp_tasks_normalize_task(
  p_task JSONB,
  p_project_id UUID,
  p_default_column_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_normalize_task$
DECLARE
  text_result JSONB;
  optional_result JSONB;
  reference_result JSONB;
  title_value TEXT;
  description_value TEXT;
  social_copy_value TEXT;
  priority_value TEXT := 'P4';
  deadline_value TIMESTAMPTZ;
  labels_value JSONB := '[]'::JSONB;
  assignee_id_value UUID;
  estimated_hours_value NUMERIC;
  column_id_value UUID;
BEGIN
  IF jsonb_typeof(COALESCE(p_task, 'null'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      p_task,
      ARRAY[
        'title',
        'description',
        'priority',
        'deadline',
        'labels',
        'assignee_id',
        'assignee_query',
        'estimated_hours',
        'column_id',
        'column_query',
        'social_copy'
      ]
    )
  THEN
    RETURN private.mcp_error(
      'invalid_task',
      'Every task accepts only the documented fields.'
    );
  END IF;

  text_result := private.mcp_tasks_text_value(p_task, 'title', 1, 300);
  IF NOT COALESCE((text_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN text_result;
  END IF;
  title_value := text_result -> 'data' ->> 'value';

  optional_result := private.mcp_optional_text(p_task, 'description', 5000);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  description_value := optional_result -> 'data' ->> 'value';

  optional_result := private.mcp_optional_text(p_task, 'social_copy', 5000);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  social_copy_value := optional_result -> 'data' ->> 'value';

  IF (p_task ? 'priority') AND jsonb_typeof(p_task -> 'priority') <> 'null' THEN
    priority_value := private.mcp_tasks_priority_value(p_task -> 'priority');
    IF priority_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_priority',
        'priority must be P1, P2, P3 or P4.'
      );
    END IF;
  END IF;

  IF (p_task ? 'deadline') AND jsonb_typeof(p_task -> 'deadline') <> 'null' THEN
    deadline_value := private.mcp_tasks_deadline_value(p_task -> 'deadline');
    IF deadline_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_deadline',
        'deadline must be a date or an ISO instant.'
      );
    END IF;
  END IF;

  IF (p_task ? 'labels') AND jsonb_typeof(p_task -> 'labels') <> 'null' THEN
    optional_result := private.mcp_tasks_labels_value(p_task -> 'labels');
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN optional_result;
    END IF;
    labels_value := optional_result -> 'data' -> 'value';
  END IF;

  IF (p_task ? 'estimated_hours')
    AND jsonb_typeof(p_task -> 'estimated_hours') <> 'null'
  THEN
    optional_result := private.mcp_tasks_hours_value(p_task -> 'estimated_hours');
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN optional_result;
    END IF;
    estimated_hours_value := (optional_result -> 'data' ->> 'value')::NUMERIC;
  END IF;

  reference_result := private.mcp_tasks_resolve_reference(
    'member', p_task, 'assignee_id', 'assignee_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  assignee_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  reference_result := private.mcp_tasks_resolve_reference(
    'column', p_task, 'column_id', 'column_query', p_project_id
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  column_id_value := COALESCE(
    (reference_result -> 'data' ->> 'id')::UUID,
    p_default_column_id
  );

  IF column_id_value IS NULL THEN
    RETURN private.mcp_error(
      'column_required',
      'Supply a column for the task or a default column for the request.'
    );
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'title', title_value,
      'description', description_value,
      'social_copy', social_copy_value,
      'priority', priority_value,
      'deadline', deadline_value,
      'labels', labels_value,
      'assignee_id', assignee_id_value,
      'estimated_hours', estimated_hours_value,
      'column_id', column_id_value
    )
  );
END
$mcp_tasks_normalize_task$;

-- Inserta al final de su columna, que es donde el tablero espera lo nuevo.
CREATE OR REPLACE FUNCTION private.mcp_tasks_insert_task(
  p_project_id UUID,
  p_normalized JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_insert_task$
DECLARE
  column_id_value UUID := (p_normalized ->> 'column_id')::UUID;
  next_position INTEGER;
  task_id_value UUID;
BEGIN
  SELECT COALESCE(MAX(task.orden), -1) + 1
  INTO next_position
  FROM public.sistema_tasks AS task
  WHERE task.column_id = column_id_value;

  INSERT INTO public.sistema_tasks(
    project_id,
    column_id,
    titulo,
    descripcion,
    priority,
    deadline,
    labels,
    assignee_id,
    estimated_hours,
    social_copy,
    orden
  )
  VALUES (
    p_project_id,
    column_id_value,
    p_normalized ->> 'title',
    p_normalized ->> 'description',
    p_normalized ->> 'priority',
    (p_normalized ->> 'deadline')::TIMESTAMPTZ,
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(p_normalized -> 'labels', '[]'::JSONB)
      )
    ),
    (p_normalized ->> 'assignee_id')::UUID,
    (p_normalized ->> 'estimated_hours')::NUMERIC,
    p_normalized ->> 'social_copy',
    next_position
  )
  RETURNING id INTO task_id_value;

  RETURN task_id_value;
END
$mcp_tasks_insert_task$;

-- Vista corta de una tarea escrita, para que la respuesta no obligue a releer.
CREATE OR REPLACE FUNCTION private.mcp_tasks_summary(p_task_id UUID)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_summary$
  SELECT jsonb_build_object(
    'task_id', task.id,
    'title', task.titulo,
    'project_id', task.project_id,
    'column_id', task.column_id,
    'priority', task.priority,
    'deadline', task.deadline,
    'assignee_id', task.assignee_id,
    'completed', COALESCE(task.completed, false)
  )
  FROM public.sistema_tasks AS task
  WHERE task.id = p_task_id;
$mcp_tasks_summary$;

-- Resuelve el proyecto y la columna por defecto que comparten alta y lote.
CREATE OR REPLACE FUNCTION private.mcp_tasks_resolve_target(p_request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_resolve_target$
DECLARE
  reference_result JSONB;
  project_id_value UUID;
  column_id_value UUID;
BEGIN
  reference_result := private.mcp_tasks_resolve_reference(
    'project', p_request, 'project_id', 'project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  project_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  IF project_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Exactly one project selector is required.'
    );
  END IF;

  reference_result := private.mcp_tasks_resolve_reference(
    'column', p_request, 'column_id', 'column_query', project_id_value
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  column_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  -- Sin columna explicita se usa la primera del tablero, que es donde entra el
  -- trabajo nuevo en este sistema.
  IF column_id_value IS NULL THEN
    SELECT board_column.id
    INTO column_id_value
    FROM public.sistema_columns AS board_column
    WHERE board_column.project_id = project_id_value
    ORDER BY board_column.orden, board_column.created_at, board_column.id
    LIMIT 1;
  END IF;

  IF column_id_value IS NULL THEN
    RETURN private.mcp_error(
      'project_has_no_columns',
      'The project has no board column to receive tasks.'
    );
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'project_id', project_id_value,
      'column_id', column_id_value
    )
  );
END
$mcp_tasks_resolve_target$;

-- ---------------------------------------------------------------------------
-- 2. Alta de una tarea
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_create_task(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_create_task$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  target_result JSONB;
  normalize_result JSONB;
  idempotency_uuid UUID;
  project_id_value UUID;
  column_id_value UUID;
  normalized JSONB;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
  task_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.write',
    'mcp_tasks_create_task',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY[
        'idempotency_key',
        'project_id',
        'project_query',
        'column_id',
        'column_query',
        'title',
        'description',
        'priority',
        'deadline',
        'labels',
        'assignee_id',
        'assignee_query',
        'estimated_hours',
        'social_copy'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'title'
      AND (p_request ? 'project_id' OR p_request ? 'project_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, title and one project selector are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  target_result := private.mcp_tasks_resolve_target(p_request);
  IF NOT COALESCE((target_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN target_result;
  END IF;
  project_id_value := (target_result -> 'data' ->> 'project_id')::UUID;
  column_id_value := (target_result -> 'data' ->> 'column_id')::UUID;

  normalize_result := private.mcp_tasks_normalize_task(
    p_request
      - 'idempotency_key'
      - 'project_id'
      - 'project_query'
      - 'column_id'
      - 'column_query',
    project_id_value,
    column_id_value
  );
  IF NOT COALESCE((normalize_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN normalize_result;
  END IF;
  normalized := normalize_result -> 'data';

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object('project_id', project_id_value, 'task', normalized)
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.create_task',
    'tasks.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_tasks_risk(1)
  );
  IF NOT COALESCE((open_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN open_result;
  END IF;
  operation_id_value := (open_result -> 'data' ->> 'operation_id')::UUID;

  IF COALESCE((open_result -> 'data' ->> 'idempotent_replay')::BOOLEAN, false) THEN
    RETURN private.mcp_ok(
      (open_result -> 'data' -> 'view')
      || jsonb_build_object('idempotent_replay', true)
    );
  END IF;

  BEGIN
    task_id_value := private.mcp_tasks_insert_task(project_id_value, normalized);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'task_insert_failed'
      );
      PERFORM private.mcp_audit_event(
        'tasks.task.create_failed',
        'mcp_tasks_create_task',
        'failed',
        (context_data ->> 'user_id')::UUID,
        (context_data ->> 'client_id')::UUID,
        (context_data ->> 'session_id')::UUID,
        operation_id_value,
        'tasks.write',
        jsonb_build_object('sqlstate', SQLSTATE)
      );
      RETURN private.mcp_error(
        'task_create_failed',
        'The task could not be created.'
      );
  END;

  PERFORM private.mcp_tasks_record_undo(
    operation_id_value,
    0,
    'delete_row',
    'sistema_tasks',
    task_id_value
  );

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_tasks',
    task_id_value,
    private.mcp_tasks_summary(task_id_value)
  );

  PERFORM private.mcp_audit_event(
    'tasks.task.created',
    'mcp_tasks_create_task',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.write',
    jsonb_build_object(
      'task_id', task_id_value,
      'project_id', project_id_value,
      'idempotency_key', idempotency_uuid
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM private.mcp_audit_event(
      'tasks.task.create_failed',
      'mcp_tasks_create_task',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      operation_id_value,
      'tasks.write',
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'task_create_failed',
      'The task could not be created.'
    );
END
$mcp_tasks_create_task$;

-- ---------------------------------------------------------------------------
-- 3. Alta en lote
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_create_tasks_batch(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_create_tasks_batch$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  target_result JSONB;
  normalize_result JSONB;
  idempotency_uuid UUID;
  project_id_value UUID;
  column_id_value UUID;
  task_elements JSONB;
  task_count INTEGER;
  batch_limit INTEGER;
  normalized_tasks JSONB := '[]'::JSONB;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
  task_index INTEGER;
  task_id_value UUID;
  created_tasks JSONB := '[]'::JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.write',
    'mcp_tasks_create_tasks_batch',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY[
        'idempotency_key',
        'project_id',
        'project_query',
        'column_id',
        'column_query',
        'tasks'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'tasks'
      AND (p_request ? 'project_id' OR p_request ? 'project_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, tasks and one project selector are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  task_elements := p_request -> 'tasks';
  IF jsonb_typeof(task_elements) <> 'array' THEN
    RETURN private.mcp_error('invalid_tasks', 'tasks must be an array.');
  END IF;

  task_count := jsonb_array_length(task_elements);
  batch_limit := private.mcp_config_integer('tasks_batch_max', 50);
  IF task_count = 0 THEN
    RETURN private.mcp_error('invalid_tasks', 'tasks must not be empty.');
  END IF;
  IF task_count > batch_limit THEN
    RETURN private.mcp_error(
      'batch_too_large',
      'The batch exceeds the configured maximum.',
      jsonb_build_object('max_tasks', batch_limit, 'received', task_count)
    );
  END IF;

  target_result := private.mcp_tasks_resolve_target(p_request);
  IF NOT COALESCE((target_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN target_result;
  END IF;
  project_id_value := (target_result -> 'data' ->> 'project_id')::UUID;
  column_id_value := (target_result -> 'data' ->> 'column_id')::UUID;

  -- Todo o nada: se normaliza el lote entero antes de escribir una sola fila,
  -- y el error dice que posicion del lote fallo.
  FOR task_index IN 0 .. task_count - 1
  LOOP
    normalize_result := private.mcp_tasks_normalize_task(
      task_elements -> task_index,
      project_id_value,
      column_id_value
    );
    IF NOT COALESCE((normalize_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN private.mcp_error(
        normalize_result -> 'error' ->> 'code',
        'Task ' || (task_index + 1) || ' of the batch was rejected: '
          || (normalize_result -> 'error' ->> 'message'),
        jsonb_build_object(
          'index', task_index,
          'details', normalize_result -> 'error' -> 'details'
        )
      );
    END IF;
    normalized_tasks := normalized_tasks
      || jsonb_build_array(normalize_result -> 'data');
  END LOOP;

  normalized_payload := jsonb_build_object(
    'project_id', project_id_value,
    'task_count', task_count,
    'tasks', normalized_tasks
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.create_tasks_batch',
    'tasks.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_tasks_risk(task_count)
  );
  IF NOT COALESCE((open_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN open_result;
  END IF;
  operation_id_value := (open_result -> 'data' ->> 'operation_id')::UUID;

  IF COALESCE((open_result -> 'data' ->> 'idempotent_replay')::BOOLEAN, false) THEN
    RETURN private.mcp_ok(
      (open_result -> 'data' -> 'view')
      || jsonb_build_object('idempotent_replay', true)
    );
  END IF;

  BEGIN
    FOR task_index IN 0 .. task_count - 1
    LOOP
      task_id_value := private.mcp_tasks_insert_task(
        project_id_value,
        normalized_tasks -> task_index
      );

      PERFORM private.mcp_tasks_record_undo(
        operation_id_value,
        task_index,
        'delete_row',
        'sistema_tasks',
        task_id_value
      );

      created_tasks := created_tasks
        || jsonb_build_array(private.mcp_tasks_summary(task_id_value));
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'task_batch_insert_failed'
      );
      PERFORM private.mcp_audit_event(
        'tasks.batch.create_failed',
        'mcp_tasks_create_tasks_batch',
        'failed',
        (context_data ->> 'user_id')::UUID,
        (context_data ->> 'client_id')::UUID,
        (context_data ->> 'session_id')::UUID,
        operation_id_value,
        'tasks.write',
        jsonb_build_object('sqlstate', SQLSTATE, 'task_count', task_count)
      );
      RETURN private.mcp_error(
        'task_batch_failed',
        'No task was created: the batch is written whole or not at all.'
      );
  END;

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_tasks',
    (created_tasks -> 0 ->> 'task_id')::UUID,
    jsonb_build_object('task_count', task_count, 'tasks', created_tasks)
  );

  PERFORM private.mcp_audit_event(
    'tasks.batch.created',
    'mcp_tasks_create_tasks_batch',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.write',
    jsonb_build_object(
      'project_id', project_id_value,
      'task_count', task_count,
      'idempotency_key', idempotency_uuid
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM private.mcp_audit_event(
      'tasks.batch.create_failed',
      'mcp_tasks_create_tasks_batch',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      operation_id_value,
      'tasks.write',
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'task_batch_failed',
      'No task was created: the batch is written whole or not at all.'
    );
END
$mcp_tasks_create_tasks_batch$;

-- ---------------------------------------------------------------------------
-- 4. Actualizacion de una tarea
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_update_task(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_update_task$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  optional_result JSONB;
  text_result JSONB;
  idempotency_uuid UUID;
  task_id_value UUID;
  task_row public.sistema_tasks%ROWTYPE;
  previous_snapshot JSONB;
  set_title BOOLEAN := false;
  set_description BOOLEAN := false;
  set_social_copy BOOLEAN := false;
  set_priority BOOLEAN := false;
  set_deadline BOOLEAN := false;
  set_labels BOOLEAN := false;
  set_assignee BOOLEAN := false;
  set_hours BOOLEAN := false;
  set_column BOOLEAN := false;
  set_completed BOOLEAN := false;
  title_value TEXT;
  description_value TEXT;
  social_copy_value TEXT;
  priority_value TEXT;
  deadline_value TIMESTAMPTZ;
  labels_value TEXT[];
  assignee_id_value UUID;
  hours_value NUMERIC;
  column_id_value UUID;
  completed_value BOOLEAN;
  next_position INTEGER;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.write',
    'mcp_tasks_update_task',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY[
        'idempotency_key',
        'task_id',
        'task_query',
        'project_id',
        'project_query',
        'title',
        'description',
        'social_copy',
        'priority',
        'deadline',
        'labels',
        'assignee_id',
        'assignee_query',
        'estimated_hours',
        'column_id',
        'column_query',
        'completed'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND (p_request ? 'task_id' OR p_request ? 'task_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key and one task selector are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  reference_result := private.mcp_tasks_resolve_reference(
    'project', p_request, 'project_id', 'project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;

  reference_result := private.mcp_tasks_resolve_reference(
    'task',
    p_request,
    'task_id',
    'task_query',
    (reference_result -> 'data' ->> 'id')::UUID
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  task_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  SELECT task.*
  INTO task_row
  FROM public.sistema_tasks AS task
  WHERE task.id = task_id_value
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.mcp_error('task_not_found', 'The task no longer exists.');
  END IF;

  IF p_request ? 'title' THEN
    text_result := private.mcp_tasks_text_value(p_request, 'title', 1, 300);
    IF NOT COALESCE((text_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN text_result;
    END IF;
    title_value := text_result -> 'data' ->> 'value';
    set_title := true;
  END IF;

  IF p_request ? 'description' THEN
    optional_result := private.mcp_optional_text(p_request, 'description', 5000);
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN optional_result;
    END IF;
    description_value := optional_result -> 'data' ->> 'value';
    set_description := true;
  END IF;

  IF p_request ? 'social_copy' THEN
    optional_result := private.mcp_optional_text(p_request, 'social_copy', 5000);
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN optional_result;
    END IF;
    social_copy_value := optional_result -> 'data' ->> 'value';
    set_social_copy := true;
  END IF;

  IF p_request ? 'priority' THEN
    priority_value := private.mcp_tasks_priority_value(p_request -> 'priority');
    IF priority_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_priority',
        'priority must be P1, P2, P3 or P4.'
      );
    END IF;
    set_priority := true;
  END IF;

  IF p_request ? 'deadline' THEN
    IF jsonb_typeof(p_request -> 'deadline') = 'null' THEN
      deadline_value := NULL;
    ELSE
      deadline_value := private.mcp_tasks_deadline_value(p_request -> 'deadline');
      IF deadline_value IS NULL THEN
        RETURN private.mcp_error(
          'invalid_deadline',
          'deadline must be a date, an ISO instant, or null to clear it.'
        );
      END IF;
    END IF;
    set_deadline := true;
  END IF;

  IF p_request ? 'labels' THEN
    optional_result := private.mcp_tasks_labels_value(
      COALESCE(NULLIF(p_request -> 'labels', 'null'::JSONB), '[]'::JSONB)
    );
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN optional_result;
    END IF;
    labels_value := ARRAY(
      SELECT jsonb_array_elements_text(optional_result -> 'data' -> 'value')
    );
    set_labels := true;
  END IF;

  IF p_request ? 'estimated_hours' THEN
    IF jsonb_typeof(p_request -> 'estimated_hours') = 'null' THEN
      hours_value := NULL;
    ELSE
      optional_result := private.mcp_tasks_hours_value(
        p_request -> 'estimated_hours'
      );
      IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
        RETURN optional_result;
      END IF;
      hours_value := (optional_result -> 'data' ->> 'value')::NUMERIC;
    END IF;
    set_hours := true;
  END IF;

  -- Un `assignee_id` nulo explicito desasigna; omitirlo deja el responsable.
  IF (p_request ? 'assignee_id') AND jsonb_typeof(p_request -> 'assignee_id') = 'null'
  THEN
    assignee_id_value := NULL;
    set_assignee := true;
  ELSIF (p_request ? 'assignee_id') OR (p_request ? 'assignee_query') THEN
    reference_result := private.mcp_tasks_resolve_reference(
      'member', p_request, 'assignee_id', 'assignee_query'
    );
    IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN reference_result;
    END IF;
    assignee_id_value := (reference_result -> 'data' ->> 'id')::UUID;
    set_assignee := true;
  END IF;

  IF (p_request ? 'column_id') OR (p_request ? 'column_query') THEN
    reference_result := private.mcp_tasks_resolve_reference(
      'column', p_request, 'column_id', 'column_query', task_row.project_id
    );
    IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN reference_result;
    END IF;
    column_id_value := (reference_result -> 'data' ->> 'id')::UUID;
    IF column_id_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_column',
        'The column must belong to the same project as the task.'
      );
    END IF;
    set_column := column_id_value IS DISTINCT FROM task_row.column_id;
  END IF;

  IF p_request ? 'completed' THEN
    IF jsonb_typeof(p_request -> 'completed') <> 'boolean' THEN
      RETURN private.mcp_error(
        'invalid_completed',
        'completed must be a boolean.'
      );
    END IF;
    completed_value := (p_request ->> 'completed')::BOOLEAN;
    set_completed := true;
  END IF;

  IF NOT (
    set_title OR set_description OR set_social_copy OR set_priority
    OR set_deadline OR set_labels OR set_assignee OR set_hours
    OR set_column OR set_completed
  ) THEN
    RETURN private.mcp_error(
      'nothing_to_update',
      'The request does not change any field of the task.'
    );
  END IF;

  previous_snapshot := private.mcp_tasks_snapshot(task_id_value);

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'task_id', task_id_value,
      'project_id', task_row.project_id,
      'changes', jsonb_strip_nulls(
        jsonb_build_object(
          'title', CASE WHEN set_title THEN title_value END,
          'description', CASE WHEN set_description THEN description_value END,
          'social_copy', CASE WHEN set_social_copy THEN social_copy_value END,
          'priority', CASE WHEN set_priority THEN priority_value END,
          'deadline', CASE WHEN set_deadline THEN deadline_value END,
          'labels', CASE WHEN set_labels THEN to_jsonb(labels_value) END,
          'assignee_id', CASE WHEN set_assignee THEN assignee_id_value END,
          'estimated_hours', CASE WHEN set_hours THEN hours_value END,
          'column_id', CASE WHEN set_column THEN column_id_value END,
          'completed', CASE WHEN set_completed THEN completed_value END
        )
      ),
      'cleared_fields', (
        SELECT COALESCE(jsonb_agg(field.name), '[]'::JSONB)
        FROM (
          SELECT 'deadline' AS name WHERE set_deadline AND deadline_value IS NULL
          UNION ALL
          SELECT 'assignee_id' WHERE set_assignee AND assignee_id_value IS NULL
          UNION ALL
          SELECT 'estimated_hours' WHERE set_hours AND hours_value IS NULL
          UNION ALL
          SELECT 'description' WHERE set_description AND description_value IS NULL
        ) AS field
      )
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.update_task',
    'tasks.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_tasks_risk(1)
  );
  IF NOT COALESCE((open_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN open_result;
  END IF;
  operation_id_value := (open_result -> 'data' ->> 'operation_id')::UUID;

  IF COALESCE((open_result -> 'data' ->> 'idempotent_replay')::BOOLEAN, false) THEN
    RETURN private.mcp_ok(
      (open_result -> 'data' -> 'view')
      || jsonb_build_object('idempotent_replay', true)
    );
  END IF;

  IF set_column THEN
    SELECT COALESCE(MAX(task.orden), -1) + 1
    INTO next_position
    FROM public.sistema_tasks AS task
    WHERE task.column_id = column_id_value;
  END IF;

  BEGIN
    UPDATE public.sistema_tasks AS task
    SET
      titulo = CASE WHEN set_title THEN title_value ELSE task.titulo END,
      descripcion = CASE
        WHEN set_description THEN description_value
        ELSE task.descripcion
      END,
      social_copy = CASE
        WHEN set_social_copy THEN social_copy_value
        ELSE task.social_copy
      END,
      priority = CASE WHEN set_priority THEN priority_value ELSE task.priority END,
      deadline = CASE WHEN set_deadline THEN deadline_value ELSE task.deadline END,
      labels = CASE WHEN set_labels THEN labels_value ELSE task.labels END,
      assignee_id = CASE
        WHEN set_assignee THEN assignee_id_value
        ELSE task.assignee_id
      END,
      estimated_hours = CASE
        WHEN set_hours THEN hours_value
        ELSE task.estimated_hours
      END,
      column_id = CASE WHEN set_column THEN column_id_value ELSE task.column_id END,
      orden = CASE WHEN set_column THEN next_position ELSE task.orden END,
      completed = CASE WHEN set_completed THEN completed_value ELSE task.completed END,
      completed_at = CASE
        WHEN set_completed AND completed_value THEN
          COALESCE(task.completed_at, clock_timestamp())
        WHEN set_completed THEN NULL
        ELSE task.completed_at
      END
    -- `updated_at` lo fija el trigger update_sistema_tasks_updated_at, que es
    -- justamente lo que permite detectar despues si una persona edito la tarea.
    WHERE task.id = task_id_value;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'task_update_failed'
      );
      PERFORM private.mcp_audit_event(
        'tasks.task.update_failed',
        'mcp_tasks_update_task',
        'failed',
        (context_data ->> 'user_id')::UUID,
        (context_data ->> 'client_id')::UUID,
        (context_data ->> 'session_id')::UUID,
        operation_id_value,
        'tasks.write',
        jsonb_build_object('sqlstate', SQLSTATE, 'task_id', task_id_value)
      );
      RETURN private.mcp_error(
        'task_update_failed',
        'The task could not be updated.'
      );
  END;

  PERFORM private.mcp_tasks_record_undo(
    operation_id_value,
    0,
    'restore_row',
    'sistema_tasks',
    task_id_value,
    previous_snapshot
  );

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_tasks',
    task_id_value,
    private.mcp_tasks_summary(task_id_value)
  );

  PERFORM private.mcp_audit_event(
    'tasks.task.updated',
    'mcp_tasks_update_task',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.write',
    jsonb_build_object(
      'task_id', task_id_value,
      'idempotency_key', idempotency_uuid
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM private.mcp_audit_event(
      'tasks.task.update_failed',
      'mcp_tasks_update_task',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      operation_id_value,
      'tasks.write',
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'task_update_failed',
      'The task could not be updated.'
    );
END
$mcp_tasks_update_task$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.mcp_tasks_create_tasks_batch(JSONB) IS
  'Crea hasta el maximo configurado de tareas en un proyecto, todo o nada, bajo una sola operacion anulable.';
COMMENT ON FUNCTION public.mcp_tasks_update_task(JSONB) IS
  'Cambia campos, columna y estado de una tarea guardando el estado previo para poder anular.';

NOTIFY pgrst, 'reload schema';
