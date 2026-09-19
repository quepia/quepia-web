-- Gestión social, fase 3: automatizaciones.
--
-- Separación de motores:
-- * Zernio ejecuta las automatizaciones nativas de mensajes (comentario→DM y
--   respuesta a Story→DM, con respuesta pública opcional documentada en
--   POST /v1/comment-automations). Quepia guarda borradores versionados y solo
--   las crea/pausa en Zernio tras la aprobación explícita de un admin sobre un
--   hash de configuración concreto.
-- * Quepia ejecuta reglas internas: asignación automática y recordatorios de
--   SLA (solo efectos locales: responsables y notificaciones in-app).
-- Crear una automatización en Zernio la deja activa (el contrato de creación
-- no acepta isActive): por eso "activar" = crear, y nunca ocurre al guardar.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.sistema_social_threads') IS NULL THEN
    RAISE EXCEPTION 'Aplicar primero la migración de bandeja';
  END IF;
END
$preflight$;

CREATE TABLE public.sistema_social_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('zernio_comment_to_dm', 'quepia_assignment', 'quepia_sla_reminder')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  trigger TEXT CHECK (trigger IN ('comment', 'story_reply')),
  platform_post_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_activation', 'active', 'pending_pause', 'paused', 'error', 'archived', 'external_unmanaged')),
  current_version INTEGER NOT NULL DEFAULT 1,
  zernio_automation_id TEXT UNIQUE,
  daily_cap INTEGER CHECK (daily_cap IS NULL OR daily_cap BETWEEN 1 AND 5000),
  last_provider_stats JSONB,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  activated_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  paused_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  paused_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id),
  UNIQUE (id, client_id)
);
CREATE INDEX idx_social_automations_account ON public.sistema_social_automations(account_id, status);

CREATE TABLE public.sistema_social_automation_versions (
  automation_id UUID NOT NULL REFERENCES public.sistema_social_automations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  config JSONB NOT NULL,
  config_hash TEXT NOT NULL,
  created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (automation_id, version)
);

CREATE TABLE public.sistema_social_automation_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  automation_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('zernio_log', 'quepia_engine')),
  dedupe_key TEXT NOT NULL UNIQUE,
  external_log_id TEXT,
  trigger_external_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped', 'pending', 'gated', 'applied')),
  comment_reply_status TEXT,
  error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (automation_id, client_id) REFERENCES public.sistema_social_automations(id, client_id) ON DELETE CASCADE
);
CREATE INDEX idx_social_automation_runs ON public.sistema_social_automation_runs(automation_id, occurred_at DESC);

DO $server_only$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sistema_social_automations', 'sistema_social_automation_versions', 'sistema_social_automation_runs']
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

-- ---------------------------------------------------------------------------
-- Validación de configuración (contrato documentado de Zernio)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.social_normalize_keywords(p_value JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_normalize_keywords$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT lower(btrim(value)) FROM jsonb_array_elements_text(COALESCE(p_value, '[]'::JSONB)) AS value
    WHERE btrim(value) <> ''
  ), '{}');
$social_normalize_keywords$;

CREATE OR REPLACE FUNCTION private.social_validate_automation_config(
  p_engine TEXT,
  p_platform TEXT,
  p_config JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $social_validate_automation_config$
DECLARE
  keywords TEXT[] := private.social_normalize_keywords(p_config -> 'keywords');
  buttons_count INTEGER := COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_config -> 'buttons') = 'array' THEN p_config -> 'buttons' END), 0);
  dm_length INTEGER := length(COALESCE(p_config ->> 'dm_message', ''));
