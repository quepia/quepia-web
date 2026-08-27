-- Keep the auth-bound RLS helper out of the public Data API schema. The
-- dedicated schema contains only this no-argument function, and authenticated
-- callers receive no access to the broader private schema.

CREATE SCHEMA IF NOT EXISTS sistema_authorization;

REVOKE ALL ON SCHEMA sistema_authorization
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated,
    supabase_auth_admin;
GRANT USAGE ON SCHEMA sistema_authorization TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA sistema_authorization
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE OR REPLACE FUNCTION sistema_authorization.request_is_authorized()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.sistema_user_is_authorized((SELECT auth.uid()));
$function$;

REVOKE EXECUTE ON FUNCTION sistema_authorization.request_is_authorized()
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated,
    supabase_auth_admin;
GRANT EXECUTE ON FUNCTION sistema_authorization.request_is_authorized()
  TO authenticated;

COMMENT ON SCHEMA sistema_authorization IS
  'Non-API helpers used exclusively by Kepia allowlist RLS policies.';
COMMENT ON FUNCTION sistema_authorization.request_is_authorized() IS
  'Returns whether the current authenticated request is on the active Kepia allowlist.';

DO $policies$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT namespace.nspname AS schema_name, class.relname AS table_name
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
      AND (
        class.relname LIKE 'sistema\_%' ESCAPE '\'
        OR class.relname LIKE 'accounting\_%' ESCAPE '\'
      )
  LOOP
    EXECUTE format(
      'ALTER POLICY sistema_require_authorized_user ON %I.%I USING ((SELECT sistema_authorization.request_is_authorized())) WITH CHECK ((SELECT sistema_authorization.request_is_authorized()))',
      table_record.schema_name,
      table_record.table_name
    );
  END LOOP;
END
$policies$;

ALTER POLICY sistema_require_authorized_user
  ON storage.objects
  USING ((SELECT sistema_authorization.request_is_authorized()))
  WITH CHECK ((SELECT sistema_authorization.request_is_authorized()));

DROP FUNCTION public.sistema_request_is_authorized();

NOTIFY pgrst, 'reload schema';
