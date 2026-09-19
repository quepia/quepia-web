-- Gestión social (Zernio), fase 0: identidad comercial, propiedad multicuenta,
-- auditoría, cola durable, webhooks y estado de sincronización.
--
-- Modelo de acceso: TODO el módulo es exclusivo de administradores globales
-- (role = 'admin', is_authorized, is_active, deleted_at IS NULL). Las tablas
-- son server-only: RLS activo sin políticas permisivas y sin grants para anon,
-- authenticated ni mcp_authenticated. El servidor Next.js valida al
-- administrador antes de usar service_role, y cada RPC vuelve a validarlo en
-- la base (defensa en profundidad: service_role elude RLS).
--
-- Expandir-migrar-adaptar: no se quita la unicidad de
-- sistema_zernio_profiles.project_id porque getProjectIntegration() espera una
-- sola fila por proyecto. Solo se vuelve opcional para admitir perfiles de
-- cliente que no pertenecen a un proyecto.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.clients') IS NULL
    OR to_regclass('public.sistema_users') IS NULL
    OR to_regclass('public.sistema_projects') IS NULL
    OR to_regclass('public.sistema_tasks') IS NULL
    OR to_regclass('public.sistema_zernio_profiles') IS NULL
    OR to_regclass('public.sistema_zernio_accounts') IS NULL
    OR to_regclass('public.sistema_zernio_publications') IS NULL
  THEN
    RAISE EXCEPTION 'Faltan tablas base de Quepia/Zernio; aplicar primero las migraciones previas';
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- 1. Predicado único de administrador global y envoltorios de respuesta
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.social_is_global_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_is_global_admin$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sistema_users AS sistema_user
    WHERE sistema_user.id = p_user_id
      AND sistema_user.role = 'admin'
      AND sistema_user.is_authorized IS TRUE
      AND sistema_user.is_active IS TRUE
      AND sistema_user.deleted_at IS NULL
  );
$social_is_global_admin$;

CREATE OR REPLACE FUNCTION private.social_ok(p_data JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_ok$
  SELECT jsonb_build_object('ok', true, 'data', COALESCE(p_data, 'null'::JSONB), 'error', NULL);
$social_ok$;

CREATE OR REPLACE FUNCTION private.social_error(
  p_code TEXT,
  p_message TEXT,
  p_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_error$
  SELECT jsonb_build_object(
    'ok', false,
    'data', NULL,
    'error', jsonb_strip_nulls(jsonb_build_object('code', p_code, 'message', p_message, 'details', p_details))
  );
$social_error$;

-- Excepción tipada: las RPC la convierten en envoltorio de error.
CREATE OR REPLACE FUNCTION private.social_raise(p_code TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $social_raise$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = p_message, DETAIL = p_code;
END
$social_raise$;

CREATE OR REPLACE FUNCTION private.social_require_admin(p_actor UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $social_require_admin$
BEGIN
  IF NOT private.social_is_global_admin(p_actor) THEN
    PERFORM private.social_raise('forbidden', 'Solo administradores globales activos y autorizados');
  END IF;
END
$social_require_admin$;

-- ---------------------------------------------------------------------------
-- 2. Identidad comercial: public.clients (se reutiliza; estaba vacía)
-- ---------------------------------------------------------------------------

-- public.clients pertenece al modelo heredado de organizaciones y tiene grants
-- amplios con RLS por organización. El módulo solo la lee/escribe mediante RPC
-- server-only; no se modifican sus políticas existentes.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS social_created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL;

ALTER TABLE public.sistema_projects
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE RESTRICT;
CREATE INDEX idx_sistema_projects_client ON public.sistema_projects(client_id) WHERE client_id IS NOT NULL;
ALTER TABLE public.sistema_projects
  ADD CONSTRAINT sistema_projects_id_client_key UNIQUE (id, client_id);

ALTER TABLE public.sistema_zernio_profiles
  ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.sistema_zernio_profiles
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE RESTRICT,
  ADD COLUMN provider_removed_at TIMESTAMPTZ;
CREATE INDEX idx_zernio_profiles_client ON public.sistema_zernio_profiles(client_id) WHERE client_id IS NOT NULL;
ALTER TABLE public.sistema_zernio_profiles
  ADD CONSTRAINT sistema_zernio_profiles_id_client_key UNIQUE (id, client_id);

-- Cuentas: identidad nativa, capacidades y salud.
ALTER TABLE public.sistema_zernio_accounts
  ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE RESTRICT,
  ADD COLUMN platform_user_id TEXT,
  ADD COLUMN account_type TEXT,
  ADD COLUMN permissions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('unknown', 'healthy', 'warning', 'error', 'needs_reconnect', 'removed')),
  ADD COLUMN health_issues JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN can_post BOOLEAN,
  ADD COLUMN can_fetch_analytics BOOLEAN,
  ADD COLUMN analytics_supported BOOLEAN,
  ADD COLUMN token_expires_at TIMESTAMPTZ,
  ADD COLUMN messaging_restriction JSONB,
  ADD COLUMN followers_count BIGINT,
  ADD COLUMN provider_analytics_synced_at TIMESTAMPTZ,
  ADD COLUMN dm_backfill_status TEXT,
  ADD COLUMN last_seen_in_provider_at TIMESTAMPTZ,
  ADD COLUMN provider_removed_at TIMESTAMPTZ,
  ADD COLUMN last_health_check_at TIMESTAMPTZ;
CREATE INDEX idx_zernio_accounts_client ON public.sistema_zernio_accounts(client_id, platform) WHERE client_id IS NOT NULL;
ALTER TABLE public.sistema_zernio_accounts
  ADD CONSTRAINT sistema_zernio_accounts_id_client_key UNIQUE (id, client_id);
-- La cuenta hereda cliente del perfil; FK compuesta impide divergencia.
ALTER TABLE public.sistema_zernio_accounts
  ADD CONSTRAINT sistema_zernio_accounts_profile_client_fkey
  FOREIGN KEY (integration_id, client_id)
  REFERENCES public.sistema_zernio_profiles(id, client_id)
  ON UPDATE CASCADE;

-- La asignación de cliente es explícita y no reclasifica el pasado:
-- NULL -> cliente está permitido; cambiar de un cliente a otro no.
CREATE OR REPLACE FUNCTION private.social_guard_client_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $social_guard_client_reassignment$
BEGIN
  IF OLD.client_id IS NOT NULL
    AND NEW.client_id IS DISTINCT FROM OLD.client_id
    AND current_setting('quepia.social_allow_client_reassignment', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'No se puede cambiar el cliente asignado: el histórico quedaría reclasificado',
      DETAIL = 'client_reassignment_blocked';
  END IF;
  RETURN NEW;
END
$social_guard_client_reassignment$;

CREATE TRIGGER sistema_projects_social_client_guard
  BEFORE UPDATE OF client_id ON public.sistema_projects
  FOR EACH ROW EXECUTE FUNCTION private.social_guard_client_reassignment();
CREATE TRIGGER sistema_zernio_profiles_social_client_guard
  BEFORE UPDATE OF client_id ON public.sistema_zernio_profiles
  FOR EACH ROW EXECUTE FUNCTION private.social_guard_client_reassignment();

-- Propaga el cliente del perfil a sus cuentas (que antes no tenían cliente).
CREATE OR REPLACE FUNCTION private.social_propagate_profile_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $social_propagate_profile_client$
BEGIN
  IF NEW.client_id IS NOT NULL AND OLD.client_id IS NULL THEN
    UPDATE public.sistema_zernio_accounts
    SET client_id = NEW.client_id, updated_at = now()
    WHERE integration_id = NEW.id AND client_id IS NULL;
  END IF;
  RETURN NEW;
END
$social_propagate_profile_client$;

CREATE TRIGGER sistema_zernio_profiles_social_client_propagate
  AFTER UPDATE OF client_id ON public.sistema_zernio_profiles
  FOR EACH ROW EXECUTE FUNCTION private.social_propagate_profile_client();

-- Una cuenta nueva de un perfil ya asignado nace con su cliente.
CREATE OR REPLACE FUNCTION private.social_inherit_account_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $social_inherit_account_client$
BEGIN
  IF NEW.client_id IS NULL THEN
    SELECT profile.client_id INTO NEW.client_id
    FROM public.sistema_zernio_profiles AS profile
    WHERE profile.id = NEW.integration_id;
  END IF;
  RETURN NEW;
END
$social_inherit_account_client$;

CREATE TRIGGER sistema_zernio_accounts_social_inherit_client
  BEFORE INSERT OR UPDATE OF integration_id ON public.sistema_zernio_accounts
  FOR EACH ROW EXECUTE FUNCTION private.social_inherit_account_client();

-- ---------------------------------------------------------------------------
-- 3. Vínculos proyecto–perfil y proyecto–cuenta (histórico con vigencia)
-- ---------------------------------------------------------------------------

CREATE TABLE public.sistema_social_project_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, client_id) REFERENCES public.sistema_projects(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id, client_id) REFERENCES public.sistema_zernio_profiles(id, client_id) ON DELETE CASCADE,
  UNIQUE (project_id, profile_id)
);
CREATE UNIQUE INDEX uq_social_project_default_profile
  ON public.sistema_social_project_profiles(project_id) WHERE is_default;
CREATE INDEX idx_social_project_profiles_profile ON public.sistema_social_project_profiles(profile_id);

CREATE TABLE public.sistema_social_project_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL,
  account_id UUID NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ,
  created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  ended_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, client_id) REFERENCES public.sistema_projects(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX uq_social_project_account_open
  ON public.sistema_social_project_accounts(project_id, account_id) WHERE valid_to IS NULL;
CREATE INDEX idx_social_project_accounts_account ON public.sistema_social_project_accounts(account_id);

-- Historial de identidades/conexiones del proveedor.
CREATE TABLE public.sistema_social_account_connections (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.sistema_zernio_accounts(id) ON DELETE CASCADE,
  zernio_account_id TEXT NOT NULL,
  zernio_profile_id TEXT,
  platform_user_id TEXT,
  event TEXT NOT NULL CHECK (event IN (
    'discovered', 'connected', 'reconnected', 'disconnected', 'identity_changed', 'removed_from_provider', 'restored'
  )),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_account_connections_account ON public.sistema_social_account_connections(account_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Auditoría (append-only), payloads saneados, webhooks, cola, sync
-- ---------------------------------------------------------------------------

CREATE TABLE public.sistema_social_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('admin', 'worker', 'webhook', 'mcp', 'system', 'ai')),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::JSONB,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_audit_client_time ON public.sistema_social_audit_events(client_id, created_at DESC);
CREATE INDEX idx_social_audit_entity ON public.sistema_social_audit_events(entity_type, entity_id);

CREATE OR REPLACE FUNCTION private.social_audit_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $social_audit_append_only$
BEGIN
  RAISE EXCEPTION 'La auditoría social es de solo inserción';
END
$social_audit_append_only$;

CREATE TRIGGER sistema_social_audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.sistema_social_audit_events
  FOR EACH ROW EXECUTE FUNCTION private.social_audit_append_only();

CREATE OR REPLACE FUNCTION private.social_audit(
  p_actor UUID,
  p_actor_kind TEXT,
  p_client_id UUID,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_action TEXT,
  p_changes JSONB DEFAULT '{}'::JSONB,
  p_correlation_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SET search_path = ''
AS $social_audit$
  INSERT INTO public.sistema_social_audit_events(
    actor_id, actor_kind, client_id, entity_type, entity_id, action, changes, correlation_id
  ) VALUES (
    p_actor, p_actor_kind, p_client_id, p_entity_type, p_entity_id, p_action,
    COALESCE(p_changes, '{}'::JSONB), p_correlation_id
  );
$social_audit$;

-- JSON original saneado (sin secretos). Retención configurable por fila.
CREATE TABLE public.sistema_social_provider_payloads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'api')),
  endpoint TEXT NOT NULL,
  entity_type TEXT,
  external_id TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contains_private_content BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'zernio-v1',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retain_until TIMESTAMPTZ NOT NULL,
  redacted_at TIMESTAMPTZ,
  UNIQUE (source, endpoint, payload_hash)
);
CREATE INDEX idx_social_payloads_retention ON public.sistema_social_provider_payloads(retain_until) WHERE redacted_at IS NULL;
CREATE INDEX idx_social_payloads_entity ON public.sistema_social_provider_payloads(entity_type, external_id);

CREATE TABLE public.sistema_social_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'zernio',
  environment TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('analytics', 'operations')),
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ,
  zernio_account_id TEXT,
  zernio_profile_id TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'quarantined', 'ignored', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload_id BIGINT REFERENCES public.sistema_social_provider_payloads(id) ON DELETE SET NULL,
  duplicate_deliveries INTEGER NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, environment, external_event_id)
);
CREATE INDEX idx_social_webhook_status ON public.sistema_social_webhook_events(status, received_at);
CREATE INDEX idx_social_webhook_account ON public.sistema_social_webhook_events(zernio_account_id, received_at DESC);