BEGIN
  IF p_engine = 'zernio_comment_to_dm' THEN
    IF p_platform NOT IN ('instagram', 'facebook') THEN
      RETURN 'Las automatizaciones comentario→DM de Zernio solo existen para Instagram y Facebook';
    END IF;
    IF COALESCE(p_config ->> 'trigger', 'comment') NOT IN ('comment', 'story_reply') THEN
      RETURN 'Disparador inválido';
    END IF;
    IF p_config ->> 'trigger' = 'story_reply' AND p_platform <> 'instagram' THEN
      RETURN 'La respuesta a Stories solo existe en Instagram';
    END IF;
    IF dm_length = 0 OR dm_length > 1000 OR (buttons_count > 0 AND dm_length > 640) THEN
      RETURN 'El DM es obligatorio: hasta 1000 caracteres, o 640 si tiene botones';
    END IF;
    IF buttons_count > 3 THEN
      RETURN 'Máximo 3 botones';
    END IF;
    IF COALESCE(p_config ->> 'match_mode', 'contains') NOT IN ('contains', 'word', 'exact') THEN
      RETURN 'match_mode inválido';
    END IF;
    IF COALESCE((p_config ->> 'also_match_in_dms')::BOOLEAN, false) AND cardinality(keywords) = 0 THEN
      RETURN 'alsoMatchInDms exige al menos una palabra clave (sin palabras respondería todos los DMs)';
    END IF;
    IF COALESCE((p_config ->> 'typo_tolerance')::BOOLEAN, false) AND COALESCE(p_config ->> 'match_mode', 'contains') <> 'word' THEN
      RETURN 'La tolerancia a errores solo aplica con match_mode=word';
    END IF;
    IF COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_config -> 'dm_message_variations') = 'array' THEN p_config -> 'dm_message_variations' END), 0) > 5
      OR COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_config -> 'comment_reply_variations') = 'array' THEN p_config -> 'comment_reply_variations' END), 0) > 5 THEN
      RETURN 'Máximo 5 variaciones';
    END IF;
    IF COALESCE((p_config ->> 'dm_delay_seconds')::INTEGER, 0) NOT BETWEEN 0 AND 86400 THEN
      RETURN 'La demora del DM debe estar entre 0 y 86400 segundos';
    END IF;
    IF p_config ->> 'trigger' = 'story_reply' AND COALESCE(p_config ->> 'comment_reply', '') <> '' THEN
      RETURN 'Una respuesta a Story no admite respuesta pública';
    END IF;
  ELSIF p_engine = 'quepia_assignment' THEN
    IF COALESCE(p_config ->> 'assignee_id', '') !~* '^[0-9a-f-]{36}$' THEN
      RETURN 'Elegí un responsable';
    END IF;
  ELSIF p_engine = 'quepia_sla_reminder' THEN
    IF COALESCE((p_config ->> 'after_minutes')::INTEGER, 0) NOT BETWEEN 5 AND 10080 THEN
      RETURN 'El recordatorio debe dispararse entre 5 minutos y 7 días';
    END IF;
  ELSE
    RETURN 'Motor desconocido';
  END IF;
  RETURN NULL;
END
$social_validate_automation_config$;

-- Conflictos con otras reglas de la misma cuenta.
CREATE OR REPLACE FUNCTION private.social_automation_conflicts(p_automation_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_automation_conflicts$
  WITH target AS (
    SELECT automation.*, version.config
    FROM public.sistema_social_automations AS automation
    JOIN public.sistema_social_automation_versions AS version
      ON version.automation_id = automation.id AND version.version = automation.current_version
    WHERE automation.id = p_automation_id
  ), others AS (
    SELECT automation.*, version.config
    FROM public.sistema_social_automations AS automation
    LEFT JOIN public.sistema_social_automation_versions AS version
      ON version.automation_id = automation.id AND version.version = automation.current_version
    JOIN target ON target.account_id = automation.account_id AND target.engine = automation.engine
    WHERE automation.id <> p_automation_id
      AND automation.status IN ('active', 'pending_activation', 'external_unmanaged', 'paused')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'automation_id', others.id,
    'name', others.name,
    'status', others.status,
    'severity', CASE
      WHEN others.platform_post_id IS NOT NULL AND others.platform_post_id = target.platform_post_id
        AND COALESCE(others.trigger, 'comment') = COALESCE(target.trigger, 'comment')
        AND others.status IN ('active', 'pending_activation', 'external_unmanaged') THEN 'blocking'
      ELSE 'warning'
    END,
    'reason', CASE
      WHEN others.platform_post_id IS NOT NULL AND others.platform_post_id = target.platform_post_id
        THEN 'Zernio admite una sola regla específica activa por publicación'
      WHEN others.status = 'external_unmanaged' THEN 'Regla creada fuera de Quepia en la misma cuenta'
      WHEN cardinality(private.social_normalize_keywords(others.config -> 'keywords')) = 0
        OR cardinality(private.social_normalize_keywords(target.config -> 'keywords')) = 0
        THEN 'Una de las reglas responde a cualquier comentario: ambas podrían disparar'
      ELSE 'Palabras clave superpuestas: ' || array_to_string(ARRAY(
        SELECT unnest(private.social_normalize_keywords(others.config -> 'keywords'))
        INTERSECT SELECT unnest(private.social_normalize_keywords(target.config -> 'keywords'))), ', ')
    END
  )), '[]'::JSONB)
  FROM others, target
  WHERE COALESCE(others.trigger, 'comment') = COALESCE(target.trigger, 'comment')
    AND (
      (others.platform_post_id IS NOT NULL AND others.platform_post_id = target.platform_post_id)
      OR others.status = 'external_unmanaged'
      OR (others.platform_post_id IS NULL OR target.platform_post_id IS NULL) AND (
        cardinality(private.social_normalize_keywords(others.config -> 'keywords')) = 0
        OR cardinality(private.social_normalize_keywords(target.config -> 'keywords')) = 0
        OR private.social_normalize_keywords(others.config -> 'keywords') && private.social_normalize_keywords(target.config -> 'keywords')
      )
    );
