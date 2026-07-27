-- Escrituras contables directas por MCP.
--
-- El flujo anterior era preparar la operacion, aprobarla en una pantalla web
-- con AAL2 y recien despues confirmarla. Este control previo se reemplaza por
-- una escritura inmediata y auditada mas control posterior: cada registro
-- guarda su operacion, aparece en la actividad reciente y puede anularse.
--
-- La anulacion solo alcanza filas creadas por el MCP: el asistente no puede
-- tocar contabilidad cargada por una persona desde la web.

-- ---------------------------------------------------------------------------
-- 1. Catalogo de capacidades
-- ---------------------------------------------------------------------------

ALTER TABLE private.mcp_capabilities
  ADD COLUMN IF NOT EXISTS granted_by_default BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN private.mcp_capabilities.granted_by_default IS
  'Capacidades que mcp_provision_oauth_client concede al autorizar un cliente.';

INSERT INTO private.mcp_capabilities(capability, description)
VALUES
  (
    'accounting.income.write',
    'Registrar y anular un cobro de cliente sin aprobacion previa.'
  ),
  (
    'accounting.transfer.write',
    'Registrar y anular una transferencia entre cuentas sin aprobacion previa.'
  )
ON CONFLICT (capability) DO NOTHING;

UPDATE private.mcp_capabilities
SET granted_by_default = true
WHERE capability IN (
  'accounting.read',
  'accounting.expense.write',
  'accounting.income.write',
  'accounting.transfer.write'
);

UPDATE private.mcp_capabilities
SET description = 'Registrar y anular un gasto sin aprobacion previa.'
WHERE capability = 'accounting.expense.write';

CREATE OR REPLACE FUNCTION private.mcp_default_capabilities()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_default_capabilities$
  SELECT COALESCE(
    jsonb_agg(capability.capability ORDER BY capability.capability),
    '[]'::JSONB
  )
  FROM private.mcp_capabilities AS capability
  WHERE capability.granted_by_default;
$mcp_default_capabilities$;

-- Los clientes y grants ya autorizados no deberian tener que reconectarse solo
-- porque aparecieron capacidades nuevas dentro del mismo modulo contable.
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

-- ---------------------------------------------------------------------------
-- 2. Operaciones: modo directo, entidad escrita y anulacion
-- ---------------------------------------------------------------------------