-- Cola durable con leases: sobrevive a caídas del worker.
CREATE TABLE public.sistema_social_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  dedupe_key TEXT,
  priority SMALLINT NOT NULL DEFAULT 50,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  result JSONB,
  correlation_id TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_social_jobs_active_dedupe
  ON public.sistema_social_jobs(dedupe_key) WHERE status IN ('queued', 'running') AND dedupe_key IS NOT NULL;
CREATE INDEX idx_social_jobs_ready ON public.sistema_social_jobs(priority, run_after) WHERE status = 'queued';
CREATE INDEX idx_social_jobs_lease ON public.sistema_social_jobs(lease_expires_at) WHERE status = 'running';

CREATE TABLE public.sistema_social_sync_state (
  stream TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  cursor TEXT,
  cursor_obtained_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'bootstrapping', 'ok', 'degraded', 'error', 'expired')),
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stream, scope_key)
);

CREATE TABLE public.sistema_social_sync_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id UUID REFERENCES public.sistema_social_jobs(id) ON DELETE SET NULL,
  stream TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  pages INTEGER NOT NULL DEFAULT 0,
  items_seen INTEGER NOT NULL DEFAULT 0,
  items_written INTEGER NOT NULL DEFAULT 0,
  items_skipped INTEGER NOT NULL DEFAULT 0,
  coverage JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT,
  correlation_id TEXT
);
CREATE INDEX idx_social_sync_runs_stream ON public.sistema_social_sync_runs(stream, scope_key, started_at DESC);

-- Acciones externas durables (respuestas, DMs, automatizaciones).
CREATE TABLE public.sistema_social_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'reply_comment', 'send_dm', 'private_reply', 'set_conversation_status',
    'automation_create', 'automation_update', 'automation_pause', 'automation_resume'
  )),
  target_ref JSONB NOT NULL DEFAULT '{}'::JSONB,
  request JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'ambiguous', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_result JSONB,
  provider_reference TEXT,
  last_error TEXT,
  created_by UUID NOT NULL REFERENCES public.sistema_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id)
);
CREATE INDEX idx_social_outbox_status ON public.sistema_social_outbox(status, created_at);

-- ---------------------------------------------------------------------------
-- 5. Server-only: RLS sin políticas permisivas, sin grants de navegador/MCP
-- ---------------------------------------------------------------------------