$social_automation_conflicts$;

-- ---------------------------------------------------------------------------
-- RPC de administración
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.social_admin_save_automation(p_actor UUID, p_automation_id UUID, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_save_automation$
DECLARE
  account_row public.sistema_zernio_accounts%ROWTYPE;
  automation_row public.sistema_social_automations%ROWTYPE;
  config_value JSONB := COALESCE(p_payload -> 'config', '{}'::JSONB);
  engine_value TEXT := p_payload ->> 'engine';
  validation TEXT;
  next_version INTEGER;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF p_automation_id IS NOT NULL THEN
    SELECT * INTO automation_row FROM public.sistema_social_automations WHERE id = p_automation_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN private.social_error('not_found', 'Automatización inexistente');
    END IF;
    IF automation_row.status IN ('pending_activation', 'pending_pause', 'external_unmanaged') THEN
      RETURN private.social_error('locked', 'La automatización tiene un cambio en curso o no es administrada por Quepia');
    END IF;
    engine_value := automation_row.engine;
    SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE id = automation_row.account_id;
  ELSE
    SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE id = NULLIF(p_payload ->> 'account_id', '')::UUID;
    IF NOT FOUND OR account_row.client_id IS NULL THEN
      RETURN private.social_error('account_required', 'Elegí una cuenta con cliente asignado');
    END IF;
    IF NULLIF(p_payload ->> 'client_id', '')::UUID IS DISTINCT FROM account_row.client_id THEN
      RETURN private.social_error('scope_mismatch', 'La cuenta no pertenece al cliente elegido');
    END IF;
  END IF;

  validation := private.social_validate_automation_config(engine_value, account_row.platform, config_value);
  IF validation IS NOT NULL THEN
    RETURN private.social_error('invalid_config', validation);
  END IF;
  IF engine_value = 'quepia_assignment' AND NOT private.social_is_global_admin((config_value ->> 'assignee_id')::UUID) THEN
    RETURN private.social_error('invalid_assignee', 'El responsable debe ser administrador global activo');
  END IF;

  IF p_automation_id IS NULL THEN
    INSERT INTO public.sistema_social_automations(client_id, account_id, engine, name, trigger, platform_post_id, daily_cap, created_by)
    VALUES (account_row.client_id, account_row.id, engine_value, btrim(p_payload ->> 'name'),
      CASE WHEN engine_value = 'zernio_comment_to_dm' THEN COALESCE(config_value ->> 'trigger', 'comment') END,
      NULLIF(config_value ->> 'platform_post_id', ''), NULLIF(p_payload ->> 'daily_cap', '')::INTEGER, p_actor)
    RETURNING * INTO automation_row;
    next_version := 1;
  ELSE
    next_version := automation_row.current_version + 1;
    UPDATE public.sistema_social_automations SET
      name = COALESCE(NULLIF(btrim(p_payload ->> 'name'), ''), name),
      trigger = CASE WHEN engine = 'zernio_comment_to_dm' THEN COALESCE(config_value ->> 'trigger', 'comment') END,
      platform_post_id = NULLIF(config_value ->> 'platform_post_id', ''),
      daily_cap = COALESCE(NULLIF(p_payload ->> 'daily_cap', '')::INTEGER, daily_cap),
      current_version = next_version,
      updated_at = now()
    WHERE id = automation_row.id RETURNING * INTO automation_row;
  END IF;

  INSERT INTO public.sistema_social_automation_versions(automation_id, version, config, config_hash, created_by)
  VALUES (automation_row.id, next_version, config_value, md5(config_value::TEXT), p_actor);
  PERFORM private.social_audit(p_actor, 'admin', automation_row.client_id, 'automation', automation_row.id::TEXT,
    'automation.saved', jsonb_build_object('version', next_version, 'engine', engine_value));

  RETURN private.social_ok(jsonb_build_object(
    'id', automation_row.id, 'version', next_version, 'status', automation_row.status,
    'config_hash', md5(config_value::TEXT),
    'conflicts', private.social_automation_conflicts(automation_row.id),
    'requires_provider_update', automation_row.status IN ('active', 'paused') AND automation_row.engine = 'zernio_comment_to_dm'
  ));
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
    RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
  WHEN check_violation OR invalid_text_representation THEN
    RETURN private.social_error('invalid_config', 'Datos de automatización inválidos');
END
$social_admin_save_automation$;

-- Solicita activar o pausar. La activación exige el hash exacto de la
-- configuración revisada (la aprobación es sobre un resultado concreto) y
-- revalida salud, permisos y conflictos en este momento.
CREATE OR REPLACE FUNCTION public.social_admin_request_automation_state(
  p_actor UUID,
  p_automation_id UUID,
  p_target TEXT,
  p_confirm_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_request_automation_state$
DECLARE
  automation_row public.sistema_social_automations%ROWTYPE;
  version_row public.sistema_social_automation_versions%ROWTYPE;
  account_row public.sistema_zernio_accounts%ROWTYPE;
  conflicts JSONB;
  outbox_id UUID := gen_random_uuid();
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF p_target NOT IN ('active', 'paused') THEN
    RETURN private.social_error('invalid_target', 'Estado solicitado inválido');
  END IF;
  SELECT * INTO automation_row FROM public.sistema_social_automations WHERE id = p_automation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Automatización inexistente');
  END IF;
  IF automation_row.status IN ('pending_activation', 'pending_pause', 'external_unmanaged', 'archived') THEN
    RETURN private.social_error('locked', 'La automatización no admite este cambio ahora');
  END IF;
  SELECT * INTO version_row FROM public.sistema_social_automation_versions
  WHERE automation_id = p_automation_id AND version = automation_row.current_version;
  SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE id = automation_row.account_id;

  IF p_target = 'active' THEN
    IF p_confirm_hash IS DISTINCT FROM version_row.config_hash THEN
      RETURN private.social_error('confirmation_mismatch', 'La configuración cambió desde la vista previa; revisala de nuevo');
    END IF;
    IF NOT account_row.is_active OR account_row.needs_reconnection OR account_row.provider_removed_at IS NOT NULL
      OR account_row.health_status IN ('error', 'needs_reconnect', 'removed') THEN
      RETURN private.social_error('account_unavailable', 'La cuenta no está sana; reconectala antes de activar');
    END IF;
    IF automation_row.engine = 'zernio_comment_to_dm' AND account_row.platform = 'instagram'
      AND NOT (account_row.permissions @> ARRAY['instagram_business_manage_comments', 'instagram_business_manage_messages']) THEN
      RETURN private.social_error('missing_permissions', 'La conexión de Instagram no tiene permisos de comentarios y mensajes');
    END IF;
    conflicts := private.social_automation_conflicts(p_automation_id);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(conflicts) AS conflict WHERE conflict ->> 'severity' = 'blocking') THEN
      RETURN private.social_error('blocking_conflict', 'Otra regla activa ya cubre esta publicación', jsonb_build_object('conflicts', conflicts));
    END IF;
  END IF;

  IF automation_row.engine <> 'zernio_comment_to_dm' THEN
    -- Reglas internas: efecto local inmediato.
    UPDATE public.sistema_social_automations SET
      status = p_target,
      activated_by = CASE WHEN p_target = 'active' THEN p_actor ELSE activated_by END,
      activated_at = CASE WHEN p_target = 'active' THEN now() ELSE activated_at END,
      paused_by = CASE WHEN p_target = 'paused' THEN p_actor ELSE paused_by END,
      paused_at = CASE WHEN p_target = 'paused' THEN now() ELSE paused_at END,
      updated_at = now()
    WHERE id = p_automation_id;
  ELSE
    INSERT INTO public.sistema_social_outbox(id, client_id, account_id, action_type, target_ref, request, created_by)
    VALUES (outbox_id, automation_row.client_id, automation_row.account_id,
      CASE
        WHEN p_target = 'paused' THEN 'automation_pause'
        WHEN automation_row.zernio_automation_id IS NULL THEN 'automation_create'
        WHEN automation_row.status = 'paused' THEN 'automation_resume'
        ELSE 'automation_update'
      END,
      jsonb_build_object('automation_id', p_automation_id, 'version', automation_row.current_version,
        'zernio_automation_id', automation_row.zernio_automation_id, 'zernio_account_id', account_row.zernio_account_id,
        'zernio_profile_id', (SELECT zernio_profile_id FROM public.sistema_zernio_profiles WHERE id = account_row.integration_id)),
      jsonb_build_object('config', version_row.config, 'name', automation_row.name),
      p_actor);
    UPDATE public.sistema_social_automations SET
      status = CASE WHEN p_target = 'active' THEN 'pending_activation' ELSE 'pending_pause' END,
      updated_at = now()
    WHERE id = p_automation_id;
  END IF;

  PERFORM private.social_audit(p_actor, 'admin', automation_row.client_id, 'automation', p_automation_id::TEXT,
    'automation.' || p_target || '_requested', jsonb_build_object('version', automation_row.current_version, 'hash', version_row.config_hash));
  RETURN private.social_ok(jsonb_build_object('id', p_automation_id,
    'outbox_id', CASE WHEN automation_row.engine = 'zernio_comment_to_dm' THEN outbox_id END,
    'status', (SELECT status FROM public.sistema_social_automations WHERE id = p_automation_id)));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_request_automation_state$;

-- Resultado del proveedor tras crear/pausar/reanudar (worker).
CREATE OR REPLACE FUNCTION public.social_automation_apply_provider_result(
  p_automation_id UUID,
  p_ok BOOLEAN,
  p_zernio_automation_id TEXT,
  p_is_active BOOLEAN,
  p_actor UUID,
  p_error TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_automation_apply_provider_result$
DECLARE
  automation_row public.sistema_social_automations%ROWTYPE;
BEGIN
  UPDATE public.sistema_social_automations SET
    zernio_automation_id = COALESCE(NULLIF(p_zernio_automation_id, ''), zernio_automation_id),
    status = CASE
      WHEN NOT p_ok THEN CASE WHEN status = 'pending_pause' THEN 'active' WHEN zernio_automation_id IS NULL THEN 'error' ELSE 'paused' END
      WHEN p_is_active THEN 'active' ELSE 'paused' END,
    activated_by = CASE WHEN p_ok AND p_is_active THEN p_actor ELSE activated_by END,
    activated_at = CASE WHEN p_ok AND p_is_active THEN now() ELSE activated_at END,
    paused_by = CASE WHEN p_ok AND NOT p_is_active THEN p_actor ELSE paused_by END,
    paused_at = CASE WHEN p_ok AND NOT p_is_active THEN now() ELSE paused_at END,
    last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 1000) END,
    last_synced_at = now(),
    updated_at = now()
  WHERE id = p_automation_id RETURNING * INTO automation_row;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Automatización inexistente');
  END IF;
  PERFORM private.social_audit(p_actor, 'worker', automation_row.client_id, 'automation', p_automation_id::TEXT,
    CASE WHEN p_ok THEN 'automation.provider_' || automation_row.status ELSE 'automation.provider_error' END,
    jsonb_build_object('zernio_automation_id', automation_row.zernio_automation_id, 'error', left(p_error, 300)));
  RETURN private.social_ok(jsonb_build_object('id', p_automation_id, 'status', automation_row.status));
END
$social_automation_apply_provider_result$;

-- Inventario de automatizaciones en Zernio: las desconocidas quedan como
-- "external_unmanaged" para detectar conflictos y doble motor.
CREATE OR REPLACE FUNCTION public.social_sync_provider_automations(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_sync_provider_automations$
DECLARE
  item JSONB;
  account_row public.sistema_zernio_accounts%ROWTYPE;
  automation_row public.sistema_social_automations%ROWTYPE;
  known INTEGER := 0;
  discovered INTEGER := 0;
  skipped INTEGER := 0;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB)) LOOP
    SELECT * INTO automation_row FROM public.sistema_social_automations WHERE zernio_automation_id = item ->> 'id';
    IF FOUND THEN
      UPDATE public.sistema_social_automations SET
        last_provider_stats = item -> 'stats',
        status = CASE
          WHEN status IN ('pending_activation', 'pending_pause') THEN status
          WHEN status = 'external_unmanaged' THEN status
          WHEN (item ->> 'isActive')::BOOLEAN THEN 'active' ELSE 'paused' END,
        last_synced_at = now()
      WHERE id = automation_row.id;
      known := known + 1;
      CONTINUE;
    END IF;
    SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE zernio_account_id = item ->> 'accountId';
    IF NOT FOUND OR account_row.client_id IS NULL THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.sistema_social_automations(
      client_id, account_id, engine, name, trigger, platform_post_id, status, zernio_automation_id, last_provider_stats, last_synced_at
    ) VALUES (
      account_row.client_id, account_row.id, 'zernio_comment_to_dm', left(COALESCE(NULLIF(item ->> 'name', ''), 'Regla externa'), 120),
      COALESCE(item ->> 'trigger', 'comment'), NULLIF(item ->> 'platformPostId', ''), 'external_unmanaged', item ->> 'id',
      item -> 'stats', now()
    ) RETURNING * INTO automation_row;
    INSERT INTO public.sistema_social_automation_versions(automation_id, version, config, config_hash)
    VALUES (automation_row.id, 1, jsonb_build_object('keywords', COALESCE(item -> 'keywords', '[]'::JSONB),
      'match_mode', item ->> 'matchMode', 'trigger', item ->> 'trigger'), md5(COALESCE(item -> 'keywords', '[]'::JSONB)::TEXT));
    discovered := discovered + 1;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('known', known, 'discovered_external', discovered, 'skipped', skipped));
