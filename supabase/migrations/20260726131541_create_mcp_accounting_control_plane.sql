-- MCP accounting control plane.
--
-- This migration intentionally does not change the existing accounting data
-- model or introduce record_state. It adds a private authorization/operation
-- layer and a narrow public RPC facade. OAuth sessions are prevented from
-- using the legacy accounting tables/RPCs directly, while existing first-party
-- web sessions (which have no client_id claim) keep their current access.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regclass('auth.oauth_clients') IS NULL
    OR to_regclass('auth.sessions') IS NULL
    OR to_regclass('public.sistema_users') IS NULL
    OR to_regclass('public.accounting_accounts') IS NULL
    OR to_regclass('public.accounting_expenses') IS NULL
    OR to_regclass('public.accounting_expense_categories') IS NULL
    OR to_regclass('public.accounting_expense_subcategories') IS NULL
    OR to_regprocedure('public.sistema_is_admin(uuid)') IS NULL
  THEN
    RAISE EXCEPTION
      'MCP control plane prerequisites are missing; reconcile/apply the existing auth, sistema, and accounting schema first';
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $pgcrypto_preflight$
BEGIN
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL
    OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
  THEN
    RAISE EXCEPTION
      'pgcrypto must be installed in the extensions schema before MCP setup';
  END IF;