DO $server_only$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sistema_social_project_profiles',
    'sistema_social_project_accounts',
    'sistema_social_account_connections',
    'sistema_social_audit_events',
    'sistema_social_provider_payloads',
    'sistema_social_webhook_events',
    'sistema_social_jobs',
    'sistema_social_sync_state',
    'sistema_social_sync_runs',
    'sistema_social_outbox'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM mcp_authenticated', table_name);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END
$server_only$;

REVOKE EXECUTE ON FUNCTION private.social_is_global_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.social_ok(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.social_error(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.social_raise(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.social_require_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.social_audit(UUID, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 6. RPC server-only de fundamentos
-- ---------------------------------------------------------------------------

-- Autorización comprobable desde el servidor (misma regla que la base).
CREATE OR REPLACE FUNCTION public.social_check_admin(p_actor UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_check_admin$
  SELECT private.social_is_global_admin(p_actor);
$social_check_admin$;

-- Reconciliación atómica de cuentas de un perfil (reemplaza el patrón
-- "desactivar todo y luego upsert"). Si p_complete es false (respuesta parcial
-- del proveedor) no se marca ninguna cuenta como eliminada.
CREATE OR REPLACE FUNCTION public.social_reconcile_profile_accounts(
  p_profile_id UUID,
  p_accounts JSONB,
  p_complete BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_reconcile_profile_accounts$
DECLARE
  profile_row public.sistema_zernio_profiles%ROWTYPE;
  item JSONB;
  existing public.sistema_zernio_accounts%ROWTYPE;
  seen_ids TEXT[] := '{}';
  now_value TIMESTAMPTZ := now();
  inserted_count INTEGER := 0;
  updated_count INTEGER := 0;
  removed_count INTEGER := 0;
  new_platform_user TEXT;
  account_uuid UUID;
BEGIN
  IF jsonb_typeof(p_accounts) IS DISTINCT FROM 'array' THEN
    RETURN private.social_error('invalid_request', 'p_accounts debe ser un arreglo');
  END IF;

  SELECT * INTO profile_row FROM public.sistema_zernio_profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Perfil inexistente');
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_accounts) LOOP
    IF COALESCE(item ->> 'zernio_account_id', '') = '' OR COALESCE(item ->> 'platform', '') = '' THEN
      CONTINUE;
    END IF;
    seen_ids := array_append(seen_ids, item ->> 'zernio_account_id');
    new_platform_user := NULLIF(item ->> 'platform_user_id', '');

    SELECT * INTO existing FROM public.sistema_zernio_accounts
    WHERE zernio_account_id = item ->> 'zernio_account_id' FOR UPDATE;

    IF FOUND AND existing.integration_id <> p_profile_id THEN
      -- Nunca mover una cuenta entre perfiles en silencio: podría cruzar clientes.
      PERFORM private.social_audit(NULL, 'worker', existing.client_id, 'account', existing.id::TEXT,
        'account.profile_mismatch',
        jsonb_build_object('expected_profile', existing.integration_id, 'reported_profile', p_profile_id));
      CONTINUE;
    END IF;

    IF FOUND THEN
      UPDATE public.sistema_zernio_accounts SET
        platform = item ->> 'platform',
        username = NULLIF(item ->> 'username', ''),
        display_name = NULLIF(item ->> 'display_name', ''),
        profile_picture = NULLIF(item ->> 'profile_picture', ''),
        profile_url = NULLIF(item ->> 'profile_url', ''),
        is_active = COALESCE((item ->> 'is_active')::BOOLEAN, true),
        needs_reconnection = COALESCE((item ->> 'needs_reconnection')::BOOLEAN, false),
        metadata = COALESCE(item -> 'metadata', existing.metadata),
        platform_user_id = COALESCE(new_platform_user, existing.platform_user_id),
        account_type = COALESCE(NULLIF(item ->> 'account_type', ''), existing.account_type),
        permissions = COALESCE(ARRAY(SELECT jsonb_array_elements_text(item -> 'permissions')), existing.permissions),
        followers_count = COALESCE((item ->> 'followers_count')::BIGINT, existing.followers_count),
        provider_analytics_synced_at = COALESCE((item ->> 'analytics_last_synced_at')::TIMESTAMPTZ, existing.provider_analytics_synced_at),
        dm_backfill_status = COALESCE(NULLIF(item ->> 'dm_backfill_status', ''), existing.dm_backfill_status),
        token_expires_at = COALESCE((item ->> 'token_expires_at')::TIMESTAMPTZ, existing.token_expires_at),
        last_seen_in_provider_at = now_value,
        provider_removed_at = NULL,
        health_status = CASE WHEN existing.health_status = 'removed' THEN 'unknown' ELSE existing.health_status END,
        updated_at = now_value
      WHERE id = existing.id;
      updated_count := updated_count + 1;

      IF existing.provider_removed_at IS NOT NULL THEN
        INSERT INTO public.sistema_social_account_connections(account_id, zernio_account_id, zernio_profile_id, platform_user_id, event)
        VALUES (existing.id, existing.zernio_account_id, profile_row.zernio_profile_id, new_platform_user, 'restored');
      END IF;
      IF new_platform_user IS NOT NULL AND existing.platform_user_id IS NOT NULL
        AND new_platform_user <> existing.platform_user_id THEN
        INSERT INTO public.sistema_social_account_connections(account_id, zernio_account_id, zernio_profile_id, platform_user_id, event, details)
        VALUES (existing.id, existing.zernio_account_id, profile_row.zernio_profile_id, new_platform_user, 'identity_changed',
          jsonb_build_object('previous_platform_user_id', existing.platform_user_id));
        PERFORM private.social_audit(NULL, 'worker', existing.client_id, 'account', existing.id::TEXT,
          'account.identity_changed', jsonb_build_object('previous', existing.platform_user_id, 'current', new_platform_user));
      END IF;
    ELSE
      INSERT INTO public.sistema_zernio_accounts(
        integration_id, zernio_account_id, platform, username, display_name, profile_picture, profile_url,
        is_active, needs_reconnection, metadata, platform_user_id, account_type, permissions, followers_count,
        provider_analytics_synced_at, dm_backfill_status, token_expires_at, last_seen_in_provider_at, updated_at
      ) VALUES (
        p_profile_id, item ->> 'zernio_account_id', item ->> 'platform', NULLIF(item ->> 'username', ''),
        NULLIF(item ->> 'display_name', ''), NULLIF(item ->> 'profile_picture', ''), NULLIF(item ->> 'profile_url', ''),
        COALESCE((item ->> 'is_active')::BOOLEAN, true), COALESCE((item ->> 'needs_reconnection')::BOOLEAN, false),
        COALESCE(item -> 'metadata', '{}'::JSONB), new_platform_user, NULLIF(item ->> 'account_type', ''),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(item -> 'permissions')), '{}'),
        (item ->> 'followers_count')::BIGINT, (item ->> 'analytics_last_synced_at')::TIMESTAMPTZ,
        NULLIF(item ->> 'dm_backfill_status', ''), (item ->> 'token_expires_at')::TIMESTAMPTZ, now_value, now_value
      ) RETURNING id INTO account_uuid;
      inserted_count := inserted_count + 1;
      INSERT INTO public.sistema_social_account_connections(account_id, zernio_account_id, zernio_profile_id, platform_user_id, event)
      VALUES (account_uuid, item ->> 'zernio_account_id', profile_row.zernio_profile_id, new_platform_user, 'discovered');
    END IF;
  END LOOP;

  IF p_complete THEN
    WITH removed AS (
      UPDATE public.sistema_zernio_accounts AS account SET
        is_active = false,
        provider_removed_at = COALESCE(account.provider_removed_at, now_value),
        health_status = 'removed',
        updated_at = now_value
      WHERE account.integration_id = p_profile_id
        AND NOT (account.zernio_account_id = ANY(seen_ids))
        AND account.provider_removed_at IS NULL
      RETURNING account.id, account.zernio_account_id, account.client_id
    ), logged AS (
      INSERT INTO public.sistema_social_account_connections(account_id, zernio_account_id, zernio_profile_id, event)
      SELECT removed.id, removed.zernio_account_id, profile_row.zernio_profile_id, 'removed_from_provider' FROM removed
      RETURNING 1
    )
    SELECT count(*) INTO removed_count FROM logged;
  END IF;

  UPDATE public.sistema_zernio_profiles
  SET last_synced_at = now_value, status = 'active', provider_removed_at = NULL, updated_at = now_value
  WHERE id = p_profile_id;

  RETURN private.social_ok(jsonb_build_object(
    'inserted', inserted_count, 'updated', updated_count, 'removed', removed_count, 'complete', p_complete
  ));
END
$social_reconcile_profile_accounts$;

-- Salud por cuenta (GET /accounts/health). Solo actualiza cuentas conocidas.
CREATE OR REPLACE FUNCTION public.social_apply_account_health(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_apply_account_health$
DECLARE
  item JSONB;
  touched INTEGER := 0;
  unknown_ids TEXT[] := '{}';
  status_value TEXT;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RETURN private.social_error('invalid_request', 'p_items debe ser un arreglo');
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    status_value := CASE
      WHEN COALESCE((item ->> 'needs_reconnect')::BOOLEAN, false) THEN 'needs_reconnect'
      WHEN item ->> 'status' IN ('healthy', 'warning', 'error') THEN item ->> 'status'
      ELSE 'unknown'
    END;
    UPDATE public.sistema_zernio_accounts SET
      health_status = CASE WHEN provider_removed_at IS NOT NULL THEN 'removed' ELSE status_value END,
      health_issues = COALESCE(item -> 'issues', '[]'::JSONB),
      can_post = (item ->> 'can_post')::BOOLEAN,
      can_fetch_analytics = (item ->> 'can_fetch_analytics')::BOOLEAN,
      analytics_supported = (item ->> 'analytics_supported')::BOOLEAN,
      token_expires_at = COALESCE((item ->> 'token_expires_at')::TIMESTAMPTZ, token_expires_at),
      messaging_restriction = item -> 'messaging_restriction',
      needs_reconnection = COALESCE((item ->> 'needs_reconnect')::BOOLEAN, needs_reconnection),
      last_health_check_at = now(),
      updated_at = now()
    WHERE zernio_account_id = item ->> 'zernio_account_id';
    IF FOUND THEN
      touched := touched + 1;
    ELSE
      unknown_ids := array_append(unknown_ids, item ->> 'zernio_account_id');
    END IF;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('updated', touched, 'unknown_accounts', to_jsonb(unknown_ids)));
END
$social_apply_account_health$;

-- Crear cliente y asignar proyecto/perfil: acciones explícitas de admin.
CREATE OR REPLACE FUNCTION public.social_admin_create_client(p_actor UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_create_client$
DECLARE
  social_err_detail TEXT;
  clean_name TEXT := btrim(COALESCE(p_name, ''));
  new_id UUID;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF length(clean_name) < 2 OR length(clean_name) > 120 THEN
    RETURN private.social_error('invalid_name', 'El nombre debe tener entre 2 y 120 caracteres');
  END IF;
  IF EXISTS (SELECT 1 FROM public.clients WHERE lower(name) = lower(clean_name)) THEN
    RETURN private.social_error('duplicate_client', 'Ya existe un cliente con ese nombre');
  END IF;
  INSERT INTO public.clients(name, is_active, social_created_by, created_at, updated_at)
  VALUES (clean_name, true, p_actor, now(), now())
  RETURNING id INTO new_id;
  PERFORM private.social_audit(p_actor, 'admin', new_id, 'client', new_id::TEXT, 'client.created',
    jsonb_build_object('name', clean_name));
  RETURN private.social_ok(jsonb_build_object('id', new_id, 'name', clean_name));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_create_client$;

CREATE OR REPLACE FUNCTION public.social_admin_assign_project_client(
  p_actor UUID,
  p_project_id UUID,
  p_client_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_assign_project_client$
DECLARE
  social_err_detail TEXT;
  project_row public.sistema_projects%ROWTYPE;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
    RETURN private.social_error('not_found', 'Cliente inexistente');
  END IF;
  SELECT * INTO project_row FROM public.sistema_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Proyecto inexistente');
  END IF;
  IF project_row.client_id = p_client_id THEN
    RETURN private.social_ok(jsonb_build_object('project_id', p_project_id, 'client_id', p_client_id, 'changed', false));
  END IF;
  IF project_row.client_id IS NOT NULL THEN
    RETURN private.social_error('client_reassignment_blocked',
      'El proyecto ya pertenece a otro cliente; reasignarlo reclasificaría el histórico');
  END IF;
  UPDATE public.sistema_projects SET client_id = p_client_id WHERE id = p_project_id;

  -- Compatibilidad: el perfil heredado del proyecto pasa a ser su perfil
  -- predeterminado, si todavía no tiene cliente o ya es de este cliente.
  UPDATE public.sistema_zernio_profiles SET client_id = p_client_id, updated_at = now()
  WHERE project_id = p_project_id AND client_id IS NULL;
  INSERT INTO public.sistema_social_project_profiles(client_id, project_id, profile_id, is_default, created_by)
  SELECT p_client_id, p_project_id, profile.id, true, p_actor
  FROM public.sistema_zernio_profiles AS profile
  WHERE profile.project_id = p_project_id AND profile.client_id = p_client_id
  ON CONFLICT (project_id, profile_id) DO NOTHING;
  -- Las cuentas de ese perfil quedan vinculadas al proyecto desde ahora.
  INSERT INTO public.sistema_social_project_accounts(client_id, project_id, account_id, created_by)
  SELECT p_client_id, p_project_id, account.id, p_actor
  FROM public.sistema_zernio_accounts AS account
  JOIN public.sistema_zernio_profiles AS profile ON profile.id = account.integration_id
  WHERE profile.project_id = p_project_id AND account.client_id = p_client_id
  ON CONFLICT DO NOTHING;

  PERFORM private.social_audit(p_actor, 'admin', p_client_id, 'project', p_project_id::TEXT,
    'project.client_assigned', jsonb_build_object('client_id', p_client_id));
  RETURN private.social_ok(jsonb_build_object('project_id', p_project_id, 'client_id', p_client_id, 'changed', true));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_assign_project_client$;

CREATE OR REPLACE FUNCTION public.social_admin_assign_profile_client(
  p_actor UUID,
  p_profile_id UUID,
  p_client_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_assign_profile_client$
DECLARE
  social_err_detail TEXT;
  profile_row public.sistema_zernio_profiles%ROWTYPE;
  project_client UUID;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
    RETURN private.social_error('not_found', 'Cliente inexistente');
  END IF;
  SELECT * INTO profile_row FROM public.sistema_zernio_profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Perfil inexistente');
  END IF;
  IF profile_row.client_id = p_client_id THEN
    RETURN private.social_ok(jsonb_build_object('profile_id', p_profile_id, 'changed', false));
  END IF;
  IF profile_row.client_id IS NOT NULL THEN
    RETURN private.social_error('client_reassignment_blocked', 'El perfil ya pertenece a otro cliente');
  END IF;
  IF profile_row.project_id IS NOT NULL THEN
    SELECT client_id INTO project_client FROM public.sistema_projects WHERE id = profile_row.project_id;
    IF project_client IS NOT NULL AND project_client <> p_client_id THEN
      RETURN private.social_error('scope_mismatch', 'El proyecto del perfil pertenece a otro cliente');
    END IF;
  END IF;
  UPDATE public.sistema_zernio_profiles SET client_id = p_client_id, updated_at = now() WHERE id = p_profile_id;
  PERFORM private.social_audit(p_actor, 'admin', p_client_id, 'profile', p_profile_id::TEXT,
    'profile.client_assigned', jsonb_build_object('client_id', p_client_id));
  RETURN private.social_ok(jsonb_build_object('profile_id', p_profile_id, 'changed', true));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_assign_profile_client$;

-- Vincular/desvincular cuenta a proyecto (mismo cliente, con vigencia).
CREATE OR REPLACE FUNCTION public.social_admin_link_project_account(
  p_actor UUID,
  p_project_id UUID,
  p_account_id UUID,
  p_link BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_link_project_account$
DECLARE
  social_err_detail TEXT;
  project_client UUID;
  account_client UUID;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT client_id INTO project_client FROM public.sistema_projects WHERE id = p_project_id;
  SELECT client_id INTO account_client FROM public.sistema_zernio_accounts WHERE id = p_account_id;
  IF project_client IS NULL OR account_client IS NULL THEN
    RETURN private.social_error('client_required', 'Proyecto y cuenta deben tener cliente asignado');
  END IF;
  IF project_client <> account_client THEN
    RETURN private.social_error('scope_mismatch', 'La cuenta pertenece a otro cliente');
  END IF;
  IF p_link THEN
    INSERT INTO public.sistema_social_project_accounts(client_id, project_id, account_id, created_by)
    VALUES (project_client, p_project_id, p_account_id, p_actor)
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.sistema_social_project_accounts
    SET valid_to = now(), ended_by = p_actor
    WHERE project_id = p_project_id AND account_id = p_account_id AND valid_to IS NULL;
  END IF;
  PERFORM private.social_audit(p_actor, 'admin', project_client, 'project_account',
    p_project_id::TEXT || ':' || p_account_id::TEXT,
    CASE WHEN p_link THEN 'project_account.linked' ELSE 'project_account.unlinked' END, '{}'::JSONB);
  RETURN private.social_ok(jsonb_build_object('linked', p_link));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_link_project_account$;

-- Perfiles del proveedor que no existen localmente (p. ej. "Default"):
-- se registran sin cliente ni proyecto; quedan en cuarentena hasta asignarlos.
CREATE OR REPLACE FUNCTION public.social_register_provider_profiles(p_profiles JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_register_provider_profiles$
DECLARE
  item JSONB;
  created INTEGER := 0;
  seen TEXT[] := '{}';
BEGIN
  IF jsonb_typeof(p_profiles) IS DISTINCT FROM 'array' THEN
    RETURN private.social_error('invalid_request', 'p_profiles debe ser un arreglo');
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_profiles) LOOP
    CONTINUE WHEN COALESCE(item ->> 'zernio_profile_id', '') = '';
    seen := array_append(seen, item ->> 'zernio_profile_id');
    INSERT INTO public.sistema_zernio_profiles(project_id, zernio_profile_id, name, status, last_synced_at)
    VALUES (NULL, item ->> 'zernio_profile_id', COALESCE(NULLIF(item ->> 'name', ''), 'Perfil Zernio'), 'active', now())
    ON CONFLICT (zernio_profile_id) DO NOTHING;
    IF FOUND THEN created := created + 1; END IF;
  END LOOP;
  UPDATE public.sistema_zernio_profiles SET provider_removed_at = COALESCE(provider_removed_at, now()), status = 'disconnected'
  WHERE NOT (zernio_profile_id = ANY(seen)) AND provider_removed_at IS NULL;
  UPDATE public.sistema_zernio_profiles SET provider_removed_at = NULL
  WHERE zernio_profile_id = ANY(seen) AND provider_removed_at IS NOT NULL;
  RETURN private.social_ok(jsonb_build_object('created', created, 'seen', cardinality(seen)));
END
$social_register_provider_profiles$;

-- ---------------------------------------------------------------------------
-- 7. Cola durable: encolar, reclamar con lease, completar y fallar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.social_enqueue_job(
  p_kind TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB,
  p_dedupe_key TEXT DEFAULT NULL,
  p_priority SMALLINT DEFAULT 50,
  p_run_after TIMESTAMPTZ DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_enqueue_job$
DECLARE
  job_row public.sistema_social_jobs%ROWTYPE;
BEGIN
  IF p_kind !~ '^[a-z][a-z0-9_.]{2,60}$' THEN
    RETURN private.social_error('invalid_kind', 'Tipo de trabajo inválido');
  END IF;
  INSERT INTO public.sistema_social_jobs(kind, payload, dedupe_key, priority, run_after, client_id, created_by)
  VALUES (p_kind, COALESCE(p_payload, '{}'::JSONB), p_dedupe_key, COALESCE(p_priority, 50),
    COALESCE(p_run_after, now()), p_client_id, p_created_by)
  ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') AND dedupe_key IS NOT NULL
  DO NOTHING
  RETURNING * INTO job_row;
  IF NOT FOUND THEN
    SELECT * INTO job_row FROM public.sistema_social_jobs
    WHERE dedupe_key = p_dedupe_key AND status IN ('queued', 'running');
    RETURN private.social_ok(jsonb_build_object('id', job_row.id, 'deduplicated', true));
  END IF;
  RETURN private.social_ok(jsonb_build_object('id', job_row.id, 'deduplicated', false));
END
$social_enqueue_job$;

-- Reclama hasta p_limit trabajos listos. Recupera leases vencidos (worker
-- caído) devolviéndolos a la cola antes de reclamar.
CREATE OR REPLACE FUNCTION public.social_claim_jobs(
  p_worker TEXT,
  p_limit INTEGER DEFAULT 5,
  p_lease_seconds INTEGER DEFAULT 120,
  p_kinds TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_claim_jobs$
DECLARE
  claimed JSONB;
  recovered INTEGER;
BEGIN
  WITH expired AS (
    UPDATE public.sistema_social_jobs SET
      status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
      locked_by = NULL,
      lease_expires_at = NULL,
      last_error = COALESCE(last_error, '') || CASE WHEN last_error IS NULL THEN '' ELSE ' | ' END || 'lease vencido',
      run_after = now(),
      updated_at = now()
    WHERE status = 'running' AND lease_expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO recovered FROM expired;

  WITH ready AS (
    SELECT id FROM public.sistema_social_jobs
    WHERE status = 'queued' AND run_after <= now()
      AND (p_kinds IS NULL OR kind = ANY(p_kinds))
    ORDER BY priority, run_after, created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 25))
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.sistema_social_jobs AS job SET
      status = 'running',
      attempts = job.attempts + 1,
      locked_by = p_worker,
      lease_expires_at = now() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_lease_seconds, 120), 900))),
      started_at = COALESCE(job.started_at, now()),
      updated_at = now()
    FROM ready
    WHERE job.id = ready.id
    RETURNING job.id, job.kind, job.payload, job.attempts, job.max_attempts, job.client_id, job.correlation_id, job.priority
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(updated) ORDER BY updated.priority), '[]'::JSONB) INTO claimed FROM updated;

  RETURN private.social_ok(jsonb_build_object('jobs', claimed, 'recovered_leases', recovered));
END
$social_claim_jobs$;

CREATE OR REPLACE FUNCTION public.social_complete_job(
  p_job_id UUID,
  p_worker TEXT,
  p_result JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_complete_job$
BEGIN
  UPDATE public.sistema_social_jobs SET
    status = 'succeeded', result = p_result, locked_by = NULL, lease_expires_at = NULL,
    finished_at = now(), updated_at = now(), last_error = NULL
  WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker;
  IF NOT FOUND THEN
    RETURN private.social_error('lease_lost', 'El trabajo ya no pertenece a este worker');
  END IF;
  RETURN private.social_ok(jsonb_build_object('id', p_job_id));
END
$social_complete_job$;

-- p_terminal: error no reintentable (402, validación, permiso).
CREATE OR REPLACE FUNCTION public.social_fail_job(
  p_job_id UUID,
  p_worker TEXT,
  p_error TEXT,
  p_retry_after_seconds INTEGER DEFAULT NULL,
  p_terminal BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_fail_job$
DECLARE
  job_row public.sistema_social_jobs%ROWTYPE;
  delay_seconds INTEGER;
  next_status TEXT;
BEGIN
  SELECT * INTO job_row FROM public.sistema_social_jobs
  WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('lease_lost', 'El trabajo ya no pertenece a este worker');
  END IF;
  -- Backoff exponencial con jitter, acotado a 1 hora; respeta Retry-After.
  delay_seconds := COALESCE(
    p_retry_after_seconds,
    LEAST(3600, (power(2, LEAST(job_row.attempts, 11))::INTEGER * 5) + floor(random() * 15)::INTEGER)
  );
  next_status := CASE
    WHEN p_terminal THEN 'failed'
    WHEN job_row.attempts >= job_row.max_attempts THEN 'dead'
    ELSE 'queued'
  END;
  UPDATE public.sistema_social_jobs SET
    status = next_status,
    last_error = left(p_error, 2000),
    locked_by = NULL,
    lease_expires_at = NULL,
    run_after = now() + make_interval(secs => delay_seconds),
    finished_at = CASE WHEN next_status IN ('failed', 'dead') THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_job_id;
  RETURN private.social_ok(jsonb_build_object('id', p_job_id, 'status', next_status, 'retry_in_seconds', delay_seconds));
END
$social_fail_job$;

CREATE OR REPLACE FUNCTION public.social_extend_job_lease(p_job_id UUID, p_worker TEXT, p_seconds INTEGER DEFAULT 120)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_extend_job_lease$
BEGIN
  UPDATE public.sistema_social_jobs
  SET lease_expires_at = now() + make_interval(secs => GREATEST(30, LEAST(p_seconds, 900))), updated_at = now()
  WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker;
  IF NOT FOUND THEN
    RETURN private.social_error('lease_lost', 'El trabajo ya no pertenece a este worker');
  END IF;
  RETURN private.social_ok(jsonb_build_object('id', p_job_id));
END
$social_extend_job_lease$;

-- ---------------------------------------------------------------------------
-- 8. Webhooks: persistencia y deduplicación antes del ack
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.social_record_webhook(
  p_environment TEXT,
  p_channel TEXT,
  p_external_event_id TEXT,
  p_event_type TEXT,
  p_event_timestamp TIMESTAMPTZ,
  p_zernio_account_id TEXT,
  p_zernio_profile_id TEXT,
  p_payload JSONB,
  p_payload_hash TEXT,
  p_contains_private BOOLEAN,
  p_retention_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_record_webhook$
DECLARE
  payload_ref BIGINT;
  event_row public.sistema_social_webhook_events%ROWTYPE;
  account_client UUID;
BEGIN
  IF COALESCE(p_external_event_id, '') = '' OR length(p_external_event_id) > 200 THEN
    RETURN private.social_error('invalid_event_id', 'Evento sin identificador válido');
  END IF;

  SELECT * INTO event_row FROM public.sistema_social_webhook_events
  WHERE provider = 'zernio' AND environment = p_environment AND external_event_id = p_external_event_id;
  IF FOUND THEN
    UPDATE public.sistema_social_webhook_events
    SET duplicate_deliveries = duplicate_deliveries + 1
    WHERE id = event_row.id;
    RETURN private.social_ok(jsonb_build_object('id', event_row.id, 'duplicate', true, 'status', event_row.status));
  END IF;

  INSERT INTO public.sistema_social_provider_payloads(
    source, endpoint, entity_type, external_id, contains_private_content, payload, payload_hash, retain_until
  ) VALUES (
    'webhook', p_channel || ':' || p_event_type, 'webhook_event', p_external_event_id,
    COALESCE(p_contains_private, false), p_payload, p_payload_hash,
    now() + make_interval(days => GREATEST(1, LEAST(COALESCE(p_retention_days, 30), 365)))
  )
  ON CONFLICT (source, endpoint, payload_hash) DO UPDATE SET received_at = EXCLUDED.received_at
  RETURNING id INTO payload_ref;

  IF p_zernio_account_id IS NOT NULL THEN
    SELECT client_id INTO account_client FROM public.sistema_zernio_accounts WHERE zernio_account_id = p_zernio_account_id;
  END IF;

  INSERT INTO public.sistema_social_webhook_events(
    environment, channel, external_event_id, event_type, event_timestamp, zernio_account_id,
    zernio_profile_id, client_id, payload_id
  ) VALUES (
    p_environment, p_channel, p_external_event_id, p_event_type, p_event_timestamp, p_zernio_account_id,
    p_zernio_profile_id, account_client, payload_ref
  )
  ON CONFLICT (provider, environment, external_event_id) DO NOTHING
  RETURNING * INTO event_row;

  IF NOT FOUND THEN
    RETURN private.social_ok(jsonb_build_object('duplicate', true));
  END IF;
  RETURN private.social_ok(jsonb_build_object('id', event_row.id, 'duplicate', false));
END
$social_record_webhook$;

-- Retención: redacta payloads vencidos (conserva hash y metadatos).
CREATE OR REPLACE FUNCTION public.social_apply_payload_retention(p_limit INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_apply_payload_retention$
DECLARE
  redacted INTEGER;
BEGIN
  WITH due AS (
    SELECT id FROM public.sistema_social_provider_payloads
    WHERE redacted_at IS NULL AND retain_until < now()
    ORDER BY retain_until
    LIMIT GREATEST(1, LEAST(p_limit, 5000))
  ), updated AS (
    UPDATE public.sistema_social_provider_payloads AS payload
    SET payload = jsonb_build_object('redacted', true), redacted_at = now()
    FROM due WHERE payload.id = due.id
    RETURNING 1
  )
  SELECT count(*) INTO redacted FROM updated;
  RETURN private.social_ok(jsonb_build_object('redacted', redacted));
END
$social_apply_payload_retention$;

-- Sync state: lectura y checkpoint.
CREATE OR REPLACE FUNCTION public.social_get_sync_state(p_stream TEXT, p_scope_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_get_sync_state$
  SELECT private.social_ok(COALESCE(
    (SELECT to_jsonb(state) FROM public.sistema_social_sync_state AS state
     WHERE state.stream = p_stream AND state.scope_key = p_scope_key),
    'null'::JSONB
  ));
$social_get_sync_state$;

CREATE OR REPLACE FUNCTION public.social_set_sync_state(
  p_stream TEXT,
  p_scope_key TEXT,
  p_status TEXT,
  p_cursor TEXT DEFAULT NULL,
  p_cursor_obtained_at TIMESTAMPTZ DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_success BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_set_sync_state$
BEGIN
  INSERT INTO public.sistema_social_sync_state(
    stream, scope_key, status, cursor, cursor_obtained_at, last_attempt_at, last_success_at, last_error, details, updated_at
  ) VALUES (
    p_stream, p_scope_key, p_status, p_cursor, p_cursor_obtained_at, now(),
    CASE WHEN p_success THEN now() END, p_error, COALESCE(p_details, '{}'::JSONB), now()
  )
  ON CONFLICT (stream, scope_key) DO UPDATE SET
    status = EXCLUDED.status,
    cursor = COALESCE(EXCLUDED.cursor, public.sistema_social_sync_state.cursor),
    cursor_obtained_at = COALESCE(EXCLUDED.cursor_obtained_at, public.sistema_social_sync_state.cursor_obtained_at),
    last_attempt_at = now(),
    last_success_at = CASE WHEN p_success THEN now() ELSE public.sistema_social_sync_state.last_success_at END,
    last_error = EXCLUDED.last_error,
    details = public.sistema_social_sync_state.details || COALESCE(p_details, '{}'::JSONB),
    updated_at = now();
  RETURN private.social_ok(jsonb_build_object('stream', p_stream, 'scope_key', p_scope_key));
END
$social_set_sync_state$;

CREATE OR REPLACE FUNCTION public.social_record_sync_run(p_run JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_record_sync_run$
DECLARE
  run_id BIGINT;
BEGIN
  INSERT INTO public.sistema_social_sync_runs(
    job_id, stream, scope_key, status, started_at, finished_at, pages, items_seen, items_written,
    items_skipped, coverage, error, correlation_id
  ) VALUES (
    NULLIF(p_run ->> 'job_id', '')::UUID, p_run ->> 'stream', COALESCE(p_run ->> 'scope_key', 'global'),
    COALESCE(p_run ->> 'status', 'succeeded'), COALESCE((p_run ->> 'started_at')::TIMESTAMPTZ, now()), now(),
    COALESCE((p_run ->> 'pages')::INTEGER, 0), COALESCE((p_run ->> 'items_seen')::INTEGER, 0),
    COALESCE((p_run ->> 'items_written')::INTEGER, 0), COALESCE((p_run ->> 'items_skipped')::INTEGER, 0),
    COALESCE(p_run -> 'coverage', '{}'::JSONB), left(p_run ->> 'error', 2000), p_run ->> 'correlation_id'
  ) RETURNING id INTO run_id;
  RETURN private.social_ok(jsonb_build_object('id', run_id));
END
$social_record_sync_run$;

-- Solo service_role ejecuta las RPC del módulo.
DO $rpc_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.social_check_admin(uuid)',
    'public.social_reconcile_profile_accounts(uuid,jsonb,boolean)',
    'public.social_apply_account_health(jsonb)',
    'public.social_admin_create_client(uuid,text)',
    'public.social_admin_assign_project_client(uuid,uuid,uuid)',
    'public.social_admin_assign_profile_client(uuid,uuid,uuid)',
    'public.social_admin_link_project_account(uuid,uuid,uuid,boolean)',
    'public.social_register_provider_profiles(jsonb)',
    'public.social_enqueue_job(text,jsonb,text,smallint,timestamptz,uuid,uuid)',
    'public.social_claim_jobs(text,integer,integer,text[])',
    'public.social_complete_job(uuid,text,jsonb)',
    'public.social_fail_job(uuid,text,text,integer,boolean)',
    'public.social_extend_job_lease(uuid,text,integer)',
    'public.social_record_webhook(text,text,text,text,timestamptz,text,text,jsonb,text,boolean,integer)',
    'public.social_apply_payload_retention(integer)',
    'public.social_get_sync_state(text,text)',
    'public.social_set_sync_state(text,text,text,text,timestamptz,text,jsonb,boolean)',
    'public.social_record_sync_run(jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM mcp_authenticated', function_signature);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
  END LOOP;
END
$rpc_grants$;

-- ---------------------------------------------------------------------------
-- 9. Soporte del worker: programación periódica, webhooks y cuentas activas
-- ---------------------------------------------------------------------------

-- Reconciliación por ID de perfil del proveedor (perfiles desconocidos se
-- registran antes con social_register_provider_profiles).
CREATE OR REPLACE FUNCTION public.social_reconcile_provider_profile(
  p_zernio_profile_id TEXT,
  p_accounts JSONB,
  p_complete BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_reconcile_provider_profile$
DECLARE
  profile_uuid UUID;
BEGIN
  SELECT id INTO profile_uuid FROM public.sistema_zernio_profiles WHERE zernio_profile_id = p_zernio_profile_id;
  IF profile_uuid IS NULL THEN
    RETURN private.social_error('not_found', 'Perfil del proveedor no registrado');
  END IF;
  RETURN public.social_reconcile_profile_accounts(profile_uuid, p_accounts, p_complete);
END
$social_reconcile_provider_profile$;

-- Cuentas y perfiles operables por el worker (solo con cliente asignado).
CREATE OR REPLACE FUNCTION public.social_worker_accounts()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_worker_accounts$
  SELECT private.social_ok(jsonb_build_object(
    'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', account.id, 'zernio_account_id', account.zernio_account_id, 'platform', account.platform,
      'client_id', account.client_id, 'permissions', to_jsonb(account.permissions),
      'health_status', account.health_status, 'dm_backfill_status', account.dm_backfill_status,
      'zernio_profile_id', profile.zernio_profile_id
    ) ORDER BY account.updated_at)
      FROM public.sistema_zernio_accounts AS account
      JOIN public.sistema_zernio_profiles AS profile ON profile.id = account.integration_id
      WHERE account.client_id IS NOT NULL AND account.is_active AND account.provider_removed_at IS NULL), '[]'::JSONB),
    'profiles', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', profile.id, 'zernio_profile_id', profile.zernio_profile_id,
      'client_id', profile.client_id))
      FROM public.sistema_zernio_profiles AS profile
      WHERE profile.client_id IS NOT NULL AND profile.provider_removed_at IS NULL), '[]'::JSONB)
  ));
$social_worker_accounts$;

-- Encola trabajos periódicos sin duplicar un mismo bucket temporal aunque el
-- trabajo anterior ya haya terminado.
CREATE OR REPLACE FUNCTION public.social_schedule_jobs(p_specs JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_schedule_jobs$
DECLARE
  spec JSONB;
  created INTEGER := 0;
BEGIN
  FOR spec IN SELECT value FROM jsonb_array_elements(COALESCE(p_specs, '[]'::JSONB)) LOOP
    CONTINUE WHEN COALESCE(spec ->> 'kind', '') !~ '^[a-z][a-z0-9_.]{2,60}$' OR COALESCE(spec ->> 'dedupe_key', '') = '';
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.sistema_social_jobs
      WHERE dedupe_key = spec ->> 'dedupe_key'
        AND (status IN ('queued', 'running') OR created_at > now() - make_interval(hours => COALESCE((spec ->> 'window_hours')::INTEGER, 36)))
    );
    INSERT INTO public.sistema_social_jobs(kind, dedupe_key, priority, payload, run_after)
    VALUES (spec ->> 'kind', spec ->> 'dedupe_key', COALESCE((spec ->> 'priority')::SMALLINT, 50),
      COALESCE(spec -> 'payload', '{}'::JSONB), COALESCE((spec ->> 'run_after')::TIMESTAMPTZ, now()))
    ON CONFLICT DO NOTHING;
    IF FOUND THEN created := created + 1; END IF;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('created', created));
END
$social_schedule_jobs$;

-- Toma eventos pendientes (o atascados en processing) para procesarlos.
CREATE OR REPLACE FUNCTION public.social_webhook_claim(p_limit INTEGER DEFAULT 25)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_webhook_claim$
DECLARE
  claimed JSONB;
BEGIN
  WITH candidates AS (
    SELECT id FROM public.sistema_social_webhook_events
    WHERE status = 'pending'
      OR (status = 'processing' AND received_at < now() - interval '10 minutes' AND attempts < 8)
      OR (status = 'failed' AND attempts < 8)
    ORDER BY received_at
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.sistema_social_webhook_events AS event
    SET status = 'processing', attempts = event.attempts + 1
    FROM candidates WHERE event.id = candidates.id
    RETURNING event.id, event.event_type, event.channel, event.event_timestamp, event.payload_id, event.received_at
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', updated.id, 'event_type', updated.event_type, 'channel', updated.channel,
    'event_timestamp', updated.event_timestamp, 'payload', payload.payload
  ) ORDER BY updated.received_at), '[]'::JSONB) INTO claimed
  FROM updated LEFT JOIN public.sistema_social_provider_payloads AS payload ON payload.id = updated.payload_id;
  RETURN private.social_ok(claimed);