-- Los CHECK originales nacieron con nombre autogenerado y describen el flujo de
-- aprobacion previa, asi que se localizan por definicion antes de reemplazarlos.
DO $drop_operation_checks$
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
      AND (
        pg_catalog.pg_get_constraintdef(con.oid) LIKE '%operation_type%'
        OR pg_catalog.pg_get_constraintdef(con.oid) LIKE '%status%'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE private.mcp_operations DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END
$drop_operation_checks$;

ALTER TABLE private.mcp_operations
  ADD COLUMN IF NOT EXISTS approval_mode TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS entity_table TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE private.mcp_operations
  ADD CONSTRAINT mcp_operations_operation_type_allowed
    CHECK (
      operation_type IN (
        'accounting.create_expense',
        'accounting.create_income',
        'accounting.create_transfer'
      )
    ),
  ADD CONSTRAINT mcp_operations_status_allowed
    CHECK (
      status IN (
        'awaiting_approval', 'approved', 'committed', 'rejected',
        'expired', 'cancelled', 'failed', 'voided'
      )
    ),
  ADD CONSTRAINT mcp_operations_approval_mode_allowed
    CHECK (approval_mode IN ('human', 'direct')),
  ADD CONSTRAINT mcp_operations_approved_evidence
    CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  -- Una operacion aprobada a mano sigue exigiendo su evidencia; una directa
  -- solo exige haber quedado efectivamente escrita.
  ADD CONSTRAINT mcp_operations_committed_evidence
    CHECK (
      status <> 'committed'
      OR (
        committed_at IS NOT NULL
        AND (approval_mode = 'direct' OR approved_at IS NOT NULL)
      )
    ),
  ADD CONSTRAINT mcp_operations_voided_evidence
    CHECK (
      status <> 'voided'
      OR (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    ),
  ADD CONSTRAINT mcp_operations_entity_pairing
    CHECK ((entity_table IS NULL) = (entity_id IS NULL)),
  ADD CONSTRAINT mcp_operations_entity_table_allowed
    CHECK (
      entity_table IS NULL
      OR entity_table IN (
        'accounting_expenses',
        'accounting_client_payments',
        'accounting_transfers'
      )
    );

CREATE INDEX IF NOT EXISTS mcp_operations_direct_activity_idx
  ON private.mcp_operations(user_id, committed_at DESC)
  WHERE approval_mode = 'direct';

COMMENT ON COLUMN private.mcp_operations.approval_mode IS
  'human: aprobacion web previa. direct: escritura inmediata revisable y anulable.';
COMMENT ON COLUMN private.mcp_operations.entity_table IS
  'Tabla contable escrita por la operacion; habilita anular solo lo que creo el MCP.';

-- ---------------------------------------------------------------------------
-- 3. Helpers de validacion y resolucion
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.mcp_money_value(p_value JSONB)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $mcp_money_value$
  SELECT CASE
    WHEN p_value IS NULL
      OR jsonb_typeof(p_value) <> 'string'
      OR (p_value #>> '{}') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$'
    THEN NULL
    ELSE (p_value #>> '{}')::NUMERIC(12, 2)
  END;
$mcp_money_value$;

CREATE OR REPLACE FUNCTION private.mcp_date_value(p_value JSONB)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_date_value$
BEGIN
  IF p_value IS NULL
    OR jsonb_typeof(p_value) <> 'string'
    OR (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN
    RETURN NULL;
  END IF;
  RETURN (p_value #>> '{}')::DATE;
EXCEPTION
  WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN NULL;
END
$mcp_date_value$;

CREATE OR REPLACE FUNCTION private.mcp_optional_text(
  p_request JSONB,
  p_key TEXT,
  p_max_length INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_optional_text$
DECLARE
  text_value TEXT;
BEGIN
  IF NOT (p_request ? p_key)
    OR jsonb_typeof(p_request -> p_key) = 'null'
  THEN
    RETURN private.mcp_ok(jsonb_build_object('value', NULL));
  END IF;

  IF jsonb_typeof(p_request -> p_key) <> 'string' THEN
    RETURN private.mcp_error(
      'invalid_' || p_key,
      p_key || ' must be a string.'
    );
  END IF;

  text_value := NULLIF(BTRIM(p_request ->> p_key), '');
  IF text_value IS NOT NULL AND char_length(text_value) > p_max_length THEN
    RETURN private.mcp_error(
      'invalid_' || p_key,
      p_key || ' must not exceed ' || p_max_length || ' characters.'
    );
  END IF;

  RETURN private.mcp_ok(jsonb_build_object('value', text_value));
END
$mcp_optional_text$;

-- Resuelve un id explicito o una busqueda por nombre para cuentas, categorias,
-- contrapartes y proyectos. Devuelve id nulo cuando el campo es opcional y no
-- vino, y candidatos cuando la busqueda es ambigua.
CREATE OR REPLACE FUNCTION private.mcp_resolve_reference(
  p_kind TEXT,
  p_request JSONB,
  p_id_key TEXT,
  p_query_key TEXT,
  p_currency TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_resolve_reference$
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
      WHEN 'account' THEN EXISTS (
        SELECT 1
        FROM public.accounting_accounts AS account
        WHERE account.id = id_value
          AND account.is_active
          AND (p_currency IS NULL OR account.currency = p_currency)
      )
      WHEN 'category' THEN EXISTS (
        SELECT 1
        FROM public.accounting_expense_categories AS category
        WHERE category.id = id_value
      )
      WHEN 'counterparty' THEN EXISTS (
        SELECT 1
        FROM public.accounting_counterparties AS counterparty
        WHERE counterparty.id = id_value
          AND counterparty.is_active
      )
      WHEN 'project' THEN EXISTS (
        SELECT 1
        FROM public.sistema_projects AS project
        WHERE project.id = id_value
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

  IF p_kind = 'account' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', candidate.id,
            'name', candidate.name,
            'currency', candidate.currency
          )
          ORDER BY candidate.name, candidate.id
        ),
        '[]'::JSONB
      )
    INTO match_count, match_candidates
    FROM (
      SELECT account.id, account.name, account.currency
      FROM public.accounting_accounts AS account
      WHERE account.is_active
        AND (p_currency IS NULL OR account.currency = p_currency)
        AND account.name ILIKE '%' || query_value || '%'
      ORDER BY account.name, account.id
      LIMIT 6
    ) AS candidate;
  ELSIF p_kind = 'category' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object('id', candidate.id, 'name', candidate.name)
          ORDER BY candidate.name, candidate.id
        ),
        '[]'::JSONB
      )
    INTO match_count, match_candidates
    FROM (
      SELECT category.id, category.name
      FROM public.accounting_expense_categories AS category
      WHERE category.name ILIKE '%' || query_value || '%'
      ORDER BY category.name, category.id
      LIMIT 6
    ) AS candidate;
  ELSIF p_kind = 'counterparty' THEN
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', candidate.id,
            'name', candidate.name,
            'kind', candidate.kind
          )
          ORDER BY candidate.name, candidate.id
        ),
        '[]'::JSONB
      )
    INTO match_count, match_candidates
    FROM (
      SELECT counterparty.id, counterparty.name, counterparty.kind
      FROM public.accounting_counterparties AS counterparty
      WHERE counterparty.is_active
        AND counterparty.name ILIKE '%' || query_value || '%'
      ORDER BY counterparty.name, counterparty.id
      LIMIT 6
    ) AS candidate;
  ELSIF p_kind = 'project' THEN
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
$mcp_resolve_reference$;
-- ---------------------------------------------------------------------------
-- 4. Ciclo de vida de una escritura directa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.mcp_write_risk(
  p_amount NUMERIC,
  p_currency TEXT,
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_write_risk$
DECLARE
  risk_level SMALLINT := 2;
  risk_reasons JSONB := '["financial_balance_change"]'::JSONB;
  high_risk_threshold NUMERIC;
  backdate_days INTEGER;
BEGIN
  high_risk_threshold := CASE p_currency
    WHEN 'USD' THEN private.mcp_config_numeric('expense_high_risk_usd', 1000)
    ELSE private.mcp_config_numeric('expense_high_risk_ars', 500000)
  END;
  backdate_days := private.mcp_config_integer('expense_backdate_days', 30);

  IF p_amount >= high_risk_threshold THEN
    risk_level := 3;
    risk_reasons := risk_reasons || jsonb_build_array('high_amount');
  END IF;

  IF p_date < CURRENT_DATE - backdate_days THEN
    risk_level := 3;
    risk_reasons := risk_reasons || jsonb_build_array('backdated');
  END IF;

  RETURN jsonb_build_object('level', risk_level, 'reasons', risk_reasons);
END
$mcp_write_risk$;

CREATE OR REPLACE FUNCTION private.mcp_direct_operation_view(
  p_operation_id UUID
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_direct_operation_view$
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'operation_id', operation.id,
      'operation_type', operation.operation_type,
      'status', operation.status,
      'payload', operation.normalized_payload,
      'risk_level', operation.risk_level,
      'risk_reasons', operation.risk_reasons,
      'entity_table', operation.entity_table,
      'entity_id', operation.entity_id,
      'recorded_at', operation.committed_at,
      'voided_at', operation.voided_at,
      'void_reason', operation.void_reason,
      'result', operation.result
    )
  )
  FROM private.mcp_operations AS operation
  WHERE operation.id = p_operation_id;
$mcp_direct_operation_view$;

-- Abre la operacion antes de tocar contabilidad. El estado intermedio nunca es
-- visible fuera de la transaccion que lo escribe.
CREATE OR REPLACE FUNCTION private.mcp_direct_operation_open(
  p_context JSONB,
  p_operation_type TEXT,
  p_capability TEXT,
  p_idempotency_key TEXT,
  p_normalized_payload JSONB,
  p_risk JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_direct_operation_open$
DECLARE
  user_id_value UUID := (p_context ->> 'user_id')::UUID;
  client_id_value UUID := (p_context ->> 'client_id')::UUID;
  payload_hash_value TEXT;
  operation_id_value UUID;
  existing_operation private.mcp_operations%ROWTYPE;
BEGIN
  payload_hash_value := encode(
    extensions.digest(
      convert_to(p_normalized_payload::TEXT, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Un intento anterior que no llego a escribir no debe bloquear el reintento
  -- con la misma clave de idempotencia.
  UPDATE private.mcp_operations
  SET status = 'expired'
  WHERE user_id = user_id_value
    AND client_id = client_id_value
    AND operation_type = p_operation_type
    AND idempotency_key = p_idempotency_key
    AND status IN ('awaiting_approval', 'approved', 'failed');

  INSERT INTO private.mcp_operations(
    user_id,
    client_id,
    session_id,
    grant_id,
    operation_type,
    capability,
    idempotency_key,
    normalized_payload,
    payload_hash,
    risk_level,
    risk_reasons,
    approval_mode,
    expires_at
  )
  VALUES (
    user_id_value,
    client_id_value,
    (p_context ->> 'session_id')::UUID,
    (p_context ->> 'grant_id')::UUID,
    p_operation_type,
    p_capability,
    p_idempotency_key,
    p_normalized_payload,
    payload_hash_value,
    (p_risk ->> 'level')::SMALLINT,
    p_risk -> 'reasons',
    'direct',
    clock_timestamp() + make_interval(secs => 60)
  )
  ON CONFLICT (user_id, client_id, operation_type, idempotency_key)
    WHERE status <> 'expired'
  DO NOTHING
  RETURNING id INTO operation_id_value;

  IF operation_id_value IS NOT NULL THEN
    RETURN private.mcp_ok(
      jsonb_build_object(
        'operation_id', operation_id_value,
        'payload_hash', payload_hash_value,
        'idempotent_replay', false
      )
    );
  END IF;

  SELECT operation.*
  INTO existing_operation
  FROM private.mcp_operations AS operation
  WHERE operation.user_id = user_id_value
    AND operation.client_id = client_id_value
    AND operation.operation_type = p_operation_type
    AND operation.idempotency_key = p_idempotency_key
    AND operation.status <> 'expired'
  FOR UPDATE;

  IF existing_operation.payload_hash <> payload_hash_value THEN
    PERFORM private.mcp_audit_event(
      p_operation_type || '.conflict',
      'mcp_direct_operation_open',
      'denied',
      user_id_value,
      client_id_value,
      (p_context ->> 'session_id')::UUID,
      existing_operation.id,
      p_capability,
      jsonb_build_object(
        'reason', 'idempotency_payload_mismatch',
        'idempotency_key', p_idempotency_key
      )
    );
    RETURN private.mcp_error(
      'idempotency_conflict',
      'The idempotency key already belongs to a different record.',
      jsonb_build_object('operation_id', existing_operation.id)
    );
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'operation_id', existing_operation.id,
      'payload_hash', payload_hash_value,
      'idempotent_replay', true,
      'view', private.mcp_direct_operation_view(existing_operation.id)
    )
  );
END
$mcp_direct_operation_open$;

CREATE OR REPLACE FUNCTION private.mcp_direct_operation_commit(
  p_operation_id UUID,
  p_entity_table TEXT,
  p_entity_id UUID,
  p_result JSONB
)
RETURNS VOID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_direct_operation_commit$
  UPDATE private.mcp_operations
  SET
    status = 'committed',
    committed_at = clock_timestamp(),
    entity_table = p_entity_table,
    entity_id = p_entity_id,
    result = p_result,
    failure_code = NULL
  WHERE id = p_operation_id;
$mcp_direct_operation_commit$;

CREATE OR REPLACE FUNCTION private.mcp_direct_operation_fail(
  p_operation_id UUID,
  p_failure_code TEXT
)
RETURNS VOID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_direct_operation_fail$
  UPDATE private.mcp_operations
  SET
    status = 'failed',
    failure_code = p_failure_code
  WHERE id = p_operation_id;
$mcp_direct_operation_fail$;

-- ---------------------------------------------------------------------------
-- 5. Registro directo de gastos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_accounting_record_expense(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_record_expense$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  optional_result JSONB;
  idempotency_uuid UUID;
  expense_date DATE;
  description_value TEXT;
  amount_value NUMERIC(12, 2);
  currency_value TEXT;
  account_id_value UUID;
  category_id_value UUID;
  counterparty_id_value UUID;
  project_id_value UUID;
  notes_value TEXT;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
  expense_id_value UUID;
  result_value JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'accounting.expense.write',
    'mcp_accounting_record_expense',
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
        'date',
        'description',
        'amount',
        'currency',
        'account_id',
        'account_query',
        'category_id',
        'category_query',
        'counterparty_id',
        'counterparty_query',
        'project_id',
        'project_query',
        'notes'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'date'
      AND p_request ? 'description'
      AND p_request ? 'amount'
      AND p_request ? 'currency'
      AND (p_request ? 'account_id' OR p_request ? 'account_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, date, description, amount, currency and one account selector are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  expense_date := private.mcp_date_value(p_request -> 'date');
  IF expense_date IS NULL THEN
    RETURN private.mcp_error('invalid_date', 'date must use YYYY-MM-DD.');
  END IF;

  IF jsonb_typeof(p_request -> 'description') <> 'string' THEN
    RETURN private.mcp_error(
      'invalid_description',
      'description must be a string.'
    );
  END IF;
  description_value := BTRIM(p_request ->> 'description');
  IF char_length(description_value) NOT BETWEEN 1 AND 500 THEN
    RETURN private.mcp_error(
      'invalid_description',
      'description must contain 1-500 characters.'
    );
  END IF;

  amount_value := private.mcp_money_value(p_request -> 'amount');
  IF amount_value IS NULL OR amount_value <= 0 THEN
    RETURN private.mcp_error(
      'invalid_amount',
      'amount must be a positive decimal string with exactly two decimals.'
    );
  END IF;

  IF jsonb_typeof(p_request -> 'currency') <> 'string' THEN
    RETURN private.mcp_error('invalid_currency', 'currency must be a string.');
  END IF;
  currency_value := UPPER(p_request ->> 'currency');
  IF currency_value NOT IN ('ARS', 'USD') THEN
    RETURN private.mcp_error('invalid_currency', 'currency must be ARS or USD.');
  END IF;

  reference_result := private.mcp_resolve_reference(
    'account', p_request, 'account_id', 'account_query', currency_value
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  account_id_value := (reference_result -> 'data' ->> 'id')::UUID;
  IF account_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_account',
      'The account must exist, be active, and use the expense currency.'
    );
  END IF;

  reference_result := private.mcp_resolve_reference(
    'category', p_request, 'category_id', 'category_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  category_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  reference_result := private.mcp_resolve_reference(
    'counterparty', p_request, 'counterparty_id', 'counterparty_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  counterparty_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  reference_result := private.mcp_resolve_reference(
    'project', p_request, 'project_id', 'project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  project_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  optional_result := private.mcp_optional_text(p_request, 'notes', 2000);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  notes_value := optional_result -> 'data' ->> 'value';

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'date', to_char(expense_date, 'YYYY-MM-DD'),
      'description', description_value,
      'amount', to_char(amount_value, 'FM9999999990.00'),
      'currency', currency_value,
      'account_id', account_id_value,
      'category_id', category_id_value,
      'counterparty_id', counterparty_id_value,
      'project_id', project_id_value,
      'notes', notes_value
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'accounting.create_expense',
    'accounting.expense.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_write_risk(amount_value, currency_value, expense_date)
  );
  IF NOT COALESCE((open_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN open_result;
  END IF;
  operation_id_value := (open_result -> 'data' ->> 'operation_id')::UUID;

  IF COALESCE((open_result -> 'data' ->> 'idempotent_replay')::BOOLEAN, false) THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.record_replayed',
      'mcp_accounting_record_expense',
      'success',
      (context_data ->> 'user_id')::UUID,
      (context_data ->> 'client_id')::UUID,
      (context_data ->> 'session_id')::UUID,
      operation_id_value,
      'accounting.expense.write',
      jsonb_build_object('idempotency_key', idempotency_uuid)
    );
    RETURN private.mcp_ok(
      (open_result -> 'data' -> 'view')
      || jsonb_build_object('idempotent_replay', true)
    );
  END IF;

  BEGIN
    INSERT INTO public.accounting_expenses(
      date,
      description,
      amount,
      currency,
      account_id,
      category_id,
      counterparty_id,
      project_id,
      notes,
      created_by
    )
    VALUES (
      expense_date,
      description_value,
      amount_value,
      currency_value,
      account_id_value,
      category_id_value,
      counterparty_id_value,
      project_id_value,
      notes_value,
      (context_data ->> 'user_id')::UUID
    )
    RETURNING id INTO expense_id_value;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'accounting_insert_failed'
      );
      PERFORM private.mcp_audit_event(
        'accounting.expense.record_failed',
        'mcp_accounting_record_expense',
        'failed',
        (context_data ->> 'user_id')::UUID,
        (context_data ->> 'client_id')::UUID,
        (context_data ->> 'session_id')::UUID,
        operation_id_value,
        'accounting.expense.write',
        jsonb_build_object('sqlstate', SQLSTATE)
      );
      RETURN private.mcp_error(
        'expense_record_failed',
        'The expense could not be recorded.'
      );
  END;

  result_value := jsonb_build_object(
    'expense_id', expense_id_value,
    'date', to_char(expense_date, 'YYYY-MM-DD'),
    'description', description_value,
    'amount', to_char(amount_value, 'FM9999999990.00'),
    'currency', currency_value,
    'account_id', account_id_value,
    'created_by', (context_data ->> 'user_id')::UUID
  );

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'accounting_expenses',
    expense_id_value,
    result_value
  );

  PERFORM private.mcp_audit_event(
    'accounting.expense.recorded',
    'mcp_accounting_record_expense',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'accounting.expense.write',
    jsonb_build_object(
      'expense_id', expense_id_value,
      'approval_mode', 'direct',
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
      'accounting.expense.record_failed',
      'mcp_accounting_record_expense',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      operation_id_value,
      'accounting.expense.write',
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'expense_record_failed',
      'The expense could not be recorded.'
    );
END
$mcp_accounting_record_expense$;
-- ---------------------------------------------------------------------------
-- 6. Registro directo de cobros de clientes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_accounting_record_income(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_record_income$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  optional_result JSONB;
  idempotency_uuid UUID;
  income_date DATE;
  period_value TEXT;
  period_month INTEGER;
  period_year INTEGER;
  amount_value NUMERIC(12, 2);
  currency_value TEXT;
  status_value TEXT;
  account_id_value UUID;
  project_id_value UUID;
  client_name_value TEXT;
  payment_method_value TEXT;
  invoice_number_value TEXT;
  notes_value TEXT;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
  payment_id_value UUID;
  result_value JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'accounting.income.write',
    'mcp_accounting_record_income',
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
        'date',
        'amount',
        'currency',
        'status',
        'period',
        'account_id',
        'account_query',
        'project_id',
        'project_query',
        'client_name',
        'payment_method',
        'invoice_number',
        'notes'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'date'
      AND p_request ? 'amount'
      AND p_request ? 'currency'
      AND (p_request ? 'account_id' OR p_request ? 'account_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, date, amount, currency and one account selector are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  income_date := private.mcp_date_value(p_request -> 'date');
  IF income_date IS NULL THEN
    RETURN private.mcp_error('invalid_date', 'date must use YYYY-MM-DD.');
  END IF;

  amount_value := private.mcp_money_value(p_request -> 'amount');
  IF amount_value IS NULL OR amount_value <= 0 THEN
    RETURN private.mcp_error(
      'invalid_amount',
      'amount must be a positive decimal string with exactly two decimals.'
    );
  END IF;

  IF jsonb_typeof(p_request -> 'currency') <> 'string' THEN
    RETURN private.mcp_error('invalid_currency', 'currency must be a string.');
  END IF;
  currency_value := UPPER(p_request ->> 'currency');
  IF currency_value NOT IN ('ARS', 'USD') THEN
    RETURN private.mcp_error('invalid_currency', 'currency must be ARS or USD.');
  END IF;

  status_value := 'paid';
  IF (p_request ? 'status') AND jsonb_typeof(p_request -> 'status') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'status') <> 'string' THEN
      RETURN private.mcp_error('invalid_status', 'status must be a string.');
    END IF;
    status_value := LOWER(p_request ->> 'status');
    IF status_value NOT IN ('paid', 'pending') THEN
      RETURN private.mcp_error(
        'invalid_status',
        'status must be paid or pending.'
      );
    END IF;
  END IF;

  -- El modulo contable imputa cada cobro a un mes; por defecto es el de la
  -- fecha informada y period permite corregirlo sin tocar la fecha real.
  period_month := EXTRACT(MONTH FROM income_date)::INTEGER;
  period_year := EXTRACT(YEAR FROM income_date)::INTEGER;
  IF (p_request ? 'period') AND jsonb_typeof(p_request -> 'period') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'period') <> 'string'
      OR (p_request ->> 'period') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    THEN
      RETURN private.mcp_error('invalid_period', 'period must use YYYY-MM.');
    END IF;
    period_value := p_request ->> 'period';
    period_year := split_part(period_value, '-', 1)::INTEGER;
    period_month := split_part(period_value, '-', 2)::INTEGER;
    IF period_year NOT BETWEEN 2000 AND 2100 THEN
      RETURN private.mcp_error(
        'invalid_period',
        'period year must be between 2000 and 2100.'
      );
    END IF;
  END IF;

  reference_result := private.mcp_resolve_reference(
    'account', p_request, 'account_id', 'account_query', currency_value
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  account_id_value := (reference_result -> 'data' ->> 'id')::UUID;
  IF account_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_account',
      'The account must exist, be active, and use the income currency.'
    );
  END IF;

  reference_result := private.mcp_resolve_reference(
    'project', p_request, 'project_id', 'project_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  project_id_value := (reference_result -> 'data' ->> 'id')::UUID;

  optional_result := private.mcp_optional_text(p_request, 'client_name', 200);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  client_name_value := optional_result -> 'data' ->> 'value';

  -- La tabla exige exactamente un titular: proyecto habitual o cliente suelto.
  IF (project_id_value IS NULL) = (client_name_value IS NULL) THEN
    RETURN private.mcp_error(
      'invalid_client',
      'Supply a project selector or client_name, not both and not neither.'
    );
  END IF;

  optional_result := private.mcp_optional_text(p_request, 'payment_method', 50);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  payment_method_value := optional_result -> 'data' ->> 'value';

  optional_result := private.mcp_optional_text(p_request, 'invoice_number', 100);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  invoice_number_value := optional_result -> 'data' ->> 'value';

  optional_result := private.mcp_optional_text(p_request, 'notes', 2000);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  notes_value := optional_result -> 'data' ->> 'value';

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'date', to_char(income_date, 'YYYY-MM-DD'),
      'amount', to_char(amount_value, 'FM9999999990.00'),
      'currency', currency_value,
      'status', status_value,
      'period', to_char(make_date(period_year, period_month, 1), 'YYYY-MM'),
      'account_id', account_id_value,
      'project_id', project_id_value,
      'client_name', client_name_value,
      'payment_method', payment_method_value,
      'invoice_number', invoice_number_value,
      'notes', notes_value
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'accounting.create_income',
    'accounting.income.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_write_risk(amount_value, currency_value, income_date)
  );
  IF NOT COALESCE((open_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN open_result;
  END IF;
  operation_id_value := (open_result -> 'data' ->> 'operation_id')::UUID;

  IF COALESCE((open_result -> 'data' ->> 'idempotent_replay')::BOOLEAN, false) THEN
    PERFORM private.mcp_audit_event(
      'accounting.income.record_replayed',
      'mcp_accounting_record_income',
      'success',
      (context_data ->> 'user_id')::UUID,
      (context_data ->> 'client_id')::UUID,
      (context_data ->> 'session_id')::UUID,
      operation_id_value,
      'accounting.income.write',
      jsonb_build_object('idempotency_key', idempotency_uuid)
    );
    RETURN private.mcp_ok(
      (open_result -> 'data' -> 'view')
      || jsonb_build_object('idempotent_replay', true)
    );
  END IF;

  BEGIN
    INSERT INTO public.accounting_client_payments(
      project_id,
      client_name,
      month,
      year,
      amount,
      currency,
      status,
      expected_payment_date,
      payment_date,
      payment_method,
      invoice_number,
      notes,
      account_id,
      created_by
    )
    VALUES (
      project_id_value,
      client_name_value,
      period_month,
      period_year,
      amount_value,
      currency_value,
      status_value,
      CASE WHEN status_value = 'pending' THEN income_date END,
      CASE WHEN status_value = 'paid' THEN income_date END,
      payment_method_value,
      invoice_number_value,
      notes_value,
      account_id_value,
      (context_data ->> 'user_id')::UUID
    )
    RETURNING id INTO payment_id_value;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'accounting_insert_failed'
      );
      PERFORM private.mcp_audit_event(
        'accounting.income.record_failed',
        'mcp_accounting_record_income',
        'failed',
        (context_data ->> 'user_id')::UUID,
        (context_data ->> 'client_id')::UUID,
        (context_data ->> 'session_id')::UUID,
        operation_id_value,
        'accounting.income.write',
        jsonb_build_object('sqlstate', SQLSTATE)
      );
      RETURN private.mcp_error(
        'income_record_failed',
        'The income could not be recorded.'
      );
  END;

  result_value := jsonb_strip_nulls(
    jsonb_build_object(
      'payment_id', payment_id_value,
      'date', to_char(income_date, 'YYYY-MM-DD'),
      'amount', to_char(amount_value, 'FM9999999990.00'),
      'currency', currency_value,
      'status', status_value,
      'account_id', account_id_value,
      'project_id', project_id_value,
      'client_name', client_name_value,
      'created_by', (context_data ->> 'user_id')::UUID
    )
  );

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'accounting_client_payments',
    payment_id_value,
    result_value
  );

  PERFORM private.mcp_audit_event(
    'accounting.income.recorded',
    'mcp_accounting_record_income',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'accounting.income.write',
    jsonb_build_object(
      'payment_id', payment_id_value,
      'approval_mode', 'direct',
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
      'accounting.income.record_failed',
      'mcp_accounting_record_income',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      operation_id_value,
      'accounting.income.write',
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'income_record_failed',
      'The income could not be recorded.'
    );
END
$mcp_accounting_record_income$;

-- ---------------------------------------------------------------------------
-- 7. Registro directo de transferencias entre cuentas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_accounting_record_transfer(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_record_transfer$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  reference_result JSONB;
  optional_result JSONB;
  idempotency_uuid UUID;
  transfer_date DATE;
  amount_value NUMERIC(12, 2);
  commission_value NUMERIC(12, 2) := 0;
  tax_value NUMERIC(12, 2) := 0;
  exchange_rate_value NUMERIC(10, 4);
  from_account_id UUID;
  to_account_id UUID;
  from_currency TEXT;
  to_currency TEXT;
  notes_value TEXT;
  normalized_payload JSONB;
  open_result JSONB;
  operation_id_value UUID;
  transfer_id_value UUID;
  result_value JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'accounting.transfer.write',
    'mcp_accounting_record_transfer',
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
        'date',
        'amount',
        'from_account_id',
        'from_account_query',
        'to_account_id',
        'to_account_query',
        'exchange_rate',
        'commission',
        'tax',
        'notes'
      ]
    )
    OR NOT (
      p_request ? 'idempotency_key'
      AND p_request ? 'date'
      AND p_request ? 'amount'
      AND (p_request ? 'from_account_id' OR p_request ? 'from_account_query')
      AND (p_request ? 'to_account_id' OR p_request ? 'to_account_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'idempotency_key, date, amount and one selector per account are required.'
    );
  END IF;

  idempotency_uuid := private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;

  transfer_date := private.mcp_date_value(p_request -> 'date');
  IF transfer_date IS NULL THEN
    RETURN private.mcp_error('invalid_date', 'date must use YYYY-MM-DD.');
  END IF;

  amount_value := private.mcp_money_value(p_request -> 'amount');
  IF amount_value IS NULL OR amount_value <= 0 THEN
    RETURN private.mcp_error(
      'invalid_amount',
      'amount must be a positive decimal string with exactly two decimals.'
    );
  END IF;

  reference_result := private.mcp_resolve_reference(
    'account', p_request, 'from_account_id', 'from_account_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  from_account_id := (reference_result -> 'data' ->> 'id')::UUID;

  reference_result := private.mcp_resolve_reference(
    'account', p_request, 'to_account_id', 'to_account_query'
  );
  IF NOT COALESCE((reference_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN reference_result;
  END IF;
  to_account_id := (reference_result -> 'data' ->> 'id')::UUID;

  IF from_account_id IS NULL OR to_account_id IS NULL THEN
    RETURN private.mcp_error(
      'invalid_account',
      'Both accounts must exist and be active.'
    );
  END IF;

  IF from_account_id = to_account_id THEN
    RETURN private.mcp_error(
      'invalid_transfer',
      'The origin and destination accounts must be different.'
    );
  END IF;

  SELECT account.currency INTO from_currency
  FROM public.accounting_accounts AS account
  WHERE account.id = from_account_id;
  SELECT account.currency INTO to_currency
  FROM public.accounting_accounts AS account
  WHERE account.id = to_account_id;

  -- amount sale de la cuenta origen, por eso la operacion se registra en su
  -- moneda y el tipo de cambio solo aplica cuando la cuenta destino difiere.
  IF (p_request ? 'exchange_rate')
    AND jsonb_typeof(p_request -> 'exchange_rate') <> 'null'
  THEN
    IF jsonb_typeof(p_request -> 'exchange_rate') <> 'string'
      OR (p_request ->> 'exchange_rate') !~ '^(0|[1-9][0-9]{0,5})\.[0-9]{1,4}$'
    THEN
      RETURN private.mcp_error(
        'invalid_exchange_rate',
        'exchange_rate must be a decimal string with up to four decimals.'
      );
    END IF;
    exchange_rate_value := (p_request ->> 'exchange_rate')::NUMERIC(10, 4);
    IF exchange_rate_value <= 0 THEN
      RETURN private.mcp_error(
        'invalid_exchange_rate',
        'exchange_rate must be greater than zero.'
      );
    END IF;
  END IF;

  IF from_currency <> to_currency AND exchange_rate_value IS NULL THEN
    RETURN private.mcp_error(
      'exchange_rate_required',
      'Transfers between accounts of different currencies require exchange_rate.',
      jsonb_build_object(
        'from_currency', from_currency,
        'to_currency', to_currency
      )
    );
  END IF;

  IF from_currency = to_currency AND exchange_rate_value IS NOT NULL THEN
    RETURN private.mcp_error(
      'unexpected_exchange_rate',
      'Both accounts use the same currency, so exchange_rate must be omitted.'
    );
  END IF;

  IF (p_request ? 'commission')
    AND jsonb_typeof(p_request -> 'commission') <> 'null'
  THEN
    commission_value := private.mcp_money_value(p_request -> 'commission');
    IF commission_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_commission',
        'commission must be a decimal string with exactly two decimals.'
      );
    END IF;
  END IF;

  IF (p_request ? 'tax') AND jsonb_typeof(p_request -> 'tax') <> 'null' THEN
    tax_value := private.mcp_money_value(p_request -> 'tax');
    IF tax_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_tax',
        'tax must be a decimal string with exactly two decimals.'
      );
    END IF;
  END IF;

  IF commission_value + tax_value >= amount_value THEN
    RETURN private.mcp_error(
      'invalid_fees',
      'commission plus tax must be lower than amount.'
    );
  END IF;

  optional_result := private.mcp_optional_text(p_request, 'notes', 2000);
  IF NOT COALESCE((optional_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN optional_result;
  END IF;
  notes_value := optional_result -> 'data' ->> 'value';

  normalized_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'date', to_char(transfer_date, 'YYYY-MM-DD'),
      'amount', to_char(amount_value, 'FM9999999990.00'),
      'currency', from_currency,
      'from_account_id', from_account_id,
      'to_account_id', to_account_id,
      'to_currency', to_currency,
      'exchange_rate', to_char(exchange_rate_value, 'FM9999999990.0000'),
      'commission', to_char(commission_value, 'FM9999999990.00'),
      'tax', to_char(tax_value, 'FM9999999990.00'),
      'notes', notes_value
    )
  );

  open_result := private.mcp_direct_operation_open(
    context_data,
    'accounting.create_transfer',
    'accounting.transfer.write',
    idempotency_uuid::TEXT,
    normalized_payload,
    private.mcp_write_risk(amount_value, from_currency, transfer_date)
  );
  IF NOT COALESCE((open_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN open_result;
  END IF;
  operation_id_value := (open_result -> 'data' ->> 'operation_id')::UUID;

  IF COALESCE((open_result -> 'data' ->> 'idempotent_replay')::BOOLEAN, false) THEN
    PERFORM private.mcp_audit_event(
      'accounting.transfer.record_replayed',
      'mcp_accounting_record_transfer',
      'success',
      (context_data ->> 'user_id')::UUID,
      (context_data ->> 'client_id')::UUID,
      (context_data ->> 'session_id')::UUID,
      operation_id_value,
      'accounting.transfer.write',
      jsonb_build_object('idempotency_key', idempotency_uuid)
    );
    RETURN private.mcp_ok(
      (open_result -> 'data' -> 'view')
      || jsonb_build_object('idempotent_replay', true)
    );
  END IF;

  BEGIN
    INSERT INTO public.accounting_transfers(
      from_account_id,
      to_account_id,
      amount,
      currency,
      exchange_rate,
      commission,
      tax,
      date,
      notes,
      created_by
    )
    VALUES (
      from_account_id,
      to_account_id,
      amount_value,
      from_currency,
      exchange_rate_value,
      commission_value,
      tax_value,
      transfer_date,
      notes_value,
      (context_data ->> 'user_id')::UUID
    )
    RETURNING id INTO transfer_id_value;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM private.mcp_direct_operation_fail(
        operation_id_value,
        'accounting_insert_failed'
      );
      PERFORM private.mcp_audit_event(
        'accounting.transfer.record_failed',
        'mcp_accounting_record_transfer',
        'failed',
        (context_data ->> 'user_id')::UUID,
        (context_data ->> 'client_id')::UUID,
        (context_data ->> 'session_id')::UUID,
        operation_id_value,
        'accounting.transfer.write',
        jsonb_build_object('sqlstate', SQLSTATE)
      );
      RETURN private.mcp_error(
        'transfer_record_failed',
        'The transfer could not be recorded.'
      );
  END;

  result_value := jsonb_strip_nulls(
    jsonb_build_object(
      'transfer_id', transfer_id_value,
      'date', to_char(transfer_date, 'YYYY-MM-DD'),
      'amount', to_char(amount_value, 'FM9999999990.00'),
      'currency', from_currency,
      'from_account_id', from_account_id,
      'to_account_id', to_account_id,
      'received_amount', to_char(
        public.accounting_transfer_received_amount(
          amount_value,
          exchange_rate_value,
          commission_value,
          tax_value,
          to_currency
        ),
        'FM9999999990.00'
      ),
      'created_by', (context_data ->> 'user_id')::UUID
    )
  );

  PERFORM private.mcp_direct_operation_commit(
    operation_id_value,
    'accounting_transfers',
    transfer_id_value,
    result_value
  );

  PERFORM private.mcp_audit_event(
    'accounting.transfer.recorded',
    'mcp_accounting_record_transfer',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'accounting.transfer.write',
    jsonb_build_object(
      'transfer_id', transfer_id_value,
      'approval_mode', 'direct',
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
      'accounting.transfer.record_failed',
      'mcp_accounting_record_transfer',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      operation_id_value,
      'accounting.transfer.write',
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'transfer_record_failed',
      'The transfer could not be recorded.'
    );
END
$mcp_accounting_record_transfer$;
-- ---------------------------------------------------------------------------
-- 8. Anulacion y revision posterior
-- ---------------------------------------------------------------------------

-- Solo alcanza filas creadas por una operacion MCP directa del mismo usuario:
-- la contabilidad cargada a mano desde la web queda fuera de su alcance.
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
      'No direct accounting operation matches that identifier.'
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
    IF operation_row.entity_table = 'accounting_expenses' THEN
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
        'The operation does not point at a known accounting table.'
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
        'The recorded row could not be removed.'
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
      AND operation.status IN ('committed', 'voided')
      AND (p_include_voided OR operation.status = 'committed')
      AND operation.committed_at >= now() - make_interval(hours => p_hours)
    ORDER BY operation.committed_at DESC
    LIMIT p_limit
  ) AS entry;
$mcp_recent_direct_operations$;

CREATE OR REPLACE FUNCTION private.mcp_recent_window(p_request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $mcp_recent_window$
DECLARE
  hours_value INTEGER := 24;
  limit_value INTEGER := 50;
  include_voided BOOLEAN := true;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['hours', 'limit', 'include_voided']
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Only hours, limit and include_voided are accepted.'
    );
  END IF;

  IF (p_request ? 'hours') AND jsonb_typeof(p_request -> 'hours') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'hours') <> 'number' THEN
      RETURN private.mcp_error('invalid_hours', 'hours must be a number.');
    END IF;
    hours_value := (p_request ->> 'hours')::NUMERIC::INTEGER;
    IF hours_value NOT BETWEEN 1 AND 720 THEN
      RETURN private.mcp_error('invalid_hours', 'hours must be between 1 and 720.');
    END IF;
  END IF;

  IF (p_request ? 'limit') AND jsonb_typeof(p_request -> 'limit') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'limit') <> 'number' THEN
      RETURN private.mcp_error('invalid_limit', 'limit must be a number.');
    END IF;
    limit_value := (p_request ->> 'limit')::NUMERIC::INTEGER;
    IF limit_value NOT BETWEEN 1 AND 200 THEN
      RETURN private.mcp_error('invalid_limit', 'limit must be between 1 and 200.');
    END IF;
  END IF;

  IF (p_request ? 'include_voided')
    AND jsonb_typeof(p_request -> 'include_voided') <> 'null'
  THEN
    IF jsonb_typeof(p_request -> 'include_voided') <> 'boolean' THEN
      RETURN private.mcp_error(
        'invalid_include_voided',
        'include_voided must be a boolean.'
      );
    END IF;
    include_voided := (p_request ->> 'include_voided')::BOOLEAN;
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'hours', hours_value,
      'limit', limit_value,
      'include_voided', include_voided
    )
  );
END
$mcp_recent_window$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_list_recent_operations(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_list_recent_operations$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  window_result JSONB;
  window_data JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'accounting.read',
    'mcp_accounting_list_recent_operations',
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
      'operations', private.mcp_recent_direct_operations(
        (context_data ->> 'user_id')::UUID,
        (window_data ->> 'hours')::INTEGER,
        (window_data ->> 'limit')::INTEGER,
        (window_data ->> 'include_voided')::BOOLEAN
      )
    )
  );
END
$mcp_accounting_list_recent_operations$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_void_operation(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_void_operation$
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

  -- Anular una escritura exige la misma capacidad que haberla hecho.
  SELECT operation.capability
  INTO capability_value
  FROM private.mcp_operations AS operation
  WHERE operation.id = operation_id_value
    AND operation.approval_mode = 'direct';

  authorization_result := private.mcp_authorize(
    COALESCE(capability_value, 'accounting.expense.write'),
    'mcp_accounting_void_operation',
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
$mcp_accounting_void_operation$;

-- ---------------------------------------------------------------------------
-- 9. Revision y anulacion desde la sesion web
-- ---------------------------------------------------------------------------

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

  RETURN private.mcp_ok(
    jsonb_build_object(
      'window_hours', (window_data ->> 'hours')::INTEGER,
      'operations', private.mcp_recent_direct_operations(
        (context_data ->> 'user_id')::UUID,
        (window_data ->> 'hours')::INTEGER,
        (window_data ->> 'limit')::INTEGER,
        (window_data ->> 'include_voided')::BOOLEAN
      )
    )
  );
END
$mcp_web_list_recent_operations$;

CREATE OR REPLACE FUNCTION public.mcp_web_void_operation(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_web_void_operation$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  operation_id_value UUID;
  reason_result JSONB;
  reason_value TEXT;
BEGIN
  authorization_result := private.mcp_authorize_web(
    'mcp_web_void_operation',
    false
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

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

  RETURN private.mcp_void_direct_operation(
    (context_data ->> 'user_id')::UUID,
    operation_id_value,
    reason_value,
    NULL,
    (context_data ->> 'session_id')::UUID,
    'web'
  );
END
$mcp_web_void_operation$;

-- ---------------------------------------------------------------------------
-- 10. Permisos
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mcp_accounting_record_expense(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_record_income(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_record_transfer(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_void_operation(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_list_recent_operations(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_web_list_recent_operations(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_web_void_operation(JSONB)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.mcp_accounting_record_expense(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_record_income(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_record_transfer(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_void_operation(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_list_recent_operations(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_web_list_recent_operations(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_web_void_operation(JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.mcp_accounting_record_expense(JSONB) IS
  'Registra un gasto sin aprobacion previa y deja la operacion anulable.';
COMMENT ON FUNCTION public.mcp_accounting_record_income(JSONB) IS
  'Registra un cobro de cliente sin aprobacion previa y deja la operacion anulable.';
COMMENT ON FUNCTION public.mcp_accounting_record_transfer(JSONB) IS
  'Registra una transferencia entre cuentas sin aprobacion previa y deja la operacion anulable.';
COMMENT ON FUNCTION public.mcp_accounting_void_operation(JSONB) IS
  'Anula una escritura directa del MCP eliminando solo la fila que esa operacion creo.';
-- ---------------------------------------------------------------------------
-- 11. Provision OAuth: las capacidades salen del catalogo
-- ---------------------------------------------------------------------------
--
-- Reemplaza la lista fija de la migracion de onboarding para que autorizar un
-- cliente conceda tambien ingresos y transferencias, y para que cualquier
-- capacidad futura marcada como granted_by_default entre sola.

CREATE OR REPLACE FUNCTION public.mcp_provision_oauth_client(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_provision_oauth_client$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  caller_user_id UUID;
  caller_session_id UUID;
  client_id_value UUID;
  oauth_client auth.oauth_clients%ROWTYPE;
  resource_uri_value TEXT;
  grant_row private.mcp_access_grants%ROWTYPE;
  idempotent_replay BOOLEAN := false;
BEGIN
  authorization_result := private.mcp_authorize_web(
    'mcp_provision_oauth_client',
    false
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.provision_denied',
      'mcp_provision_oauth_client',
      'denied',
      auth.uid(),
      private.mcp_parse_uuid(auth.jwt() ->> 'client_id'),
      private.mcp_parse_uuid(auth.jwt() ->> 'session_id'),
      NULL,
      NULL,
      jsonb_build_object(
        'reason',
        COALESCE(
          authorization_result -> 'error' ->> 'code',
          'authorization_denied'
        )
      )
    );
    RETURN authorization_result;
  END IF;

  context_data := authorization_result -> 'data';
  caller_user_id := (context_data ->> 'user_id')::UUID;
  caller_session_id := (context_data ->> 'session_id')::UUID;

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['client_id']
    )
    OR NOT (COALESCE(p_request, '{}'::JSONB) ? 'client_id')
    OR jsonb_typeof(p_request -> 'client_id') <> 'string'
  THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.provision_denied',
      'mcp_provision_oauth_client',
      'denied',
      caller_user_id,
      NULL,
      caller_session_id,
      NULL,
      NULL,
      jsonb_build_object('reason', 'invalid_request')
    );
    RETURN private.mcp_error(
      'invalid_request',
      'Exactly one string field, client_id, is required.'
    );
  END IF;

  client_id_value := private.mcp_parse_uuid(p_request ->> 'client_id');
  IF client_id_value IS NULL THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.provision_denied',
      'mcp_provision_oauth_client',
      'denied',
      caller_user_id,
      NULL,
      caller_session_id,
      NULL,
      NULL,
      jsonb_build_object('reason', 'invalid_client_id')
    );
    RETURN private.mcp_error(
      'invalid_client_id',
      'client_id must be a valid UUID.'
    );
  END IF;

  SELECT client.*
  INTO oauth_client
  FROM auth.oauth_clients AS client
  WHERE client.id = client_id_value
    AND client.deleted_at IS NULL;

  IF NOT FOUND THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.provision_denied',
      'mcp_provision_oauth_client',
      'denied',
      caller_user_id,
      client_id_value,
      caller_session_id,
      NULL,
      NULL,
      jsonb_build_object('reason', 'oauth_client_not_active')
    );
    RETURN private.mcp_error(
      'oauth_client_not_active',
      'The OAuth client does not exist or is deleted.'
    );
  END IF;

  resource_uri_value := private.mcp_resource_uri();

  IF resource_uri_value IS NULL THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.provision_failed',
      'mcp_provision_oauth_client',
      'failed',
      caller_user_id,
      client_id_value,
      caller_session_id,
      NULL,
      NULL,
      jsonb_build_object('reason', 'invalid_resource_uri')
    );
    RETURN private.mcp_error(
      'invalid_resource_uri',
      'The per-environment MCP resource URI is missing or invalid.'
    );
  END IF;

  INSERT INTO private.mcp_client_policies(
    client_id,
    required_audience,
    enabled,
    min_aal,
    rate_limit_read_per_minute,
    rate_limit_write_per_minute,
    created_by,
    updated_by
  )
  VALUES (
    client_id_value,
    resource_uri_value,
    true,
    'aal1',
    60,
    10,
    caller_user_id,
    caller_user_id
  )
  ON CONFLICT (client_id) DO UPDATE
  SET
    required_audience = EXCLUDED.required_audience,
    enabled = true,
    min_aal = 'aal1',
    updated_at = clock_timestamp(),
    updated_by = EXCLUDED.updated_by;

  INSERT INTO private.mcp_client_capabilities(client_id, capability)
  SELECT client_id_value, capability.capability
  FROM private.mcp_capabilities AS capability
  WHERE capability.granted_by_default
  ON CONFLICT (client_id, capability) DO NOTHING;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      caller_user_id::TEXT || ':' || client_id_value::TEXT,
      0
    )
  );

  SELECT grant_record.*
  INTO grant_row
  FROM private.mcp_access_grants AS grant_record
  WHERE grant_record.user_id = caller_user_id
    AND grant_record.client_id = client_id_value
    AND grant_record.revoked_at IS NULL
  FOR UPDATE;

  IF FOUND AND (
    grant_row.expires_at IS NULL
    OR grant_row.expires_at > clock_timestamp()
  ) THEN
    idempotent_replay := true;
  ELSE
    IF FOUND THEN
      UPDATE private.mcp_access_grants
      SET
        revoked_at = clock_timestamp(),
        revoked_by = caller_user_id,
        revoke_reason = 'expired_grant_superseded'
      WHERE id = grant_row.id;
    END IF;

    INSERT INTO private.mcp_access_grants(
      user_id,
      client_id,
      valid_from,
      created_by
    )
    VALUES (
      caller_user_id,
      client_id_value,
      clock_timestamp(),
      caller_user_id
    )
    RETURNING * INTO grant_row;
  END IF;

  INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability)
  SELECT grant_row.id, capability.capability
  FROM private.mcp_capabilities AS capability
  WHERE capability.granted_by_default
  ON CONFLICT (grant_id, capability) DO NOTHING;

  PERFORM private.mcp_audit_event(
    'oauth.client.provisioned',
    'mcp_provision_oauth_client',
    'success',
    caller_user_id,
    client_id_value,
    caller_session_id,
    NULL,
    NULL,
    jsonb_build_object(
      'grant_id', grant_row.id,
      'grant_expires_at', grant_row.expires_at,
      'grant_lifetime', 'oauth_grant',
      'idempotent_replay', idempotent_replay,
      'min_aal', 'aal1',
      'proof_at_grant_aal', context_data ->> 'aal',
      'capabilities', private.mcp_default_capabilities()
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'client',
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', oauth_client.id,
            'name', oauth_client.client_name,
            'uri', oauth_client.client_uri,
            'type', oauth_client.client_type,
            'registration_type', oauth_client.registration_type
          )
        ),
      'policy',
        jsonb_build_object(
          'enabled', true,
          'resource_uri', resource_uri_value,
          'min_aal', 'aal1',
          'proof_at_grant_aal', context_data ->> 'aal',
          'capabilities', private.mcp_default_capabilities()
        ),
      'grant',
        jsonb_build_object(
          'id', grant_row.id,
          'expires_at', grant_row.expires_at,
          'lifetime', 'oauth_grant',
          'revocable', true
        ),
      'idempotent_replay', idempotent_replay
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.provision_failed',
      'mcp_provision_oauth_client',
      'failed',
      caller_user_id,
      client_id_value,
      caller_session_id,
      NULL,
      NULL,
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'oauth_client_provision_failed',
      'The OAuth client could not be provisioned.'
    );
END
$mcp_provision_oauth_client$;

NOTIFY pgrst, 'reload schema';