END
$social_sync_provider_automations$;

CREATE OR REPLACE FUNCTION public.social_ingest_automation_logs(p_automation_id UUID, p_logs JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_ingest_automation_logs$
DECLARE
  automation_row public.sistema_social_automations%ROWTYPE;
  item JSONB;
  written INTEGER := 0;
BEGIN
  SELECT * INTO automation_row FROM public.sistema_social_automations WHERE id = p_automation_id;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Automatización inexistente');
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_logs, '[]'::JSONB)) LOOP
    CONTINUE WHEN COALESCE(item ->> 'id', '') = '';
    INSERT INTO public.sistema_social_automation_runs(
      client_id, automation_id, source, dedupe_key, external_log_id, trigger_external_id, status,
      comment_reply_status, error, details, occurred_at
    ) VALUES (
      automation_row.client_id, p_automation_id, 'zernio_log', 'zernio:' || (item ->> 'id'), item ->> 'id', item ->> 'commentId',
      CASE WHEN item ->> 'status' IN ('sent', 'failed', 'skipped', 'pending', 'gated') THEN item ->> 'status' ELSE 'skipped' END,
      item ->> 'commentReplyStatus', left(item ->> 'error', 500),
      jsonb_strip_nulls(jsonb_build_object('source', item ->> 'source', 'audience_outcome', item ->> 'audienceOutcome',
        'private_reply_consumed', item -> 'privateReplyConsumed', 'platform_error', item -> 'platformError')),
      COALESCE((item ->> 'createdAt')::TIMESTAMPTZ, now())
    )
    ON CONFLICT (dedupe_key) DO UPDATE SET
      status = EXCLUDED.status, comment_reply_status = EXCLUDED.comment_reply_status, error = EXCLUDED.error;
    written := written + 1;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('written', written));
