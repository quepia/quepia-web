BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- Test-only visibility for pgTAP while assertions execute under the isolated
-- OAuth role. This GRANT is transactional and is removed by the final ROLLBACK;
-- production keeps mcp_authenticated without extensions schema usage.
GRANT USAGE ON SCHEMA extensions TO mcp_authenticated;

SELECT plan(95);

INSERT INTO auth.users(id, email, aud, role, created_at, updated_at)
VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    'mcp-admin@example.test',
    'authenticated',
    'authenticated',
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'mcp-non-admin@example.test',
    'authenticated',
    'authenticated',
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'mcp-new-user@example.test',
    'authenticated',
    'authenticated',
    clock_timestamp(),
    clock_timestamp()
  );

INSERT INTO public.sistema_users(id, email, nombre, role, is_active)
VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    'mcp-admin@example.test',
    'MCP Admin',
    'admin',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'mcp-non-admin@example.test',
    'MCP Non Admin',
    'user',
    true
  );

INSERT INTO auth.oauth_clients(
  id,
  registration_type,
  redirect_uris,
  grant_types,
  client_name,
  client_type,
  token_endpoint_auth_method
)
VALUES (
  '00000000-0000-4000-8000-000000000201',
  'manual',
  'https://mcp-client.example.test/callback',
  'authorization_code refresh_token',
  'MCP pgTAP client',
  'public',
  'none'
),
(
  '00000000-0000-4000-8000-000000000202',
  'manual',
  'https://mcp-onboarding.example.test/callback',
  'authorization_code refresh_token',
  'MCP onboarding pgTAP client',
  'public',
  'none'
),
(
  '00000000-0000-4000-8000-000000000203',
  'manual',
  'https://deleted-mcp-client.example.test/callback',
  'authorization_code refresh_token',
  'Deleted MCP pgTAP client',
  'public',
  'none'
);

UPDATE auth.oauth_clients
SET deleted_at = clock_timestamp()
WHERE id = '00000000-0000-4000-8000-000000000203';

INSERT INTO auth.sessions(
  id,
  user_id,
  created_at,
  updated_at,
  aal,
  oauth_client_id
)
VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000101',
    clock_timestamp(),
    clock_timestamp(),
    'aal1',
    '00000000-0000-4000-8000-000000000201'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000101',
    clock_timestamp(),
    clock_timestamp(),
    'aal2',
    NULL
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000102',
    clock_timestamp(),
    clock_timestamp(),
    'aal1',
    '00000000-0000-4000-8000-000000000201'
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000101',
    clock_timestamp(),
    clock_timestamp(),
    'aal1',
    NULL
  ),
  (
    '00000000-0000-4000-8000-000000000305',
    '00000000-0000-4000-8000-000000000102',
    clock_timestamp(),
    clock_timestamp(),
    'aal1',
    NULL
  ),
  (
    '00000000-0000-4000-8000-000000000306',
    '00000000-0000-4000-8000-000000000101',
    clock_timestamp(),
    clock_timestamp(),
    'aal1',
    '00000000-0000-4000-8000-000000000202'
  ),
  (
    '00000000-0000-4000-8000-000000000307',
    '00000000-0000-4000-8000-000000000103',
    clock_timestamp(),
    clock_timestamp(),
    'aal1',
    NULL
  );

INSERT INTO public.accounting_accounts(
  id,
  name,
  type,
  currency,
  initial_balance,
  is_default,
  is_active
)
VALUES
  (
    '00000000-0000-4000-8000-000000000401',
    'MCP Test Account Alpha',
    'bank',
    'ARS',
    10000,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    'MCP Test Account Beta',
    'bank',
    'ARS',
    20000,
    false,
    true
  );

INSERT INTO private.mcp_client_policies(
  client_id,
  required_audience,
  enabled,
  min_aal,
  rate_limit_read_per_minute,
  rate_limit_write_per_minute
)
VALUES (
  '00000000-0000-4000-8000-000000000201',
  'https://mcp.quepia.example.test/mcp',
  true,
  'aal1',
  100,
  100
);

INSERT INTO private.mcp_client_capabilities(client_id, capability)
VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    'accounting.read'
  ),
  (
    '00000000-0000-4000-8000-000000000201',
    'accounting.expense.write'
  );

INSERT INTO private.mcp_access_grants(
  id,
  user_id,
  client_id,
  created_by
)
VALUES (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101'
);

INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability)
VALUES
  (
    '00000000-0000-4000-8000-000000000501',
    'accounting.read'
  ),
  (
    '00000000-0000-4000-8000-000000000501',
    'accounting.expense.write'
  );

UPDATE private.mcp_config SET value = 'true'::JSONB WHERE key = 'enabled';
UPDATE private.mcp_config SET value = 'false'::JSONB WHERE key = 'read_only';
-- Make fail-closed assertions independent from the deployment environment.
-- The enclosing transaction restores the real production resource URI.
UPDATE private.mcp_config
SET value = 'null'::JSONB, updated_at = clock_timestamp()
WHERE key = 'resource_uri';

