-- Forward-only fix for 20260727163000_mcp_direct_accounting_writes.sql.
--
-- That migration moved the MCP from prepare/approve/commit to direct writes,
-- but it wired the new RPCs for the wrong role and never updated the machine
-- allowlist:
--
--   1. It granted EXECUTE on the new RPCs to `authenticated` only. The MCP
--      connects as `mcp_authenticated`, which is NOINHERIT and is not a member
--      of `authenticated`, so every write RPC raised 42501.
--   2. `mcp_postgrest_pre_request` still allowlisted the retired approval
--      flow (prepare/get_operation/commit) and none of the direct-write RPCs,
--      so the pre-request rejected those paths before the function ran — the
--      grant alone would not have been enough.
--
-- Both faults are deterministic, which is why `mcp_accounting_list_accounts`
-- and `mcp_accounting_list_expenses` kept working while every write and
-- `mcp_accounting_list_recent_operations` failed as `database_rpc_failed`.
--
-- The allowlist is now the eight RPCs the MCP server actually calls. The
-- retired approval RPCs lose both their allowlist entry and their machine
-- grant, so this narrows the OAuth surface rather than widening it. The
-- `mcp_web_*` RPCs stay granted to `authenticated` only: they are the human
-- path in the web app and must not be reachable by the machine role.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Machine grants for the direct-write RPCs
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.mcp_accounting_record_expense(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_record_income(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_record_transfer(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_void_operation(JSONB)
  TO mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_accounting_list_recent_operations(JSONB)
  TO mcp_authenticated;

-- The machine role must never reach the human web RPCs.
REVOKE EXECUTE ON FUNCTION public.mcp_web_list_recent_operations(JSONB)
  FROM mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_web_void_operation(JSONB)
  FROM mcp_authenticated;

-- Retired approval flow: no longer called by the MCP server.
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_prepare_expense(JSONB)
  FROM mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_get_operation(JSONB)
  FROM mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_commit_expense(JSONB)
  FROM mcp_authenticated;
REVOKE EXECUTE ON FUNCTION public.mcp_accounting_approve_expense(JSONB)
  FROM mcp_authenticated;

-- ---------------------------------------------------------------------------
-- 2. Allowlist aligned with the RPCs the MCP server invokes
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

  -- Accept either spelling instead of pinning the gate to one PostgREST
  -- release: the allowlist below is what limits access, not the slash.
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
        'rpc/mcp_accounting_void_operation'
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
  'Limits OAuth Data API access to the MCP machine RPC allowlist (direct-write flow); tolerates the leading slash PostgREST 11+ reports in request.path.';

NOTIFY pgrst, 'reload schema';