END
$social_webhook_claim$;

CREATE OR REPLACE FUNCTION public.social_webhook_mark(p_event_id UUID, p_status TEXT, p_error TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_webhook_mark$
BEGIN
  IF p_status NOT IN ('processed', 'quarantined', 'ignored', 'failed') THEN
    RETURN private.social_error('invalid_status', 'Estado de evento inválido');
  END IF;
  UPDATE public.sistema_social_webhook_events SET
    status = p_status, last_error = left(p_error, 1000),
    processed_at = CASE WHEN p_status IN ('processed', 'ignored') THEN now() ELSE processed_at END,
    client_id = COALESCE(client_id, (SELECT account.client_id FROM public.sistema_zernio_accounts AS account
      WHERE account.zernio_account_id = public.sistema_social_webhook_events.zernio_account_id))
  WHERE id = p_event_id;
  RETURN private.social_ok(jsonb_build_object('id', p_event_id, 'status', p_status));
END
$social_webhook_mark$;

-- Tras asignar cliente a una cuenta, un admin reprocesa su cuarentena.
CREATE OR REPLACE FUNCTION public.social_admin_requeue_quarantine(p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_requeue_quarantine$
DECLARE
  requeued INTEGER;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  WITH updated AS (
    UPDATE public.sistema_social_webhook_events AS event SET status = 'pending', attempts = 0
    WHERE event.status = 'quarantined' AND EXISTS (
      SELECT 1 FROM public.sistema_zernio_accounts AS account
      WHERE account.zernio_account_id = event.zernio_account_id AND account.client_id IS NOT NULL)
    RETURNING 1
  )
  SELECT count(*) INTO requeued FROM updated;
  PERFORM private.social_audit(p_actor, 'admin', NULL, 'webhook', NULL, 'webhook.quarantine_requeued', jsonb_build_object('count', requeued));
  RETURN private.social_ok(jsonb_build_object('requeued', requeued));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_requeue_quarantine$;

-- Panel de conexiones: perfiles/cuentas (incluye sin asignar), proyectos y clientes.
CREATE OR REPLACE FUNCTION public.social_admin_connections(p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_connections$
DECLARE
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  RETURN private.social_ok(jsonb_build_object(
    'clients', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', client.id, 'name', client.name) ORDER BY client.name)
      FROM public.clients AS client WHERE client.social_created_by IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.sistema_projects WHERE client_id = client.id)), '[]'::JSONB),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', project.id, 'name', project.nombre, 'client_id', project.client_id,
      'parent_id', project.parent_id) ORDER BY project.nombre) FROM public.sistema_projects AS project), '[]'::JSONB),
    'profiles', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', profile.id, 'zernio_profile_id', profile.zernio_profile_id, 'name', profile.name, 'project_id', profile.project_id,
      'client_id', profile.client_id, 'status', profile.status, 'provider_removed_at', profile.provider_removed_at,
      'last_synced_at', profile.last_synced_at,
      'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', account.id, 'platform', account.platform, 'username', account.username, 'display_name', account.display_name,
        'is_active', account.is_active, 'needs_reconnection', account.needs_reconnection, 'health_status', account.health_status,
        'health_issues', account.health_issues, 'permissions', to_jsonb(account.permissions),
        'can_post', account.can_post, 'can_fetch_analytics', account.can_fetch_analytics,
        'token_expires_at', account.token_expires_at, 'provider_removed_at', account.provider_removed_at,
        'last_health_check_at', account.last_health_check_at, 'provider_analytics_synced_at', account.provider_analytics_synced_at,
        'dm_backfill_status', account.dm_backfill_status, 'client_id', account.client_id,
        'linked_project_ids', COALESCE((SELECT jsonb_agg(link.project_id) FROM public.sistema_social_project_accounts AS link
          WHERE link.account_id = account.id AND link.valid_to IS NULL), '[]'::JSONB)
      ) ORDER BY account.platform) FROM public.sistema_zernio_accounts AS account WHERE account.integration_id = profile.id), '[]'::JSONB)
    ) ORDER BY profile.client_id NULLS FIRST, profile.name) FROM public.sistema_zernio_profiles AS profile), '[]'::JSONB),
    'quarantined_events', (SELECT count(*) FROM public.sistema_social_webhook_events WHERE status = 'quarantined'),
    'admins', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', person.id, 'name', person.nombre) ORDER BY person.nombre)
      FROM public.sistema_users AS person WHERE private.social_is_global_admin(person.id)), '[]'::JSONB),
    'recent_sync_runs', COALESCE((SELECT jsonb_agg(to_jsonb(run) ORDER BY run.started_at DESC) FROM (
      SELECT stream, scope_key, status, started_at, finished_at, pages, items_seen, items_written, items_skipped, error
      FROM public.sistema_social_sync_runs ORDER BY started_at DESC LIMIT 20) AS run), '[]'::JSONB),
    'jobs', COALESCE((SELECT jsonb_agg(to_jsonb(job) ORDER BY job.updated_at DESC) FROM (
      SELECT kind, status, attempts, last_error, run_after, updated_at FROM public.sistema_social_jobs
      WHERE status IN ('failed', 'dead', 'running', 'queued') ORDER BY updated_at DESC LIMIT 20) AS job), '[]'::JSONB)
  ));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_connections$;

