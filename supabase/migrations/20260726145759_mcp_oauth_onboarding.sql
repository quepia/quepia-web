-- MCP OAuth onboarding and lifecycle facade.
--
-- This migration does not register an OAuth client or enable the Auth hook.
-- OAuth clients remain canonical in auth.oauth_clients and the hook must be
-- selected explicitly in Authentication > Hooks after staging validation.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regclass('auth.oauth_clients') IS NULL
    OR to_regclass('auth.sessions') IS NULL
    OR to_regclass('private.mcp_config') IS NULL
    OR to_regclass('private.mcp_client_policies') IS NULL
    OR to_regclass('private.mcp_client_capabilities') IS NULL
    OR to_regclass('private.mcp_access_grants') IS NULL
    OR to_regclass('private.mcp_access_grant_capabilities') IS NULL
    OR to_regclass('private.mcp_connections') IS NULL
    OR to_regclass('private.mcp_audit_log') IS NULL
    OR to_regprocedure('private.mcp_authorize_web(text,boolean)') IS NULL
    OR to_regprocedure('private.mcp_audit_event(text,text,text,uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
    OR to_regprocedure('private.mcp_json_has_only_keys(jsonb,text[])') IS NULL
    OR to_regprocedure('private.mcp_parse_uuid(text)') IS NULL
    OR to_regprocedure('private.mcp_ok(jsonb)') IS NULL
    OR to_regprocedure('private.mcp_error(text,text,jsonb)') IS NULL
    OR (
      SELECT COUNT(*) <> 4
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('public.sistema_users')
        AND attribute.attname IN (
          'role',
          'is_active',
          'deleted_at',
          'deleted_by'
        )
        AND NOT attribute.attisdropped
    )
  THEN
    RAISE EXCEPTION
      'MCP OAuth onboarding requires the MCP accounting control-plane migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_auth_admin'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'authenticator'
  ) THEN
    RAISE EXCEPTION
      'The Supabase database roles authenticator and supabase_auth_admin are required';
  END IF;
END
$preflight$;

DO $mcp_authenticated_role$
DECLARE
  role_record pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT role_state.*
  INTO role_record
  FROM pg_catalog.pg_roles AS role_state
  WHERE role_state.rolname = 'mcp_authenticated';

  IF NOT FOUND THEN
    CREATE ROLE mcp_authenticated
      NOLOGIN
      NOINHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  ELSIF role_record.rolcanlogin
    OR role_record.rolinherit
    OR role_record.rolsuper
    OR role_record.rolcreatedb
    OR role_record.rolcreaterole
    OR role_record.rolreplication
    OR role_record.rolbypassrls
  THEN
    RAISE EXCEPTION
      'Existing mcp_authenticated role has unsafe attributes';
  END IF;

  IF FOUND AND (
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = role_record.oid
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.roleid = role_record.oid
        AND membership.member <> (
          SELECT role_state.oid
          FROM pg_catalog.pg_roles AS role_state
          WHERE role_state.rolname = 'authenticator'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      WHERE relation.relowner = role_record.oid
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.proowner = role_record.oid
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_namespace AS namespace
      WHERE namespace.nspowner = role_record.oid
    )
  ) THEN
    RAISE EXCEPTION
      'Existing mcp_authenticated role has unsafe memberships or object ownership';
  END IF;
END
$mcp_authenticated_role$;

GRANT mcp_authenticated TO authenticator;
GRANT USAGE ON SCHEMA public TO mcp_authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM mcp_authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM mcp_authenticated;
REVOKE ALL ON SCHEMA private FROM mcp_authenticated;

DO $mcp_isolate_auxiliary_schemas$
DECLARE
  schema_name TEXT;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['storage', 'realtime']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_namespace
      WHERE nspname = schema_name
    ) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON SCHEMA %I FROM mcp_authenticated',
        schema_name
      );
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM mcp_authenticated',
        schema_name
      );
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM mcp_authenticated',
        schema_name
      );
    END IF;
  END LOOP;
END
$mcp_isolate_auxiliary_schemas$;

