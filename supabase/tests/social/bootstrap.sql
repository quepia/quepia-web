-- Esquema base mínimo para probar las migraciones sociales en PGlite.
-- Reproduce solo lo que las migraciones sociales referencian; las tablas
-- Zernio de fase uno se crean con sus migraciones reales.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE mcp_authenticated NOLOGIN;
CREATE ROLE supabase_auth_admin NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, mcp_authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, mcp_authenticated;

CREATE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::JSONB
$$;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::UUID
$$;
GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO PUBLIC;

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  name VARCHAR NOT NULL,
  slug VARCHAR,
  email VARCHAR,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
-- Réplica de los grants amplios observados en producción.
GRANT ALL ON public.clients TO anon, authenticated, service_role;

CREATE TABLE public.sistema_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  role TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_authorized BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.sistema_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  parent_id UUID,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.sistema_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL DEFAULT ''
);

-- Réplica de columnas y CHECK de producción (2026-09-18).
CREATE TABLE public.sistema_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  actor_id UUID,
  type TEXT NOT NULL CHECK (type = ANY (ARRAY['mention', 'assignment', 'approval_request', 'status_change', 'comment', 'system'])),
  title TEXT NOT NULL,
  content TEXT,
  link TEXT,
  data JSONB DEFAULT '{}'::JSONB,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Stubs del control plane MCP (la lógica real vive en migraciones previas).
CREATE TABLE private.mcp_capabilities (
  capability TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  granted_by_default BOOLEAN NOT NULL DEFAULT false
);
-- Columnas relevantes replicadas de producción (2026-09-18).
CREATE TABLE private.mcp_client_policies (client_id UUID PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE private.mcp_client_capabilities (client_id UUID, capability TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (client_id, capability));
CREATE TABLE private.mcp_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, client_id UUID, valid_from TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, revoked_by UUID, revoke_reason TEXT, created_at TIMESTAMPTZ DEFAULT now(), created_by UUID
);
CREATE TABLE private.mcp_access_grant_capabilities (grant_id UUID, capability TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (grant_id, capability));
CREATE TABLE private.test_mcp_audit (id SERIAL PRIMARY KEY, action TEXT, outcome TEXT, details JSONB);

CREATE FUNCTION private.mcp_error(p_code TEXT, p_message TEXT, p_details JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('ok', false, 'data', NULL,
    'error', jsonb_strip_nulls(jsonb_build_object('code', p_code, 'message', p_message, 'details', p_details)))
$$;
CREATE FUNCTION private.mcp_ok(p_data JSONB) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('ok', true, 'data', p_data, 'error', NULL)
$$;
CREATE FUNCTION private.mcp_json_has_only_keys(p_value JSONB, p_keys TEXT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_value) AS key WHERE NOT (key = ANY(p_keys)))
$$;
CREATE FUNCTION private.mcp_audit_event(
  p_event TEXT, p_action TEXT, p_outcome TEXT, p_user UUID, p_client UUID, p_session UUID,
  p_operation UUID, p_capability TEXT, p_details JSONB
) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO private.test_mcp_audit(action, outcome, details) VALUES (p_action, p_outcome, p_details)
$$;
-- Autoriza si el usuario del JWT tiene un grant vigente con la capacidad.
CREATE FUNCTION private.mcp_authorize(
  p_capability TEXT, p_action TEXT, p_rate_class TEXT DEFAULT 'read', p_consume_rate BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN private.mcp_error('unauthenticated', 'A valid user JWT is required.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.mcp_access_grants AS g
    JOIN private.mcp_access_grant_capabilities AS c ON c.grant_id = g.id
    JOIN private.mcp_client_capabilities AS cc ON cc.client_id = g.client_id AND cc.capability = c.capability
    WHERE g.user_id = auth.uid() AND g.client_id = NULLIF(auth.jwt() ->> 'client_id', '')::UUID
      AND g.revoked_at IS NULL AND c.capability = p_capability
  ) THEN
    RETURN private.mcp_error('capability_denied', 'Capability not granted.');
  END IF;
  RETURN private.mcp_ok(jsonb_build_object('user_id', auth.uid(), 'capabilities', jsonb_build_array(p_capability)));
END $$;
