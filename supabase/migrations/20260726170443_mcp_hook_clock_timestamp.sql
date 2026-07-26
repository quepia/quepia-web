-- Forward-only fix: access-grant timestamps use wall-clock time, matching the
-- base MCP authorizer. CURRENT_TIMESTAMP is fixed at transaction start and can
-- incorrectly reject a grant created later in the same transaction.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.mcp_custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
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
     AND access_grant.valid_from <= clock_timestamp()
     AND (
       access_grant.expires_at IS NULL
       OR access_grant.expires_at > clock_timestamp()
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

COMMENT ON FUNCTION public.mcp_custom_access_token_hook(JSONB) IS
  'Isolates every non-empty OAuth client_id in mcp_authenticated; sets MCP aud only for matching event.user_id/sub and an enabled active grant.';

NOTIFY pgrst, 'reload schema';