END
$social_ingest_automation_logs$;

-- Motor interno de Quepia: asignación automática y recordatorios de SLA.
-- Deduplicado por regla/hilo/episodio; solo efectos locales.
CREATE OR REPLACE FUNCTION public.social_run_internal_automations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_run_internal_automations$
DECLARE
  rule RECORD;
  thread_row RECORD;
  assigned INTEGER := 0;
  reminded INTEGER := 0;
  assignee UUID;
  applied_today INTEGER;
BEGIN
  FOR rule IN
    SELECT automation.*, version.config FROM public.sistema_social_automations AS automation
    JOIN public.sistema_social_automation_versions AS version
      ON version.automation_id = automation.id AND version.version = automation.current_version
    WHERE automation.status = 'active' AND automation.engine IN ('quepia_assignment', 'quepia_sla_reminder')
  LOOP
    SELECT count(*) INTO applied_today FROM public.sistema_social_automation_runs
    WHERE automation_id = rule.id AND occurred_at > now() - interval '24 hours';
    CONTINUE WHEN rule.daily_cap IS NOT NULL AND applied_today >= rule.daily_cap;

    IF rule.engine = 'quepia_assignment' THEN
      assignee := (rule.config ->> 'assignee_id')::UUID;
      IF NOT private.social_is_global_admin(assignee) THEN
        UPDATE public.sistema_social_automations SET status = 'error', last_error = 'El responsable ya no es administrador global'
        WHERE id = rule.id;
        CONTINUE;
      END IF;
      FOR thread_row IN
        SELECT thread.* FROM public.sistema_social_threads AS thread
        WHERE thread.account_id = rule.account_id AND thread.assignee_id IS NULL AND thread.attention_status = 'new'
          AND (rule.config ->> 'kind' IS NULL OR thread.kind = rule.config ->> 'kind')
        ORDER BY thread.pending_since NULLS LAST
        LIMIT COALESCE(rule.daily_cap, 500)
      LOOP
        INSERT INTO public.sistema_social_automation_runs(client_id, automation_id, source, dedupe_key, trigger_external_id, status)
        VALUES (rule.client_id, rule.id, 'quepia_engine', 'assign:' || rule.id || ':' || thread_row.id || ':' || thread_row.version,
          thread_row.id::TEXT, 'applied')
        ON CONFLICT (dedupe_key) DO NOTHING;
        CONTINUE WHEN NOT FOUND;
        UPDATE public.sistema_social_threads SET assignee_id = assignee, attention_status = 'assigned',
          version = version + 1, updated_at = now() WHERE id = thread_row.id;
        INSERT INTO public.sistema_social_assignments(client_id, thread_id, assignee_id, assigned_by)
        VALUES (thread_row.client_id, thread_row.id, assignee, NULL);
        INSERT INTO public.sistema_social_attention_events(client_id, thread_id, event, details)
        VALUES (thread_row.client_id, thread_row.id, 'assigned', jsonb_build_object('automation_id', rule.id, 'assignee_id', assignee));
        assigned := assigned + 1;
      END LOOP;
    ELSE
      FOR thread_row IN
        SELECT thread.*, episode.id AS episode_id FROM public.sistema_social_threads AS thread
        JOIN public.sistema_social_attention_episodes AS episode ON episode.thread_id = thread.id AND episode.resolved_at IS NULL
        WHERE thread.account_id = rule.account_id AND thread.pending_since IS NOT NULL
          AND thread.pending_since < now() - make_interval(mins => (rule.config ->> 'after_minutes')::INTEGER)
          AND thread.attention_status <> 'resolved'
      LOOP
        INSERT INTO public.sistema_social_automation_runs(client_id, automation_id, source, dedupe_key, trigger_external_id, status)
        VALUES (rule.client_id, rule.id, 'quepia_engine', 'sla:' || rule.id || ':' || thread_row.episode_id, thread_row.id::TEXT, 'applied')
        ON CONFLICT (dedupe_key) DO NOTHING;
        CONTINUE WHEN NOT FOUND;
        INSERT INTO public.sistema_notifications(user_id, type, title, content, link, data)
        SELECT recipient.id, 'system', 'Interacción social sin responder',
          'Una conversación lleva más de ' || (rule.config ->> 'after_minutes') || ' minutos sin respuesta.',
          '/sistema?view=social&tab=inbox&thread=' || thread_row.id,
          jsonb_build_object('thread_id', thread_row.id, 'automation_id', rule.id)
        FROM public.sistema_users AS recipient
        WHERE recipient.id = COALESCE(thread_row.assignee_id, (rule.config ->> 'fallback_admin_id')::UUID)
          AND private.social_is_global_admin(recipient.id);
        reminded := reminded + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('assigned', assigned, 'reminders', reminded));