-- Solicitud manual acotada de sincronización (no dispara fan-out inmediato).
CREATE OR REPLACE FUNCTION public.social_admin_request_sync(p_actor UUID, p_kinds TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_request_sync$
DECLARE
  kind_value TEXT;
  created INTEGER := 0;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  FOREACH kind_value IN ARRAY COALESCE(p_kinds, '{}') LOOP
    CONTINUE WHEN NOT kind_value = ANY(ARRAY['inventory.reconcile', 'health.check', 'analytics.delta', 'analytics.bootstrap',
      'followers.daily', 'timeline.backfill', 'ig_insights.refresh', 'inbox.backfill', 'automations.sync']);
    INSERT INTO public.sistema_social_jobs(kind, dedupe_key, priority, created_by)
    VALUES (kind_value, 'manual:' || kind_value, 15, p_actor)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN created := created + 1; END IF;
  END LOOP;
  PERFORM private.social_audit(p_actor, 'admin', NULL, 'sync', NULL, 'sync.requested', jsonb_build_object('kinds', to_jsonb(p_kinds)));
  RETURN private.social_ok(jsonb_build_object('enqueued', created));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_request_sync$;

DO $worker_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.social_reconcile_provider_profile(text,jsonb,boolean)',
    'public.social_worker_accounts()',
    'public.social_schedule_jobs(jsonb)',
    'public.social_webhook_claim(integer)',
    'public.social_webhook_mark(uuid,text,text)',
    'public.social_admin_requeue_quarantine(uuid)',
    'public.social_admin_connections(uuid)',
    'public.social_admin_request_sync(uuid,text[])'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM mcp_authenticated', function_signature);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
  END LOOP;
END
$worker_grants$;

NOTIFY pgrst, 'reload schema';