CREATE TEMP TABLE mcp_test_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
GRANT ALL ON TABLE mcp_test_state TO authenticated, mcp_authenticated;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000103',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000307',
    'aal', 'aal1',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.sistema_users(id, email, nombre, role)
    VALUES (
      '00000000-0000-4000-8000-000000000103',
      'mcp-new-user@example.test',
      'MCP New User',
      'admin'
    )
  $$,
  '42501',
  NULL,
  'a user cannot self-register with the admin role'
);

SELECT lives_ok(
  $$
    INSERT INTO public.sistema_users(id, email, nombre)
    VALUES (
      '00000000-0000-4000-8000-000000000103',
      'mcp-new-user@example.test',
      'MCP New User'
    )
  $$,
  'a user can self-register with the default role and privilege state'
);

SELECT throws_ok(
  $$
    UPDATE public.sistema_users
    SET role = 'admin'
    WHERE id = '00000000-0000-4000-8000-000000000103'
  $$,
  '42501',
  NULL,
  'a user cannot escalate their existing profile role'
);

SELECT lives_ok(
  $$
    UPDATE public.sistema_users
    SET nombre = 'MCP New User Updated'
    WHERE id = '00000000-0000-4000-8000-000000000103'
  $$,
  'the privilege guard preserves normal self profile updates'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    UPDATE public.sistema_users
    SET role = 'admin'
    WHERE id = '00000000-0000-4000-8000-000000000101'
  $$,
  '42501',
  NULL,
  'an OAuth token cannot manage roles even when its subject is an admin'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}'::TEXT, true);
UPDATE public.sistema_users
SET is_active = false
WHERE id = '00000000-0000-4000-8000-000000000101';

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-000000000101',
      'claims',
      jsonb_build_object(
        'sub', '00000000-0000-4000-8000-000000000101',
        'aud', 'authenticated',
        'role', 'authenticated',
        'client_id', '00000000-0000-4000-8000-000000000201'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'aud', 'authenticated',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201'
  ),
  'the hook isolates but does not grant MCP aud to an inactive admin'::TEXT
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'forbidden'::TEXT,
  'an inactive admin is denied through an OAuth token'::TEXT
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000304',
    'aal', 'aal1',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  ) -> 'error' ->> 'code',
  'forbidden'::TEXT,
  'an inactive admin is denied through the direct web lifecycle'::TEXT
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}'::TEXT, true);
UPDATE public.sistema_users
SET is_active = true,
    deleted_at = clock_timestamp()
WHERE id = '00000000-0000-4000-8000-000000000101';

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'forbidden'::TEXT,
  'a soft-deleted admin is denied through an OAuth token'::TEXT
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000304',
    'aal', 'aal1',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  ) -> 'error' ->> 'code',
  'forbidden'::TEXT,
  'a soft-deleted admin is denied through the direct web lifecycle'::TEXT
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}'::TEXT, true);
UPDATE public.sistema_users
SET deleted_at = NULL
WHERE id = '00000000-0000-4000-8000-000000000101';

SELECT ok(
  (
    SELECT
      NOT role_state.rolcanlogin
      AND NOT role_state.rolinherit
      AND NOT role_state.rolsuper
      AND NOT role_state.rolbypassrls
      AND pg_has_role(
        'authenticator',
        'mcp_authenticated',
        'MEMBER'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = role_state.oid
      )
      AND (
        SELECT
          COUNT(*) = 2
          AND COUNT(*) FILTER (WHERE membership.set_option) = 1
          AND BOOL_AND(
            CASE member_role.rolname
              WHEN 'postgres' THEN
                grantor_role.rolname = 'supabase_admin'
                AND membership.admin_option
                AND NOT membership.inherit_option
                AND NOT membership.set_option
              WHEN 'authenticator' THEN
                NOT membership.admin_option
                AND NOT membership.inherit_option
                AND membership.set_option
              ELSE false
            END
          )
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS member_role
          ON member_role.oid = membership.member
        JOIN pg_catalog.pg_roles AS grantor_role
          ON grantor_role.oid = membership.grantor
        WHERE membership.roleid = role_state.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        WHERE relation.relowner = role_state.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS routine
        WHERE routine.proowner = role_state.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespace
        WHERE namespace.nspowner = role_state.oid
      )
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'mcp_authenticated'
  ),
  'the isolated OAuth role permits only managed postgres administration and authenticator runtime SET'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role_state
    CROSS JOIN LATERAL unnest(role_state.rolconfig) AS configured(setting)
    WHERE role_state.rolname = 'authenticator'
      AND configured.setting =
        'pgrst.db_pre_request=public.mcp_postgrest_pre_request'
  ),
  'authenticator is configured with the fail-closed MCP pre-request gate'
);

SELECT ok(
  has_function_privilege(
    'mcp_authenticated',
    'public.mcp_get_context(jsonb)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'mcp_authenticated',
    'public.mcp_accounting_get_operation(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'mcp_authenticated',
    'public.mcp_accounting_approve_expense(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'mcp_authenticated',
    'public.mcp_provision_oauth_client(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.mcp_get_context(jsonb)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.mcp_accounting_approve_expense(jsonb)',
    'EXECUTE'
  ),
  'machine and human MCP RPC privileges are separated'
);