END
$pgcrypto_preflight$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA private
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.mcp_config (
  key TEXT PRIMARY KEY
    CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX mcp_config_updated_by_idx
  ON private.mcp_config(updated_by)
  WHERE updated_by IS NOT NULL;

CREATE TABLE private.mcp_capabilities (
  capability TEXT PRIMARY KEY
    CHECK (capability ~ '^[a-z][a-z0-9_.:-]{2,95}$'),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE private.mcp_client_policies (
  client_id UUID PRIMARY KEY
    REFERENCES auth.oauth_clients(id) ON DELETE RESTRICT,
  required_audience TEXT NOT NULL
    CHECK (
      char_length(required_audience) BETWEEN 8 AND 2048
      AND required_audience ~ '^https://'
    ),
  enabled BOOLEAN NOT NULL DEFAULT false,
  min_aal TEXT NOT NULL DEFAULT 'aal1'
    CHECK (min_aal IN ('aal1', 'aal2')),
  rate_limit_read_per_minute INTEGER NOT NULL DEFAULT 60
    CHECK (rate_limit_read_per_minute BETWEEN 1 AND 1000),
  rate_limit_write_per_minute INTEGER NOT NULL DEFAULT 10
    CHECK (rate_limit_write_per_minute BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX mcp_client_policies_created_by_idx
  ON private.mcp_client_policies(created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX mcp_client_policies_updated_by_idx
  ON private.mcp_client_policies(updated_by)
  WHERE updated_by IS NOT NULL;

CREATE TABLE private.mcp_client_capabilities (
  client_id UUID NOT NULL
    REFERENCES private.mcp_client_policies(client_id) ON DELETE CASCADE,
  capability TEXT NOT NULL
    REFERENCES private.mcp_capabilities(capability) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (client_id, capability)
);

CREATE INDEX mcp_client_capabilities_capability_idx
  ON private.mcp_client_capabilities(capability);

CREATE TABLE private.mcp_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL
    REFERENCES private.mcp_client_policies(client_id) ON DELETE RESTRICT,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (expires_at IS NULL OR expires_at > valid_from),
  CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR revoked_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX mcp_access_grants_one_unrevoked_per_user_client_idx
  ON private.mcp_access_grants(user_id, client_id)
  WHERE revoked_at IS NULL;
CREATE INDEX mcp_access_grants_client_idx
  ON private.mcp_access_grants(client_id);
CREATE INDEX mcp_access_grants_user_active_idx
  ON private.mcp_access_grants(user_id, client_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX mcp_access_grants_revoked_by_idx
  ON private.mcp_access_grants(revoked_by)
  WHERE revoked_by IS NOT NULL;
CREATE INDEX mcp_access_grants_created_by_idx
  ON private.mcp_access_grants(created_by)
  WHERE created_by IS NOT NULL;

CREATE TABLE private.mcp_access_grant_capabilities (
  grant_id UUID NOT NULL
    REFERENCES private.mcp_access_grants(id) ON DELETE CASCADE,
  capability TEXT NOT NULL
    REFERENCES private.mcp_capabilities(capability) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (grant_id, capability)
);

CREATE INDEX mcp_access_grant_capabilities_capability_idx
  ON private.mcp_access_grant_capabilities(capability);

CREATE TABLE private.mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL
    REFERENCES private.mcp_client_policies(client_id) ON DELETE RESTRICT,
  grant_id UUID NOT NULL
    REFERENCES private.mcp_access_grants(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  aal TEXT NOT NULL CHECK (aal IN ('aal1', 'aal2', 'aal3')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  CHECK (
    (revoked_at IS NULL AND revoke_reason IS NULL)
    OR revoked_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX mcp_connections_active_session_idx
  ON private.mcp_connections(user_id, client_id, session_id)
  WHERE revoked_at IS NULL;
CREATE INDEX mcp_connections_client_idx
  ON private.mcp_connections(client_id);
CREATE INDEX mcp_connections_grant_idx
  ON private.mcp_connections(grant_id);
CREATE INDEX mcp_connections_session_idx
  ON private.mcp_connections(session_id);

CREATE TABLE private.mcp_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID NOT NULL
    REFERENCES private.mcp_client_policies(client_id) ON DELETE RESTRICT,
  session_id UUID NOT NULL,
  grant_id UUID NOT NULL
    REFERENCES private.mcp_access_grants(id) ON DELETE RESTRICT,
  operation_type TEXT NOT NULL
    CHECK (operation_type IN ('accounting.create_expense')),
  capability TEXT NOT NULL
    REFERENCES private.mcp_capabilities(capability) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL
    CHECK (
      idempotency_key
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
  normalized_payload JSONB NOT NULL
    CHECK (jsonb_typeof(normalized_payload) = 'object'),
  payload_hash TEXT NOT NULL
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  risk_level SMALLINT NOT NULL CHECK (risk_level BETWEEN 1 AND 3),
  risk_reasons JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(risk_reasons) = 'array'),
  status TEXT NOT NULL DEFAULT 'awaiting_approval'
    CHECK (
      status IN (
        'awaiting_approval', 'approved', 'committed', 'rejected',
        'expired', 'cancelled', 'failed'
      )
    ),
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  result JSONB,
  failure_code TEXT,
  CHECK (expires_at > prepared_at),
  CHECK ((status <> 'approved') OR approved_at IS NOT NULL),
  CHECK ((status <> 'committed') OR (approved_at IS NOT NULL AND committed_at IS NOT NULL))
);

CREATE UNIQUE INDEX mcp_operations_idempotency_idx
  ON private.mcp_operations(
    user_id,
    client_id,
    operation_type,
    idempotency_key
  )
  WHERE status <> 'expired';
CREATE INDEX mcp_operations_user_status_idx
  ON private.mcp_operations(user_id, status, prepared_at DESC);
CREATE INDEX mcp_operations_client_status_idx
  ON private.mcp_operations(client_id, status, prepared_at DESC);
CREATE INDEX mcp_operations_session_idx
  ON private.mcp_operations(session_id);
CREATE INDEX mcp_operations_grant_idx
  ON private.mcp_operations(grant_id);
CREATE INDEX mcp_operations_capability_idx
  ON private.mcp_operations(capability);
CREATE INDEX mcp_operations_expires_idx
  ON private.mcp_operations(expires_at)
  WHERE status IN ('awaiting_approval', 'approved');

CREATE TABLE private.mcp_approval_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL
    REFERENCES private.mcp_operations(id) ON DELETE RESTRICT,
  issued_to_user_id UUID NOT NULL,
  issued_session_id UUID NOT NULL,
  nonce_hash TEXT NOT NULL
    CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  CHECK (expires_at > issued_at),
  CHECK (used_at IS NULL OR invalidated_at IS NULL)
);

CREATE UNIQUE INDEX mcp_approval_challenges_nonce_hash_idx
  ON private.mcp_approval_challenges(nonce_hash);
CREATE UNIQUE INDEX mcp_approval_challenges_one_live_per_operation_idx
  ON private.mcp_approval_challenges(operation_id)
  WHERE used_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX mcp_approval_challenges_operation_idx
  ON private.mcp_approval_challenges(operation_id);
CREATE INDEX mcp_approval_challenges_expiry_idx
  ON private.mcp_approval_challenges(expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE private.mcp_operation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE
    REFERENCES private.mcp_operations(id) ON DELETE RESTRICT,
  payload_hash TEXT NOT NULL
    CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  challenge_id UUID NOT NULL UNIQUE
    REFERENCES private.mcp_approval_challenges(id) ON DELETE RESTRICT,
  nonce_hash TEXT NOT NULL
    CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  challenge_issued_at TIMESTAMPTZ NOT NULL,
  challenge_expires_at TIMESTAMPTZ NOT NULL,
  approved_by UUID NOT NULL,
  approved_session_id UUID NOT NULL,
  approved_aal TEXT NOT NULL CHECK (approved_aal IN ('aal2', 'aal3')),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (approved_at <= challenge_expires_at)
);

CREATE INDEX mcp_operation_approvals_operation_idx
  ON private.mcp_operation_approvals(operation_id);
CREATE INDEX mcp_operation_approvals_approved_by_idx
  ON private.mcp_operation_approvals(approved_by, approved_at DESC);
CREATE INDEX mcp_operation_approvals_session_idx
  ON private.mcp_operation_approvals(approved_session_id);

CREATE TABLE private.mcp_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL
    CHECK (event_type ~ '^[a-z][a-z0-9_.:-]{2,95}$'),
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
  actor_user_id UUID,
  client_id UUID,
  session_id UUID,
  operation_id UUID,
  capability TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX mcp_audit_actor_created_idx
  ON private.mcp_audit_log(actor_user_id, created_at DESC);
CREATE INDEX mcp_audit_client_created_idx
  ON private.mcp_audit_log(client_id, created_at DESC);
CREATE INDEX mcp_audit_operation_idx
  ON private.mcp_audit_log(operation_id, created_at);
CREATE INDEX mcp_audit_outcome_created_idx
  ON private.mcp_audit_log(outcome, created_at DESC);

CREATE TABLE private.mcp_rate_budgets (
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  capability TEXT NOT NULL,
  rate_class TEXT NOT NULL CHECK (rate_class IN ('read', 'write')),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (
    user_id, client_id, capability, rate_class, window_started_at
  )
);

CREATE INDEX mcp_rate_budgets_expiry_idx
  ON private.mcp_rate_budgets(window_started_at);

INSERT INTO private.mcp_config(key, value, description)
VALUES
  ('enabled', 'false'::JSONB, 'Global MCP kill switch; enable only after staging validation.'),
  ('read_only', 'false'::JSONB, 'Emergency write kill switch; reads stay available.'),
  ('operation_ttl_seconds', '900'::JSONB, 'Prepared expense lifetime.'),
  ('approval_challenge_ttl_seconds', '300'::JSONB, 'One-time web approval challenge lifetime.'),
  ('expense_high_risk_ars', '"500000.00"'::JSONB, 'ARS threshold that raises an expense to risk level 3.'),
  ('expense_high_risk_usd', '"1000.00"'::JSONB, 'USD threshold that raises an expense to risk level 3.'),
  ('expense_backdate_days', '30'::JSONB, 'Backdating threshold that raises an expense to risk level 3.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO private.mcp_capabilities(capability, description)
VALUES
  ('accounting.read', 'Read the narrow MCP accounting projection.'),
  ('accounting.expense.write', 'Prepare and commit one approved accounting expense.')
ON CONFLICT (capability) DO NOTHING;

DO $rls$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'mcp_config',
    'mcp_capabilities',
    'mcp_client_policies',
    'mcp_client_capabilities',
    'mcp_access_grants',
    'mcp_access_grant_capabilities',
    'mcp_connections',
    'mcp_operations',
    'mcp_approval_challenges',
    'mcp_operation_approvals',
    'mcp_audit_log',
    'mcp_rate_budgets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL ON TABLE private.%I FROM PUBLIC, anon, authenticated, service_role',
      table_name
    );
  END LOOP;
END
$rls$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;

-- Existing first-party browser sessions do not carry client_id. Restrictive
-- policies preserve their current policies, but make direct Data API access
-- unavailable to OAuth/MCP tokens.
DO $accounting_oauth_fence$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'accounting_accounts',
    'accounting_expense_categories',
    'accounting_client_payments',
    'accounting_expenses',
    'accounting_expense_subcategories',
    'accounting_transfers',
    'accounting_future_investments',
    'accounting_balance_adjustments',
    'accounting_partner_contributions',
    'accounting_contribution_repayments',
    'accounting_counterparties'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format(
      'DROP POLICY IF EXISTS accounting_deny_oauth_direct_select ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY accounting_deny_oauth_direct_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS accounting_deny_oauth_direct_insert ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY accounting_deny_oauth_direct_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS accounting_deny_oauth_direct_update ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY accounting_deny_oauth_direct_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL) WITH CHECK (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS accounting_deny_oauth_direct_delete ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY accounting_deny_oauth_direct_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );
  END LOOP;
END
$accounting_oauth_fence$;

-- Convert every existing financial SECURITY DEFINER read/report function to
-- invoker semantics based on the catalog/body, instead of maintaining a
-- fragile hard-coded list. New mcp_* functions are created after this block.
DO $legacy_accounting_rpc_fence$
DECLARE
  function_signature REGPROCEDURE;
BEGIN
  FOR function_signature IN
    SELECT p.oid::REGPROCEDURE
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind = 'f'
      AND (
        p.proname LIKE 'get_accounting_%'
        OR p.proname LIKE 'get_expense_%'
        OR p.proname LIKE 'get_future_investment%'
        OR p.proname LIKE 'get_partner_contribution%'
        OR p.proname LIKE 'get_contribution%'
        OR p.proname IN (
          'get_account_movements',
          'get_unified_history',
          'get_history_summary'
        )
        OR p.prosrc ILIKE '%accounting_%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', function_signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', function_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
  END LOOP;
END
$legacy_accounting_rpc_fence$;

CREATE OR REPLACE FUNCTION private.mcp_prevent_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $mcp_prevent_append_only_mutation$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$mcp_prevent_append_only_mutation$;

CREATE TRIGGER mcp_operation_approvals_append_only
  BEFORE UPDATE OR DELETE ON private.mcp_operation_approvals
  FOR EACH ROW
  EXECUTE FUNCTION private.mcp_prevent_append_only_mutation();

CREATE TRIGGER mcp_audit_log_append_only
  BEFORE UPDATE OR DELETE ON private.mcp_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION private.mcp_prevent_append_only_mutation();

CREATE OR REPLACE FUNCTION private.mcp_ok(p_data JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_ok$
  SELECT jsonb_build_object(
    'ok', true,
    'data', COALESCE(p_data, 'null'::JSONB),
    'error', 'null'::JSONB
  );
$mcp_ok$;

CREATE OR REPLACE FUNCTION private.mcp_error(
  p_code TEXT,
  p_message TEXT,
  p_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_error$
  SELECT jsonb_build_object(
    'ok', false,
    'data', 'null'::JSONB,
    'error', jsonb_strip_nulls(
      jsonb_build_object(
        'code', p_code,
        'message', p_message,
        'details', p_details
      )
    )
  );
$mcp_error$;

CREATE OR REPLACE FUNCTION private.mcp_parse_uuid(p_value TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_parse_uuid$
BEGIN
  IF NULLIF(BTRIM(p_value), '') IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN p_value::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END
$mcp_parse_uuid$;

CREATE OR REPLACE FUNCTION private.mcp_encode_cursor(p_value JSONB)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_encode_cursor$
  SELECT RTRIM(
    TRANSLATE(
      REPLACE(
        REPLACE(
          encode(convert_to(p_value::TEXT, 'UTF8'), 'base64'),
          E'\n',
          ''
        ),
        E'\r',
        ''
      ),
      '+/',
      '-_'
    ),
    '='
  );
$mcp_encode_cursor$;

CREATE OR REPLACE FUNCTION private.mcp_decode_cursor(p_value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_decode_cursor$
DECLARE
  padding_length INTEGER;
  standard_base64 TEXT;
BEGIN
  IF p_value IS NULL
    OR char_length(p_value) NOT BETWEEN 1 AND 512
    OR p_value !~ '^[A-Za-z0-9_-]+$'
    OR char_length(p_value) % 4 = 1
  THEN
    RETURN NULL;
  END IF;

  padding_length := (4 - (char_length(p_value) % 4)) % 4;
  standard_base64 :=
    TRANSLATE(p_value, '-_', '+/')
    || repeat('=', padding_length);

  RETURN convert_from(decode(standard_base64, 'base64'), 'UTF8')::JSONB;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END
$mcp_decode_cursor$;

CREATE OR REPLACE FUNCTION private.mcp_aal_rank(p_aal TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_aal_rank$
  SELECT CASE p_aal
    WHEN 'aal3' THEN 3
    WHEN 'aal2' THEN 2
    WHEN 'aal1' THEN 1
    ELSE 0
  END;
$mcp_aal_rank$;

CREATE OR REPLACE FUNCTION private.mcp_jwt_has_audience(
  p_jwt JSONB,
  p_required_audience TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_jwt_has_audience$
  SELECT CASE jsonb_typeof(p_jwt -> 'aud')
    WHEN 'string' THEN (p_jwt ->> 'aud') = p_required_audience
    WHEN 'array' THEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_jwt -> 'aud') AS audience(value)
      WHERE audience.value = p_required_audience
    )
    ELSE false
  END;
$mcp_jwt_has_audience$;

CREATE OR REPLACE FUNCTION private.mcp_json_has_only_keys(
  p_value JSONB,
  p_allowed_keys TEXT[]
)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $mcp_json_has_only_keys$
  SELECT jsonb_typeof(p_value) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_value) AS supplied(key)
      WHERE NOT (supplied.key = ANY(p_allowed_keys))
    );
$mcp_json_has_only_keys$;

CREATE OR REPLACE FUNCTION private.mcp_config_integer(
  p_key TEXT,
  p_default INTEGER
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_config_integer$
  SELECT COALESCE(
    (
      SELECT (config.value #>> '{}')::INTEGER
      FROM private.mcp_config AS config
      WHERE config.key = p_key
    ),
    p_default
  );
$mcp_config_integer$;

CREATE OR REPLACE FUNCTION private.mcp_config_numeric(
  p_key TEXT,
  p_default NUMERIC
)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_config_numeric$
  SELECT COALESCE(
    (
      SELECT (config.value #>> '{}')::NUMERIC
      FROM private.mcp_config AS config
      WHERE config.key = p_key
    ),
    p_default
  );
$mcp_config_numeric$;

CREATE OR REPLACE FUNCTION private.mcp_audit_event(
  p_event_type TEXT,
  p_action TEXT,
  p_outcome TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_session_id UUID DEFAULT NULL,
  p_operation_id UUID DEFAULT NULL,
  p_capability TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_audit_event$
  INSERT INTO private.mcp_audit_log(
    event_type,
    action,
    outcome,
    actor_user_id,
    client_id,
    session_id,
    operation_id,
    capability,
    details
  )
  VALUES (
    p_event_type,
    p_action,
    p_outcome,
    p_actor_user_id,
    p_client_id,
    p_session_id,
    p_operation_id,
    p_capability,
    COALESCE(p_details, '{}'::JSONB)
  );
$mcp_audit_event$;

CREATE OR REPLACE FUNCTION private.mcp_authorize(
  p_capability TEXT,
  p_action TEXT,
  p_rate_class TEXT DEFAULT 'read',
  p_consume_rate BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_authorize$
DECLARE
  jwt_claims JSONB := COALESCE(auth.jwt(), '{}'::JSONB);
  caller_user_id UUID := auth.uid();
  caller_client_id UUID;
  caller_session_id UUID;
  caller_aal TEXT := COALESCE(jwt_claims ->> 'aal', '');
  client_policy private.mcp_client_policies%ROWTYPE;
  active_grant private.mcp_access_grants%ROWTYPE;
  rate_limit INTEGER;
  rate_count INTEGER;
  rate_window TIMESTAMPTZ := date_trunc('minute', clock_timestamp());
BEGIN
  IF COALESCE(
    (
      SELECT (config.value #>> '{}')::BOOLEAN
      FROM private.mcp_config AS config
      WHERE config.key = 'enabled'
    ),
    false
  ) IS NOT TRUE THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      NULL,
      NULL,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'kill_switch')
    );
    RETURN private.mcp_error('mcp_disabled', 'MCP access is disabled.');
  END IF;

  IF caller_user_id IS NULL THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      NULL,
      NULL,
      NULL,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'missing_user')
    );
    RETURN private.mcp_error('unauthenticated', 'A valid user JWT is required.');
  END IF;

  IF p_rate_class = 'write'
    AND COALESCE(
      (
        SELECT (config.value #>> '{}')::BOOLEAN
        FROM private.mcp_config AS config
        WHERE config.key = 'read_only'
      ),
      false
    )
  THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      NULL,
      private.mcp_parse_uuid(jwt_claims ->> 'session_id'),
      NULL,
      p_capability,
      jsonb_build_object('reason', 'read_only_kill_switch')
    );
    RETURN private.mcp_error(
      'mcp_read_only',
      'MCP write operations are temporarily disabled.'
    );
  END IF;

  caller_client_id := private.mcp_parse_uuid(jwt_claims ->> 'client_id');
  caller_session_id := private.mcp_parse_uuid(jwt_claims ->> 'session_id');

  IF caller_client_id IS NULL THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      NULL,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'missing_or_invalid_client_id')
    );
    RETURN private.mcp_error(
      'invalid_client',
      'An OAuth token with a valid client_id claim is required.'
    );
  END IF;

  IF caller_session_id IS NULL THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      caller_client_id,
      NULL,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'missing_or_invalid_session_id')
    );
    RETURN private.mcp_error(
      'invalid_session',
      'A valid session_id claim is required.'
    );
  END IF;

  SELECT policy.*
  INTO client_policy
  FROM private.mcp_client_policies AS policy
  JOIN auth.oauth_clients AS oauth_client
    ON oauth_client.id = policy.client_id
   AND oauth_client.deleted_at IS NULL
  WHERE policy.client_id = caller_client_id
    AND policy.enabled;

  IF NOT FOUND THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      caller_client_id,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'client_not_allowed')
    );
    RETURN private.mcp_error('client_not_allowed', 'This OAuth client is not allowed.');
  END IF;

  IF NOT private.mcp_jwt_has_audience(
    jwt_claims,
    client_policy.required_audience
  ) THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      caller_client_id,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'audience_mismatch')
    );
    RETURN private.mcp_error('invalid_audience', 'The token audience is invalid.');
  END IF;

  IF private.mcp_aal_rank(caller_aal)
    < private.mcp_aal_rank(client_policy.min_aal)
  THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      caller_client_id,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object(
        'reason', 'aal_too_low',
        'required_aal', client_policy.min_aal
      )
    );
    RETURN private.mcp_error(
      'insufficient_aal',
      'The token authentication assurance level is too low.',
      jsonb_build_object('required_aal', client_policy.min_aal)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS session
    WHERE session.id = caller_session_id
      AND session.user_id = caller_user_id
      AND session.oauth_client_id = caller_client_id
      AND (session.not_after IS NULL OR session.not_after > clock_timestamp())
  ) THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      caller_client_id,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'inactive_session')
    );
    RETURN private.mcp_error(
      'invalid_session',
      'The OAuth session is no longer active.'
    );
  END IF;

  IF NOT public.sistema_is_admin(caller_user_id) THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      caller_client_id,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'not_accounting_admin')
    );
    RETURN private.mcp_error(
      'forbidden',
      'The current user is not an accounting administrator.'
    );
  END IF;

  SELECT grant_row.*
  INTO active_grant
  FROM private.mcp_access_grants AS grant_row
  WHERE grant_row.user_id = caller_user_id
    AND grant_row.client_id = caller_client_id
    AND grant_row.revoked_at IS NULL
    AND grant_row.valid_from <= clock_timestamp()
    AND (
      grant_row.expires_at IS NULL
      OR grant_row.expires_at > clock_timestamp()
    )
    AND EXISTS (
      SELECT 1
      FROM private.mcp_access_grant_capabilities AS grant_capability
      WHERE grant_capability.grant_id = grant_row.id
        AND grant_capability.capability = p_capability
    )
    AND EXISTS (
      SELECT 1
      FROM private.mcp_client_capabilities AS client_capability
      WHERE client_capability.client_id = grant_row.client_id
        AND client_capability.capability = p_capability
    )
  ORDER BY grant_row.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM private.mcp_audit_event(
      'authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      caller_client_id,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object('reason', 'missing_capability_grant')
    );
    RETURN private.mcp_error(
      'missing_capability',
      'The user/client grant does not include the required capability.',
      jsonb_build_object('required_capability', p_capability)
    );
  END IF;

  IF p_rate_class NOT IN ('read', 'write') THEN
    RETURN private.mcp_error('server_configuration_error', 'Invalid rate class.');
  END IF;

  rate_limit := CASE p_rate_class
    WHEN 'write' THEN client_policy.rate_limit_write_per_minute
    ELSE client_policy.rate_limit_read_per_minute
  END;

  IF p_consume_rate THEN
    INSERT INTO private.mcp_rate_budgets(
    user_id,
    client_id,
    capability,
    rate_class,
    window_started_at,
    request_count
  )
  VALUES (
    caller_user_id,
    caller_client_id,
    p_capability,
    p_rate_class,
    rate_window,
    1
  )
  ON CONFLICT (
    user_id,
    client_id,
    capability,
    rate_class,
    window_started_at
  )
  DO UPDATE SET
    request_count = private.mcp_rate_budgets.request_count + 1,
    updated_at = clock_timestamp()
  WHERE private.mcp_rate_budgets.request_count < rate_limit
    RETURNING request_count INTO rate_count;

    IF rate_count IS NULL THEN
      PERFORM private.mcp_audit_event(
        'rate_limit.denied',
        p_action,
        'denied',
        caller_user_id,
        caller_client_id,
        caller_session_id,
        NULL,
        p_capability,
        jsonb_build_object(
          'rate_class', p_rate_class,
          'limit', rate_limit,
          'window_started_at', rate_window
        )
      );
      RETURN private.mcp_error(
        'rate_limit_exceeded',
        'The atomic request budget for this capability is exhausted.',
        jsonb_build_object('retry_after_seconds', 60)
      );
    END IF;
  ELSE
    rate_count := 0;
  END IF;

  INSERT INTO private.mcp_connections(
    user_id,
    client_id,
    grant_id,
    session_id,
    audience,
    aal
  )
  VALUES (
    caller_user_id,
    caller_client_id,
    active_grant.id,
    caller_session_id,
    client_policy.required_audience,
    caller_aal
  )
  ON CONFLICT (user_id, client_id, session_id)
    WHERE revoked_at IS NULL
  DO UPDATE SET
    grant_id = EXCLUDED.grant_id,
    audience = EXCLUDED.audience,
    aal = EXCLUDED.aal,
    last_seen_at = clock_timestamp();

  RETURN private.mcp_ok(
    jsonb_build_object(
      'user_id', caller_user_id,
      'client_id', caller_client_id,
      'session_id', caller_session_id,
      'grant_id', active_grant.id,
      'grant_expires_at', active_grant.expires_at,
      'audience', client_policy.required_audience,
      'aal', caller_aal,
      'capability', p_capability,
      'rate_limit', rate_limit,
      'rate_remaining', CASE
        WHEN p_consume_rate THEN GREATEST(rate_limit - rate_count, 0)
        ELSE rate_limit
      END,
      'read_only', COALESCE(
        (
          SELECT (config.value #>> '{}')::BOOLEAN
          FROM private.mcp_config AS config
          WHERE config.key = 'read_only'
        ),
        false
      )
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM private.mcp_audit_event(
      'authorization.failed',
      p_action,
      'failed',
      caller_user_id,
      caller_client_id,
      caller_session_id,
      NULL,
      p_capability,
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'authorization_failed',
      'Authorization could not be completed.'
    );
END
$mcp_authorize$;

CREATE OR REPLACE FUNCTION private.mcp_authorize_web(
  p_action TEXT,
  p_require_aal2 BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_authorize_web$
DECLARE
  jwt_claims JSONB := COALESCE(auth.jwt(), '{}'::JSONB);
  caller_user_id UUID := auth.uid();
  caller_session_id UUID;
  caller_aal TEXT := COALESCE(jwt_claims ->> 'aal', '');
BEGIN
  IF caller_user_id IS NULL THEN
    RETURN private.mcp_error('unauthenticated', 'A valid web user JWT is required.');
  END IF;

  IF NULLIF(jwt_claims ->> 'client_id', '') IS NOT NULL THEN
    PERFORM private.mcp_audit_event(
      'web_authorization.denied',
      p_action,
      'denied',
      caller_user_id,
      private.mcp_parse_uuid(jwt_claims ->> 'client_id'),
      private.mcp_parse_uuid(jwt_claims ->> 'session_id'),
      NULL,
      NULL,
      jsonb_build_object('reason', 'oauth_client_token')
    );
    RETURN private.mcp_error(
      'human_approval_required',
      'This action is only available from a direct first-party web session.'
    );
  END IF;

  caller_session_id := private.mcp_parse_uuid(jwt_claims ->> 'session_id');
  IF caller_session_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS session
    WHERE session.id = caller_session_id
      AND session.user_id = caller_user_id
      AND session.oauth_client_id IS NULL
      AND (session.not_after IS NULL OR session.not_after > clock_timestamp())
  ) THEN
    RETURN private.mcp_error('invalid_session', 'The web session is no longer active.');
  END IF;

  IF NOT public.sistema_is_admin(caller_user_id) THEN
    RETURN private.mcp_error(
      'forbidden',
      'The current user is not an accounting administrator.'
    );
  END IF;

  IF p_require_aal2 AND private.mcp_aal_rank(caller_aal) < 2 THEN
    RETURN private.mcp_error(
      'aal2_required',
      'AAL2 reauthentication is required.',
      jsonb_build_object('required_aal', 'aal2')
    );
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'user_id', caller_user_id,
      'session_id', caller_session_id,
      'aal', caller_aal,
      'direct_web_session', true
    )
  );
END
$mcp_authorize_web$;

CREATE OR REPLACE FUNCTION private.mcp_operation_response(
  p_operation_id UUID
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_operation_response$
  SELECT jsonb_build_object(
    'operation',
    jsonb_strip_nulls(
      jsonb_build_object(
        'id', operation.id,
        'status', operation.status,
        'operation_type', operation.operation_type,
        'payload', operation.normalized_payload,
        'payload_hash', operation.payload_hash,
        'idempotency_key', operation.idempotency_key,
        'risk_level', operation.risk_level,
        'risk_reasons', operation.risk_reasons,
        'prepared_at', operation.prepared_at,
        'expires_at', operation.expires_at,
        'approved_at', operation.approved_at,
        'committed_at', operation.committed_at,
        'result', operation.result,
        'failure_code', operation.failure_code
      )
    ),
    'approval',
    jsonb_build_object(
      'required', true,
      'status', CASE
        WHEN approval.id IS NOT NULL THEN 'approved'
        WHEN operation.status = 'expired' THEN 'expired'
        WHEN operation.status = 'rejected' THEN 'rejected'
        ELSE 'pending'
      END,
      'aal_required', 'aal2',
      'requires_aal2', true,
      'id', approval.id,
      'approved_by', approval.approved_by,
      'approved_session_id', approval.approved_session_id,
      'approved_aal', approval.approved_aal,
      'approved_at', approval.approved_at
    )
  )
  FROM private.mcp_operations AS operation
  LEFT JOIN private.mcp_operation_approvals AS approval
    ON approval.operation_id = operation.id
  WHERE operation.id = p_operation_id;
$mcp_operation_response$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_get_context(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_get_context$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  capability_list JSONB;
BEGIN
  IF NOT private.mcp_json_has_only_keys(
    COALESCE(p_request, '{}'::JSONB),
    ARRAY[]::TEXT[]
  ) THEN
    RETURN private.mcp_error(
      'invalid_request',
      'mcp_get_context does not accept request fields.'
    );
  END IF;

  authorization_result := private.mcp_authorize(
    'accounting.read',
    'mcp_get_context',
    'read',
    false
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;

  context_data := authorization_result -> 'data';

  SELECT COALESCE(
    jsonb_agg(grant_capability.capability ORDER BY grant_capability.capability),
    '[]'::JSONB
  )
  INTO capability_list
  FROM private.mcp_access_grant_capabilities AS grant_capability
  JOIN private.mcp_client_capabilities AS client_capability
    ON client_capability.client_id =
      (context_data ->> 'client_id')::UUID
   AND client_capability.capability = grant_capability.capability
  WHERE grant_capability.grant_id =
    (context_data ->> 'grant_id')::UUID;

  PERFORM private.mcp_audit_event(
    'context.read',
    'mcp_get_context',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'accounting.read',
    jsonb_build_object('capability_count', jsonb_array_length(capability_list))
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'user_id', context_data ->> 'user_id',
      'client_id', context_data ->> 'client_id',
      'session_id', context_data ->> 'session_id',
      'audience', context_data ->> 'audience',
      'aal', context_data ->> 'aal',
      'capabilities', capability_list,
      'read_only',
        COALESCE((context_data ->> 'read_only')::BOOLEAN, false)
        OR NOT (capability_list ? 'accounting.expense.write'),
      'grant_expires_at', context_data -> 'grant_expires_at',
      'rate_limit', context_data -> 'rate_limit',
      'rate_remaining', context_data -> 'rate_remaining'
    )
  );
END
$mcp_get_context$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_list_accounts(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_list_accounts$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  active_only BOOLEAN := true;
  page_size INTEGER := 50;
  currency_filter TEXT;
  cursor_text TEXT;
  cursor_value JSONB;
  cursor_is_default BOOLEAN;
  cursor_name TEXT;
  cursor_id UUID;
  fetched_count INTEGER;
  account_list JSONB;
  next_cursor_value JSONB;
  next_cursor_text TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['active_only', 'page_size', 'currency', 'cursor']
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Only active_only, page_size, currency, and cursor are accepted.'
    );
  END IF;

  IF p_request ? 'active_only' THEN
    IF jsonb_typeof(p_request -> 'active_only') <> 'boolean' THEN
      RETURN private.mcp_error(
        'invalid_request',
        'active_only must be a boolean.'
      );
    END IF;
    active_only := (p_request ->> 'active_only')::BOOLEAN;
  END IF;

  IF p_request ? 'page_size' THEN
    IF jsonb_typeof(p_request -> 'page_size') <> 'number'
      OR (p_request ->> 'page_size') !~ '^[0-9]+$'
    THEN
      RETURN private.mcp_error(
        'invalid_page_size',
        'page_size must be an integer.'
      );
    END IF;
    page_size := (p_request ->> 'page_size')::INTEGER;
  END IF;
  IF page_size NOT BETWEEN 1 AND 100 THEN
    RETURN private.mcp_error(
      'invalid_page_size',
      'page_size must be between 1 and 100.'
    );
  END IF;

  IF p_request ? 'currency' THEN
    IF jsonb_typeof(p_request -> 'currency') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_currency',
        'currency must be a string.'
      );
    END IF;
    currency_filter := UPPER(p_request ->> 'currency');
    IF currency_filter NOT IN ('ARS', 'USD') THEN
      RETURN private.mcp_error(
        'invalid_currency',
        'currency must be ARS or USD.'
      );
    END IF;
  END IF;

  IF p_request ? 'cursor' AND jsonb_typeof(p_request -> 'cursor') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'cursor') <> 'string' THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor must be a string.');
    END IF;
    cursor_text := p_request ->> 'cursor';
    cursor_value := private.mcp_decode_cursor(cursor_text);
    IF cursor_value IS NULL
      OR jsonb_typeof(cursor_value) <> 'object'
      OR NOT private.mcp_json_has_only_keys(
        cursor_value,
        ARRAY['is_default', 'name', 'id']
      )
      OR NOT (
        cursor_value ? 'is_default'
        AND cursor_value ? 'name'
        AND cursor_value ? 'id'
      )
      OR jsonb_typeof(cursor_value -> 'is_default') <> 'boolean'
      OR jsonb_typeof(cursor_value -> 'name') <> 'string'
    THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
    END IF;
    cursor_is_default := (cursor_value ->> 'is_default')::BOOLEAN;
    cursor_name := cursor_value ->> 'name';
    cursor_id := private.mcp_parse_uuid(cursor_value ->> 'id');
    IF cursor_id IS NULL THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor is malformed.');
    END IF;
  END IF;

  authorization_result := private.mcp_authorize(
    'accounting.read',
    'mcp_accounting_list_accounts',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  WITH account_balances AS (
    SELECT
      account.id,
      account.name,
      account.type,
      account.currency,
      COALESCE(account.initial_balance, 0) AS initial_balance,
      COALESCE(account.initial_balance, 0)
      + COALESCE(
        (
          SELECT SUM(payment.amount)
          FROM public.accounting_client_payments AS payment
          WHERE payment.account_id = account.id
            AND payment.status = 'paid'
        ),
        0
      )
      - COALESCE(
        (
          SELECT SUM(expense.amount)
          FROM public.accounting_expenses AS expense
          WHERE expense.account_id = account.id
            AND expense.date <= CURRENT_DATE
        ),
        0
      )
      + COALESCE(
        (
          SELECT SUM(
            COALESCE(
              transfer.destination_amount,
              public.accounting_transfer_received_amount(
                transfer.amount,
                transfer.exchange_rate,
                transfer.commission,
                transfer.tax,
                account.currency
              )
            )
          )
          FROM public.accounting_transfers AS transfer
          WHERE transfer.to_account_id = account.id
        ),
        0
      )
      - COALESCE(
        (
          SELECT SUM(COALESCE(transfer.source_amount, transfer.amount))
          FROM public.accounting_transfers AS transfer
          WHERE transfer.from_account_id = account.id
        ),
        0
      )
      + COALESCE(
        (
          SELECT SUM(adjustment.adjustment_amount)
          FROM public.accounting_balance_adjustments AS adjustment
          WHERE adjustment.account_id = account.id
        ),
        0
      )
      + COALESCE(
        (
          SELECT SUM(contribution.amount)
          FROM public.accounting_partner_contributions AS contribution
          WHERE contribution.account_id = account.id
        ),
        0
      )
      - COALESCE(
        (
          SELECT SUM(repayment.amount)
          FROM public.accounting_contribution_repayments AS repayment
          WHERE repayment.account_id = account.id
        ),
        0
      ) AS current_balance,
      account.icon,
      account.color,
      account.is_default,
      account.is_active,
      account.created_at
    FROM public.accounting_accounts AS account
    WHERE (NOT active_only OR account.is_active)
      AND (currency_filter IS NULL OR account.currency = currency_filter)
      AND (
        cursor_id IS NULL
        OR account.is_default < cursor_is_default
        OR (
          account.is_default = cursor_is_default
          AND account.name > cursor_name
        )
        OR (
          account.is_default = cursor_is_default
          AND account.name = cursor_name
          AND account.id > cursor_id
        )
      )
  ),
  page AS (
    SELECT *
    FROM account_balances
    ORDER BY is_default DESC, name, id
    LIMIT page_size + 1
  ),
  numbered AS (
    SELECT
      page.*,
      row_number() OVER (ORDER BY is_default DESC, name, id) AS row_number
    FROM page
  )
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', numbered.id,
          'name', numbered.name,
          'type', numbered.type,
          'currency', numbered.currency,
          'initial_balance',
            to_char(numbered.initial_balance, 'FM9999999999999990.00'),
          'current_balance',
            to_char(numbered.current_balance, 'FM9999999999999990.00'),
          'icon', numbered.icon,
          'color', numbered.color,
          'is_default', numbered.is_default,
          'is_active', numbered.is_active,
          'created_at', numbered.created_at
        )
        ORDER BY numbered.is_default DESC, numbered.name, numbered.id
      ) FILTER (WHERE numbered.row_number <= page_size),
      '[]'::JSONB
    ),
    (
      jsonb_agg(
        jsonb_build_object(
          'is_default', numbered.is_default,
          'name', numbered.name,
          'id', numbered.id
        )
      ) FILTER (WHERE numbered.row_number = page_size)
    ) -> 0
  INTO fetched_count, account_list, next_cursor_value
  FROM numbered;

  IF fetched_count > page_size THEN
    next_cursor_text := private.mcp_encode_cursor(next_cursor_value);
  END IF;

  PERFORM private.mcp_audit_event(
    'accounting.accounts.listed',
    'mcp_accounting_list_accounts',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'accounting.read',
    jsonb_build_object(
      'result_count', jsonb_array_length(account_list),
      'has_more', fetched_count > page_size
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'items', account_list,
      'count', jsonb_array_length(account_list),
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
    RETURN private.mcp_error(
      'invalid_cursor',
      'cursor is malformed.'
    );
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'accounting_read_failed',
      'Accounts could not be read.'
    );
END
$mcp_accounting_list_accounts$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_list_expenses(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_list_expenses$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  page_limit INTEGER := 50;
  start_date_filter DATE;
  end_date_filter DATE;
  account_filter UUID;
  category_filter UUID;
  currency_filter TEXT;
  query_filter TEXT;
  cursor_text TEXT;
  cursor_value JSONB;
  cursor_date DATE;
  cursor_created_at TIMESTAMPTZ;
  cursor_id UUID;
  result_count INTEGER;
  result_items JSONB;
  next_cursor_value JSONB;
  next_cursor_text TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY[
        'page_size',
        'cursor',
        'date_from',
        'date_to',
        'query',
        'account_id',
        'category_id',
        'currency'
      ]
    )
  THEN
    RETURN private.mcp_error('invalid_request', 'Unknown expense-list fields.');
  END IF;

  IF p_request ? 'page_size' THEN
    IF jsonb_typeof(p_request -> 'page_size') <> 'number'
      OR (p_request ->> 'page_size') !~ '^[0-9]+$'
    THEN
      RETURN private.mcp_error(
        'invalid_page_size',
        'page_size must be an integer.'
      );
    END IF;
    page_limit := (p_request ->> 'page_size')::INTEGER;
  END IF;

  IF page_limit NOT BETWEEN 1 AND 100 THEN
    RETURN private.mcp_error(
      'invalid_page_size',
      'page_size must be between 1 and 100.'
    );
  END IF;

  IF p_request ? 'date_from' THEN
    IF jsonb_typeof(p_request -> 'date_from') <> 'string'
      OR (p_request ->> 'date_from') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RETURN private.mcp_error(
        'invalid_date_from',
        'date_from must use YYYY-MM-DD.'
      );
    END IF;
    start_date_filter := (p_request ->> 'date_from')::DATE;
  END IF;

  IF p_request ? 'date_to' THEN
    IF jsonb_typeof(p_request -> 'date_to') <> 'string'
      OR (p_request ->> 'date_to') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RETURN private.mcp_error(
        'invalid_date_to',
        'date_to must use YYYY-MM-DD.'
      );
    END IF;
    end_date_filter := (p_request ->> 'date_to')::DATE;
  END IF;

  IF start_date_filter IS NOT NULL
    AND end_date_filter IS NOT NULL
    AND start_date_filter > end_date_filter
  THEN
    RETURN private.mcp_error(
      'invalid_date_range',
      'date_from must not be later than date_to.'
    );
  END IF;

  IF p_request ? 'query' THEN
    IF jsonb_typeof(p_request -> 'query') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_query',
        'query must be a string.'
      );
    END IF;
    query_filter := NULLIF(BTRIM(p_request ->> 'query'), '');
    IF query_filter IS NOT NULL AND char_length(query_filter) > 200 THEN
      RETURN private.mcp_error(
        'invalid_query',
        'query must not exceed 200 characters.'
      );
    END IF;
  END IF;

  IF p_request ? 'account_id' THEN
    IF jsonb_typeof(p_request -> 'account_id') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_account_id',
        'account_id must be a UUID string.'
      );
    END IF;
    account_filter := private.mcp_parse_uuid(p_request ->> 'account_id');
    IF account_filter IS NULL THEN
      RETURN private.mcp_error(
        'invalid_account_id',
        'account_id must be a UUID string.'
      );
    END IF;
  END IF;

  IF p_request ? 'category_id' THEN
    IF jsonb_typeof(p_request -> 'category_id') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_category_id',
        'category_id must be a UUID string.'
      );
    END IF;
    category_filter := private.mcp_parse_uuid(p_request ->> 'category_id');
    IF category_filter IS NULL THEN
      RETURN private.mcp_error(
        'invalid_category_id',
        'category_id must be a UUID string.'
      );
    END IF;
  END IF;

  IF p_request ? 'currency' THEN
    IF jsonb_typeof(p_request -> 'currency') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_currency',
        'currency must be a string.'
      );
    END IF;
    currency_filter := UPPER(p_request ->> 'currency');
    IF currency_filter NOT IN ('ARS', 'USD') THEN
      RETURN private.mcp_error(
        'invalid_currency',
        'currency must be ARS or USD.'
      );
    END IF;
  END IF;

  IF p_request ? 'cursor' AND jsonb_typeof(p_request -> 'cursor') <> 'null' THEN
    IF jsonb_typeof(p_request -> 'cursor') <> 'string' THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor must be a string.');
    END IF;
    cursor_text := p_request ->> 'cursor';
    cursor_value := private.mcp_decode_cursor(cursor_text);
    IF cursor_value IS NULL
      OR jsonb_typeof(cursor_value) <> 'object'
      OR NOT private.mcp_json_has_only_keys(
        cursor_value,
        ARRAY['date', 'created_at', 'id']
      )
      OR NOT (
        cursor_value ? 'date'
        AND cursor_value ? 'created_at'
        AND cursor_value ? 'id'
      )
      OR (cursor_value ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RETURN private.mcp_error(
        'invalid_cursor',
        'cursor is malformed.'
      );
    END IF;

    cursor_date := (cursor_value ->> 'date')::DATE;
    cursor_created_at := (cursor_value ->> 'created_at')::TIMESTAMPTZ;
    cursor_id := private.mcp_parse_uuid(cursor_value ->> 'id');
    IF cursor_id IS NULL THEN
      RETURN private.mcp_error('invalid_cursor', 'cursor.id must be a UUID.');
    END IF;
  END IF;

  authorization_result := private.mcp_authorize(
    'accounting.read',
    'mcp_accounting_list_expenses',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  WITH page AS (
    SELECT
      expense.id,
      expense.date,
      expense.created_at,
      expense.description,
      expense.amount,
      expense.currency,
      expense.provider,
      expense.notes,
      expense.receipt_url,
      expense.account_id,
      account.name AS account_name,
      expense.category_id,
      category.name AS category_name,
      expense.subcategory_id,
      subcategory.name AS subcategory_name,
      expense.counterparty_id,
      counterparty.name AS counterparty_name,
      expense.project_id,
      project.nombre AS project_name,
      expense.expense_type
    FROM public.accounting_expenses AS expense
    LEFT JOIN public.accounting_accounts AS account
      ON account.id = expense.account_id
    LEFT JOIN public.accounting_expense_categories AS category
      ON category.id = expense.category_id
    LEFT JOIN public.accounting_expense_subcategories AS subcategory
      ON subcategory.id = expense.subcategory_id
    LEFT JOIN public.accounting_counterparties AS counterparty
      ON counterparty.id = expense.counterparty_id
    LEFT JOIN public.sistema_projects AS project
      ON project.id = expense.project_id
    WHERE (start_date_filter IS NULL OR expense.date >= start_date_filter)
      AND (end_date_filter IS NULL OR expense.date <= end_date_filter)
      AND (account_filter IS NULL OR expense.account_id = account_filter)
      AND (category_filter IS NULL OR expense.category_id = category_filter)
      AND (currency_filter IS NULL OR expense.currency = currency_filter)
      AND (
        query_filter IS NULL
        OR expense.description ILIKE '%' || query_filter || '%'
        OR expense.provider ILIKE '%' || query_filter || '%'
        OR expense.notes ILIKE '%' || query_filter || '%'
        OR category.name ILIKE '%' || query_filter || '%'
        OR subcategory.name ILIKE '%' || query_filter || '%'
        OR counterparty.name ILIKE '%' || query_filter || '%'
        OR project.nombre ILIKE '%' || query_filter || '%'
      )
      AND (
        cursor_date IS NULL
        OR (expense.date, expense.created_at, expense.id)
          < (cursor_date, cursor_created_at, cursor_id)
      )
    ORDER BY expense.date DESC, expense.created_at DESC, expense.id DESC
    LIMIT page_limit + 1
  ),
  numbered AS (
    SELECT
      page.*,
      row_number() OVER (
        ORDER BY page.date DESC, page.created_at DESC, page.id DESC
      ) AS row_number
    FROM page
  )
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', numbered.id,
            'date', numbered.date,
            'description', numbered.description,
            'amount', to_char(numbered.amount, 'FM9999999990.00'),
            'currency', numbered.currency,
            'provider', numbered.provider,
            'notes', numbered.notes,
            'receipt_url', numbered.receipt_url,
            'account_id', numbered.account_id,
            'account_name', numbered.account_name,
            'category_id', numbered.category_id,
            'category_name', numbered.category_name,
            'subcategory_id', numbered.subcategory_id,
            'subcategory_name', numbered.subcategory_name,
            'counterparty_id', numbered.counterparty_id,
            'counterparty_name', numbered.counterparty_name,
            'project_id', numbered.project_id,
            'project_name', numbered.project_name,
            'expense_type', numbered.expense_type,
            'created_at', numbered.created_at
          )
        )
        ORDER BY numbered.date DESC, numbered.created_at DESC, numbered.id DESC
      ) FILTER (WHERE numbered.row_number <= page_limit),
      '[]'::JSONB
    ),
    (
      jsonb_agg(
        jsonb_build_object(
          'date', numbered.date,
          'created_at', numbered.created_at,
          'id', numbered.id
        )
      ) FILTER (WHERE numbered.row_number = page_limit)
    ) -> 0
  INTO result_count, result_items, next_cursor_value
  FROM numbered;

  IF result_count > page_limit THEN
    next_cursor_text := private.mcp_encode_cursor(next_cursor_value);
  END IF;

  PERFORM private.mcp_audit_event(
    'accounting.expenses.listed',
    'mcp_accounting_list_expenses',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'accounting.read',
    jsonb_build_object(
      'result_count', LEAST(result_count, page_limit),
      'has_more', result_count > page_limit
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'items', result_items,
      'count', LEAST(result_count, page_limit),
      'page_size', page_limit,
      'has_more', result_count > page_limit,
      'next_cursor', next_cursor_text
    )
  );
