-- Kepia is a closed system. Google/Supabase authentication identifies a user,
-- but only an explicit admin approval in sistema_users authorizes access.

ALTER TABLE public.sistema_users
  ADD COLUMN IF NOT EXISTS is_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_granted_by UUID;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sistema_users_access_granted_by_fkey'
      AND conrelid = 'public.sistema_users'::REGCLASS
  ) THEN
    ALTER TABLE public.sistema_users
      ADD CONSTRAINT sistema_users_access_granted_by_fkey
      FOREIGN KEY (access_granted_by)
      REFERENCES public.sistema_users(id)
      ON DELETE SET NULL;
  END IF;
END
$migration$;

-- Existing admins and accounts created through the admin invitation flow keep
-- access. Direct Google accounts that were silently auto-created by the old
-- callback become pending so an admin can explicitly approve the legitimate
-- ones and the test/random accounts are denied immediately.
UPDATE public.sistema_users AS sistema_user
SET
  is_authorized = (
    sistema_user.role = 'admin'
    OR EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      WHERE auth_user.id = sistema_user.id
        AND auth_user.invited_at IS NOT NULL
    )
  ),
  access_granted_at = CASE
    WHEN sistema_user.role = 'admin' THEN
      COALESCE(sistema_user.access_granted_at, sistema_user.created_at, NOW())
    WHEN EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      WHERE auth_user.id = sistema_user.id
        AND auth_user.invited_at IS NOT NULL
    ) THEN COALESCE(
      sistema_user.access_granted_at,
      (
        SELECT auth_user.invited_at
        FROM auth.users AS auth_user
        WHERE auth_user.id = sistema_user.id
      ),
      sistema_user.created_at,
      NOW()
    )
    ELSE NULL
  END,
  access_granted_by = CASE
    WHEN sistema_user.role = 'admin'
      OR EXISTS (
        SELECT 1
        FROM auth.users AS auth_user
        WHERE auth_user.id = sistema_user.id
          AND auth_user.invited_at IS NOT NULL
      )
    THEN sistema_user.access_granted_by
    ELSE NULL
  END;

CREATE INDEX IF NOT EXISTS idx_sistema_users_authorized_active
  ON public.sistema_users (id)
  WHERE is_authorized AND is_active AND deleted_at IS NULL;

COMMENT ON COLUMN public.sistema_users.is_authorized IS
  'Explicit Kepia system allowlist decision managed by an authorized admin.';
COMMENT ON COLUMN public.sistema_users.access_granted_at IS
  'Timestamp of the latest explicit access grant.';
COMMENT ON COLUMN public.sistema_users.access_granted_by IS
  'Admin who most recently granted access.';

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sistema_user_is_authorized(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sistema_users AS sistema_user
    WHERE sistema_user.id = p_user_id
      AND sistema_user.is_authorized
      AND sistema_user.is_active
      AND sistema_user.deleted_at IS NULL
  );
$function$;

REVOKE EXECUTE ON FUNCTION private.sistema_user_is_authorized(UUID)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated,
    supabase_auth_admin;

-- This auth-bound wrapper deliberately exposes only the current request's own
-- authorization decision. Keeping the UUID-taking helper private prevents an
-- authenticated caller from probing another user's status and preserves the
-- private schema boundary.
CREATE OR REPLACE FUNCTION public.sistema_request_is_authorized()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.sistema_user_is_authorized((SELECT auth.uid()));
$function$;

REVOKE EXECUTE ON FUNCTION public.sistema_request_is_authorized()
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated,
    supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.sistema_request_is_authorized()
  TO authenticated;

-- Keep the existing web and MCP admin checks aligned with the allowlist.
CREATE OR REPLACE FUNCTION private.mcp_is_active_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sistema_users AS sistema_user
    WHERE sistema_user.id = p_user_id
      AND sistema_user.role = 'admin'
      AND sistema_user.is_authorized
      AND sistema_user.is_active
      AND sistema_user.deleted_at IS NULL
  );
$function$;

REVOKE EXECUTE ON FUNCTION private.mcp_is_active_admin(UUID)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated,
    supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.sistema_is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.mcp_is_active_admin(p_user_id);
$function$;

-- A browser user cannot grant themselves access or rewrite its audit fields.
-- The management API uses the service role only after verifying the requester
-- as an active, authorized admin.
CREATE OR REPLACE FUNCTION private.sistema_guard_access_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id UUID := auth.uid();
BEGIN
  IF actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.mcp_is_active_admin(actor_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_authorized
      OR NEW.access_granted_at IS NOT NULL
      OR NEW.access_granted_by IS NOT NULL
    THEN
      RAISE EXCEPTION 'A non-admin cannot authorize a sistema user'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.is_authorized IS DISTINCT FROM OLD.is_authorized
    OR NEW.access_granted_at IS DISTINCT FROM OLD.access_granted_at
    OR NEW.access_granted_by IS DISTINCT FROM OLD.access_granted_by
  THEN
    RAISE EXCEPTION 'A non-admin cannot change sistema access authorization'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.sistema_guard_access_authorization()
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated,
    supabase_auth_admin;

DROP TRIGGER IF EXISTS sistema_guard_access_authorization
  ON public.sistema_users;
CREATE TRIGGER sistema_guard_access_authorization
  BEFORE INSERT OR UPDATE OF is_authorized, access_granted_at, access_granted_by
  ON public.sistema_users
  FOR EACH ROW
  EXECUTE FUNCTION private.sistema_guard_access_authorization();

-- Remove the old self-registration path. Profiles are now created or approved
-- exclusively through the server-side admin management endpoint.
DROP POLICY IF EXISTS sistema_users_insert_self_or_admin
  ON public.sistema_users;
REVOKE INSERT ON TABLE public.sistema_users FROM authenticated;

-- Add a restrictive authorization gate to every current Kepia system table.
-- It is ANDed with the existing ownership/role policies, so those rules remain
-- in force after the allowlist check succeeds.
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
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schema_name,
      table_record.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_require_authorized_user ON %I.%I',
      table_record.schema_name,
      table_record.table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_require_authorized_user ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.sistema_request_is_authorized())) WITH CHECK ((SELECT public.sistema_request_is_authorized()))',
      table_record.schema_name,
      table_record.table_name
    );
  END LOOP;
END
$policies$;

-- Storage is a separate schema and must enforce the same decision. This blocks
-- an authenticated-but-unapproved Google account from uploading even if an old
-- permissive bucket policy still exists.
DROP POLICY IF EXISTS sistema_require_authorized_user
  ON storage.objects;
CREATE POLICY sistema_require_authorized_user
ON storage.objects
AS RESTRICTIVE
FOR ALL TO authenticated
USING ((SELECT public.sistema_request_is_authorized()))
WITH CHECK ((SELECT public.sistema_request_is_authorized()));

NOTIFY pgrst, 'reload schema';
