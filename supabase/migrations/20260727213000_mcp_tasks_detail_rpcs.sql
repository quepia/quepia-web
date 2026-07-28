-- Detalle de una tarea y estructura del tablero por MCP.
--
-- Subtareas, dependencias y links viven colgados de una tarea, asi que cada RPC
-- afecta exactamente una tarea aunque escriba varias filas, y cada fila escrita
-- deja su rastro de undo.
--
-- Crear columnas y proyectos usa su propia capacidad (`tasks.structure.write`):
-- el tablero es la estructura del trabajo y no deberia cambiarlo el mismo
-- permiso que mueve una tarjeta.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Subtareas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_add_subtasks(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_add_subtasks$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  text_result JSONB;
  idempotency_uuid UUID;
  task_id_value UUID;
  subtask_elements JSONB;
  subtask_element JSONB;
  subtask_count INTEGER;
  subtask_limit INTEGER;
  subtask_index INTEGER;
  normalized_subtasks JSONB := '[]'::JSONB;
  assignee_id_value UUID;
  title_value TEXT;
  next_position INTEGER;
  subtask_id_value UUID;
  created_subtasks JSONB := '[]'::JSONB;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.write',
    'mcp_tasks_add_subtasks',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['idempotency_key', 'task_id', 'task_query', 'subtasks']
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'subtasks'
      AND (p_request ? 'task_id' OR p_request ? 'task_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, subtasks and one task selector are required.'
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
    'task', p_request, 'task_id', 'task_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  task_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  subtask_elements := p_request -> 'subtasks';
  IF jsonb_typeof(subtask_elements) <> 'array' THEN
    RETURN private.mcp_error('invalid_subtasks', 'subtasks must be an array.');
  END IF;

  subtask_count := jsonb_array_length(subtask_elements);
  subtask_limit := private.mcp_config_integer('tasks_subtask_batch_max', 50);
  IF subtask_count = 0 THEN
    RETURN private.mcp_error('invalid_subtasks', 'subtasks must not be empty.');
  END IF;
  IF subtask_count > subtask_limit THEN
    RETURN private.mcp_error(
      'batch_too_large',
      'The subtask batch exceeds the configured maximum.',
      jsonb_build_object('max_subtasks', subtask_limit, 'received', subtask_count)
    );
  END IF;

  FOR subtask_index IN 0 .. subtask_count - 1
  LOOP
    subtask_element := subtask_elements -> subtask_index;

    IF jsonb_typeof(subtask_element) = 'string' THEN
      subtask_element := jsonb_build_object('title', subtask_element);
    END IF;

    IF jsonb_typeof(subtask_element) <> 'object'
      OR NOT private.mcp_json_has_only_keys(
        subtask_element,
        ARRAY['title', 'assignee_id', 'assignee_query']
      )
    THEN
      RETURN private.mcp_error(
        'invalid_subtasks',
        'Every subtask is a title or an object with title and an assignee selector.',
        jsonb_build_object('index', subtask_index)
      );
    END IF;

    text_result := private.mcp_tasks_text_value(subtask_element, 'title', 1, 300);
    IF NOT COALESCE((text_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN private.mcp_error(
        text_result -> 'error' ->> 'code',
        'Subtask ' || (subtask_index + 1) || ' was rejected: '
          || (text_result -> 'error' ->> 'message'),
        jsonb_build_object('index', subtask_index)
      );
    END IF;
    title_value := text_result -> 'data' ->> 'value';

    reference_result := private.mcp_tasks_resolve_reference(
      'member', subtask_element, 'assignee_id', 'assignee_query'
    );
    IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN reference_result;
    END IF;
    assignee_id_value := (reference_result -> 'data' ->> 'id')::UUID;

    normalized_subtasks := normalized_subtasks || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object('title', title_value, 'assignee_id', assignee_id_value)
      )
    );
  END LOOP;

  normalized_payload := jsonb_build_object(
    'task_id', task_id_value,
    'subtask_count', subtask_count,
    'subtasks', normalized_subtasks
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.create_subtasks',
    'tasks.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_tasks_risk(subtask_count)
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

  SELECT COALESCE(MAX(subtask.orden), -1) + 1
  INTO next_position
  FROM public.sistema_subtasks AS subtask
  WHERE subtask.task_id = task_id_value;

  BEGIN
    FOR subtask_index IN 0 .. subtask_count - 1
    LOOP
      INSERT INTO public.sistema_subtasks(task_id, titulo, assignee_id, orden)
      VALUES (
        task_id_value,
        normalized_subtasks -> subtask_index ->> 'title',
        (normalized_subtasks -> subtask_index ->> 'assignee_id')::UUID,
        next_position + subtask_index
      )
      RETURNING id INTO subtask_id_value;

      PERFORM private.mcp_tasks_record_undo(
        operation_id_value,
        subtask_index,
        'delete_row',
        'sistema_subtasks',
        subtask_id_value
      );

      created_subtasks := created_subtasks || jsonb_build_array(
        jsonb_build_object(
          'subtask_id', subtask_id_value,
          'title', normalized_subtasks -> subtask_index ->> 'title'
        )
      );
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'subtask_insert_failed'
      );
      RETURN private.mcp_error(
        'subtask_create_failed',
        'No subtask was created: the batch is written whole or not at all.'
      );
  END;

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_subtasks',
    (created_subtasks -> 0 ->> 'subtask_id')::UUID,
    jsonb_build_object(
      'task_id', task_id_value,
      'subtask_count', subtask_count,
      'subtasks', created_subtasks
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.subtasks.created',
    'mcp_tasks_add_subtasks',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.write',
    jsonb_build_object('task_id', task_id_value, 'subtask_count', subtask_count)
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'subtask_create_failed',
      'The subtasks could not be created.'
    );
END
$mcp_tasks_add_subtasks$;

CREATE OR REPLACE FUNCTION public.mcp_tasks_update_subtask(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_update_subtask$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  text_result JSONB;
  idempotency_uuid UUID;
  subtask_id_value UUID;
  subtask_row public.sistema_subtasks%ROWTYPE;
  previous_snapshot JSONB;
  set_title BOOLEAN := false;
  set_completed BOOLEAN := false;
  set_assignee BOOLEAN := false;
  title_value TEXT;
  completed_value BOOLEAN;
  assignee_id_value UUID;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.write',
    'mcp_tasks_update_subtask',
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
        'subtask_id',
        'title',
        'completed',
        'assignee_id',
        'assignee_query'
      ]
    )
    OR NOT (p_request ? 'idempotency_key' AND p_request ? 'subtask_id')
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key and subtask_id are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  subtask_id_value := private.mcp_parse_uuid(p_request ->> 'subtask_id');
  IF subtask_id_value IS NULL THEN
    RETURN private.mcp_error('invalid_subtask_id', 'subtask_id must be a UUID.');
  END IF;

  SELECT subtask.*
  INTO subtask_row
  FROM public.sistema_subtasks AS subtask
  WHERE subtask.id = subtask_id_value
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.mcp_error('subtask_not_found', 'The subtask does not exist.');
  END IF;

  IF p_request ? 'title' THEN
    text_result := private.mcp_tasks_text_value(p_request, 'title', 1, 300);
    IF NOT COALESCE((text_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN text_result;
    END IF;
    title_value := text_result -> 'data' ->> 'value';
    set_title := true;
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

  IF (p_request ? 'assignee_id')
    AND jsonb_typeof(p_request -> 'assignee_id') = 'null'
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

  IF NOT (set_title OR set_completed OR set_assignee) THEN
    RETURN private.mcp_error(
      'nothing_to_update',
      'The request does not change any field of the subtask.'
    );
  END IF;

  previous_snapshot := private.mcp_tasks_subtask_snapshot(subtask_id_value);

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'subtask_id', subtask_id_value,
      'task_id', subtask_row.task_id,
      'changes', jsonb_strip_nulls(
        jsonb_build_object(
          'title', CASE WHEN set_title THEN title_value END,
          'completed', CASE WHEN set_completed THEN completed_value END,
          'assignee_id', CASE WHEN set_assignee THEN assignee_id_value END
        )
      )
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.update_subtask',
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

  UPDATE public.sistema_subtasks AS subtask
  SET
    titulo = CASE WHEN set_title THEN title_value ELSE subtask.titulo END,
    completed = CASE
      WHEN set_completed THEN completed_value
      ELSE subtask.completed
    END,
    assignee_id = CASE
      WHEN set_assignee THEN assignee_id_value
      ELSE subtask.assignee_id
    END
  WHERE subtask.id = subtask_id_value;

  PERFORM private.mcp_tasks_record_undo(
    operation_id_value,
    0,
    'restore_row',
    'sistema_subtasks',
    subtask_id_value,
    previous_snapshot
  );

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_subtasks',
    subtask_id_value,
    jsonb_build_object(
      'subtask_id', subtask_id_value,
      'task_id', subtask_row.task_id
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.subtask.updated',
    'mcp_tasks_update_subtask',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.write',
    jsonb_build_object('subtask_id', subtask_id_value)
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'subtask_update_failed',
      'The subtask could not be updated.'
    );
END
$mcp_tasks_update_subtask$;

-- ---------------------------------------------------------------------------
-- 2. Dependencias
-- ---------------------------------------------------------------------------

-- Reemplaza el conjunto de bloqueos de una tarea. Las filas que borra se
-- reponen al anular, asi que la operacion sigue siendo reversible entera.
CREATE OR REPLACE FUNCTION public.mcp_tasks_set_dependencies(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_set_dependencies$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  idempotency_uuid UUID;
  task_id_value UUID;
  dependency_elements JSONB;
  dependency_count INTEGER;
  dependency_limit INTEGER;
  dependency_index INTEGER;
  dependency_id UUID;
  dependency_ids UUID[] := ARRAY[]::UUID[];
  removed_id UUID;
  undo_ordinal INTEGER := 0;
  created_count INTEGER := 0;
  removed_count INTEGER := 0;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
  creates_cycle BOOLEAN;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.write',
    'mcp_tasks_set_dependencies',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['idempotency_key', 'task_id', 'task_query', 'depends_on_task_ids']
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'depends_on_task_ids'
      AND (p_request ? 'task_id' OR p_request ? 'task_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, depends_on_task_ids and one task selector are required.'
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
    'task', p_request, 'task_id', 'task_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  task_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  dependency_elements := p_request -> 'depends_on_task_ids';
  IF jsonb_typeof(dependency_elements) <> 'array' THEN
    RETURN private.mcp_error(
      'invalid_depends_on_task_ids',
      'depends_on_task_ids must be an array of task UUIDs.'
    );
  END IF;

  dependency_count := jsonb_array_length(dependency_elements);
  dependency_limit := private.mcp_config_integer('tasks_dependency_max', 20);
  IF dependency_count > dependency_limit THEN
    RETURN private.mcp_error(
      'too_many_dependencies',
      'The task exceeds the configured dependency maximum.',
      jsonb_build_object('max_dependencies', dependency_limit)
    );
  END IF;

  FOR dependency_index IN 0 .. GREATEST(dependency_count - 1, -1)
  LOOP
    EXIT WHEN dependency_count = 0;

    IF jsonb_typeof(dependency_elements -> dependency_index) <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_depends_on_task_ids',
        'Every dependency must be a task UUID.'
      );
    END IF;

    dependency_id := private.mcp_parse_uuid(
      dependency_elements ->> dependency_index
    );
    IF dependency_id IS NULL THEN
      RETURN private.mcp_error(
        'invalid_depends_on_task_ids',
        'Every dependency must be a task UUID.'
      );
    END IF;

    IF dependency_id = task_id_value THEN
      RETURN private.mcp_error(
        'invalid_dependency',
        'A task cannot depend on itself.'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.sistema_tasks AS blocker
      WHERE blocker.id = dependency_id
    ) THEN
      RETURN private.mcp_error(
        'dependency_not_found',
        'A dependency does not identify an existing task.',
        jsonb_build_object('task_id', dependency_id)
      );
    END IF;

    IF NOT (dependency_id = ANY(dependency_ids)) THEN
      dependency_ids := dependency_ids || dependency_id;
    END IF;
  END LOOP;

  normalized_payload := jsonb_build_object(
    'task_id', task_id_value,
    'depends_on_task_ids', to_jsonb(dependency_ids)
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.set_dependencies',
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

  -- El sub-bloque actua como savepoint: si el conjunto final cierra un ciclo,
  -- el reemplazo entero se revierte y la tarea queda como estaba.
  BEGIN
    FOR removed_id IN
      SELECT dependency.depends_on_id
      FROM public.sistema_task_dependencies AS dependency
      WHERE dependency.task_id = task_id_value
        AND NOT (dependency.depends_on_id = ANY(dependency_ids))
    LOOP
      DELETE FROM public.sistema_task_dependencies AS dependency
      WHERE dependency.task_id = task_id_value
        AND dependency.depends_on_id = removed_id;

      PERFORM private.mcp_tasks_record_undo(
        operation_id_value,
        undo_ordinal,
        'insert_row',
        'sistema_task_dependencies',
        removed_id,
        jsonb_build_object(
          'task_id', task_id_value,
          'depends_on_id', removed_id
        )
      );
      undo_ordinal := undo_ordinal + 1;
      removed_count := removed_count + 1;
    END LOOP;

    FOREACH dependency_id IN ARRAY dependency_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.sistema_task_dependencies AS dependency
        WHERE dependency.task_id = task_id_value
          AND dependency.depends_on_id = dependency_id
      ) THEN
        INSERT INTO public.sistema_task_dependencies(task_id, depends_on_id)
        VALUES (task_id_value, dependency_id);

        PERFORM private.mcp_tasks_record_undo(
          operation_id_value,
          undo_ordinal,
          'delete_row',
          'sistema_task_dependencies',
          dependency_id,
          jsonb_build_object(
            'task_id', task_id_value,
            'depends_on_id', dependency_id
          )
        );
        undo_ordinal := undo_ordinal + 1;
        created_count := created_count + 1;
      END IF;
    END LOOP;

    WITH RECURSIVE reachable(node) AS (
      SELECT dependency.depends_on_id
      FROM public.sistema_task_dependencies AS dependency
      WHERE dependency.task_id = task_id_value
      UNION
      SELECT dependency.depends_on_id
      FROM public.sistema_task_dependencies AS dependency
      JOIN reachable ON dependency.task_id = reachable.node
    )
    SELECT EXISTS (
      SELECT 1 FROM reachable WHERE reachable.node = task_id_value
    )
    INTO creates_cycle;

    IF creates_cycle THEN
      RAISE EXCEPTION 'dependency cycle' USING ERRCODE = '23514';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'dependency_write_failed'
      );
      RETURN private.mcp_error(
        'invalid_dependency',
        'The dependencies were not changed: the requested set would block the task on itself.'
      );
  END;

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_task_dependencies',
    task_id_value,
    jsonb_build_object(
      'task_id', task_id_value,
      'added', created_count,
      'removed', removed_count,
      'depends_on_task_ids', to_jsonb(dependency_ids)
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.dependencies.set',
    'mcp_tasks_set_dependencies',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.write',
    jsonb_build_object(
      'task_id', task_id_value,
      'added', created_count,
      'removed', removed_count
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'dependency_write_failed',
      'The dependencies could not be changed.'
    );
END
$mcp_tasks_set_dependencies$;

-- ---------------------------------------------------------------------------
-- 3. Links de una tarea
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_add_links(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_add_links$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  optional_result JSONB;
  url_result JSONB;
  idempotency_uuid UUID;
  task_id_value UUID;
  link_elements JSONB;
  link_element JSONB;
  link_count INTEGER;
  link_limit INTEGER;
  link_index INTEGER;
  normalized_links JSONB := '[]'::JSONB;
  link_id_value UUID;
  created_links JSONB := '[]'::JSONB;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.write',
    'mcp_tasks_add_links',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['idempotency_key', 'task_id', 'task_query', 'links']
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'links'
      AND (p_request ? 'task_id' OR p_request ? 'task_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, links and one task selector are required.'
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
    'task', p_request, 'task_id', 'task_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  task_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  link_elements := p_request -> 'links';
  IF jsonb_typeof(link_elements) <> 'array' THEN
    RETURN private.mcp_error('invalid_links', 'links must be an array.');
  END IF;

  link_count := jsonb_array_length(link_elements);
  link_limit := private.mcp_config_integer('tasks_link_batch_max', 20);
  IF link_count = 0 THEN
    RETURN private.mcp_error('invalid_links', 'links must not be empty.');
  END IF;
  IF link_count > link_limit THEN
    RETURN private.mcp_error(
      'batch_too_large',
      'The link batch exceeds the configured maximum.',
      jsonb_build_object('max_links', link_limit, 'received', link_count)
    );
  END IF;

  FOR link_index IN 0 .. link_count - 1
  LOOP
    link_element := link_elements -> link_index;

    IF jsonb_typeof(link_element) = 'string' THEN
      link_element := jsonb_build_object('url', link_element);
    END IF;

    IF jsonb_typeof(link_element) <> 'object'
      OR NOT private.mcp_json_has_only_keys(link_element, ARRAY['url', 'title'])
      OR NOT (link_element ? 'url')
    THEN
      RETURN private.mcp_error(
        'invalid_links',
        'Every link is a url or an object with url and title.',
        jsonb_build_object('index', link_index)
      );
    END IF;

    url_result := private.mcp_tasks_url_value(link_element -> 'url');
    IF NOT COALESCE((url_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN private.mcp_error(
        url_result -> 'error' ->> 'code',
        'Link ' || (link_index + 1) || ' was rejected: '
          || (url_result -> 'error' ->> 'message'),
        jsonb_build_object('index', link_index)
      );
    END IF;

    optional_result := private.mcp_optional_text(link_element, 'title', 200);
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN optional_result;
    END IF;

    normalized_links := normalized_links || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'url', url_result -> 'data' ->> 'value',
          'title', optional_result -> 'data' ->> 'value'
        )
      )
    );
  END LOOP;

  normalized_payload := jsonb_build_object(
    'task_id', task_id_value,
    'link_count', link_count,
    'links', normalized_links
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.add_links',
    'tasks.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_tasks_risk(link_count)
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
    FOR link_index IN 0 .. link_count - 1
    LOOP
      INSERT INTO public.sistema_task_links(task_id, url, titulo)
      VALUES (
        task_id_value,
        normalized_links -> link_index ->> 'url',
        normalized_links -> link_index ->> 'title'
      )
      RETURNING id INTO link_id_value;

      PERFORM private.mcp_tasks_record_undo(
        operation_id_value,
        link_index,
        'delete_row',
        'sistema_task_links',
        link_id_value
      );

      created_links := created_links || jsonb_build_array(
        jsonb_build_object(
          'link_id', link_id_value,
          'url', normalized_links -> link_index ->> 'url'
        )
      );
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'link_insert_failed'
      );
      RETURN private.mcp_error(
        'link_create_failed',
        'No link was added: the batch is written whole or not at all.'
      );
  END;

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_task_links',
    (created_links -> 0 ->> 'link_id')::UUID,
    jsonb_build_object(
      'task_id', task_id_value,
      'link_count', link_count,
      'links', created_links
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.links.added',
    'mcp_tasks_add_links',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.write',
    jsonb_build_object('task_id', task_id_value, 'link_count', link_count)
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'link_create_failed',
      'The links could not be added.'
    );
END
$mcp_tasks_add_links$;

-- ---------------------------------------------------------------------------
-- 4. Estructura del tablero
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_create_column(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_create_column$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  text_result JSONB;
  idempotency_uuid UUID;
  project_id_value UUID;
  name_value TEXT;
  wip_limit_value INTEGER;
  next_position INTEGER;
  column_id_value UUID;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.structure.write',
    'mcp_tasks_create_column',
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
        'name',
        'wip_limit'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'name'
      AND (p_request ? 'project_id' OR p_request ? 'project_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, name and one project selector are required.'
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
  project_id_value := (reference_result -> 'data' ->> 'id')::UUID;
  IF project_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Exactly one project selector is required.'
    );
  END IF;

  text_result := private.mcp_tasks_text_value(p_request, 'name', 1, 120);
  IF NOT COALESCE((text_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN text_result;
  END IF;
  name_value := text_result -> 'data' ->> 'value';

  IF (p_request ? 'wip_limit')
    AND jsonb_typeof(p_request -> 'wip_limit') <> 'null'
  THEN
    IF jsonb_typeof(p_request -> 'wip_limit') <> 'number'
      OR (p_request ->> 'wip_limit') !~ '^[0-9]+$'
    THEN
      RETURN private.mcp_error(
        'invalid_wip_limit',
        'wip_limit must be a positive integer.'
      );
    END IF;
    wip_limit_value := (p_request ->> 'wip_limit')::INTEGER;
    IF wip_limit_value NOT BETWEEN 1 AND 999 THEN
      RETURN private.mcp_error(
        'invalid_wip_limit',
        'wip_limit must be between 1 and 999.'
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sistema_columns AS board_column
    WHERE board_column.project_id = project_id_value
      AND LOWER(board_column.nombre) = LOWER(name_value)
  ) THEN
    RETURN private.mcp_error(
      'column_already_exists',
      'The project already has a column with that name.'
    );
  END IF;

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'project_id', project_id_value,
      'name', name_value,
      'wip_limit', wip_limit_value
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.create_column',
    'tasks.structure.write',
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

  SELECT COALESCE(MAX(board_column.orden), -1) + 1
  INTO next_position
  FROM public.sistema_columns AS board_column
  WHERE board_column.project_id = project_id_value;

  INSERT INTO public.sistema_columns(project_id, nombre, orden, wip_limit)
  VALUES (project_id_value, name_value, next_position, wip_limit_value)
  RETURNING id INTO column_id_value;

  PERFORM private.mcp_tasks_record_undo(
    operation_id_value,
    0,
    'delete_row',
    'sistema_columns',
    column_id_value
  );

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_columns',
    column_id_value,
    jsonb_build_object(
      'column_id', column_id_value,
      'project_id', project_id_value,
      'name', name_value,
      'position', next_position
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.column.created',
    'mcp_tasks_create_column',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.structure.write',
    jsonb_build_object(
      'column_id', column_id_value,
      'project_id', project_id_value
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'column_create_failed',
      'The column could not be created.'
    );
END
$mcp_tasks_create_column$;

-- Un proyecto nace con su tablero, porque un proyecto sin columnas no puede
-- recibir tareas. Sin `columns` explicitas se usa el flujo de la agencia.
CREATE OR REPLACE FUNCTION public.mcp_tasks_create_project(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_create_project$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  text_result JSONB;
  optional_result JSONB;
  idempotency_uuid UUID;
  name_value TEXT;
  description_value TEXT;
  parent_id_value UUID;
  column_elements JSONB;
  column_names TEXT[] := ARRAY[
    'PLANIFICACION',
    'MATERIAL A PRODUCIR',
    'EDICION',
    'LISTO PARA PUBLICAR'
  ];
  column_index INTEGER;
  column_name TEXT;
  column_id_value UUID;
  created_columns JSONB := '[]'::JSONB;
  project_id_value UUID;
  undo_ordinal INTEGER := 1;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.structure.write',
    'mcp_tasks_create_project',
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
        'name',
        'description',
        'parent_project_id',
        'parent_project_query',
        'columns'
      ]
    )
    OR NOT (p_request ? 'idempotency_key' AND p_request ? 'name')
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key and name are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  text_result := private.mcp_tasks_text_value(p_request, 'name', 1, 200);
  IF NOT COALESCE((text_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN text_result;
  END IF;
  name_value := text_result -> 'data' ->> 'value';

  optional_result := private.mcp_optional_text(p_request, 'description', 2000);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  description_value := optional_result -> 'data' ->> 'value';

  reference_result := private.mcp_tasks_resolve_reference(
    'project', p_request, 'parent_project_id', 'parent_project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  parent_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  IF EXISTS (
    SELECT 1
    FROM public.sistema_projects AS project
    WHERE LOWER(project.nombre) = LOWER(name_value)
      AND project.parent_id IS NOT DISTINCT FROM parent_id_value
  ) THEN
    RETURN private.mcp_error(
      'project_already_exists',
      'A project with that name already exists at the same level.'
    );
  END IF;

  IF (p_request ? 'columns') AND jsonb_typeof(p_request -> 'columns') <> 'null'
  THEN
    column_elements := p_request -> 'columns';
    IF jsonb_typeof(column_elements) <> 'array'
      OR jsonb_array_length(column_elements) NOT BETWEEN 1 AND 12
    THEN
      RETURN private.mcp_error(
        'invalid_columns',
        'columns must be an array of 1-12 column names.'
      );
    END IF;

    column_names := ARRAY[]::TEXT[];
    FOR column_index IN 0 .. jsonb_array_length(column_elements) - 1
    LOOP
      IF jsonb_typeof(column_elements -> column_index) <> 'string' THEN
        RETURN private.mcp_error(
          'invalid_columns',
          'Every column name must be a string.'
        );
      END IF;
      column_name := BTRIM(column_elements ->> column_index);
      IF char_length(column_name) NOT BETWEEN 1 AND 120 THEN
        RETURN private.mcp_error(
          'invalid_columns',
          'Every column name must contain 1-120 characters.'
        );
      END IF;
      IF column_name = ANY(column_names) THEN
        RETURN private.mcp_error(
          'invalid_columns',
          'Column names must not repeat.'
        );
      END IF;
      column_names := column_names || column_name;
    END LOOP;
  END IF;

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'name', name_value,
      'description', description_value,
      'parent_project_id', parent_id_value,
      'columns', to_jsonb(column_names)
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.create_project',
    'tasks.structure.write',
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
    INSERT INTO public.sistema_projects(nombre, descripcion, parent_id, owner_id)
    VALUES (
      name_value,
      description_value,
      parent_id_value,
      (context_data ->> 'user_id')::UUID
    )
    RETURNING id INTO project_id_value;

    PERFORM private.mcp_tasks_record_undo(
      operation_id_value,
      0,
      'delete_row',
      'sistema_projects',
      project_id_value
    );

    FOR column_index IN 1 .. array_length(column_names, 1)
    LOOP
      INSERT INTO public.sistema_columns(project_id, nombre, orden)
      VALUES (project_id_value, column_names[column_index], column_index - 1)
      RETURNING id INTO column_id_value;

      PERFORM private.mcp_tasks_record_undo(
        operation_id_value,
        undo_ordinal,
        'delete_row',
        'sistema_columns',
        column_id_value
      );
      undo_ordinal := undo_ordinal + 1;

      created_columns := created_columns || jsonb_build_array(
        jsonb_build_object(
          'column_id', column_id_value,
          'name', column_names[column_index]
        )
      );
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'project_insert_failed'
      );
      RETURN private.mcp_error(
        'project_create_failed',
        'The project could not be created.'
      );
  END;

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_projects',
    project_id_value,
    jsonb_build_object(
      'project_id', project_id_value,
      'name', name_value,
      'columns', created_columns
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.project.created',
    'mcp_tasks_create_project',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.structure.write',
    jsonb_build_object(
      'project_id', project_id_value,
      'column_count', jsonb_array_length(created_columns)
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'project_create_failed',
      'The project could not be created.'
    );
END
$mcp_tasks_create_project$;

COMMENT ON FUNCTION public.mcp_tasks_set_dependencies(JSONB) IS
  'Reemplaza los bloqueos de una tarea, rechaza ciclos y repone al anular las dependencias que quito.';
COMMENT ON FUNCTION public.mcp_tasks_create_project(JSONB) IS
  'Crea un proyecto con su tablero inicial bajo la capacidad de estructura, no la de tareas.';

NOTIFY pgrst, 'reload schema';
