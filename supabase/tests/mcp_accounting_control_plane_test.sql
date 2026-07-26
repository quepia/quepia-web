BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(42);

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
);

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

CREATE TEMP TABLE mcp_test_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
GRANT ALL ON TABLE mcp_test_state TO authenticated;

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.mcp_accounting_prepare_expense(jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute the write RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.mcp_accounting_prepare_expense(jsonb)',
    'EXECUTE'
  ),
  'authenticated can execute the narrow write RPC'
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
    'role', 'authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

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
  'context returns the normalized capability set'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://wrong-audience.example.test'
  )::TEXT,
  true
);

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'invalid_audience',
  'audience mismatch is denied'
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
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
  'invalid_request',
  'commit rejects every mutable field besides operation_id'
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
  '125.50',
  'prepared payload preserves canonical decimal string'
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
  'idempotent replay returns the same operation'
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
  'idempotency_conflict',
  'same idempotency key cannot carry a different payload'
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
  'approval_required',
  'commit is rejected before separate approval'
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
  'human_approval_required',
  'OAuth/MCP token cannot issue an approval challenge'
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
  'invalid_approval_nonce',
  'wrong approval nonce is rejected'
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
  'aal2',
  'append-only approval stores the approving AAL'
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
    'role', 'authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

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
  'payload_tampered',
  'payload tampering is detected before commit'
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
    'role', 'authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

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
    'role', 'authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

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
  'commit retry never duplicates the business expense'
);

UPDATE private.mcp_config SET value = 'true'::JSONB WHERE key = 'read_only';

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'client_id', '00000000-0000-4000-8000-000000000201',
    'session_id', '00000000-0000-4000-8000-000000000301',
    'aal', 'aal1',
    'aud', 'https://mcp.quepia.example.test/mcp'
  )::TEXT,
  true
);
SET LOCAL ROLE authenticated;

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
  'mcp_read_only',
  'read-only kill switch blocks prepare'
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

SET LOCAL ROLE authenticated;

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
  'rate_limit_exceeded',
  'second read in the same window is atomically denied'
);

RESET ROLE;
UPDATE private.mcp_client_policies
SET rate_limit_read_per_minute = 100
WHERE client_id = '00000000-0000-4000-8000-000000000201';
DELETE FROM private.mcp_rate_budgets
WHERE user_id = '00000000-0000-4000-8000-000000000101'
  AND capability = 'accounting.read';
SET LOCAL ROLE authenticated;

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
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'missing_capability',
  'revoked access grant is effective immediately'
);

RESET ROLE;
UPDATE private.mcp_access_grants
SET revoked_at = NULL, revoke_reason = NULL
WHERE id = '00000000-0000-4000-8000-000000000501';
DELETE FROM auth.sessions
WHERE id = '00000000-0000-4000-8000-000000000301';
SET LOCAL ROLE authenticated;

SELECT is(
  public.mcp_get_context('{}'::JSONB) -> 'error' ->> 'code',
  'invalid_session',
  'deleted OAuth session is rejected immediately'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