EXCEPTION
  WHEN invalid_datetime_format
    OR datetime_field_overflow
    OR invalid_text_representation
    OR invalid_parameter_value
    OR character_not_in_repertoire
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'A date, timestamp, UUID, or integer is malformed.'
    );
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'accounting_read_failed',
      'Expenses could not be read.'
    );
END
$mcp_accounting_list_expenses$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_prepare_expense(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_prepare_expense$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  expense_request JSONB;
  idempotency_key_value TEXT;
  idempotency_uuid_value UUID;
  expense_date DATE;
  description_value TEXT;
  amount_value NUMERIC(12, 2);
  currency_value TEXT;
  account_id_value UUID;
  account_query_value TEXT;
  category_id_value UUID;
  category_query_value TEXT;
  counterparty_id_value UUID;
  counterparty_query_value TEXT;
  project_id_value UUID;
  notes_value TEXT;
  normalized_payload_value JSONB;
  payload_hash_value TEXT;
  operation_id_value UUID;
  existing_operation private.mcp_operations%ROWTYPE;
  operation_ttl_seconds INTEGER;
  risk_level_value SMALLINT := 2;
  risk_reasons_value JSONB := '["financial_balance_change"]'::JSONB;
  high_risk_threshold NUMERIC;
  backdate_days INTEGER;
  match_count INTEGER;
  match_candidates JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'accounting.expense.write',
    'mcp_accounting_prepare_expense',
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
        'amount',
        'currency',
        'date',
        'account_id',
        'account_query',
        'description',
        'category_id',
        'category_query',
        'counterparty_id',
        'counterparty_query',
        'project_id',
        'notes',
        'idempotency_key'
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
      'Required flat fields are missing or unknown fields were supplied.'
    );
  END IF;

  IF jsonb_typeof(p_request -> 'idempotency_key') <> 'string' THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a string.'
    );
  END IF;
  idempotency_uuid_value :=
    private.mcp_parse_uuid(p_request ->> 'idempotency_key');
  IF idempotency_uuid_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_idempotency_key',
      'idempotency_key must be a UUID.'
    );
  END IF;
  idempotency_key_value := idempotency_uuid_value::TEXT;

  expense_request := p_request;
  IF jsonb_typeof(expense_request) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      expense_request,
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
        'notes'
      ]
    )
    OR NOT (
      expense_request ? 'date'
      AND expense_request ? 'description'
      AND expense_request ? 'amount'
      AND expense_request ? 'currency'
      AND (expense_request ? 'account_id' OR expense_request ? 'account_query')
    )
  THEN
    RETURN private.mcp_error(
      'invalid_expense',
      'date, description, amount, currency, and one account selector are required.'
    );
  END IF;

  IF jsonb_typeof(expense_request -> 'date') <> 'string'
    OR (expense_request ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN
    RETURN private.mcp_error('invalid_date', 'date must use YYYY-MM-DD.');
  END IF;
  expense_date := (expense_request ->> 'date')::DATE;

  IF jsonb_typeof(expense_request -> 'description') <> 'string' THEN
    RETURN private.mcp_error(
      'invalid_description',
      'description must be a string.'
    );
  END IF;
  description_value := BTRIM(expense_request ->> 'description');
  IF char_length(description_value) NOT BETWEEN 1 AND 500 THEN
    RETURN private.mcp_error(
      'invalid_description',
      'description must contain 1-500 characters.'
    );
  END IF;

  IF jsonb_typeof(expense_request -> 'amount') <> 'string'
    OR (expense_request ->> 'amount')
      !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$'
  THEN
    RETURN private.mcp_error(
      'invalid_amount',
      'amount must be a positive decimal string with exactly two decimals.'
    );
  END IF;
  amount_value := (expense_request ->> 'amount')::NUMERIC(12, 2);
  IF amount_value <= 0 THEN
    RETURN private.mcp_error('invalid_amount', 'amount must be greater than zero.');
  END IF;

  IF jsonb_typeof(expense_request -> 'currency') <> 'string' THEN
    RETURN private.mcp_error('invalid_currency', 'currency must be a string.');
  END IF;
  currency_value := UPPER(expense_request ->> 'currency');
  IF currency_value NOT IN ('ARS', 'USD') THEN
    RETURN private.mcp_error('invalid_currency', 'currency must be ARS or USD.');
  END IF;

  IF expense_request ? 'account_id' AND expense_request ? 'account_query' THEN
    RETURN private.mcp_error(
      'ambiguous_account_selector',
      'Supply account_id or account_query, not both.'
    );
  END IF;

  IF expense_request ? 'account_id' THEN
    IF jsonb_typeof(expense_request -> 'account_id') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_account_id',
        'account_id must be a UUID string.'
      );
    END IF;
    account_id_value :=
      private.mcp_parse_uuid(expense_request ->> 'account_id');
  ELSE
    IF jsonb_typeof(expense_request -> 'account_query') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_account_query',
        'account_query must be a string.'
      );
    END IF;
    account_query_value := BTRIM(expense_request ->> 'account_query');
    IF char_length(account_query_value) NOT BETWEEN 1 AND 200 THEN
      RETURN private.mcp_error(
        'invalid_account_query',
        'account_query must contain 1-200 characters.'
      );
    END IF;

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
        AND account.currency = currency_value
        AND account.name ILIKE '%' || account_query_value || '%'
      ORDER BY account.name, account.id
      LIMIT 6
    ) AS candidate;

    IF match_count = 0 THEN
      RETURN private.mcp_error(
        'account_not_found',
        'account_query did not match an active account.'
      );
    ELSIF match_count > 1 THEN
      RETURN private.mcp_error(
        'ambiguous_account_query',
        'account_query matched more than one account.',
        jsonb_build_object('candidates', match_candidates)
      );
    END IF;
    account_id_value := (match_candidates -> 0 ->> 'id')::UUID;
  END IF;

  IF account_id_value IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.accounting_accounts AS account
    WHERE account.id = account_id_value
      AND account.is_active
      AND account.currency = currency_value
  ) THEN
    RETURN private.mcp_error(
      'invalid_account',
      'The account must exist, be active, and use the expense currency.'
    );
  END IF;

  IF expense_request ? 'category_id' AND expense_request ? 'category_query' THEN
    RETURN private.mcp_error(
      'ambiguous_category_selector',
      'Supply category_id or category_query, not both.'
    );
  END IF;

  IF expense_request ? 'category_id'
    AND jsonb_typeof(expense_request -> 'category_id') <> 'null'
  THEN
    category_id_value :=
      private.mcp_parse_uuid(expense_request ->> 'category_id');
    IF category_id_value IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.accounting_expense_categories AS category
      WHERE category.id = category_id_value
    ) THEN
      RETURN private.mcp_error(
        'invalid_category',
        'category_id must identify an existing category.'
      );
    END IF;
  ELSIF expense_request ? 'category_query'
    AND jsonb_typeof(expense_request -> 'category_query') <> 'null'
  THEN
    IF jsonb_typeof(expense_request -> 'category_query') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_category_query',
        'category_query must be a string.'
      );
    END IF;
    category_query_value := BTRIM(expense_request ->> 'category_query');
    IF char_length(category_query_value) NOT BETWEEN 1 AND 200 THEN
      RETURN private.mcp_error(
        'invalid_category_query',
        'category_query must contain 1-200 characters.'
      );
    END IF;

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
      WHERE category.name ILIKE '%' || category_query_value || '%'
      ORDER BY category.name, category.id
      LIMIT 6
    ) AS candidate;

    IF match_count = 0 THEN
      RETURN private.mcp_error(
        'category_not_found',
        'category_query did not match a category.'
      );
    ELSIF match_count > 1 THEN
      RETURN private.mcp_error(
        'ambiguous_category_query',
        'category_query matched more than one category.',
        jsonb_build_object('candidates', match_candidates)
      );
    END IF;
    category_id_value := (match_candidates -> 0 ->> 'id')::UUID;
  END IF;

  IF expense_request ? 'counterparty_id'
    AND expense_request ? 'counterparty_query'
  THEN
    RETURN private.mcp_error(
      'ambiguous_counterparty_selector',
      'Supply counterparty_id or counterparty_query, not both.'
    );
  END IF;

  IF expense_request ? 'counterparty_id'
    AND jsonb_typeof(expense_request -> 'counterparty_id') <> 'null'
  THEN
    counterparty_id_value :=
      private.mcp_parse_uuid(expense_request ->> 'counterparty_id');
    IF counterparty_id_value IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.accounting_counterparties AS counterparty
      WHERE counterparty.id = counterparty_id_value
        AND counterparty.is_active
    ) THEN
      RETURN private.mcp_error(
        'invalid_counterparty',
        'counterparty_id must identify an active counterparty.'
      );
    END IF;
  ELSIF expense_request ? 'counterparty_query'
    AND jsonb_typeof(expense_request -> 'counterparty_query') <> 'null'
  THEN
    IF jsonb_typeof(expense_request -> 'counterparty_query') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_counterparty_query',
        'counterparty_query must be a string.'
      );
    END IF;
    counterparty_query_value :=
      BTRIM(expense_request ->> 'counterparty_query');
    IF char_length(counterparty_query_value) NOT BETWEEN 1 AND 200 THEN
      RETURN private.mcp_error(
        'invalid_counterparty_query',
        'counterparty_query must contain 1-200 characters.'
      );
    END IF;

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
        AND counterparty.name ILIKE '%' || counterparty_query_value || '%'
      ORDER BY counterparty.name, counterparty.id
      LIMIT 6
    ) AS candidate;

    IF match_count = 0 THEN
      RETURN private.mcp_error(
        'counterparty_not_found',
        'counterparty_query did not match an active counterparty.'
      );
    ELSIF match_count > 1 THEN
      RETURN private.mcp_error(
        'ambiguous_counterparty_query',
        'counterparty_query matched more than one counterparty.',
        jsonb_build_object('candidates', match_candidates)
      );
    END IF;
    counterparty_id_value := (match_candidates -> 0 ->> 'id')::UUID;
  END IF;

  IF expense_request ? 'project_id'
    AND jsonb_typeof(expense_request -> 'project_id') <> 'null'
  THEN
    project_id_value :=
      private.mcp_parse_uuid(expense_request ->> 'project_id');
    IF project_id_value IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.sistema_projects AS project
      WHERE project.id = project_id_value
    ) THEN
      RETURN private.mcp_error(
        'invalid_project',
        'project_id must identify an existing project.'
      );
    END IF;
  END IF;

  IF expense_request ? 'notes'
    AND jsonb_typeof(expense_request -> 'notes') <> 'null'
  THEN
    IF jsonb_typeof(expense_request -> 'notes') <> 'string' THEN
      RETURN private.mcp_error('invalid_notes', 'notes must be a string.');
    END IF;
    notes_value := NULLIF(BTRIM(expense_request ->> 'notes'), '');
    IF notes_value IS NOT NULL AND char_length(notes_value) > 2000 THEN
      RETURN private.mcp_error(
        'invalid_notes',
        'notes must not exceed 2000 characters.'
      );
    END IF;
  END IF;

  normalized_payload_value := jsonb_strip_nulls(
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
  payload_hash_value := encode(
    extensions.digest(
      convert_to(normalized_payload_value::TEXT, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  high_risk_threshold := CASE currency_value
    WHEN 'USD' THEN private.mcp_config_numeric(
      'expense_high_risk_usd',
      1000
    )
    ELSE private.mcp_config_numeric(
      'expense_high_risk_ars',
      500000
    )
  END;
  backdate_days := private.mcp_config_integer('expense_backdate_days', 30);

  IF amount_value >= high_risk_threshold THEN
    risk_level_value := 3;
    risk_reasons_value := risk_reasons_value
      || jsonb_build_array('high_amount');
  END IF;

  IF expense_date < CURRENT_DATE - backdate_days THEN
    risk_level_value := 3;
    risk_reasons_value := risk_reasons_value
      || jsonb_build_array('backdated');
  END IF;

  operation_ttl_seconds :=
    private.mcp_config_integer('operation_ttl_seconds', 900);

  UPDATE private.mcp_operations
  SET status = 'expired'
  WHERE user_id = (context_data ->> 'user_id')::UUID
    AND client_id = (context_data ->> 'client_id')::UUID
    AND operation_type = 'accounting.create_expense'
    AND idempotency_key = idempotency_key_value
    AND status IN ('awaiting_approval', 'approved')
    AND expires_at <= clock_timestamp();

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
    expires_at
  )
  VALUES (
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    (context_data ->> 'grant_id')::UUID,
    'accounting.create_expense',
    'accounting.expense.write',
    idempotency_key_value,
    normalized_payload_value,
    payload_hash_value,
    risk_level_value,
    risk_reasons_value,
    clock_timestamp() + make_interval(secs => operation_ttl_seconds)
  )
  ON CONFLICT (user_id, client_id, operation_type, idempotency_key)
    WHERE status <> 'expired'
  DO NOTHING
  RETURNING id INTO operation_id_value;

  IF operation_id_value IS NULL THEN
    SELECT operation.*
    INTO existing_operation
    FROM private.mcp_operations AS operation
    WHERE operation.user_id = (context_data ->> 'user_id')::UUID
      AND operation.client_id = (context_data ->> 'client_id')::UUID
      AND operation.operation_type = 'accounting.create_expense'
      AND operation.idempotency_key = idempotency_key_value
      AND operation.status <> 'expired'
    FOR UPDATE;

    IF existing_operation.payload_hash <> payload_hash_value THEN
      PERFORM private.mcp_audit_event(
        'accounting.expense.prepare_conflict',
        'mcp_accounting_prepare_expense',
        'denied',
        (context_data ->> 'user_id')::UUID,
        (context_data ->> 'client_id')::UUID,
        (context_data ->> 'session_id')::UUID,
        existing_operation.id,
        'accounting.expense.write',
        jsonb_build_object(
          'reason', 'idempotency_payload_mismatch',
          'idempotency_key', idempotency_key_value
        )
      );
      RETURN private.mcp_error(
        'idempotency_conflict',
        'The idempotency key already belongs to a different normalized payload.',
        jsonb_build_object('operation_id', existing_operation.id)
      );
    END IF;

    PERFORM private.mcp_audit_event(
      'accounting.expense.prepare_replayed',
      'mcp_accounting_prepare_expense',
      'success',
      (context_data ->> 'user_id')::UUID,
      (context_data ->> 'client_id')::UUID,
      (context_data ->> 'session_id')::UUID,
      existing_operation.id,
      'accounting.expense.write',
      jsonb_build_object('idempotency_key', idempotency_key_value)
    );
    RETURN private.mcp_ok(
      private.mcp_operation_response(existing_operation.id)
      || jsonb_build_object(
        'operation_id', existing_operation.id,
        'payload_hash', existing_operation.payload_hash,
        'idempotent_replay', true
      )
    );
  END IF;

  PERFORM private.mcp_audit_event(
    'accounting.expense.prepared',
    'mcp_accounting_prepare_expense',
    'success',
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    operation_id_value,
    'accounting.expense.write',
    jsonb_build_object(
      'payload_hash', payload_hash_value,
      'risk_level', risk_level_value,
      'idempotency_key', idempotency_key_value
    )
  );

  RETURN private.mcp_ok(
    private.mcp_operation_response(operation_id_value)
    || jsonb_build_object(
      'operation_id', operation_id_value,
      'payload_hash', payload_hash_value,
      'idempotent_replay', false
    )
  );
EXCEPTION
  WHEN invalid_datetime_format
    OR datetime_field_overflow
    OR invalid_text_representation
    OR numeric_value_out_of_range
  THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.prepare_failed',
      'mcp_accounting_prepare_expense',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      NULL,
      'accounting.expense.write',
      jsonb_build_object('reason', 'invalid_cast', 'sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'invalid_expense',
      'An expense field has an invalid value.'
    );
  WHEN OTHERS THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.prepare_failed',
      'mcp_accounting_prepare_expense',
      'failed',
      private.mcp_parse_uuid(context_data ->> 'user_id'),
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      private.mcp_parse_uuid(context_data ->> 'session_id'),
      operation_id_value,
      'accounting.expense.write',
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'expense_prepare_failed',
      'The expense could not be prepared.'
    );
END
$mcp_accounting_prepare_expense$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_get_operation(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_get_operation$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  caller_is_oauth BOOLEAN :=
    NULLIF(COALESCE(auth.jwt(), '{}'::JSONB) ->> 'client_id', '') IS NOT NULL;
  operation_id_value UUID;
  issue_challenge BOOLEAN := false;
  operation_row private.mcp_operations%ROWTYPE;
  response_data JSONB;
  raw_nonce TEXT;
  nonce_hash_value TEXT;
  challenge_id_value UUID;
  challenge_expires_at_value TIMESTAMPTZ;
  challenge_ttl_seconds INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['operation_id', 'issue_approval_challenge']
    )
    OR NOT (p_request ? 'operation_id')
    OR jsonb_typeof(p_request -> 'operation_id') <> 'string'
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'operation_id is required; only issue_approval_challenge is optional.'
    );
  END IF;

  operation_id_value :=
    private.mcp_parse_uuid(p_request ->> 'operation_id');
  IF operation_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_operation_id',
      'operation_id must be a UUID.'
    );
  END IF;

  IF p_request ? 'issue_approval_challenge' THEN
    IF jsonb_typeof(p_request -> 'issue_approval_challenge') <> 'boolean' THEN
      RETURN private.mcp_error(
        'invalid_request',
        'issue_approval_challenge must be a boolean.'
      );
    END IF;
    issue_challenge := (p_request ->> 'issue_approval_challenge')::BOOLEAN;
  END IF;

  IF caller_is_oauth THEN
    IF issue_challenge THEN
      RETURN private.mcp_error(
        'human_approval_required',
        'An OAuth/MCP token cannot issue an approval challenge.'
      );
    END IF;
    authorization_result := private.mcp_authorize(
      'accounting.expense.write',
      'mcp_accounting_get_operation',
      'read'
    );
  ELSE
    authorization_result := private.mcp_authorize_web(
      'mcp_accounting_get_operation',
      issue_challenge
    );
  END IF;

  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF issue_challenge THEN
    SELECT operation.*
    INTO operation_row
    FROM private.mcp_operations AS operation
    WHERE operation.id = operation_id_value
    FOR UPDATE;
  ELSE
    SELECT operation.*
    INTO operation_row
    FROM private.mcp_operations AS operation
    WHERE operation.id = operation_id_value;
  END IF;

  IF NOT FOUND
    OR operation_row.user_id <> (context_data ->> 'user_id')::UUID
    OR (
      caller_is_oauth
      AND operation_row.client_id <> (context_data ->> 'client_id')::UUID
    )
  THEN
    RETURN private.mcp_error('operation_not_found', 'The operation was not found.');
  END IF;

  IF operation_row.expires_at <= clock_timestamp()
    AND operation_row.status IN ('awaiting_approval', 'approved')
  THEN
    UPDATE private.mcp_operations
    SET status = 'expired'
    WHERE id = operation_row.id
    RETURNING * INTO operation_row;

    PERFORM private.mcp_audit_event(
      'accounting.expense.operation_expired',
      'mcp_accounting_get_operation',
      'success',
      operation_row.user_id,
      operation_row.client_id,
      (context_data ->> 'session_id')::UUID,
      operation_row.id,
      operation_row.capability,
      '{}'::JSONB
    );
  END IF;

  response_data := private.mcp_operation_response(operation_row.id);

  IF issue_challenge THEN
    IF operation_row.status <> 'awaiting_approval' THEN
      RETURN private.mcp_error(
        'operation_not_approvable',
        'Only an unexpired awaiting_approval operation can issue a challenge.',
        jsonb_build_object('status', operation_row.status)
      );
    END IF;

    UPDATE private.mcp_approval_challenges
    SET invalidated_at = clock_timestamp()
    WHERE operation_id = operation_row.id
      AND used_at IS NULL
      AND invalidated_at IS NULL;

    raw_nonce := encode(extensions.gen_random_bytes(32), 'hex');
    nonce_hash_value := encode(
      extensions.digest(convert_to(raw_nonce, 'UTF8'), 'sha256'),
      'hex'
    );
    challenge_ttl_seconds :=
      private.mcp_config_integer('approval_challenge_ttl_seconds', 300);
    challenge_expires_at_value :=
      LEAST(
        operation_row.expires_at,
        clock_timestamp() + make_interval(secs => challenge_ttl_seconds)
      );

    INSERT INTO private.mcp_approval_challenges(
      operation_id,
      issued_to_user_id,
      issued_session_id,
      nonce_hash,
      expires_at
    )
    VALUES (
      operation_row.id,
      (context_data ->> 'user_id')::UUID,
      (context_data ->> 'session_id')::UUID,
      nonce_hash_value,
      challenge_expires_at_value
    )
    RETURNING id INTO challenge_id_value;

    response_data := jsonb_set(
      response_data,
      '{approval}',
      (response_data -> 'approval')
        || jsonb_build_object(
          'challenge_nonce', raw_nonce,
          'challenge_expires_at', challenge_expires_at_value
        ),
      true
    );

    PERFORM private.mcp_audit_event(
      'accounting.expense.approval_challenge_issued',
      'mcp_accounting_get_operation',
      'success',
      operation_row.user_id,
      operation_row.client_id,
      (context_data ->> 'session_id')::UUID,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object(
        'challenge_id', challenge_id_value,
        'expires_at', challenge_expires_at_value,
        'aal', context_data ->> 'aal'
      )
    );
  END IF;

  RETURN private.mcp_ok(response_data);