SELECT ok(
  NOT has_table_privilege(
    'mcp_authenticated',
    'public.sistema_users',
    'SELECT'
  )
  AND NOT has_table_privilege(
    'mcp_authenticated',
    'public.accounting_expenses',
    'SELECT, INSERT, UPDATE, DELETE'
  )
  AND NOT has_schema_privilege(
    'mcp_authenticated',
    'private',
    'USAGE'
  )
  AND (
    to_regnamespace('storage') IS NULL
    OR NOT has_schema_privilege(
      'mcp_authenticated',
      'storage',
      'USAGE'
    )
  )
  AND (
    to_regnamespace('realtime') IS NULL
    OR NOT has_schema_privilege(
      'mcp_authenticated',
      'realtime',
      'USAGE'
    )
  ),
  'the isolated OAuth role has no direct application, private, Storage, or Realtime data privileges'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201'
  )::TEXT,
  true
);
SELECT set_config('request.path', 'rpc/mcp_get_context', true);
SELECT set_config('request.method', 'POST', true);
SET LOCAL ROLE mcp_authenticated;

SELECT lives_ok(
  $$ SELECT public.mcp_postgrest_pre_request() $$,
  'PostgREST allows the exact no-leading-slash MCP machine RPC path'
);

SELECT set_config('request.path', 'sistema_users', true);
SELECT throws_ok(
  $$ SELECT public.mcp_postgrest_pre_request() $$,
  '42501',
  NULL,
  'PostgREST rejects OAuth table access before route resolution'
);

SELECT set_config(
  'request.path',
  'rpc/mcp_accounting_approve_expense',
  true
);
SELECT throws_ok(
  $$ SELECT public.mcp_postgrest_pre_request() $$,
  '42501',
  NULL,
  'PostgREST rejects the human approval RPC for OAuth tokens'
);

SELECT set_config('request.path', '/rpc/mcp_get_context', true);
SELECT throws_ok(
  $$ SELECT public.mcp_postgrest_pre_request() $$,
  '42501',
  NULL,
  'PostgREST route matching is exact and rejects a leading slash'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated'
  )::TEXT,
  true
);
SELECT set_config('request.path', 'sistema_users', true);
SELECT set_config('request.method', 'GET', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.mcp_postgrest_pre_request() $$,
  'the pre-request gate preserves direct first-party web Data API requests'
);

RESET ROLE;

SELECT ok(
  private.mcp_resource_uri() IS NULL,
  'OAuth onboarding starts fail-closed without an environment resource URI'
);

SELECT ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.mcp_custom_access_token_hook(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.mcp_custom_access_token_hook(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.mcp_custom_access_token_hook(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.mcp_custom_access_token_hook(jsonb)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.mcp_provision_oauth_client(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.mcp_provision_oauth_client(jsonb)',
    'EXECUTE'
  ),
  'hook and onboarding RPC privileges are separated by database role'
);

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'claims',
      jsonb_build_object(
        'aud', 'authenticated',
        'role', 'authenticated'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'aud', 'authenticated',
    'role', 'authenticated'
  ),
  'the hook preserves a direct first-party token'::TEXT
);

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'claims',
      jsonb_build_object(
        'aud', 'authenticated',
        'role', 'authenticated',
        'client_id', '00000000-0000-4000-8000-000000000202'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'aud', 'authenticated',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000202'
  ),
  'the hook isolates an OAuth token without granting an MCP audience'::TEXT
);

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'claims',
      jsonb_build_object(
        'aud', 'authenticated',
        'role', 'authenticated',
        'client_id', 'not-a-uuid'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'aud', 'authenticated',
    'role', 'mcp_authenticated',
    'client_id', 'not-a-uuid'
  ),
  'the hook isolates a non-empty non-UUID client_id without granting aud'::TEXT
);

SELECT throws_ok(
  $$
    SELECT public.mcp_custom_access_token_hook(
      jsonb_build_object(
        'user_id', '00000000-0000-4000-8000-000000000101',
        'claims',
        jsonb_build_object(
          'sub', '00000000-0000-4000-8000-000000000101',
          'aud', 'authenticated',
          'role', 'authenticated',
          'client_id', '00000000-0000-4000-8000-000000000201'
        )
      )
    )
  $$,
  '22023',
  NULL,
  'an enabled client with an active grant fails closed when resource_uri is invalid'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000304',
    'aal', 'aal1',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  ) -> 'error' ->> 'code',
  'invalid_resource_uri'::TEXT,
  'an existing AAL1 admin login reaches provisioning and fails closed only on missing resource_uri'::TEXT
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

