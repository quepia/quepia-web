-- Control de tareas por MCP: plano de control.
--
-- El modulo contable ya escribe directo y se controla despues. Las tareas
-- siguen exactamente ese modelo, con dos diferencias que este archivo resuelve:
--
--   1. Una operacion de tareas puede tocar varias filas (un lote de tareas, las
--      subtareas de una tarea, los links de una tarea), asi que `entity_table` /
--      `entity_id` no alcanzan para anular. Se agrega `private.mcp_operation_undo`,
--      que guarda que fila borrar o que fila restaurar y en que orden.
--   2. Actualizar una tarea no crea nada: anularla es devolver los campos a como
--      estaban. Por eso el undo guarda tambien el estado previo y se niega a
--      restaurar si una persona toco la fila despues.
--
-- Como en contabilidad, el MCP solo deshace lo que el MCP hizo.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Capacidades del modulo de tareas
-- ---------------------------------------------------------------------------

INSERT INTO private.mcp_capabilities(capability, description)
VALUES
  (
    'tasks.read',
    'Leer proyectos, columnas, miembros y tareas del sistema de gestion.'
  ),
  (
    'tasks.write',
    'Crear, actualizar, mover y completar tareas, subtareas, dependencias y links.'
  ),
  (
    'tasks.structure.write',
    'Crear proyectos y columnas del tablero.'
  ),
  (
    'tasks.notify',
    'Comentar en una tarea y avisar al responsable.'
  )
ON CONFLICT (capability) DO NOTHING;

UPDATE private.mcp_capabilities
SET granted_by_default = true
WHERE capability IN (
  'tasks.read',
  'tasks.write',
  'tasks.structure.write',
  'tasks.notify'
);

-- Los clientes y grants ya autorizados reciben el modulo nuevo sin reconectar,
-- igual que cuando se agregaron ingresos y transferencias.
INSERT INTO private.mcp_client_capabilities(client_id, capability)
SELECT policy.client_id, capability.capability
FROM private.mcp_client_policies AS policy
CROSS JOIN private.mcp_capabilities AS capability
WHERE capability.granted_by_default
ON CONFLICT (client_id, capability) DO NOTHING;

INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability)
SELECT grant_record.id, capability.capability
FROM private.mcp_access_grants AS grant_record
CROSS JOIN private.mcp_capabilities AS capability
WHERE grant_record.revoked_at IS NULL
  AND capability.granted_by_default
ON CONFLICT (grant_id, capability) DO NOTHING;

-- El lote es la unica excepcion a "una mutacion, un id" del plan maestro. Vive
-- en la configuracion para poder bajarlo sin desplegar codigo.
INSERT INTO private.mcp_config(key, value, description)
VALUES
  (
    'tasks_batch_max',
    '50'::JSONB,
    'Tareas maximas por lote; el lote se escribe entero o no se escribe.'
  ),
  (
    'tasks_subtask_batch_max',
    '50'::JSONB,
    'Subtareas maximas por llamada.'
  ),
  (
    'tasks_link_batch_max',
    '20'::JSONB,
    'Links maximos por llamada.'
  ),
  (
    'tasks_dependency_max',
    '20'::JSONB,
    'Dependencias maximas por tarea.'
  )
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Operaciones: tipos, entidades y rastro para anular
-- ---------------------------------------------------------------------------