INSERT INTO private.mcp_config(key, value, description)
VALUES
  (
    'resource_uri',
    'null'::JSONB,
    'Required per-environment MCP protected-resource URI and OAuth access-token audience.'
  )
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.mcp_resource_uri()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_resource_uri$
  SELECT configured.value
  FROM (
    SELECT config.value #>> '{}' AS value
    FROM private.mcp_config AS config
    WHERE config.key = 'resource_uri'
      AND jsonb_typeof(config.value) = 'string'
  ) AS configured
  WHERE char_length(configured.value) BETWEEN 12 AND 2048
    AND configured.value ~
      '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?$'
    AND configured.value !~ '[[:space:][:cntrl:]]';
$mcp_resource_uri$;

REVOKE EXECUTE ON FUNCTION private.mcp_resource_uri()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;

CREATE OR REPLACE FUNCTION private.mcp_is_active_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_is_active_admin$
  SELECT EXISTS (
    SELECT 1
    FROM public.sistema_users AS sistema_user
    WHERE sistema_user.id = p_user_id
      AND sistema_user.role = 'admin'
      AND sistema_user.is_active
      AND sistema_user.deleted_at IS NULL
  );
$mcp_is_active_admin$;

REVOKE EXECUTE ON FUNCTION private.mcp_is_active_admin(UUID)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated,
    supabase_auth_admin;

-- Existing MCP authorizers call sistema_is_admin. Replacing the shared helper
-- forward-only makes both OAuth and direct-web authorization require a live,
-- non-deleted admin profile without rewriting the already-applied base
-- migration.
CREATE OR REPLACE FUNCTION public.sistema_is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $sistema_is_admin$
  SELECT private.mcp_is_active_admin(p_user_id);
$sistema_is_admin$;

CREATE OR REPLACE FUNCTION private.mcp_guard_sistema_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_guard_sistema_user_role$
DECLARE
  actor_user_id UUID := auth.uid();
  oauth_client_claim TEXT :=
    NULLIF(COALESCE(auth.jwt(), '{}'::JSONB) ->> 'client_id', '');