SELECT throws_ok(
  $$
    SELECT public.mcp_provision_oauth_client(
      jsonb_build_object(
        'client_id', '00000000-0000-4000-8000-000000000202'
      )
    )
  $$,
  '42501',
  NULL,
  'the isolated OAuth role cannot execute the direct-web onboarding RPC'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000102',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000305',
    'aal', 'aal1',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  ) -> 'error' ->> 'code',
  'forbidden'::TEXT,
  'a non-admin AAL1 login cannot provision an OAuth client'::TEXT
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000304',
    'aal', 'aal1',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202',
      'unexpected', true
    )
  ) -> 'error' ->> 'code',
  'invalid_request'::TEXT,
  'OAuth provisioning rejects unknown request fields'::TEXT
);

SELECT is(
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000203'
    )
  ) -> 'error' ->> 'code',
  'oauth_client_not_active'::TEXT,
  'OAuth provisioning rejects a deleted client'::TEXT
);

SELECT is(
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  ) -> 'error' ->> 'code',
  'invalid_resource_uri'::TEXT,
  'OAuth provisioning fails closed before resource_uri is configured'::TEXT
);

RESET ROLE;

UPDATE private.mcp_config
SET
  value = to_jsonb(
    'https://staging-mcp.quepia.example.test/mcp'::TEXT
  ),
  updated_at = clock_timestamp()
WHERE key = 'resource_uri';

SELECT is(
  private.mcp_resource_uri(),
  'https://staging-mcp.quepia.example.test/mcp'::TEXT,
  'a private deployment transaction can set a validated staging resource URI'::TEXT
);

SET LOCAL ROLE authenticated;

INSERT INTO mcp_test_state(key, value)
SELECT
  'oauth_onboarding_one',
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  );

RESET ROLE;

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'oauth_onboarding_one'
  ),
  'an existing direct-web AAL1 admin login provisions an active OAuth client'
);

SELECT is(
  (
    SELECT
      required_audience || '|' || min_aal || '|' || enabled::TEXT
        || '|' || (
          SELECT value -> 'data' -> 'policy' ->> 'proof_at_grant_aal'
          FROM mcp_test_state
          WHERE key = 'oauth_onboarding_one'
        )
    FROM private.mcp_client_policies
    WHERE client_id = '00000000-0000-4000-8000-000000000202'
  ),
  'https://staging-mcp.quepia.example.test/mcp|aal1|true|aal1'::TEXT,
  'existing AAL1 admin login creates an AAL1 OAuth token policy without falsifying aal'::TEXT
);

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM private.mcp_client_capabilities
    WHERE client_id = '00000000-0000-4000-8000-000000000202'
      AND capability IN ('accounting.read', 'accounting.expense.write')
  ),
  2,
  'provisioning attaches both MCP accounting capabilities to the client'::TEXT
);

SELECT ok(
  (
    SELECT
      expires_at IS NULL
      AND (
        SELECT value -> 'data' -> 'grant' ->> 'lifetime'
        FROM mcp_test_state
        WHERE key = 'oauth_onboarding_one'
      ) = 'oauth_grant'
    FROM private.mcp_access_grants
    WHERE id = (
      SELECT (value -> 'data' -> 'grant' ->> 'id')::UUID
      FROM mcp_test_state
      WHERE key = 'oauth_onboarding_one'
    )
  ),
  'the MCP grant does not expire independently from the OAuth grant'
);

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM private.mcp_access_grant_capabilities
    WHERE grant_id = (
      SELECT (value -> 'data' -> 'grant' ->> 'id')::UUID
      FROM mcp_test_state
      WHERE key = 'oauth_onboarding_one'
    )
  ),
  2,
  'the OAuth-bound user grant carries only the accounting capabilities'::TEXT
);

SET LOCAL ROLE authenticated;

INSERT INTO mcp_test_state(key, value)
SELECT
  'oauth_onboarding_retry',
  public.mcp_provision_oauth_client(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  );

RESET ROLE;

SELECT ok(
  (
    SELECT
      (value ->> 'ok')::BOOLEAN
      AND (value -> 'data' ->> 'idempotent_replay')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'oauth_onboarding_retry'
  ),
  'repeated OAuth provisioning is an idempotent replay'
);

SELECT is(
  (
    SELECT value -> 'data' -> 'grant' ->> 'id'
    FROM mcp_test_state
    WHERE key = 'oauth_onboarding_retry'
  ),
  (
    SELECT value -> 'data' -> 'grant' ->> 'id'
    FROM mcp_test_state
    WHERE key = 'oauth_onboarding_one'
  ),
  'idempotent provisioning reuses the same live grant'::TEXT
);

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM private.mcp_access_grants
    WHERE user_id = '00000000-0000-4000-8000-000000000101'
      AND client_id = '00000000-0000-4000-8000-000000000202'
      AND revoked_at IS NULL
  ),
  1,
  'idempotent provisioning creates only one unrevoked grant'::TEXT
);

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-000000000101',
      'claims',
      jsonb_build_object(
        'sub', '00000000-0000-4000-8000-000000000101',
        'aud', 'authenticated',
        'aal', 'aal1',
        'role', 'authenticated',
        'client_id', '00000000-0000-4000-8000-000000000202'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'aud', 'https://staging-mcp.quepia.example.test/mcp',
    'aal', 'aal1',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000202'
  ),
  'the hook sets exact MCP role/aud for an active grant and preserves the real aal'::TEXT
);

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-000000000102',
      'claims',
      jsonb_build_object(
        'sub', '00000000-0000-4000-8000-000000000101',
        'aud', 'authenticated',
        'aal', 'aal1',
        'role', 'authenticated',
        'client_id', '00000000-0000-4000-8000-000000000202'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'aud', 'authenticated',
    'aal', 'aal1',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000202'
  ),
  'the hook refuses MCP aud when event.user_id does not equal claims.sub'::TEXT
);

