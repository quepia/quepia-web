-- Close the calendar RPC impersonation path without changing its API signature.
CREATE OR REPLACE FUNCTION public.bulk_insert_calendar_events(
  events jsonb, p_project_id uuid, p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  ev jsonb;
  inserted_count integer := 0;
BEGIN
  IF actor_id IS NULL
    OR p_user_id IS DISTINCT FROM actor_id
    OR NULLIF(auth.jwt() ->> 'client_id', '') IS NOT NULL
    OR COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated'
    OR NOT private.sistema_user_is_authorized(actor_id)
  THEN
    RAISE EXCEPTION 'Not authorized to import calendar events' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sistema_projects WHERE id = p_project_id AND owner_id = actor_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.sistema_project_members
    WHERE project_id = p_project_id AND user_id = actor_id AND role IN ('owner', 'admin', 'member')
  ) THEN
    RAISE EXCEPTION 'Project access denied' USING ERRCODE = '42501';
  END IF;

  IF events IS NULL OR jsonb_typeof(events) <> 'array' THEN
    RAISE EXCEPTION 'Events must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(events) > 1000 OR octet_length(events::text) > 1000000 THEN
    RAISE EXCEPTION 'Calendar import is too large' USING ERRCODE = '22023';
  END IF;

  FOR ev IN SELECT * FROM jsonb_array_elements(events)
  LOOP
    INSERT INTO public.sistema_calendar_events (
      project_id, titulo, descripcion, tipo, fecha_inicio, todo_el_dia, color, created_by
    ) VALUES (
      p_project_id, ev->>'titulo', ev->>'descripcion', COALESCE(ev->>'tipo', 'publicacion'),
      (ev->>'fecha_inicio')::timestamptz, COALESCE((ev->>'todo_el_dia')::boolean, true),
      COALESCE(ev->>'color', '#22c55e'), actor_id
    );
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bulk_insert_calendar_events(jsonb, uuid, uuid)
  FROM PUBLIC, anon, mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_calendar_events(jsonb, uuid, uuid) TO authenticated;

-- Prevent untrusted schemas from shadowing names in privileged legacy functions.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
DO $hardening$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname IN ('sql', 'plpgsql')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) setting
        WHERE setting LIKE 'search_path=%'
      )
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.signature);
  END LOOP;

  -- Triggers are invoked by PostgreSQL; they are not public RPC entrypoints.
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
  END LOOP;

  -- Internal helpers remain callable from their privileged parent functions.
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proname IN (
      '_resolve_client_token', 'is_org_admin', 'is_project_admin', 'is_project_editor',
      'is_project_member', 'sistema_can_access_project', 'sistema_can_access_proposal',
      'sistema_can_manage_project', 'sistema_can_manage_proposal', 'sistema_is_admin'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
    IF fn.signature::text LIKE '_resolve_client_token(%' THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.signature);
    END IF;
  END LOOP;
END;
$hardening$;

NOTIFY pgrst, 'reload schema';