BEGIN
  -- A database-owner maintenance transaction has no end-user JWT. All
  -- application requests do, so role decisions below always use persisted
  -- actor state and never trust NEW.role.
  IF actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF oauth_client_claim IS NOT NULL THEN
    RAISE EXCEPTION
      'OAuth/MCP tokens cannot create profiles or manage sistema user roles'
      USING ERRCODE = '42501';
  END IF;

  IF private.mcp_is_active_admin(actor_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS DISTINCT FROM actor_user_id
      OR NEW.role IS DISTINCT FROM 'user'
      OR NEW.is_active IS DISTINCT FROM true
      OR NEW.deleted_at IS NOT NULL
      OR NEW.deleted_by IS NOT NULL
    THEN
      RAISE EXCEPTION
        'A non-admin may only create an active own profile with the default user role'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM actor_user_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
  THEN
    RAISE EXCEPTION
      'A non-admin cannot change sistema user privilege state'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$mcp_guard_sistema_user_role$;

REVOKE EXECUTE ON FUNCTION private.mcp_guard_sistema_user_role()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;

DROP TRIGGER IF EXISTS mcp_guard_sistema_user_role
  ON public.sistema_users;
CREATE TRIGGER mcp_guard_sistema_user_role
  BEFORE INSERT OR UPDATE OF role, is_active, deleted_at, deleted_by
  ON public.sistema_users
  FOR EACH ROW
  EXECUTE FUNCTION private.mcp_guard_sistema_user_role();

CREATE OR REPLACE FUNCTION public.mcp_custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $mcp_custom_access_token_hook$
DECLARE
  claims JSONB;
  raw_client_id TEXT;
  event_user_id_value UUID;
  user_id_value UUID;
  client_id_value UUID;
  resource_uri_value TEXT;
BEGIN
  IF jsonb_typeof(event) <> 'object'
    OR jsonb_typeof(event -> 'claims') <> 'object'
  THEN
    RETURN event;
  END IF;

  claims := event -> 'claims';
  raw_client_id := NULLIF(claims ->> 'client_id', '');
  user_id_value :=
    private.mcp_parse_uuid(NULLIF(claims ->> 'sub', ''));
  event_user_id_value :=
    private.mcp_parse_uuid(NULLIF(event ->> 'user_id', ''));
  client_id_value :=
    private.mcp_parse_uuid(raw_client_id);

  IF raw_client_id IS NULL THEN
    RETURN event;
  END IF;

  -- Every Supabase OAuth token receives the isolated Postgres role, including
  -- clients that have not been granted MCP access. Direct first-party tokens
  -- have no client_id and retain their existing role.
  claims := jsonb_set(
    claims,
    '{role}',
    to_jsonb('mcp_authenticated'::TEXT),
    true
  );
  event := jsonb_set(event, '{claims}', claims, true);

  IF client_id_value IS NULL
    OR user_id_value IS NULL
    OR event_user_id_value IS NULL
    OR event_user_id_value <> user_id_value
    OR NOT private.mcp_is_active_admin(user_id_value)
    OR NOT EXISTS (
    SELECT 1
    FROM private.mcp_client_policies AS policy
    JOIN auth.oauth_clients AS oauth_client
      ON oauth_client.id = policy.client_id
     AND oauth_client.deleted_at IS NULL
    JOIN private.mcp_access_grants AS access_grant
     ON access_grant.user_id = user_id_value
     AND access_grant.client_id = policy.client_id
     AND access_grant.revoked_at IS NULL
     AND access_grant.valid_from <= CURRENT_TIMESTAMP
     AND (
       access_grant.expires_at IS NULL
       OR access_grant.expires_at > CURRENT_TIMESTAMP
     )
    WHERE policy.client_id = client_id_value
      AND policy.enabled
  ) THEN
    RETURN event;
  END IF;

  resource_uri_value := private.mcp_resource_uri();

  IF resource_uri_value IS NULL THEN
    RAISE EXCEPTION
      'MCP resource_uri is missing or invalid for an enabled OAuth client'
      USING ERRCODE = '22023';
  END IF;

  claims := jsonb_set(
    claims,
    '{aud}',
    to_jsonb(resource_uri_value),
    true
  );

  RETURN jsonb_set(event, '{claims}', claims, true);
END
$mcp_custom_access_token_hook$;

REVOKE EXECUTE
  ON FUNCTION public.mcp_custom_access_token_hook(JSONB)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE
  ON FUNCTION public.mcp_custom_access_token_hook(JSONB)
  TO supabase_auth_admin;

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

  IF request_method <> 'POST'
    OR request_path <> ALL (
      ARRAY[
        'rpc/mcp_get_context',
        'rpc/mcp_accounting_list_accounts',
        'rpc/mcp_accounting_list_expenses',
        'rpc/mcp_accounting_prepare_expense',
        'rpc/mcp_accounting_get_operation',
        'rpc/mcp_accounting_commit_expense'
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

-- PostgREST invokes this function before resolving a table, view or RPC. Never
-- replace an unrelated project-wide pre-request hook without composing both
-- behaviors in one reviewed function.
DO $mcp_pre_request_configuration$
DECLARE
  existing_pre_request TEXT;
BEGIN
  SELECT split_part(setting, '=', 2)
  INTO existing_pre_request
  FROM unnest(
    COALESCE(
      (
        SELECT role_state.rolconfig
        FROM pg_catalog.pg_roles AS role_state
        WHERE role_state.rolname = 'authenticator'
      ),
      ARRAY[]::TEXT[]
    )
  ) AS configured(setting)
  WHERE setting LIKE 'pgrst.db_pre_request=%'
  LIMIT 1;

  IF existing_pre_request IS NOT NULL
    AND existing_pre_request <> 'public.mcp_postgrest_pre_request'
  THEN
    RAISE EXCEPTION
      'authenticator already has pgrst.db_pre_request=%; compose it with public.mcp_postgrest_pre_request before applying this migration',
      existing_pre_request;
  END IF;

  ALTER ROLE authenticator
    SET pgrst.db_pre_request = 'public.mcp_postgrest_pre_request';
END
$mcp_pre_request_configuration$;

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
  VALUES
    (client_id_value, 'accounting.read'),
    (client_id_value, 'accounting.expense.write')
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
  VALUES
    (grant_row.id, 'accounting.read'),
    (grant_row.id, 'accounting.expense.write')
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
      'capabilities',
        jsonb_build_array('accounting.read', 'accounting.expense.write')
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
          'capabilities',
            jsonb_build_array(
              'accounting.read',
              'accounting.expense.write'
            )
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

CREATE OR REPLACE FUNCTION public.mcp_list_oauth_clients(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_list_oauth_clients$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  caller_user_id UUID;
  caller_session_id UUID;
  resource_uri_value TEXT;
  client_list JSONB;
BEGIN
  authorization_result := private.mcp_authorize_web(
    'mcp_list_oauth_clients',
    false
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.list_denied',
      'mcp_list_oauth_clients',
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
      ARRAY[]::TEXT[]
    )
  THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.list_denied',
      'mcp_list_oauth_clients',
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
      'mcp_list_oauth_clients does not accept request fields.'
    );
  END IF;

  resource_uri_value := private.mcp_resource_uri();

  IF resource_uri_value IS NULL THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.list_failed',
      'mcp_list_oauth_clients',
      'failed',
      caller_user_id,
      NULL,
      caller_session_id,
      NULL,
      NULL,
      jsonb_build_object('reason', 'invalid_resource_uri')
    );
    RETURN private.mcp_error(
      'invalid_resource_uri',
      'The per-environment MCP resource URI is not configured.'
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', oauth_client.id,
          'name', oauth_client.client_name,
          'uri', oauth_client.client_uri,
          'type', oauth_client.client_type,
          'registration_type', oauth_client.registration_type,
          'enabled', policy.enabled,
          'min_aal', policy.min_aal,
          'grant',
            CASE
              WHEN access_grant.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', access_grant.id,
                'expires_at', access_grant.expires_at,
                'active',
                  access_grant.expires_at IS NULL
                  OR access_grant.expires_at > clock_timestamp(),
                'lifetime',
                  CASE
                    WHEN access_grant.expires_at IS NULL
                    THEN 'oauth_grant'
                    ELSE 'database_expiry'
                  END
              )
            END
        )
      )
      ORDER BY COALESCE(oauth_client.client_name, oauth_client.id::TEXT)
    ),
    '[]'::JSONB
  )
  INTO client_list
  FROM private.mcp_client_policies AS policy
  JOIN auth.oauth_clients AS oauth_client
    ON oauth_client.id = policy.client_id
   AND oauth_client.deleted_at IS NULL
  LEFT JOIN private.mcp_access_grants AS access_grant
    ON access_grant.user_id = caller_user_id
   AND access_grant.client_id = policy.client_id
   AND access_grant.revoked_at IS NULL;

  PERFORM private.mcp_audit_event(
    'oauth.client.listed',
    'mcp_list_oauth_clients',
    'success',
    caller_user_id,
    NULL,
    caller_session_id,
    NULL,
    NULL,
    jsonb_build_object('client_count', jsonb_array_length(client_list))
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'resource_uri', resource_uri_value,
      'clients', client_list
    )
  );