UPDATE private.mcp_client_policies
SET enabled = false
WHERE client_id = '00000000-0000-4000-8000-000000000202';

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-000000000101',
      'claims',
      jsonb_build_object(
        'sub', '00000000-0000-4000-8000-000000000101',
        'aud', 'authenticated',
        'aal', 'aal1',
        'role', 'authenticated',
        'client_id', '00000000-0000-4000-8000-000000000202'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'aud', 'authenticated',
    'aal', 'aal1',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000202'
  ),
  'the hook preserves aud but keeps OAuth role isolation when policy is disabled'::TEXT
);

UPDATE private.mcp_client_policies
SET enabled = true
WHERE client_id = '00000000-0000-4000-8000-000000000202';

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000202',
    'session_id', '00000000-0000-4000-8000-000000000306',
    'aal', 'aal1',
    'aud', 'https://staging-mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

SELECT ok(
  (
    public.mcp_get_context('{}'::JSONB) ->> 'ok'
  )::BOOLEAN,
  'the OAuth authorization-code AAL1 access token passes the AAL1 client policy'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000304',
    'aal', 'aal1',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_list_oauth_clients('{"unexpected":true}'::JSONB)
    -> 'error' ->> 'code',
  'invalid_request'::TEXT,
  'the OAuth client list rejects request fields'::TEXT
);

INSERT INTO mcp_test_state(key, value)
SELECT
  'oauth_client_list',
  public.mcp_list_oauth_clients('{}'::JSONB);

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'oauth_client_list'
  ),
  'an existing direct-web AAL1 admin login can list MCP OAuth state'
);

SELECT ok(
  (
    SELECT
      item ->> 'id' = '00000000-0000-4000-8000-000000000202'
      AND NOT (item ? 'redirect_uris')
      AND NOT (item ? 'client_secret')
      AND NOT (item ? 'client_secret_hash')
    FROM mcp_test_state AS state
    CROSS JOIN LATERAL jsonb_array_elements(
      state.value -> 'data' -> 'clients'
    ) AS listed(item)
    WHERE state.key = 'oauth_client_list'
      AND item ->> 'id' = '00000000-0000-4000-8000-000000000202'
  ),
  'the minimal OAuth list exposes no redirect URI or client secret material'
);

RESET ROLE;

SELECT ok(
  (
    SELECT COUNT(*) >= 2
    FROM private.mcp_audit_log
    WHERE event_type = 'oauth.client.provisioned'
      AND client_id = '00000000-0000-4000-8000-000000000202'
  ),
  'successful and idempotent provisioning are audited'
);

SET LOCAL ROLE authenticated;

INSERT INTO mcp_test_state(key, value)
SELECT
  'oauth_revoke_one',
  public.mcp_revoke_oauth_client_grant(
    jsonb_build_object(
      'client_id', '00000000-0000-4000-8000-000000000202'
    )
  );

SELECT ok(
  (
    SELECT
      (value ->> 'ok')::BOOLEAN
      AND (value -> 'data' ->> 'revoked')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'oauth_revoke_one'
  ),
  'the existing-login lifecycle RPC revokes the caller grant'
);

RESET ROLE;

SELECT ok(
  (
    SELECT
      revoked_at IS NOT NULL
      AND revoked_by = '00000000-0000-4000-8000-000000000101'::UUID
      AND revoke_reason = 'revoked_by_user'
    FROM private.mcp_access_grants
    WHERE id = (
      SELECT (value -> 'data' ->> 'grant_id')::UUID
      FROM mcp_test_state
      WHERE key = 'oauth_revoke_one'
    )
  ),
  'revocation persists actor, timestamp, and reason'
);

SELECT is(
  public.mcp_custom_access_token_hook(
    jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-000000000101',
      'claims',
      jsonb_build_object(
        'sub', '00000000-0000-4000-8000-000000000101',
        'aud', 'authenticated',
        'aal', 'aal1',
        'role', 'authenticated',
        'client_id', '00000000-0000-4000-8000-000000000202'
      )
    )
  ) -> 'claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'aud', 'authenticated',
    'aal', 'aal1',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000202'
  ),
  'the hook removes MCP aud after database revocation while preserving OAuth isolation'::TEXT
);

SET LOCAL ROLE authenticated;

SELECT ok(
  (
    public.mcp_revoke_oauth_client_grant(
      jsonb_build_object(
        'client_id', '00000000-0000-4000-8000-000000000202'
      )
    ) -> 'data' ->> 'idempotent_replay'
  )::BOOLEAN,
  'repeated grant revocation is idempotent'
);

RESET ROLE;