END
$mcp_accounting_get_operation$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_approve_expense(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_approve_expense$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  operation_id_value UUID;
  raw_nonce TEXT;
  nonce_hash_value TEXT;
  operation_row private.mcp_operations%ROWTYPE;
  challenge_row private.mcp_approval_challenges%ROWTYPE;
  approval_id_value UUID;
  approved_at_value TIMESTAMPTZ;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['operation_id', 'approval_nonce']
    )
    OR NOT (p_request ? 'operation_id' AND p_request ? 'approval_nonce')
    OR jsonb_typeof(p_request -> 'operation_id') <> 'string'
    OR jsonb_typeof(p_request -> 'approval_nonce') <> 'string'
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'operation_id and approval_nonce string fields are required.'
    );
  END IF;

  operation_id_value :=
    private.mcp_parse_uuid(p_request ->> 'operation_id');
  raw_nonce := p_request ->> 'approval_nonce';

  IF operation_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_operation_id',
      'operation_id must be a UUID.'
    );
  END IF;
  IF raw_nonce !~ '^[0-9a-f]{64}$' THEN
    RETURN private.mcp_error(
      'invalid_approval_nonce',
      'approval_nonce is malformed.'
    );
  END IF;

  authorization_result := private.mcp_authorize_web(
    'mcp_accounting_approve_expense',
    true
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  SELECT operation.*
  INTO operation_row
  FROM private.mcp_operations AS operation
  WHERE operation.id = operation_id_value
  FOR UPDATE;

  IF NOT FOUND
    OR operation_row.user_id <> (context_data ->> 'user_id')::UUID
  THEN
    RETURN private.mcp_error('operation_not_found', 'The operation was not found.');
  END IF;

  IF operation_row.expires_at <= clock_timestamp() THEN
    UPDATE private.mcp_operations
    SET status = 'expired'
    WHERE id = operation_row.id
      AND status IN ('awaiting_approval', 'approved');
    RETURN private.mcp_error('operation_expired', 'The operation has expired.');
  END IF;

  IF operation_row.status <> 'awaiting_approval' THEN
    RETURN private.mcp_error(
      'operation_not_approvable',
      'The operation is not awaiting approval.',
      jsonb_build_object('status', operation_row.status)
    );
  END IF;

  IF operation_row.payload_hash <> encode(
    extensions.digest(
      convert_to(operation_row.normalized_payload::TEXT, 'UTF8'),
      'sha256'
    ),
    'hex'
  ) THEN
    UPDATE private.mcp_operations
    SET
      status = 'failed',
      failure_code = 'payload_hash_mismatch'
    WHERE id = operation_row.id;
    PERFORM private.mcp_audit_event(
      'accounting.expense.approval_failed',
      'mcp_accounting_approve_expense',
      'failed',
      operation_row.user_id,
      operation_row.client_id,
      (context_data ->> 'session_id')::UUID,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object('reason', 'payload_hash_mismatch')
    );
    RETURN private.mcp_error(
      'payload_tampered',
      'The normalized operation payload no longer matches its server hash.'
    );
  END IF;

  nonce_hash_value := encode(
    extensions.digest(convert_to(raw_nonce, 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT challenge.*
  INTO challenge_row
  FROM private.mcp_approval_challenges AS challenge
  WHERE challenge.operation_id = operation_row.id
    AND challenge.issued_to_user_id = (context_data ->> 'user_id')::UUID
    AND challenge.issued_session_id = (context_data ->> 'session_id')::UUID
    AND challenge.nonce_hash = nonce_hash_value
    AND challenge.used_at IS NULL
    AND challenge.invalidated_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.approval_denied',
      'mcp_accounting_approve_expense',
      'denied',
      operation_row.user_id,
      operation_row.client_id,
      (context_data ->> 'session_id')::UUID,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object('reason', 'challenge_not_found')
    );
    RETURN private.mcp_error(
      'invalid_approval_nonce',
      'The approval challenge is invalid, consumed, or belongs to another session.'
    );
  END IF;

  IF challenge_row.expires_at <= clock_timestamp() THEN
    UPDATE private.mcp_approval_challenges
    SET invalidated_at = clock_timestamp()
    WHERE id = challenge_row.id;
    RETURN private.mcp_error(
      'approval_challenge_expired',
      'The approval challenge has expired.'
    );
  END IF;

  approved_at_value := clock_timestamp();

  UPDATE private.mcp_approval_challenges
  SET used_at = approved_at_value
  WHERE id = challenge_row.id;

  INSERT INTO private.mcp_operation_approvals(
    operation_id,
    payload_hash,
    challenge_id,
    nonce_hash,
    challenge_issued_at,
    challenge_expires_at,
    approved_by,
    approved_session_id,
    approved_aal,
    approved_at
  )
  VALUES (
    operation_row.id,
    operation_row.payload_hash,
    challenge_row.id,
    challenge_row.nonce_hash,
    challenge_row.issued_at,
    challenge_row.expires_at,
    (context_data ->> 'user_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    context_data ->> 'aal',
    approved_at_value
  )
  RETURNING id INTO approval_id_value;

  UPDATE private.mcp_operations
  SET
    status = 'approved',
    approved_at = approved_at_value
  WHERE id = operation_row.id;

  PERFORM private.mcp_audit_event(
    'accounting.expense.approved',
    'mcp_accounting_approve_expense',
    'success',
    operation_row.user_id,
    operation_row.client_id,
    (context_data ->> 'session_id')::UUID,
    operation_row.id,
    operation_row.capability,
    jsonb_build_object(
      'approval_id', approval_id_value,
      'challenge_id', challenge_row.id,
      'approved_aal', context_data ->> 'aal',
      'payload_hash', operation_row.payload_hash
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'operation',
      jsonb_build_object(
        'id', operation_row.id,
        'status', 'approved',
        'risk_level', operation_row.risk_level,
        'approved_at', approved_at_value,
        'expires_at', operation_row.expires_at
      ),
      'approval',
      jsonb_build_object(
        'id', approval_id_value,
        'approved_by', context_data ->> 'user_id',
        'approved_session_id', context_data ->> 'session_id',
        'approved_aal', context_data ->> 'aal',
        'approved_at', approved_at_value
      )
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN private.mcp_error(
      'operation_already_approved',
      'The operation already has an approval.'
    );
END
$mcp_accounting_approve_expense$;

CREATE OR REPLACE FUNCTION public.mcp_accounting_commit_expense(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_accounting_commit_expense$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  operation_id_value UUID;
  operation_row private.mcp_operations%ROWTYPE;
  expense_id_value UUID;
  committed_at_value TIMESTAMPTZ;
  result_value JSONB;
BEGIN
  authorization_result := private.mcp_authorize(
    'accounting.expense.write',
    'mcp_accounting_commit_expense',
    'write'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['operation_id']
    )
    OR NOT (p_request ? 'operation_id')
    OR jsonb_typeof(p_request -> 'operation_id') <> 'string'
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'commit accepts exactly one operation_id string and no mutable payload.'
    );
  END IF;

  operation_id_value :=
    private.mcp_parse_uuid(p_request ->> 'operation_id');
  IF operation_id_value IS NULL THEN
    RETURN private.mcp_error(
      'invalid_operation_id',
      'operation_id must be a UUID.'
    );
  END IF;

  SELECT operation.*
  INTO operation_row
  FROM private.mcp_operations AS operation
  WHERE operation.id = operation_id_value
  FOR UPDATE;

  IF NOT FOUND
    OR operation_row.user_id <> (context_data ->> 'user_id')::UUID
    OR operation_row.client_id <> (context_data ->> 'client_id')::UUID
    OR operation_row.session_id <> (context_data ->> 'session_id')::UUID
    OR operation_row.grant_id <> (context_data ->> 'grant_id')::UUID
  THEN
    RETURN private.mcp_error('operation_not_found', 'The operation was not found.');
  END IF;

  IF operation_row.status = 'committed' THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.commit_replayed',
      'mcp_accounting_commit_expense',
      'success',
      operation_row.user_id,
      operation_row.client_id,
      operation_row.session_id,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object('idempotent_replay', true)
    );
    RETURN private.mcp_ok(
      jsonb_build_object(
        'operation_id', operation_row.id,
        'status', operation_row.status,
        'result', operation_row.result,
        'idempotent_replay', true
      )
    );
  END IF;

  IF operation_row.expires_at <= clock_timestamp() THEN
    UPDATE private.mcp_operations
    SET status = 'expired'
    WHERE id = operation_row.id
      AND status IN ('awaiting_approval', 'approved');
    RETURN private.mcp_error('operation_expired', 'The operation has expired.');
  END IF;

  IF operation_row.status <> 'approved' THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.commit_denied',
      'mcp_accounting_commit_expense',
      'denied',
      operation_row.user_id,
      operation_row.client_id,
      operation_row.session_id,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object(
        'reason', 'approval_required',
        'status', operation_row.status
      )
    );
    RETURN private.mcp_error(
      'approval_required',
      'The operation must have a separate human approval before commit.',
      jsonb_build_object('status', operation_row.status)
    );
  END IF;

  IF operation_row.payload_hash <> encode(
    extensions.digest(
      convert_to(operation_row.normalized_payload::TEXT, 'UTF8'),
      'sha256'
    ),
    'hex'
  ) THEN
    UPDATE private.mcp_operations
    SET
      status = 'failed',
      failure_code = 'payload_hash_mismatch'
    WHERE id = operation_row.id;
    PERFORM private.mcp_audit_event(
      'accounting.expense.commit_failed',
      'mcp_accounting_commit_expense',
      'failed',
      operation_row.user_id,
      operation_row.client_id,
      operation_row.session_id,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object('reason', 'payload_hash_mismatch')
    );
    RETURN private.mcp_error(
      'payload_tampered',
      'The normalized operation payload no longer matches its server hash.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.mcp_operation_approvals AS approval
    WHERE approval.operation_id = operation_row.id
      AND approval.payload_hash = operation_row.payload_hash
      AND approval.approved_by = operation_row.user_id
      AND approval.approved_at = operation_row.approved_at
      AND approval.approved_aal IN ('aal2', 'aal3')
  ) THEN
    RETURN private.mcp_error(
      'invalid_approval',
      'A matching append-only human approval was not found.'
    );
  END IF;

  IF NOT private.mcp_json_has_only_keys(
    operation_row.normalized_payload,
    ARRAY[
      'date',
      'description',
      'amount',
      'currency',
      'account_id',
      'category_id',
      'counterparty_id',
      'project_id',
      'notes'
    ]
  )
    OR NOT (
      operation_row.normalized_payload ? 'date'
      AND operation_row.normalized_payload ? 'description'
      AND operation_row.normalized_payload ? 'amount'
      AND operation_row.normalized_payload ? 'currency'
      AND operation_row.normalized_payload ? 'account_id'
    )
    OR (operation_row.normalized_payload ->> 'date')
      !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR (operation_row.normalized_payload ->> 'amount')
      !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$'
    OR (operation_row.normalized_payload ->> 'amount')::NUMERIC(12, 2) <= 0
  THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.commit_denied',
      'mcp_accounting_commit_expense',
      'denied',
      operation_row.user_id,
      operation_row.client_id,
      operation_row.session_id,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object('reason', 'invalid_canonical_payload')
    );
    RETURN private.mcp_error(
      'invalid_canonical_payload',
      'The approved normalized payload no longer satisfies the expense contract.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.accounting_accounts AS account
    WHERE account.id =
      (operation_row.normalized_payload ->> 'account_id')::UUID
      AND account.is_active
      AND account.currency =
        (operation_row.normalized_payload ->> 'currency')
  ) THEN
    PERFORM private.mcp_audit_event(
      'accounting.expense.commit_denied',
      'mcp_accounting_commit_expense',
      'denied',
      operation_row.user_id,
      operation_row.client_id,
      operation_row.session_id,
      operation_row.id,
      operation_row.capability,
      jsonb_build_object('reason', 'account_no_longer_eligible')
    );
    RETURN private.mcp_error(
      'account_no_longer_eligible',
      'The approved account is missing, inactive, or no longer matches the currency.'
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
      subcategory_id,
      counterparty_id,
      project_id,
      expense_type,
      provider,
      notes,
      created_by
    )
    VALUES (
      (operation_row.normalized_payload ->> 'date')::DATE,
      operation_row.normalized_payload ->> 'description',
      (operation_row.normalized_payload ->> 'amount')::NUMERIC(12, 2),
      operation_row.normalized_payload ->> 'currency',
      (operation_row.normalized_payload ->> 'account_id')::UUID,
      private.mcp_parse_uuid(operation_row.normalized_payload ->> 'category_id'),
      private.mcp_parse_uuid(operation_row.normalized_payload ->> 'subcategory_id'),
      private.mcp_parse_uuid(operation_row.normalized_payload ->> 'counterparty_id'),
      private.mcp_parse_uuid(operation_row.normalized_payload ->> 'project_id'),
      operation_row.normalized_payload ->> 'expense_type',
      operation_row.normalized_payload ->> 'provider',
      operation_row.normalized_payload ->> 'notes',
      operation_row.user_id
    )
    RETURNING id INTO expense_id_value;
  EXCEPTION
    WHEN OTHERS THEN
      UPDATE private.mcp_operations
      SET
        status = 'failed',
        failure_code = 'accounting_insert_failed'
      WHERE id = operation_row.id;
      PERFORM private.mcp_audit_event(
        'accounting.expense.commit_failed',
        'mcp_accounting_commit_expense',
        'failed',
        operation_row.user_id,
        operation_row.client_id,
        operation_row.session_id,
        operation_row.id,
        operation_row.capability,
        jsonb_build_object(
          'reason', 'accounting_insert_failed',
          'sqlstate', SQLSTATE
        )
      );
      RETURN private.mcp_error(
        'expense_commit_failed',
        'The approved expense could not be committed.'
      );
  END;

  committed_at_value := clock_timestamp();
  result_value := jsonb_build_object(
    'expense_id', expense_id_value,
    'date', operation_row.normalized_payload ->> 'date',
    'description', operation_row.normalized_payload ->> 'description',
    'amount', operation_row.normalized_payload ->> 'amount',
    'currency', operation_row.normalized_payload ->> 'currency',
    'account_id', operation_row.normalized_payload ->> 'account_id',
    'created_by', operation_row.user_id,
    'created_at', committed_at_value
  );

  UPDATE private.mcp_operations
  SET
    status = 'committed',
    committed_at = committed_at_value,
    result = result_value,
    failure_code = NULL
  WHERE id = operation_row.id;

  -- The financial write and its success audit are part of this same database
  -- transaction. Rejected/failed attempts return structured errors so their
  -- audit events are not rolled back by an exception.
  PERFORM private.mcp_audit_event(
    'accounting.expense.committed',
    'mcp_accounting_commit_expense',
    'success',
    operation_row.user_id,
    operation_row.client_id,
    operation_row.session_id,
    operation_row.id,
    operation_row.capability,
    jsonb_build_object(
      'expense_id', expense_id_value,
      'payload_hash', operation_row.payload_hash,
      'risk_level', operation_row.risk_level,
      'idempotency_key', operation_row.idempotency_key
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'operation_id', operation_row.id,
      'status', 'committed',
      'result', result_value,
      'idempotent_replay', false
    )
  );
END
$mcp_accounting_commit_expense$;

-- Cover historical creator foreign keys used by accounting/MCP joins.
CREATE INDEX accounting_expenses_created_by_idx
  ON public.accounting_expenses(created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX accounting_client_payments_created_by_idx
  ON public.accounting_client_payments(created_by)
  WHERE created_by IS NOT NULL;
CREATE INDEX accounting_transfers_created_by_idx
  ON public.accounting_transfers(created_by)
  WHERE created_by IS NOT NULL;

REVOKE EXECUTE ON FUNCTION public.mcp_get_context(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_list_accounts(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_list_expenses(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_prepare_expense(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_get_operation(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_approve_expense(JSONB)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_commit_expense(JSONB)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.mcp_get_context(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_list_accounts(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_list_expenses(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_prepare_expense(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_get_operation(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_approve_expense(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_commit_expense(JSONB)
  TO authenticated;

COMMENT ON SCHEMA private IS
  'Non-exposed Quepia control plane. Access only through narrow public RPCs.';
COMMENT ON TABLE private.mcp_access_grants IS
  'Revocable user/client grants. Grants are not bound to one session.';
COMMENT ON TABLE private.mcp_operation_approvals IS
  'Append-only human approval evidence; raw nonces are never persisted.';
COMMENT ON TABLE private.mcp_audit_log IS
  'Append-only MCP security and business audit stream.';
COMMENT ON FUNCTION public.mcp_accounting_commit_expense(JSONB) IS
  'Commits only the immutable normalized payload of a separately approved operation.';

NOTIFY pgrst, 'reload schema';
