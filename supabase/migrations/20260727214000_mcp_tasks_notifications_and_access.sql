-- Avisos, revision, anulacion y acceso del modulo de tareas.
--
-- Avisar es una operacion propia y no un efecto colateral de otra escritura:
-- el plan maestro prohibe mezclar el envio de un mensaje dentro de otra
-- operacion, asi que `mcp_tasks_post_update` deja el comentario, crea la
-- notificacion en la app y encola el email, y nada mas.
--
-- Postgres no puede mandar mail: la cola `sistema_notification_email_outbox`
-- la vacia la web, que ya tiene Resend y las plantillas.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Cola de emails de aviso
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sistema_notification_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID
    REFERENCES public.sistema_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES public.sistema_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  content TEXT CHECK (content IS NULL OR char_length(content) <= 4000),
  link TEXT CHECK (link IS NULL OR char_length(link) <= 2048),
  source TEXT NOT NULL DEFAULT 'mcp'
    CHECK (source IN ('mcp', 'web')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS sistema_notification_email_outbox_pending_idx
  ON public.sistema_notification_email_outbox(created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS sistema_notification_email_outbox_user_idx
  ON public.sistema_notification_email_outbox(user_id);

ALTER TABLE public.sistema_notification_email_outbox
  ENABLE ROW LEVEL SECURITY;

-- Solo la ruta de despacho, que usa la clave de servicio, lee esta cola.
REVOKE ALL ON TABLE public.sistema_notification_email_outbox
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.sistema_notification_email_outbox IS
  'Emails de aviso pendientes; los envia la web porque Postgres no habla SMTP.';

-- ---------------------------------------------------------------------------
-- 2. Aviso sobre una tarea
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_tasks_post_update(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_post_update$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  text_result JSONB;
  idempotency_uuid UUID;
  task_id_value UUID;
  task_row public.sistema_tasks%ROWTYPE;
  actor_user_id UUID;
  actor_name TEXT;
  message_value TEXT;
  notify_requested BOOLEAN := true;
  recipient_id UUID;
  in_app_enabled BOOLEAN;
  email_enabled BOOLEAN;
  comment_id_value UUID;
  notification_id_value UUID;
  outbox_id_value UUID;
  notification_title TEXT;
  notification_link TEXT;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.notify',
    'mcp_tasks_post_update',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';
  actor_user_id := (context_data ->> 'user_id')::UUID;

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY[
        'idempotency_key',
        'task_id',
        'task_query',
        'message',
        'notify',
        'recipient_id',
        'recipient_query'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'message'
      AND (p_request ? 'task_id' OR p_request ? 'task_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, message and one task selector are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  text_result := private.mcp_tasks_text_value(p_request, 'message', 1, 2000);
  IF NOT COALESCE((text_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN text_result;
  END IF;
  message_value := text_result -> 'data' ->> 'value';

  IF (p_request ? 'notify') AND jsonb_typeof(p_request -> 'notify') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'notify') <> 'boolean' THEN
      RETURN private.mcp_error('invalid_notify', 'notify must be a boolean.');
    END IF;
    notify_requested := (p_request ->> 'notify')::BOOLEAN;
  END IF;

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

  reference_result := private.mcp_tasks_resolve_reference(
    'member', p_request, 'recipient_id', 'recipient_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  recipient_id := COALESCE(
    (reference_result -> 'data' ->> 'id')::UUID,
    task_row.assignee_id
  );

  -- Avisarse a uno mismo es ruido: el comentario queda igual.
  IF recipient_id = actor_user_id THEN
    recipient_id := NULL;
  END IF;

  SELECT member.nombre
  INTO actor_name
  FROM public.sistema_users AS member
  WHERE member.id = actor_user_id;

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'task_id', task_id_value,
      'project_id', task_row.project_id,
      'message', message_value,
      'notify', notify_requested,
      'recipient_id', recipient_id
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'tasks.post_update',
    'tasks.notify',
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
    -- El autor queda marcado para que en la tarea se lea quien escribio.
    INSERT INTO public.sistema_comments(
      task_id,
      user_id,
      contenido,
      author_name,
      source
    )
    VALUES (
      task_id_value,
      actor_user_id,
      message_value,
      COALESCE(actor_name, 'Asistente') || ' (asistente)',
      'task_comment'
    )
    RETURNING id INTO comment_id_value;

    PERFORM private.mcp_tasks_record_undo(
      operation_id_value,
      0,
      'delete_row',
      'sistema_comments',
      comment_id_value
    );

    IF notify_requested AND recipient_id IS NOT NULL THEN
      SELECT
        COALESCE(preference.in_app_enabled, true),
        COALESCE(preference.email_enabled, true)
          AND COALESCE(preference.frequency, 'immediate') = 'immediate'
      INTO in_app_enabled, email_enabled
      FROM public.sistema_users AS member
      LEFT JOIN public.sistema_notification_preferences AS preference
        ON preference.user_id = member.id
      WHERE member.id = recipient_id;

      notification_title := 'Novedad en ' || task_row.titulo;
      -- Misma forma de enlace que usa la app: el tablero abre la tarjeta.
      notification_link := '/sistema?taskId=' || task_id_value::TEXT;

      IF COALESCE(in_app_enabled, true) THEN
        INSERT INTO public.sistema_notifications(
          user_id,
          actor_id,
          type,
          title,
          content,
          link,
          data
        )
        VALUES (
          recipient_id,
          actor_user_id,
          'comment',
          notification_title,
          message_value,
          notification_link,
          jsonb_build_object(
            'source', 'mcp',
            'task_id', task_id_value,
            'operation_id', operation_id_value
          )
        )
        RETURNING id INTO notification_id_value;

        PERFORM private.mcp_tasks_record_undo(
          operation_id_value,
          1,
          'delete_row',
          'sistema_notifications',
          notification_id_value
        );
      END IF;

      IF COALESCE(email_enabled, true) THEN
        INSERT INTO public.sistema_notification_email_outbox(
          notification_id,
          user_id,
          title,
          content,
          link,
          source
        )
        VALUES (
          notification_id_value,
          recipient_id,
          notification_title,
          message_value,
          notification_link,
          'mcp'
        )
        RETURNING id INTO outbox_id_value;
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'task_update_post_failed'
      );
      RETURN private.mcp_error(
        'task_update_post_failed',
        'The update could not be posted.'
      );
  END;

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'sistema_comments',
    comment_id_value,
    jsonb_strip_nulls(
      jsonb_build_object(
        'comment_id', comment_id_value,
        'task_id', task_id_value,
        'notification_id', notification_id_value,
        'email_queued', outbox_id_value IS NOT NULL,
        'recipient_id', recipient_id
      )
    )
  );

  PERFORM private.mcp_audit_event(
    'tasks.update.posted',
    'mcp_tasks_post_update',
    'success',
    actor_user_id,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'tasks.notify',
    jsonb_strip_nulls(
      jsonb_build_object(
        'task_id', task_id_value,
        'recipient_id', recipient_id,
        'notified', notification_id_value IS NOT NULL,
        'email_queued', outbox_id_value IS NOT NULL
      )
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_id_value)
    || jsonb_build_object('idempotent_replay', false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'task_update_post_failed',
      'The update could not be posted.'
    );
END
$mcp_tasks_post_update$;

-- ---------------------------------------------------------------------------
-- 3. Anulacion de una operacion de tareas
-- ---------------------------------------------------------------------------

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
          social_copy = undo_row.snapshot ->> 'social_copy'
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

-- La web y el MCP entran por la misma puerta de anulacion, asi que aca se
-- decide a que undo corresponde cada operacion.
CREATE OR REPLACE FUNCTION private.mcp_void_direct_operation(
  p_user_id UUID,
  p_operation_id UUID,
  p_reason TEXT,
  p_client_id UUID,
  p_session_id UUID,
  p_source TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_void_direct_operation$
DECLARE
  operation_row private.mcp_operations%ROWTYPE;
  deleted_count INTEGER := 0;
  undo_result JSONB;
BEGIN
  SELECT operation.*
  INTO operation_row
  FROM private.mcp_operations AS operation
  WHERE operation.id = p_operation_id
    AND operation.user_id = p_user_id
    AND operation.approval_mode = 'direct'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.mcp_error(
      'operation_not_found',
      'No direct operation matches that identifier.'
    );
  END IF;

  IF operation_row.status = 'voided' THEN
    RETURN private.mcp_ok(
      private.mcp_direct_operation_view(operation_row.id)
      || jsonb_build_object('idempotent_replay', true)
    );
  END IF;

  IF operation_row.status <> 'committed' OR operation_row.entity_id IS NULL THEN
    RETURN private.mcp_error(
      'operation_not_voidable',
      'Only a recorded operation can be voided.',
      jsonb_build_object('status', operation_row.status)
    );
  END IF;

  BEGIN
    IF operation_row.operation_type LIKE 'tasks.%' THEN
      undo_result := private.mcp_tasks_undo_operation(
        operation_row.id,
        operation_row.committed_at
      );
      IF NOT COALESCE((undo_result ->> 'ok')::BOOLEAN, false) THEN
        RETURN undo_result;
      END IF;
    ELSIF operation_row.entity_table = 'accounting_expenses' THEN
      DELETE FROM public.accounting_expenses AS expense
      WHERE expense.id = operation_row.entity_id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
    ELSIF operation_row.entity_table = 'accounting_client_payments' THEN
      DELETE FROM public.accounting_client_payments AS payment
      WHERE payment.id = operation_row.entity_id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
    ELSIF operation_row.entity_table = 'accounting_transfers' THEN
      DELETE FROM public.accounting_transfers AS transfer
      WHERE transfer.id = operation_row.entity_id;
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
    ELSE
      RETURN private.mcp_error(
        'operation_not_voidable',
        'The operation does not point at a known table.'
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_audit_event(
        operation_row.operation_type || '.void_failed',
        'mcp_void_direct_operation',
        'failed',
        p_user_id,
        p_client_id,
        p_session_id,
        operation_row.id,
        operation_row.capability,
        jsonb_build_object('sqlstate', SQLSTATE, 'source', p_source)
      );
      RETURN private.mcp_error(
        'void_failed',
        'The recorded rows could not be undone.'
      );
  END;

  UPDATE private.mcp_operations
  SET
    status = 'voided',
    voided_at = clock_timestamp(),
    voided_by = p_user_id,
    void_reason = p_reason
  WHERE id = operation_row.id;

  PERFORM private.mcp_audit_event(
    operation_row.operation_type || '.voided',
    'mcp_void_direct_operation',
    'success',
    p_user_id,
    p_client_id,
    p_session_id,
    operation_row.id,
    operation_row.capability,
    jsonb_build_object(
      'entity_table', operation_row.entity_table,
      'entity_id', operation_row.entity_id,
      'rows_removed', deleted_count,
      'source', p_source
    )
  );

  RETURN private.mcp_ok(
    private.mcp_direct_operation_view(operation_row.id)
    || jsonb_build_object('idempotent_replay', false)
  );
END
$mcp_void_direct_operation$;

CREATE OR REPLACE FUNCTION public.mcp_tasks_void_operation(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_void_operation$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  operation_id_value UUID;
  capability_value TEXT;
  reason_result JSONB;
  reason_value TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['operation_id', 'reason']
    )
    OR NOT (p_request ? 'operation_id')
    OR jsonb_typeof(p_request -> 'operation_id') <> 'string'
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'operation_id is required and only reason may accompany it.'
    );
  END IF;

  operation_id_value := private.mcp_parse_uuid(p_request ->> 'operation_id');
  IF operation_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_operation_id',
      'operation_id must be a UUID.'
    );
  END IF;

  reason_result := private.mcp_optional_text(p_request, 'reason', 500);
  IF NOT COALESCE((reason_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reason_result;
  END IF;
  reason_value := reason_result -> 'data' ->> 'value';

  -- Deshacer exige la misma capacidad que haber escrito.
  SELECT operation.capability
  INTO capability_value
  FROM private.mcp_operations AS operation
  WHERE operation.id = operation_id_value
    AND operation.approval_mode = 'direct'
    AND operation.operation_type LIKE 'tasks.%';

  IF capability_value IS NULL THEN
    RETURN private.mcp_error(
      'operation_not_found',
      'No task operation matches that identifier.'
    );
  END IF;

  authorization_result := private.mcp_authorize(
    capability_value,
    'mcp_tasks_void_operation',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  RETURN private.mcp_void_direct_operation(
    (context_data ->> 'user_id')::UUID,
    operation_id_value,
    reason_value,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    'mcp'
  );
END
$mcp_tasks_void_operation$;

-- ---------------------------------------------------------------------------
-- 4. Actividad reciente por modulo
-- ---------------------------------------------------------------------------

-- La lista contable deja de mezclar modulos: quien solo tiene `accounting.read`
-- no deberia enterarse de lo que pasa en el tablero.
CREATE OR REPLACE FUNCTION private.mcp_recent_direct_operations(
  p_user_id UUID,
  p_hours INTEGER,
  p_limit INTEGER,
  p_include_voided BOOLEAN
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_recent_direct_operations$
  SELECT COALESCE(jsonb_agg(entry.view ORDER BY entry.recorded_at DESC), '[]'::JSONB)
  FROM (
    SELECT
      operation.committed_at AS recorded_at,
      private.mcp_direct_operation_view(operation.id)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'module', 'accounting',
          'account_name', account.name,
          'project_name', project.nombre
        )
      ) AS view
    FROM private.mcp_operations AS operation
    LEFT JOIN public.accounting_accounts AS account
      ON account.id = private.mcp_parse_uuid(
        COALESCE(
          operation.normalized_payload ->> 'account_id',
          operation.normalized_payload ->> 'from_account_id'
        )
      )
    LEFT JOIN public.sistema_projects AS project
      ON project.id = private.mcp_parse_uuid(
        operation.normalized_payload ->> 'project_id'
      )
    WHERE operation.user_id = p_user_id
      AND operation.approval_mode = 'direct'
      AND operation.operation_type LIKE 'accounting.%'
      AND operation.status IN ('committed', 'voided')
      AND (p_include_voided OR operation.status = 'committed')
      AND operation.committed_at >= now() - make_interval(hours => p_hours)
    ORDER BY operation.committed_at DESC
    LIMIT p_limit
  ) AS entry;
$mcp_recent_direct_operations$;

CREATE OR REPLACE FUNCTION private.mcp_tasks_recent_operations(
  p_user_id UUID,
  p_hours INTEGER,
  p_limit INTEGER,
  p_include_voided BOOLEAN
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_recent_operations$
  SELECT COALESCE(jsonb_agg(entry.view ORDER BY entry.recorded_at DESC), '[]'::JSONB)
  FROM (
    SELECT
      operation.committed_at AS recorded_at,
      private.mcp_direct_operation_view(operation.id)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'module', 'tasks',
          'project_name', project.nombre,
          'task_title', task.titulo,
          'row_count', (
            SELECT COUNT(*)
            FROM private.mcp_operation_undo AS undo
            WHERE undo.operation_id = operation.id
          )
        )
      ) AS view
    FROM private.mcp_operations AS operation
    LEFT JOIN public.sistema_projects AS project
      ON project.id = private.mcp_parse_uuid(
        operation.normalized_payload ->> 'project_id'
      )
    LEFT JOIN public.sistema_tasks AS task
      ON task.id = private.mcp_parse_uuid(
        operation.normalized_payload ->> 'task_id'
      )
    WHERE operation.user_id = p_user_id
      AND operation.approval_mode = 'direct'
      AND operation.operation_type LIKE 'tasks.%'
      AND operation.status IN ('committed', 'voided')
      AND (p_include_voided OR operation.status = 'committed')
      AND operation.committed_at >= now() - make_interval(hours => p_hours)
    ORDER BY operation.committed_at DESC
    LIMIT p_limit
  ) AS entry;
$mcp_tasks_recent_operations$;

CREATE OR REPLACE FUNCTION public.mcp_tasks_list_recent_operations(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_list_recent_operations$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  window_result JSONB;
  window_data JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'tasks.read',
    'mcp_tasks_list_recent_operations',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  window_result := private.mcp_recent_window(p_request);
  IF NOT COALESCE((window_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN window_result;
  END IF;
  window_data := window_result -> 'data';

  RETURN private.mcp_ok(
    jsonb_build_object(
      'window_hours', (window_data ->> 'hours')::INTEGER,
      'operations', private.mcp_tasks_recent_operations(
        (context_data ->> 'user_id')::UUID,
        (window_data ->> 'hours')::INTEGER,
        (window_data ->> 'limit')::INTEGER,
        (window_data ->> 'include_voided')::BOOLEAN
      )
    )
  );
END
$mcp_tasks_list_recent_operations$;

-- La pantalla de actividad de la web revisa los dos modulos en una sola lista.
CREATE OR REPLACE FUNCTION public.mcp_web_list_recent_operations(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_web_list_recent_operations$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  window_result JSONB;
  window_data JSONB;
  accounting_operations JSONB;
  task_operations JSONB;
BEGIN
  authorization_result := private.mcp_authorize_web(
    'mcp_web_list_recent_operations',
    false
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  window_result := private.mcp_recent_window(p_request);
  IF NOT COALESCE((window_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN window_result;
  END IF;
  window_data := window_result -> 'data';

  accounting_operations := private.mcp_recent_direct_operations(
    (context_data ->> 'user_id')::UUID,
    (window_data ->> 'hours')::INTEGER,
    (window_data ->> 'limit')::INTEGER,
    (window_data ->> 'include_voided')::BOOLEAN
  );
  task_operations := private.mcp_tasks_recent_operations(
    (context_data ->> 'user_id')::UUID,
    (window_data ->> 'hours')::INTEGER,
    (window_data ->> 'limit')::INTEGER,
    (window_data ->> 'include_voided')::BOOLEAN
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'window_hours', (window_data ->> 'hours')::INTEGER,
      'operations', (
        SELECT COALESCE(
          jsonb_agg(
            entry.value
            ORDER BY entry.value ->> 'recorded_at' DESC NULLS LAST
          ),
          '[]'::JSONB
        )
        FROM jsonb_array_elements(
          accounting_operations || task_operations
        ) AS entry(value)
      )
    )
  );
END
$mcp_web_list_recent_operations$;

-- ---------------------------------------------------------------------------
-- 5. Allowlist y permisos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_postgrest_pre_request()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_postgrest_pre_request$
DECLARE
  raw_client_id TEXT := NULLIF(auth.jwt() ->> 'client_id', '');
  client_id_value UUID;
  jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
  request_path TEXT;
  request_method TEXT;
BEGIN
  IF raw_client_id IS NULL THEN
    IF jwt_role = 'mcp_authenticated' THEN
      RAISE EXCEPTION
        'The isolated MCP role requires a valid OAuth client_id'
        USING ERRCODE = '42501';
    END IF;

    RETURN;
  END IF;

  client_id_value := private.mcp_parse_uuid(raw_client_id);
  IF client_id_value IS NULL
    OR jwt_role <> 'mcp_authenticated'
  THEN
    RAISE EXCEPTION
      'OAuth requests require the isolated MCP database role'
      USING ERRCODE = '42501';
  END IF;

  request_path := NULLIF(
    pg_catalog.current_setting('request.path', true),
    ''
  );
  request_method := NULLIF(
    UPPER(pg_catalog.current_setting('request.method', true)),
    ''
  );

  IF request_path IS NULL OR request_method IS NULL THEN
    RAISE EXCEPTION
      'PostgREST request metadata is required for OAuth requests'
      USING ERRCODE = '42501';
  END IF;

  request_path := pg_catalog.ltrim(request_path, '/');

  IF request_method <> 'POST'
    OR request_path <> ALL (
      ARRAY[
        'rpc/mcp_get_context',
        'rpc/mcp_accounting_list_accounts',
        'rpc/mcp_accounting_list_expenses',
        'rpc/mcp_accounting_list_recent_operations',
        'rpc/mcp_accounting_record_expense',
        'rpc/mcp_accounting_record_income',
        'rpc/mcp_accounting_record_transfer',
        'rpc/mcp_accounting_void_operation',
        'rpc/mcp_tasks_list_projects',
        'rpc/mcp_tasks_list_columns',
        'rpc/mcp_tasks_list_members',
        'rpc/mcp_tasks_search_tasks',
        'rpc/mcp_tasks_get_task',
        'rpc/mcp_tasks_create_task',
        'rpc/mcp_tasks_create_tasks_batch',
        'rpc/mcp_tasks_update_task',
        'rpc/mcp_tasks_add_subtasks',
        'rpc/mcp_tasks_update_subtask',
        'rpc/mcp_tasks_set_dependencies',
        'rpc/mcp_tasks_add_links',
        'rpc/mcp_tasks_create_column',
        'rpc/mcp_tasks_create_project',
        'rpc/mcp_tasks_post_update',
        'rpc/mcp_tasks_list_recent_operations',
        'rpc/mcp_tasks_void_operation'
      ]::TEXT[]
    )
  THEN
    RAISE EXCEPTION
      'OAuth Data API access is limited to the MCP machine RPC allowlist'
      USING ERRCODE = '42501';
  END IF;
END
$mcp_postgrest_pre_request$;

REVOKE EXECUTE ON FUNCTION public.mcp_postgrest_pre_request()
  FROM PUBLIC, mcp_authenticated, anon, authenticated, service_role,
    supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.mcp_postgrest_pre_request()
  TO mcp_authenticated, anon, authenticated, service_role;

COMMENT ON FUNCTION public.mcp_postgrest_pre_request() IS
  'Limita el acceso OAuth al Data API a las RPC de contabilidad y tareas del MCP.';

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;

DO $tasks_grants$
DECLARE
  function_name TEXT;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'mcp_tasks_list_projects',
    'mcp_tasks_list_columns',
    'mcp_tasks_list_members',
    'mcp_tasks_search_tasks',
    'mcp_tasks_get_task',
    'mcp_tasks_create_task',
    'mcp_tasks_create_tasks_batch',
    'mcp_tasks_update_task',
    'mcp_tasks_add_subtasks',
    'mcp_tasks_update_subtask',
    'mcp_tasks_set_dependencies',
    'mcp_tasks_add_links',
    'mcp_tasks_create_column',
    'mcp_tasks_create_project',
    'mcp_tasks_post_update',
    'mcp_tasks_list_recent_operations',
    'mcp_tasks_void_operation'
  ]
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(JSONB) FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated',
      function_name
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(JSONB) TO mcp_authenticated',
      function_name
    );
  END LOOP;
END
$tasks_grants$;

NOTIFY pgrst, 'reload schema';