SELECT ok(
  (
    SELECT COUNT(*) >= 2
    FROM private.mcp_audit_log
    WHERE event_type = 'oauth.client.grant_revoked'
      AND client_id = '00000000-0000-4000-8000-000000000202'
  ),
  'successful and idempotent revocations are audited'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.mcp_accounting_prepare_expense(jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute the write RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.mcp_accounting_prepare_expense(jsonb)',
    'EXECUTE'
  ),
  'direct web sessions cannot execute the machine prepare-expense RPC'
);

SELECT ok(
  NOT has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated has no direct private schema usage'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.mcp_accounting_commit_expense(jsonb)',
    'EXECUTE'
  ),
  'service_role is not an MCP facade caller'
);

SELECT ok(
  (
    SELECT bool_and(class.relrowsecurity)
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'private'
      AND class.relname LIKE 'mcp_%'
      AND class.relkind = 'r'
  ),
  'all private MCP tables have RLS enabled as defense in depth'
);

SELECT ok(
  (
    SELECT bool_and(
      COALESCE(array_to_string(proc.proconfig, ','), '')
        LIKE '%search_path=%'
      AND COALESCE(array_to_string(proc.proconfig, ','), '')
        NOT LIKE '%public%'
    )
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname IN ('private', 'public')
      AND proc.proname LIKE 'mcp_%'
      AND proc.prosecdef
  ),
  'all MCP security-definer functions pin a non-public search_path'
);

SELECT ok(
  (
    SELECT indexdef ILIKE '%operation_type%'
      AND indexdef ILIKE '%WHERE (status <> ''expired''%'
    FROM pg_indexes
    WHERE schemaname = 'private'
      AND indexname = 'mcp_operations_idempotency_idx'
  ),
  'idempotency uniqueness includes operation_type and excludes expired rows'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

INSERT INTO mcp_test_state(key, value)
VALUES ('context', public.mcp_get_context('{}'::JSONB));

SELECT ok(
  (SELECT (value ->> 'ok')::BOOLEAN FROM mcp_test_state WHERE key = 'context'),
  'valid OAuth user/client/session/grant obtains context'
);

SELECT is(
  (
    SELECT value -> 'data' -> 'capabilities'
    FROM mcp_test_state
    WHERE key = 'context'
  ),
  '["accounting.expense.write", "accounting.read"]'::JSONB,
  'context returns the normalized capability set'::TEXT
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://wrong-audience.example.test'
  )::TEXT,
  true
);

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'invalid_audience'::TEXT,
  'audience mismatch is denied'::TEXT
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);

SELECT is(
  public.mcp_accounting_commit_expense(
    jsonb_build_object(
      'operation_id', '00000000-0000-4000-8000-000000000999',
      'amount', '1.00'
    )
  ) -> 'error' ->> 'code',
  'invalid_request'::TEXT,
  'commit rejects every mutable field besides operation_id'::TEXT
);

SELECT throws_ok(
  $$
    INSERT INTO public.accounting_expenses(
      date,
      description,
      amount,
      currency,
      account_id,
      created_by
    )
    VALUES (
      CURRENT_DATE,
      'Direct OAuth bypass attempt',
      10,
      'ARS',
      '00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000101'
    )
  $$,
  '42501',
  NULL,
  'OAuth token cannot insert directly into accounting tables'
);

INSERT INTO mcp_test_state(key, value)
VALUES (
  'prepare_one',
  public.mcp_accounting_prepare_expense(
    jsonb_build_object(
      'idempotency_key', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'description', 'MCP test expense one',
      'amount', '125.50',
      'currency', 'ARS',
      'account_query', 'Account Alpha',
      'notes', 'Prepared by pgTAP'
    )
  )
);

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'prepare_one'
  ),
  'valid flat payload prepares an expense'
);

SELECT is(
  (
    SELECT value -> 'data' -> 'operation' -> 'payload' ->> 'amount'
    FROM mcp_test_state
    WHERE key = 'prepare_one'
  ),
  '125.50'::TEXT,
  'prepared payload preserves canonical decimal string'::TEXT
);

INSERT INTO mcp_test_state(key, value)
VALUES (
  'prepare_one_replay',
  public.mcp_accounting_prepare_expense(
    jsonb_build_object(
      'idempotency_key', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'description', 'MCP test expense one',
      'amount', '125.50',
      'currency', 'ARS',
      'account_id', '00000000-0000-4000-8000-000000000401',
      'notes', 'Prepared by pgTAP'
    )
  )
);

SELECT ok(
  (
    SELECT (value -> 'data' ->> 'idempotent_replay')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'prepare_one_replay'
  ),
  'same idempotency key and normalized payload replays'
);

SELECT is(
  (
    SELECT value -> 'data' -> 'operation' ->> 'id'
    FROM mcp_test_state
    WHERE key = 'prepare_one'
  ),
  (
    SELECT value -> 'data' -> 'operation' ->> 'id'
    FROM mcp_test_state
    WHERE key = 'prepare_one_replay'
  ),
  'idempotent replay returns the same operation'::TEXT
);