DO $drop_task_operation_checks$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'private'
      AND rel.relname = 'mcp_operations'
      AND con.contype = 'c'
      AND con.conname IN (
        'mcp_operations_operation_type_allowed',
        'mcp_operations_entity_table_allowed'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE private.mcp_operations DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END
$drop_task_operation_checks$;

ALTER TABLE private.mcp_operations
  ADD CONSTRAINT mcp_operations_operation_type_allowed
    CHECK (
      operation_type IN (
        'accounting.create_expense',
        'accounting.create_income',
        'accounting.create_transfer',
        'tasks.create_task',
        'tasks.create_tasks_batch',
        'tasks.update_task',
        'tasks.create_subtasks',
        'tasks.update_subtask',
        'tasks.set_dependencies',
        'tasks.add_links',
        'tasks.post_update',
        'tasks.create_column',
        'tasks.create_project'
      )
    ),
  ADD CONSTRAINT mcp_operations_entity_table_allowed
    CHECK (
      entity_table IS NULL
      OR entity_table IN (
        'accounting_expenses',
        'accounting_client_payments',
        'accounting_transfers',
        'sistema_tasks',
        'sistema_subtasks',
        'sistema_comments',
        'sistema_task_links',
        'sistema_task_dependencies',
        'sistema_columns',
        'sistema_projects'
      )
    );

-- Rastro para anular: `delete_row` borra lo que la operacion creo,
-- `restore_row` devuelve una fila a su estado previo y `insert_row` repone una
-- fila que la operacion borro. El orden inverso del ordinal deshace primero lo
-- ultimo que se escribio.
CREATE TABLE IF NOT EXISTS private.mcp_operation_undo (
  operation_id UUID NOT NULL
    REFERENCES private.mcp_operations(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  undo_action TEXT NOT NULL
    CHECK (undo_action IN ('delete_row', 'restore_row', 'insert_row')),
  entity_table TEXT NOT NULL
    CHECK (
      entity_table IN (
        'sistema_tasks',
        'sistema_subtasks',
        'sistema_comments',
        'sistema_task_links',
        'sistema_task_dependencies',
        'sistema_columns',
        'sistema_projects',
        'sistema_notifications'
      )
    ),
  entity_id UUID NOT NULL,
  snapshot JSONB
    CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (operation_id, ordinal),
  CHECK (undo_action = 'delete_row' OR snapshot IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mcp_operation_undo_entity_idx
  ON private.mcp_operation_undo(entity_table, entity_id);

ALTER TABLE private.mcp_operation_undo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.mcp_operation_undo
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.mcp_operation_undo IS
  'Que borrar o que restaurar para anular una operacion MCP de tareas; el MCP solo deshace lo que el MCP hizo.';

-- La actividad reciente distingue el modulo sin tener que leer cada payload.
CREATE INDEX IF NOT EXISTS mcp_operations_tasks_activity_idx
  ON private.mcp_operations(user_id, committed_at DESC)
  WHERE approval_mode = 'direct' AND operation_type LIKE 'tasks.%';

-- ---------------------------------------------------------------------------
-- 3. Las tablas del sistema quedan fuera del alcance directo de un token OAuth
-- ---------------------------------------------------------------------------
--
-- El allowlist de `mcp_postgrest_pre_request` ya rechaza cualquier ruta que no
-- sea una RPC del MCP, asi que esto es defensa en profundidad: si alguna vez un
-- token OAuth llegara al Data API con el rol `authenticated`, seguiria sin poder
-- tocar las tablas. Las sesiones de primera parte no llevan `client_id`, asi que
-- la web no cambia.

DO $sistema_oauth_fence$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sistema_projects',
    'sistema_columns',
    'sistema_tasks',
    'sistema_subtasks',
    'sistema_task_links',
    'sistema_task_dependencies',
    'sistema_comments',
    'sistema_notifications',
    'sistema_project_members',
    'sistema_labels',
    'sistema_users'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_select ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated, mcp_authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_insert ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated, mcp_authenticated WITH CHECK (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_update ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated, mcp_authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL) WITH CHECK (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_delete ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated, mcp_authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );
  END LOOP;
END
$sistema_oauth_fence$;

-- ---------------------------------------------------------------------------
-- 4. Helpers de validacion propios del modulo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.mcp_tasks_text_value(
  p_request JSONB,
  p_key TEXT,
  p_min_length INTEGER,
  p_max_length INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_tasks_text_value$
DECLARE
  text_value TEXT;
BEGIN
  IF NOT (p_request ? p_key) OR jsonb_typeof(p_request -> p_key) = 'null' THEN
    RETURN private.mcp_error(
      'invalid_' || p_key,
      p_key || ' is required.'
    );
  END IF;

  IF jsonb_typeof(p_request -> p_key) <> 'string' THEN
    RETURN private.mcp_error(
      'invalid_' || p_key,
      p_key || ' must be a string.'
    );
  END IF;

  text_value := BTRIM(p_request ->> p_key);
  IF char_length(text_value) NOT BETWEEN p_min_length AND p_max_length THEN
    RETURN private.mcp_error(
      'invalid_' || p_key,
      p_key || ' must contain ' || p_min_length || '-' || p_max_length
        || ' characters.'
    );
  END IF;

  RETURN private.mcp_ok(jsonb_build_object('value', text_value));
END
$mcp_tasks_text_value$;

CREATE OR REPLACE FUNCTION private.mcp_tasks_priority_value(p_value JSONB)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $mcp_tasks_priority_value$
  SELECT CASE
    WHEN p_value IS NULL
      OR jsonb_typeof(p_value) <> 'string'
      OR UPPER(p_value #>> '{}') NOT IN ('P1', 'P2', 'P3', 'P4')
    THEN NULL
    ELSE UPPER(p_value #>> '{}')
  END;
$mcp_tasks_priority_value$;

-- Un deadline llega como fecha o como instante ISO. La fecha sola se ancla al
-- mediodia, que es la convencion que ya usa el trigger de la tabla.
CREATE OR REPLACE FUNCTION private.mcp_tasks_deadline_value(p_value JSONB)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_tasks_deadline_value$
DECLARE
  raw_value TEXT;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'string' THEN
    RETURN NULL;
  END IF;

  raw_value := BTRIM(p_value #>> '{}');

  IF raw_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN (raw_value::DATE + TIME '12:00')::TIMESTAMPTZ;
  END IF;

  IF raw_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  THEN
    RETURN raw_value::TIMESTAMPTZ;
  END IF;

  RETURN NULL;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN NULL;
END
$mcp_tasks_deadline_value$;

-- Las etiquetas son texto libre en la tabla, asi que se acotan aca: hasta diez,
-- sin vacios ni duplicados, para que un payload no confiable no infle la fila.
CREATE OR REPLACE FUNCTION private.mcp_tasks_labels_value(p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_tasks_labels_value$
DECLARE
  label_element JSONB;
  label_text TEXT;
  labels TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF jsonb_typeof(p_value) <> 'array' THEN
    RETURN private.mcp_error('invalid_labels', 'labels must be an array.');
  END IF;

  IF jsonb_array_length(p_value) > 10 THEN
    RETURN private.mcp_error('invalid_labels', 'labels accepts up to 10 entries.');
  END IF;

  FOR label_element IN SELECT jsonb_array_elements(p_value)
  LOOP
    IF jsonb_typeof(label_element) <> 'string' THEN
      RETURN private.mcp_error('invalid_labels', 'Every label must be a string.');
    END IF;

    label_text := BTRIM(label_element #>> '{}');
    IF char_length(label_text) NOT BETWEEN 1 AND 60 THEN
      RETURN private.mcp_error(
        'invalid_labels',
        'Every label must contain 1-60 characters.'
      );
    END IF;

    IF NOT (label_text = ANY(labels)) THEN
      labels := labels || label_text;
    END IF;
  END LOOP;

  RETURN private.mcp_ok(
    jsonb_build_object('value', to_jsonb(labels))
  );
END
$mcp_tasks_labels_value$;

CREATE OR REPLACE FUNCTION private.mcp_tasks_hours_value(p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_tasks_hours_value$
DECLARE
  hours_value NUMERIC;
BEGIN
  IF jsonb_typeof(p_value) <> 'number' THEN
    RETURN private.mcp_error(
      'invalid_estimated_hours',
      'estimated_hours must be a number.'
    );
  END IF;

  hours_value := (p_value #>> '{}')::NUMERIC;
  IF hours_value < 0 OR hours_value > 9999.9 THEN
    RETURN private.mcp_error(
      'invalid_estimated_hours',
      'estimated_hours must be between 0 and 9999.9.'
    );
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object('value', round(hours_value, 1))
  );
END
$mcp_tasks_hours_value$;

-- Un link se acepta solo si es http(s) y no trae credenciales embebidas.
CREATE OR REPLACE FUNCTION private.mcp_tasks_url_value(p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_tasks_url_value$
DECLARE
  url_value TEXT;
BEGIN
  IF jsonb_typeof(p_value) <> 'string' THEN
    RETURN private.mcp_error('invalid_url', 'url must be a string.');
  END IF;

  url_value := BTRIM(p_value #>> '{}');
  IF char_length(url_value) NOT BETWEEN 8 AND 2048 THEN
    RETURN private.mcp_error(
      'invalid_url',
      'url must contain 8-2048 characters.'
    );
  END IF;

  IF url_value !~ '^https?://[^\s/@]+(/[^\s]*)?$' THEN
    RETURN private.mcp_error(
      'invalid_url',
      'url must be an http(s) address without embedded credentials.'
    );
  END IF;

  RETURN private.mcp_ok(jsonb_build_object('value', url_value));
END
$mcp_tasks_url_value$;

-- ---------------------------------------------------------------------------
-- 5. Resolucion de referencias del modulo
-- ---------------------------------------------------------------------------
--
-- Mismo contrato que `mcp_resolve_reference` en contabilidad: id explicito o
-- busqueda por nombre, nunca las dos, y candidatos cuando la busqueda es
-- ambigua. Se separa de aquella funcion porque las entidades, los filtros y el
-- alcance por proyecto no tienen nada que ver.

CREATE OR REPLACE FUNCTION private.mcp_tasks_resolve_reference(
  p_kind TEXT,
  p_request JSONB,
  p_id_key TEXT,
  p_query_key TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_resolve_reference$
DECLARE
  has_id BOOLEAN;
  has_query BOOLEAN;
  id_value UUID;
  query_value TEXT;
  match_count INTEGER;
  match_candidates JSONB;
  exists_value BOOLEAN;
BEGIN
  has_id := (p_request ? p_id_key)
    AND jsonb_typeof(p_request -> p_id_key) <> 'null';
  has_query := (p_request ? p_query_key)
    AND jsonb_typeof(p_request -> p_query_key) <> 'null';

  IF has_id AND has_query THEN
    RETURN private.mcp_error(
      'ambiguous_' || p_kind || '_selector',
      'Supply ' || p_id_key || ' or ' || p_query_key || ', not both.'
    );
  END IF;

  IF NOT has_id AND NOT has_query THEN
    RETURN private.mcp_ok(jsonb_build_object('id', NULL));
  END IF;

  IF has_id THEN
    IF jsonb_typeof(p_request -> p_id_key) <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_' || p_id_key,
        p_id_key || ' must be a UUID string.'
      );
    END IF;
    id_value := private.mcp_parse_uuid(p_request ->> p_id_key);
    IF id_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_' || p_id_key,
        p_id_key || ' must be a UUID.'
      );
    END IF;

    exists_value := CASE p_kind
      WHEN 'project' THEN EXISTS (
        SELECT 1
        FROM public.sistema_projects AS project
        WHERE project.id = id_value
      )
      WHEN 'column' THEN EXISTS (
        SELECT 1
        FROM public.sistema_columns AS board_column
        WHERE board_column.id = id_value
          AND (p_project_id IS NULL OR board_column.project_id = p_project_id)
      )
      WHEN 'member' THEN EXISTS (
        SELECT 1
        FROM public.sistema_users AS member
        WHERE member.id = id_value
          AND member.is_active
          AND member.deleted_at IS NULL
      )
      WHEN 'task' THEN EXISTS (
        SELECT 1
        FROM public.sistema_tasks AS task
        WHERE task.id = id_value
          AND (p_project_id IS NULL OR task.project_id = p_project_id)
      )
      ELSE false
    END;

    IF NOT exists_value THEN
      RETURN private.mcp_error(
        'invalid_' || p_kind,
        p_id_key || ' does not identify an eligible ' || p_kind || '.'
      );
    END IF;

    RETURN private.mcp_ok(jsonb_build_object('id', id_value));
  END IF;

  IF jsonb_typeof(p_request -> p_query_key) <> 'string' THEN
    RETURN private.mcp_error(
      'invalid_' || p_query_key,
      p_query_key || ' must be a string.'
    );
  END IF;
  query_value := BTRIM(p_request ->> p_query_key);
  IF char_length(query_value) NOT BETWEEN 1 AND 200 THEN
    RETURN private.mcp_error(
      'invalid_' || p_query_key,
      p_query_key || ' must contain 1-200 characters.'
    );
  END IF;

  IF p_kind = 'project' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object('id', candidate.id, 'name', candidate.nombre)
          ORDER BY candidate.nombre, candidate.id
        ),
        '[]'::JSONB
      )
    INTO match_count, match_candidates
    FROM (
      SELECT project.id, project.nombre
      FROM public.sistema_projects AS project
      WHERE project.nombre ILIKE '%' || query_value || '%'
      ORDER BY project.nombre, project.id
      LIMIT 6
    ) AS candidate;
  ELSIF p_kind = 'column' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', candidate.id,
            'name', candidate.nombre,
            'project_id', candidate.project_id
          )
          ORDER BY candidate.orden, candidate.nombre, candidate.id
        ),
        '[]'::JSONB
      )
    INTO match_count, match_candidates
    FROM (
      SELECT
        board_column.id,
        board_column.nombre,
        board_column.project_id,
        board_column.orden
      FROM public.sistema_columns AS board_column
      WHERE board_column.nombre ILIKE '%' || query_value || '%'
        AND (p_project_id IS NULL OR board_column.project_id = p_project_id)
      ORDER BY board_column.orden, board_column.nombre, board_column.id
      LIMIT 6
    ) AS candidate;
  ELSIF p_kind = 'member' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', candidate.id,
            'name', candidate.nombre,
            'email', candidate.email
          )
          ORDER BY candidate.nombre, candidate.id
        ),
        '[]'::JSONB
      )
    INTO match_count, match_candidates
    FROM (
      SELECT member.id, member.nombre, member.email
      FROM public.sistema_users AS member
      WHERE member.is_active
        AND member.deleted_at IS NULL
        AND (
          member.nombre ILIKE '%' || query_value || '%'
          OR member.email ILIKE '%' || query_value || '%'
        )
      ORDER BY member.nombre, member.id
      LIMIT 6
    ) AS candidate;
  ELSIF p_kind = 'task' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', candidate.id,
            'title', candidate.titulo,
            'project_id', candidate.project_id
          )
          ORDER BY candidate.titulo, candidate.id
        ),
        '[]'::JSONB
      )
    INTO match_count, match_candidates
    FROM (
      SELECT task.id, task.titulo, task.project_id
      FROM public.sistema_tasks AS task
      WHERE task.titulo ILIKE '%' || query_value || '%'
        AND (p_project_id IS NULL OR task.project_id = p_project_id)
      ORDER BY task.titulo, task.id
      LIMIT 6
    ) AS candidate;
  ELSE
    RETURN private.mcp_error(
      'invalid_reference_kind',
      'The reference kind is not supported.'
    );
  END IF;

  IF match_count = 0 THEN
    RETURN private.mcp_error(
      p_kind || '_not_found',
      p_query_key || ' did not match an eligible ' || p_kind || '.'
    );
  ELSIF match_count > 1 THEN
    RETURN private.mcp_error(
      'ambiguous_' || p_query_key,
      p_query_key || ' matched more than one ' || p_kind || '.',
      jsonb_build_object('candidates', match_candidates)
    );
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object('id', (match_candidates -> 0 ->> 'id')::UUID)
  );