END
$mcp_list_oauth_clients$;

CREATE OR REPLACE FUNCTION public.mcp_revoke_oauth_client_grant(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_revoke_oauth_client_grant$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  caller_user_id UUID;
  caller_session_id UUID;
  client_id_value UUID;
  revoked_grant_id UUID;
  revoked_connection_count INTEGER := 0;
BEGIN
  authorization_result := private.mcp_authorize_web(
    'mcp_revoke_oauth_client_grant',
    false
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.revoke_denied',
      'mcp_revoke_oauth_client_grant',
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
      'oauth.client.revoke_denied',
      'mcp_revoke_oauth_client_grant',
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
      'oauth.client.revoke_denied',
      'mcp_revoke_oauth_client_grant',
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      caller_user_id::TEXT || ':' || client_id_value::TEXT,
      0
    )
  );

  UPDATE private.mcp_access_grants
  SET
    revoked_at = clock_timestamp(),
    revoked_by = caller_user_id,
    revoke_reason = 'revoked_by_user'
  WHERE user_id = caller_user_id
    AND client_id = client_id_value
    AND revoked_at IS NULL
  RETURNING id INTO revoked_grant_id;

  IF revoked_grant_id IS NOT NULL THEN
    UPDATE private.mcp_connections
    SET
      revoked_at = clock_timestamp(),
      revoke_reason = 'access_grant_revoked'
    WHERE user_id = caller_user_id
      AND client_id = client_id_value
      AND revoked_at IS NULL;
    GET DIAGNOSTICS revoked_connection_count = ROW_COUNT;
  END IF;

  PERFORM private.mcp_audit_event(
    'oauth.client.grant_revoked',
    'mcp_revoke_oauth_client_grant',
    'success',
    caller_user_id,
    client_id_value,
    caller_session_id,
    NULL,
    NULL,
    jsonb_build_object(
      'grant_id', revoked_grant_id,
      'revoked', revoked_grant_id IS NOT NULL,
      'connection_count', revoked_connection_count,
      'idempotent_replay', revoked_grant_id IS NULL
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'client_id', client_id_value,
      'grant_id', revoked_grant_id,
      'revoked', revoked_grant_id IS NOT NULL,
      'revoked_connection_count', revoked_connection_count,
      'idempotent_replay', revoked_grant_id IS NULL
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM private.mcp_audit_event(
      'oauth.client.revoke_failed',
      'mcp_revoke_oauth_client_grant',
      'failed',
      caller_user_id,
      client_id_value,
      caller_session_id,
      NULL,
      NULL,
      jsonb_build_object('sqlstate', SQLSTATE)
    );
    RETURN private.mcp_error(
      'oauth_client_revoke_failed',
      'The OAuth client grant could not be revoked.'
    );
END
$mcp_revoke_oauth_client_grant$;

REVOKE EXECUTE ON FUNCTION public.mcp_provision_oauth_client(JSONB)
  FROM PUBLIC, anon, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_list_oauth_clients(JSONB)
  FROM PUBLIC, anon, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_revoke_oauth_client_grant(JSONB)
  FROM PUBLIC, anon, service_role, mcp_authenticated;

REVOKE EXECUTE ON FUNCTION public.mcp_get_context(JSONB)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_list_accounts(JSONB)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_list_expenses(JSONB)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_prepare_expense(JSONB)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_get_operation(JSONB)
  FROM PUBLIC, anon, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_commit_expense(JSONB)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_approve_expense(JSONB)
  FROM PUBLIC, anon, service_role, mcp_authenticated;

GRANT EXECUTE ON FUNCTION public.mcp_get_context(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_list_accounts(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_list_expenses(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_prepare_expense(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_get_operation(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_commit_expense(JSONB)
  TO mcp_authenticated;

GRANT EXECUTE ON FUNCTION public.mcp_provision_oauth_client(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_list_oauth_clients(JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_revoke_oauth_client_grant(JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.mcp_custom_access_token_hook(JSONB) IS
  'Isolates every non-empty OAuth client_id in mcp_authenticated; sets MCP aud only for matching event.user_id/sub and an enabled active grant.';
COMMENT ON FUNCTION public.mcp_postgrest_pre_request() IS
  'Fail-closed OAuth Data API gate for the exact MCP machine RPC allowlist.';
COMMENT ON FUNCTION public.mcp_provision_oauth_client(JSONB) IS
  'Direct-web active-admin onboarding for an existing active OAuth client.';
COMMENT ON FUNCTION public.mcp_list_oauth_clients(JSONB) IS
  'Direct-web active-admin view of non-secret MCP OAuth client state.';
COMMENT ON FUNCTION public.mcp_revoke_oauth_client_grant(JSONB) IS
  'Direct-web active-admin revocation of the caller grant and live MCP connections.';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