SELECT is(
  public.mcp_accounting_prepare_expense(
    jsonb_build_object(
      'idempotency_key', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'description', 'Tampered replay',
      'amount', '999.00',
      'currency', 'ARS',
      'account_id', '00000000-0000-4000-8000-000000000401'
    )
  ) -> 'error' ->> 'code',
  'idempotency_conflict'::TEXT,
  'same idempotency key cannot carry a different payload'::TEXT
);

SELECT is(
  public.mcp_accounting_commit_expense(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_one'
      )
    )
  ) -> 'error' ->> 'code',
  'approval_required'::TEXT,
  'commit is rejected before separate approval'::TEXT
);

SELECT is(
  public.mcp_accounting_get_operation(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_one'
      ),
      'issue_approval_challenge',
      true
    )
  ) -> 'error' ->> 'code',
  'human_approval_required'::TEXT,
  'OAuth/MCP token cannot issue an approval challenge'::TEXT
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000302',
    'aal', 'aal2',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO mcp_test_state(key, value)
SELECT
  'challenge_one',
  public.mcp_accounting_get_operation(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_one'
      ),
      'issue_approval_challenge',
      true
    )
  );

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'challenge_one'
  ),
  'direct AAL2 web session can issue a challenge'
);

SELECT matches(
  (
    SELECT value -> 'data' -> 'approval' ->> 'challenge_nonce'
    FROM mcp_test_state
    WHERE key = 'challenge_one'
  ),
  '^[0-9a-f]{64}$',
  'raw approval nonce is a 256-bit hex challenge'
);

SELECT is(
  public.mcp_accounting_approve_expense(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_one'
      ),
      'approval_nonce',
      repeat('0', 64)
    )
  ) -> 'error' ->> 'code',
  'invalid_approval_nonce'::TEXT,
  'wrong approval nonce is rejected'::TEXT
);

INSERT INTO mcp_test_state(key, value)
SELECT
  'approval_one',
  public.mcp_accounting_approve_expense(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_one'
      ),
      'approval_nonce',
      (
        SELECT value -> 'data' -> 'approval' ->> 'challenge_nonce'
        FROM mcp_test_state
        WHERE key = 'challenge_one'
      )
    )
  );

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'approval_one'
  ),
  'correct one-time web nonce approves the operation'
);

RESET ROLE;

SELECT is(
  (
    SELECT approved_aal
    FROM private.mcp_operation_approvals
    WHERE operation_id = (
      SELECT (value -> 'data' -> 'operation' ->> 'id')::UUID
      FROM mcp_test_state
      WHERE key = 'prepare_one'
    )
  ),
  'aal2'::TEXT,
  'append-only approval stores the approving AAL'::TEXT
);

UPDATE private.mcp_operations
SET normalized_payload =
  jsonb_set(normalized_payload, '{amount}', '"999.00"'::JSONB)
WHERE id = (
  SELECT (value -> 'data' -> 'operation' ->> 'id')::UUID
  FROM mcp_test_state
  WHERE key = 'prepare_one'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

SELECT is(
  public.mcp_accounting_commit_expense(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_one'
      )
    )
  ) -> 'error' ->> 'code',
  'payload_tampered'::TEXT,
  'payload tampering is detected before commit'::TEXT
);

RESET ROLE;

SELECT throws_ok(
  $$
    UPDATE private.mcp_audit_log SET action = 'changed' WHERE true
  $$,
  '55000',
  NULL,
  'audit log rejects updates'
);

SELECT throws_ok(
  $$
    DELETE FROM private.mcp_operation_approvals WHERE true
  $$,
  '55000',
  NULL,
  'human approvals reject deletes'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

INSERT INTO mcp_test_state(key, value)
VALUES (
  'prepare_two',
  public.mcp_accounting_prepare_expense(
    jsonb_build_object(
      'idempotency_key', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'description', 'MCP test expense two',
      'amount', '75.00',
      'currency', 'ARS',
      'account_id', '00000000-0000-4000-8000-000000000401'
    )
  )
);

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'prepare_two'
  ),
  'second operation prepares successfully'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '00000000-0000-4000-8000-000000000302',
    'aal', 'aal2',
    'aud', 'authenticated'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO mcp_test_state(key, value)
SELECT
  'challenge_two',
  public.mcp_accounting_get_operation(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_two'
      ),
      'issue_approval_challenge',
      true
    )
  );

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'challenge_two'
  ),
  'second approval challenge issues successfully'
);

