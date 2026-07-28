-- El aviso de una tarea se queda dentro de la app.
--
-- La version anterior encolaba tambien un correo en
-- `sistema_notification_email_outbox`, que vaciaba una ruta de la web llamada
-- por un cron cada cinco minutos. El plan Hobby de Vercel solo admite crons
-- diarios, y un correo que puede tardar un dia no sirve para avisar nada.
--
-- Se elige el canal que ya es inmediato: el comentario y la notificacion en la
-- app se escriben en la misma transaccion que la operacion, y las dos se
-- deshacen al anularla. La cola desaparece porque nadie la iba a vaciar.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

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
  comment_id_value UUID;
  notification_id_value UUID;
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
      SELECT COALESCE(preference.in_app_enabled, true)
      INTO in_app_enabled
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
        'notified', notification_id_value IS NOT NULL
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

COMMENT ON FUNCTION public.mcp_tasks_post_update(JSONB) IS
  'Comenta en una tarea y avisa al responsable dentro de la app; no envia correo.';

-- La cola queda sin consumidor, y una cola que nadie vacia solo acumula datos
-- de personas sin que nadie los use.
DROP TABLE IF EXISTS public.sistema_notification_email_outbox;

NOTIFY pgrst, 'reload schema';
