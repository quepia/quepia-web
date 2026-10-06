-- Persist exact story copy through MCP create, batch, patch, reads and undo.
-- Existing authorization, idempotency and transaction boundaries are preserved.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- Story attributes are a bounded patch, never arbitrary task metadata.
CREATE OR REPLACE FUNCTION private.mcp_tasks_story_value(p_story JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $mcp_tasks_story_value$
DECLARE
  field TEXT;
  value JSONB;
  max_length INTEGER;
BEGIN
  IF jsonb_typeof(p_story) IS DISTINCT FROM 'object' OR p_story = '{}'::JSONB
    OR NOT private.mcp_json_has_only_keys(p_story, ARRAY['request','headline','cta','kicker','supportingText','rules','format','backgroundSource','referenceAssetIds','referenceDriveFileIds','includeLogo']) THEN
    RETURN private.mcp_error('invalid_story', 'story must contain documented story fields.');
  END IF;
  FOR field, value IN SELECT * FROM jsonb_each(p_story) LOOP
    max_length := CASE field WHEN 'request' THEN 4000 WHEN 'headline' THEN 120 WHEN 'cta' THEN 70 WHEN 'kicker' THEN 60 WHEN 'supportingText' THEN 180 WHEN 'rules' THEN 3000 END;
    IF max_length IS NOT NULL THEN
      IF jsonb_typeof(value) <> 'string' OR char_length(value #>> '{}') > max_length THEN
        RETURN private.mcp_error('invalid_story', 'Invalid story text: ' || field);
      END IF;
    ELSIF field = 'format' THEN
      IF jsonb_typeof(value) <> 'string' OR (value #>> '{}') NOT IN ('story','portrait','square') THEN
        RETURN private.mcp_error('invalid_story', 'Invalid story format.');
      END IF;
    ELSIF field = 'backgroundSource' THEN
      IF jsonb_typeof(value) <> 'string' OR (value #>> '{}') NOT IN ('bank','ai') THEN
        RETURN private.mcp_error('invalid_story', 'Invalid story backgroundSource.');
      END IF;
    ELSIF field = 'includeLogo' THEN
      IF jsonb_typeof(value) <> 'boolean' THEN
        RETURN private.mcp_error('invalid_story', 'includeLogo must be boolean.');
      END IF;
    ELSE
      IF jsonb_typeof(value) <> 'array' THEN
        RETURN private.mcp_error('invalid_story', 'Story reference IDs must be arrays.');
      END IF;
      IF jsonb_array_length(value) > 4 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(value) AS ref(id)
        WHERE jsonb_typeof(ref.id) <> 'string'
          OR (field = 'referenceAssetIds' AND private.mcp_parse_uuid(ref.id #>> '{}') IS NULL)
          OR (field = 'referenceDriveFileIds' AND (ref.id #>> '{}') !~ '^[a-zA-Z0-9_-]{10,200}$')
      ) THEN
        RETURN private.mcp_error('invalid_story', 'Invalid story reference IDs.');
      END IF;
    END IF;
  END LOOP;
  RETURN private.mcp_ok(p_story);
END
$mcp_tasks_story_value$;

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
  story_value JSONB;
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
        'social_copy',
        'story'
      ]
    )
  THEN
    RETURN private.mcp_error(
      'invalid_task',
      'Every task accepts only the documented fields.'
    );
  END IF;

  IF p_task ? 'story' THEN
    optional_result := private.mcp_tasks_story_value(p_task -> 'story');
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN RETURN optional_result; END IF;
    story_value := optional_result -> 'data';
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
      'story', story_value,
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
    type_metadata,
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
    CASE WHEN jsonb_typeof(p_normalized -> 'story') = 'object'
      THEN jsonb_build_object('story', p_normalized -> 'story') ELSE '{}'::JSONB END,
    next_position
  )
  RETURNING id INTO task_id_value;

  RETURN task_id_value;
END
$mcp_tasks_insert_task$;

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
        'social_copy',
        'story'
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
  set_story BOOLEAN := false;
  story_value JSONB;
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
        'story',
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

  IF p_request ? 'story' THEN
    optional_result := private.mcp_tasks_story_value(p_request -> 'story');
    IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN RETURN optional_result; END IF;
    story_value := optional_result -> 'data';
    set_story := true;
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
    set_title OR set_description OR set_social_copy OR set_story OR set_priority
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
          'story', CASE WHEN set_story THEN story_value END,
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
      type_metadata = CASE WHEN set_story THEN
        COALESCE(task.type_metadata, '{}'::JSONB) || jsonb_build_object('story',
          (CASE WHEN jsonb_typeof(task.type_metadata -> 'story') = 'object'
            THEN task.type_metadata -> 'story' ELSE '{}'::JSONB END)
          || story_value || jsonb_build_object('prompt', '', 'renderMode', 'ai-overlay'))
        ELSE task.type_metadata END,
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

CREATE OR REPLACE FUNCTION private.mcp_tasks_snapshot(p_task_id UUID)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_snapshot$
  SELECT jsonb_build_object(
    'titulo', task.titulo,
    'descripcion', task.descripcion,
    'priority', task.priority,
    'deadline', task.deadline,
    'labels', to_jsonb(task.labels),
    'assignee_id', task.assignee_id,
    'estimated_hours', task.estimated_hours,
    'column_id', task.column_id,
    'orden', task.orden,
    'completed', task.completed,
    'completed_at', task.completed_at,
    'social_copy', task.social_copy,
    'type_metadata', task.type_metadata,
    'updated_at', task.updated_at
  )
  FROM public.sistema_tasks AS task
  WHERE task.id = p_task_id;
$mcp_tasks_snapshot$;

CREATE OR REPLACE FUNCTION private.mcp_tasks_undo_operation(
  p_operation_id UUID,
  p_committed_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_undo_operation$
DECLARE
  undo_row private.mcp_operation_undo%ROWTYPE;
  affected_rows INTEGER := 0;
  current_updated_at TIMESTAMPTZ;
BEGIN
  FOR undo_row IN
    SELECT undo.*
    FROM private.mcp_operation_undo AS undo
    WHERE undo.operation_id = p_operation_id
    ORDER BY undo.ordinal DESC
  LOOP
    IF undo_row.undo_action = 'delete_row' THEN
      IF undo_row.entity_table = 'sistema_tasks' THEN
        -- Borrar una tarjeta que alguien siguio trabajando le perderia el
        -- trabajo, asi que la anulacion se detiene entera y lo dice.
        SELECT task.updated_at
        INTO current_updated_at
        FROM public.sistema_tasks AS task
        WHERE task.id = undo_row.entity_id
        FOR UPDATE;

        IF FOUND
          AND current_updated_at IS NOT NULL
          AND p_committed_at IS NOT NULL
          AND current_updated_at > p_committed_at
        THEN
          RETURN private.mcp_error(
            'undo_superseded',
            'The task changed after this operation, so nothing was undone.',
            jsonb_build_object('task_id', undo_row.entity_id)
          );
        END IF;

        DELETE FROM public.sistema_tasks AS task
        WHERE task.id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_subtasks' THEN
        DELETE FROM public.sistema_subtasks AS subtask
        WHERE subtask.id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_comments' THEN
        DELETE FROM public.sistema_comments AS comment
        WHERE comment.id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_notifications' THEN
        DELETE FROM public.sistema_notifications AS notification
        WHERE notification.id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_task_links' THEN
        DELETE FROM public.sistema_task_links AS link
        WHERE link.id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_task_dependencies' THEN
        DELETE FROM public.sistema_task_dependencies AS dependency
        WHERE dependency.task_id = (undo_row.snapshot ->> 'task_id')::UUID
          AND dependency.depends_on_id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_columns' THEN
        -- Borrar una columna con tarjetas se llevaria trabajo de otra persona.
        IF EXISTS (
          SELECT 1
          FROM public.sistema_tasks AS task
          WHERE task.column_id = undo_row.entity_id
        ) THEN
          RETURN private.mcp_error(
            'undo_blocked',
            'The column now holds tasks, so it was not removed.',
            jsonb_build_object('column_id', undo_row.entity_id)
          );
        END IF;
        DELETE FROM public.sistema_columns AS board_column
        WHERE board_column.id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_projects' THEN
        IF EXISTS (
          SELECT 1
          FROM public.sistema_tasks AS task
          WHERE task.project_id = undo_row.entity_id
        ) THEN
          RETURN private.mcp_error(
            'undo_blocked',
            'The project now holds tasks, so it was not removed.',
            jsonb_build_object('project_id', undo_row.entity_id)
          );
        END IF;
        DELETE FROM public.sistema_projects AS project
        WHERE project.id = undo_row.entity_id;
      ELSE
        RETURN private.mcp_error(
          'operation_not_voidable',
          'The operation points at a table this undo does not know.'
        );
      END IF;

      GET DIAGNOSTICS affected_rows = ROW_COUNT;

    ELSIF undo_row.undo_action = 'restore_row' THEN
      IF undo_row.entity_table = 'sistema_tasks' THEN
        SELECT task.updated_at
        INTO current_updated_at
        FROM public.sistema_tasks AS task
        WHERE task.id = undo_row.entity_id
        FOR UPDATE;

        IF NOT FOUND THEN
          CONTINUE;
        END IF;

        -- Si alguien edito la tarea despues del MCP, restaurar pisaria su
        -- trabajo: la anulacion se detiene y lo dice.
        IF current_updated_at IS NOT NULL
          AND p_committed_at IS NOT NULL
          AND current_updated_at > p_committed_at
        THEN
          RETURN private.mcp_error(
            'undo_superseded',
            'The task changed after this operation, so nothing was restored.',
            jsonb_build_object('task_id', undo_row.entity_id)
          );
        END IF;

        UPDATE public.sistema_tasks AS task
        SET
          titulo = undo_row.snapshot ->> 'titulo',
          descripcion = undo_row.snapshot ->> 'descripcion',
          priority = undo_row.snapshot ->> 'priority',
          deadline = (undo_row.snapshot ->> 'deadline')::TIMESTAMPTZ,
          labels = ARRAY(
            SELECT jsonb_array_elements_text(
              COALESCE(undo_row.snapshot -> 'labels', '[]'::JSONB)
            )
          ),
          assignee_id = (undo_row.snapshot ->> 'assignee_id')::UUID,
          estimated_hours = (undo_row.snapshot ->> 'estimated_hours')::NUMERIC,
          column_id = (undo_row.snapshot ->> 'column_id')::UUID,
          orden = (undo_row.snapshot ->> 'orden')::INTEGER,
          completed = (undo_row.snapshot ->> 'completed')::BOOLEAN,
          completed_at = (undo_row.snapshot ->> 'completed_at')::TIMESTAMPTZ,
          social_copy = undo_row.snapshot ->> 'social_copy',
          type_metadata = CASE WHEN undo_row.snapshot ? 'type_metadata'
            THEN undo_row.snapshot -> 'type_metadata' ELSE task.type_metadata END
        -- `updated_at` queda con la marca de la anulacion: el trigger de la
        -- tabla la fija y devolverla al valor previo escondería el cambio.
        WHERE task.id = undo_row.entity_id;
      ELSIF undo_row.entity_table = 'sistema_subtasks' THEN
        UPDATE public.sistema_subtasks AS subtask
        SET
          titulo = undo_row.snapshot ->> 'titulo',
          completed = (undo_row.snapshot ->> 'completed')::BOOLEAN,
          assignee_id = (undo_row.snapshot ->> 'assignee_id')::UUID,
          orden = (undo_row.snapshot ->> 'orden')::INTEGER
        WHERE subtask.id = undo_row.entity_id;
      ELSE
        RETURN private.mcp_error(
          'operation_not_voidable',
          'The operation points at a table this undo does not know.'
        );
      END IF;

      GET DIAGNOSTICS affected_rows = ROW_COUNT;

    ELSE
      IF undo_row.entity_table = 'sistema_task_dependencies' THEN
        INSERT INTO public.sistema_task_dependencies(task_id, depends_on_id)
        VALUES (
          (undo_row.snapshot ->> 'task_id')::UUID,
          (undo_row.snapshot ->> 'depends_on_id')::UUID
        )
        ON CONFLICT DO NOTHING;
      ELSE
        RETURN private.mcp_error(
          'operation_not_voidable',
          'The operation points at a table this undo does not know.'
        );
      END IF;

      GET DIAGNOSTICS affected_rows = ROW_COUNT;
    END IF;
  END LOOP;

  RETURN private.mcp_ok(jsonb_build_object('undone', true));
END
$mcp_tasks_undo_operation$;

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
    'story', task_row.type_metadata -> 'story',
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
    'story', task.type_metadata -> 'story',
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

REVOKE ALL ON FUNCTION private.mcp_tasks_story_value(JSONB) FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