END
$social_run_internal_automations$;

CREATE OR REPLACE FUNCTION public.social_admin_list_automations(p_actor UUID, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_list_automations$
DECLARE
  scope JSONB;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  scope := private.social_resolve_scope(COALESCE(p_params, '{}'::JSONB), false);
  RETURN private.social_ok(jsonb_build_object('automations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', automation.id, 'client_id', automation.client_id, 'account_id', automation.account_id,
      'account_username', account.username, 'platform', account.platform, 'engine', automation.engine,
      'name', automation.name, 'trigger', automation.trigger, 'platform_post_id', automation.platform_post_id,
      'status', automation.status, 'version', automation.current_version, 'config', version.config,
      'config_hash', version.config_hash, 'daily_cap', automation.daily_cap,
      'zernio_automation_id', automation.zernio_automation_id, 'last_provider_stats', automation.last_provider_stats,
      'last_error', automation.last_error, 'activated_at', automation.activated_at, 'paused_at', automation.paused_at,
      'conflicts', private.social_automation_conflicts(automation.id),
      'runs_24h', (SELECT jsonb_object_agg(status, n) FROM (
        SELECT status, count(*) AS n FROM public.sistema_social_automation_runs
        WHERE automation_id = automation.id AND occurred_at > now() - interval '24 hours' GROUP BY status) AS grouped)
    ) ORDER BY automation.updated_at DESC)
    FROM public.sistema_social_automations AS automation
    JOIN public.sistema_zernio_accounts AS account ON account.id = automation.account_id
    LEFT JOIN public.sistema_social_automation_versions AS version
      ON version.automation_id = automation.id AND version.version = automation.current_version
    WHERE automation.account_id = ANY(private.social_scope_uuids(scope, 'resolved_account_ids'))
      AND automation.status <> 'archived'
  ), '[]'::JSONB)));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_list_automations$;