END
$mcp_tasks_resolve_reference$;

-- ---------------------------------------------------------------------------
-- 6. Ciclo de vida de una escritura de tareas
-- ---------------------------------------------------------------------------

-- Una tarea no mueve plata, asi que el riesgo lo marca el alcance: una fila es
-- nivel 2 y un lote es nivel 3, para que la actividad reciente lo destaque.
CREATE OR REPLACE FUNCTION private.mcp_tasks_risk(p_row_count INTEGER)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $mcp_tasks_risk$
  SELECT CASE
    WHEN COALESCE(p_row_count, 1) > 1 THEN jsonb_build_object(
      'level', 3,
      'reasons', jsonb_build_array('bulk_write', 'project_board_change')
    )
    ELSE jsonb_build_object(
      'level', 2,
      'reasons', jsonb_build_array('project_board_change')
    )
  END;
$mcp_tasks_risk$;

CREATE OR REPLACE FUNCTION private.mcp_tasks_record_undo(
  p_operation_id UUID,
  p_ordinal INTEGER,
  p_undo_action TEXT,
  p_entity_table TEXT,
  p_entity_id UUID,
  p_snapshot JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_record_undo$
  INSERT INTO private.mcp_operation_undo(
    operation_id,
    ordinal,
    undo_action,
    entity_table,
    entity_id,
    snapshot
  )
  VALUES (
    p_operation_id,
    p_ordinal,
    p_undo_action,
    p_entity_table,
    p_entity_id,
    p_snapshot
  );
$mcp_tasks_record_undo$;

-- Estado previo de una tarea, con `updated_at` incluido para poder negarse a
-- restaurar si una persona la edito despues de la escritura del MCP.
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
    'updated_at', task.updated_at
  )
  FROM public.sistema_tasks AS task
  WHERE task.id = p_task_id;
$mcp_tasks_snapshot$;

CREATE OR REPLACE FUNCTION private.mcp_tasks_subtask_snapshot(p_subtask_id UUID)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_tasks_subtask_snapshot$
  SELECT jsonb_build_object(
    'titulo', subtask.titulo,
    'completed', subtask.completed,
    'assignee_id', subtask.assignee_id,
    'orden', subtask.orden
  )
  FROM public.sistema_subtasks AS subtask
  WHERE subtask.id = p_subtask_id;
$mcp_tasks_subtask_snapshot$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.mcp_tasks_resolve_reference(TEXT, JSONB, TEXT, TEXT, UUID) IS
  'Resuelve proyecto, columna, miembro o tarea por id o por nombre, con candidatos cuando la busqueda es ambigua.';
COMMENT ON FUNCTION private.mcp_tasks_snapshot(UUID) IS
  'Estado previo de una tarea para poder anular una actualizacion del MCP.';

NOTIFY pgrst, 'reload schema';
