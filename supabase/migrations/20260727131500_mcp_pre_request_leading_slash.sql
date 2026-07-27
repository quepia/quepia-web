-- Forward-only fix: the machine RPC allowlist compares against paths without a
-- leading slash, but PostgREST 11 and later expose `request.path` with one
-- ("/rpc/mcp_get_context"). Every OAuth request therefore failed the allowlist
-- and raised 42501 before reaching any RPC, which surfaced to MCP clients as an
-- opaque connection failure.
--
-- The path is now normalised before the comparison so both spellings resolve to
-- the same entry. The allowlist itself is unchanged and still matches the RPC
-- name exactly: normalising leading slashes widens nothing beyond the six paths
-- already permitted, and table access such as "sistema_users" or the human
-- approval RPC stays rejected.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

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

  -- Accept either spelling instead of pinning the gate to one PostgREST
  -- release: the allowlist below is what limits access, not the slash.
  request_path := pg_catalog.ltrim(request_path, '/');

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

COMMENT ON FUNCTION public.mcp_postgrest_pre_request() IS
  'Limits OAuth Data API access to the MCP machine RPC allowlist; tolerates the leading slash PostgREST 11+ reports in request.path.';

NOTIFY pgrst, 'reload schema';