SELECT ok(
  (
    public.mcp_accounting_approve_expense(
      jsonb_build_object(
        'operation_id',
        (
          SELECT value -> 'data' -> 'operation' ->> 'id'
          FROM mcp_test_state
          WHERE key = 'prepare_two'
        ),
        'approval_nonce',
        (
          SELECT value -> 'data' -> 'approval' ->> 'challenge_nonce'
          FROM mcp_test_state
          WHERE key = 'challenge_two'
        )
      )
    ) ->> 'ok'
  )::BOOLEAN,
  'second operation receives separate human approval'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

INSERT INTO mcp_test_state(key, value)
SELECT
  'commit_two',
  public.mcp_accounting_commit_expense(
    jsonb_build_object(
      'operation_id',
      (
        SELECT value -> 'data' -> 'operation' ->> 'id'
        FROM mcp_test_state
        WHERE key = 'prepare_two'
      )
    )
  );

SELECT ok(
  (
    SELECT (value ->> 'ok')::BOOLEAN
    FROM mcp_test_state
    WHERE key = 'commit_two'
  ),
  'approved immutable operation commits'
);

SELECT ok(
  (
    public.mcp_accounting_commit_expense(
      jsonb_build_object(
        'operation_id',
        (
          SELECT value -> 'data' -> 'operation' ->> 'id'
          FROM mcp_test_state
          WHERE key = 'prepare_two'
        )
      )
    ) -> 'data' ->> 'idempotent_replay'
  )::BOOLEAN,
  'commit retry returns the stored result idempotently'
);

RESET ROLE;

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.accounting_expenses
    WHERE description = 'MCP test expense two'
  ),
  1,
  'commit retry never duplicates the business expense'::TEXT
);

UPDATE private.mcp_config SET value = 'true'::JSONB WHERE key = 'read_only';

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'mcp_authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE mcp_authenticated;

SELECT is(
  public.mcp_accounting_prepare_expense(
    jsonb_build_object(
      'idempotency_key', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'description', 'Read-only rejected',
      'amount', '1.00',
      'currency', 'ARS',
      'account_id', '00000000-0000-4000-8000-000000000401'
    )
  ) -> 'error' ->> 'code',
  'mcp_read_only'::TEXT,
  'read-only kill switch blocks prepare'::TEXT
);

SELECT ok(
  (public.mcp_accounting_list_accounts('{}'::JSONB) ->> 'ok')::BOOLEAN,
  'read-only kill switch does not block reads'
);

RESET ROLE;
UPDATE private.mcp_config SET value = 'false'::JSONB WHERE key = 'read_only';
UPDATE private.mcp_client_policies
SET rate_limit_read_per_minute = 1
WHERE client_id = '00000000-0000-4000-8000-000000000201';
DELETE FROM private.mcp_rate_budgets
WHERE user_id = '00000000-0000-4000-8000-000000000101'
  AND capability = 'accounting.read';

SET LOCAL ROLE mcp_authenticated;

SELECT ok(
  (public.mcp_get_context('{}'::JSONB) ->> 'ok')::BOOLEAN,
  'context validation does not consume tool rate budget'
);

SELECT ok(
  (public.mcp_accounting_list_accounts('{}'::JSONB) ->> 'ok')::BOOLEAN,
  'first read consumes the atomic budget'
);

SELECT is(
  public.mcp_accounting_list_accounts('{}'::JSONB)
    -> 'error' ->> 'code',
  'rate_limit_exceeded'::TEXT,
  'second read in the same window is atomically denied'::TEXT
);

RESET ROLE;
UPDATE private.mcp_client_policies
SET rate_limit_read_per_minute = 100
WHERE client_id = '00000000-0000-4000-8000-000000000201';
DELETE FROM private.mcp_rate_budgets
WHERE user_id = '00000000-0000-4000-8000-000000000101'
  AND capability = 'accounting.read';
SET LOCAL ROLE mcp_authenticated;

INSERT INTO mcp_test_state(key, value)
VALUES (
  'accounts_page_one',
  public.mcp_accounting_list_accounts(
    '{"active_only":true,"currency":"ARS","page_size":1}'::JSONB
  )
);

SELECT matches(
  (
    SELECT value -> 'data' ->> 'next_cursor'
    FROM mcp_test_state
    WHERE key = 'accounts_page_one'
  ),
  '^[A-Za-z0-9_-]+$',
  'pagination cursor is unpadded base64url'
);

SELECT ok(
  (
    public.mcp_accounting_list_accounts(
      jsonb_build_object(
        'active_only', true,
        'currency', 'ARS',
        'page_size', 1,
        'cursor',
        (
          SELECT value -> 'data' ->> 'next_cursor'
          FROM mcp_test_state
          WHERE key = 'accounts_page_one'
        )
      )
    ) ->> 'ok'
  )::BOOLEAN,
  'opaque account cursor loads the next page'
);

RESET ROLE;
UPDATE private.mcp_access_grants
SET revoked_at = clock_timestamp(), revoke_reason = 'pgTAP'
WHERE id = '00000000-0000-4000-8000-000000000501';
SET LOCAL ROLE mcp_authenticated;

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'missing_capability'::TEXT,
  'revoked access grant is effective immediately'::TEXT
);

RESET ROLE;
UPDATE private.mcp_access_grants
SET revoked_at = NULL, revoke_reason = NULL
WHERE id = '00000000-0000-4000-8000-000000000501';
DELETE FROM auth.sessions
WHERE id = '00000000-0000-4000-8000-000000000301';
SET LOCAL ROLE mcp_authenticated;

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'invalid_session'::TEXT,
  'deleted OAuth session is rejected immediately'::TEXT
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