-- Comentarios recientes de una cuenta para simular reglas sin efectos.
CREATE OR REPLACE FUNCTION public.social_admin_simulation_sample(p_actor UUID, p_automation_id UUID, p_limit INTEGER DEFAULT 200)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_simulation_sample$
DECLARE
  automation_row public.sistema_social_automations%ROWTYPE;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT * INTO automation_row FROM public.sistema_social_automations WHERE id = p_automation_id;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Automatización inexistente');
  END IF;
  RETURN private.social_ok(jsonb_build_object(
    'automation', to_jsonb(automation_row),
    'config', (SELECT config FROM public.sistema_social_automation_versions WHERE automation_id = automation_row.id AND version = automation_row.current_version),
    'config_hash', (SELECT config_hash FROM public.sistema_social_automation_versions WHERE automation_id = automation_row.id AND version = automation_row.current_version),
    'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', interaction.external_id, 'text', interaction.body,
      'platform_post_id', thread.platform_post_id, 'is_reply', interaction.parent_external_id IS NOT NULL,
      'occurred_at', interaction.occurred_at) ORDER BY interaction.occurred_at DESC)
      FROM (SELECT * FROM public.sistema_social_interactions AS candidate
        WHERE candidate.account_id = automation_row.account_id AND candidate.kind = 'comment' AND candidate.direction = 'inbound'
          AND NOT candidate.is_deleted
        ORDER BY candidate.occurred_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 500)) AS interaction
      JOIN public.sistema_social_threads AS thread ON thread.id = interaction.thread_id), '[]'::JSONB),
    'conflicts', private.social_automation_conflicts(automation_row.id)
  ));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_simulation_sample$;

DO $rpc_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.social_admin_save_automation(uuid,uuid,jsonb)',
    'public.social_admin_request_automation_state(uuid,uuid,text,text)',
    'public.social_automation_apply_provider_result(uuid,boolean,text,boolean,uuid,text)',
    'public.social_sync_provider_automations(jsonb)',
    'public.social_ingest_automation_logs(uuid,jsonb)',
    'public.social_run_internal_automations()',
    'public.social_admin_list_automations(uuid,jsonb)',
    'public.social_admin_simulation_sample(uuid,uuid,integer)'
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

DO $private_revoke$
DECLARE
  function_record RECORD;
BEGIN
  FOR function_record IN
    SELECT procedure.oid::REGPROCEDURE AS signature
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'private' AND procedure.proname LIKE 'social\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_record.signature);
  END LOOP;
END
$private_revoke$;

NOTIFY pgrst, 'reload schema';
