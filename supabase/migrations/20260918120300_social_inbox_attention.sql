-- Gestión social, fase 2: bandeja, atención de agencia y SLA.
--
-- Zernio aporta conversaciones, mensajes y comentarios; los estados de
-- atención, responsables, notas internas y SLA son dominio de Quepia.
-- * Las notas internas nunca se envían al proveedor ni a la IA por defecto.
-- * Responsables: exclusivamente administradores globales válidos.
-- * Respuestas humanas y automáticas se miden por separado; un mensaje saliente
--   sin evidencia de autoría (sentVia nulo) no se atribuye a un admin.
-- * Doble respuesta concurrente: versión optimista + claim con vencimiento.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.sistema_social_posts') IS NULL OR to_regclass('public.sistema_social_outbox') IS NULL THEN
    RAISE EXCEPTION 'Aplicar primero las migraciones sociales previas';
  END IF;
END
$preflight$;

CREATE TABLE public.sistema_social_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'comment')),
  external_thread_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  participant_external_id TEXT,
  participant_name TEXT,
  participant_username TEXT,
  post_id UUID,
  platform_post_id TEXT,
  project_id UUID,
  attention_status TEXT NOT NULL DEFAULT 'new'
    CHECK (attention_status IN ('new', 'assigned', 'in_progress', 'waiting', 'resolved')),
  assignee_id UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  provider_status TEXT CHECK (provider_status IN ('active', 'archived')),
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  pending_since TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  claimed_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  claimed_until TIMESTAMPTZ,
  imported_as_historical BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id),
  FOREIGN KEY (post_id, client_id) REFERENCES public.sistema_social_posts(id, client_id),
  FOREIGN KEY (project_id, client_id) REFERENCES public.sistema_projects(id, client_id),
  UNIQUE (account_id, kind, external_thread_id),
  UNIQUE (id, client_id)
);
CREATE INDEX idx_social_threads_attention ON public.sistema_social_threads(client_id, attention_status, last_activity_at DESC);
CREATE INDEX idx_social_threads_assignee ON public.sistema_social_threads(assignee_id, attention_status) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_social_threads_pending ON public.sistema_social_threads(pending_since) WHERE pending_since IS NOT NULL;

CREATE TABLE public.sistema_social_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL,
  thread_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'comment')),
  external_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  author_external_id TEXT,
  author_name TEXT,
  author_username TEXT,
  body TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::JSONB,
  parent_external_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('webhook', 'backfill', 'quepia')),
  sent_via TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('contact', 'quepia_admin', 'zernio_automation', 'zernio_human', 'external_unknown')),
  sent_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  outbox_id UUID REFERENCES public.sistema_social_outbox(id) ON DELETE SET NULL,
  delivery_status TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  FOREIGN KEY (thread_id, client_id) REFERENCES public.sistema_social_threads(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id),
  UNIQUE (account_id, kind, external_id)
);
CREATE INDEX idx_social_interactions_thread ON public.sistema_social_interactions(thread_id, occurred_at);

CREATE TABLE public.sistema_social_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  thread_id UUID NOT NULL,
  assignee_id UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  FOREIGN KEY (thread_id, client_id) REFERENCES public.sistema_social_threads(id, client_id) ON DELETE CASCADE
);
CREATE INDEX idx_social_assignments_thread ON public.sistema_social_assignments(thread_id, assigned_at DESC);

CREATE TABLE public.sistema_social_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  thread_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES public.sistema_users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (thread_id, client_id) REFERENCES public.sistema_social_threads(id, client_id) ON DELETE CASCADE
);
CREATE INDEX idx_social_notes_thread ON public.sistema_social_notes(thread_id, created_at);

CREATE TABLE public.sistema_social_attention_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  thread_id UUID NOT NULL,
  event TEXT NOT NULL CHECK (event IN (
    'opened', 'reopened', 'assigned', 'unassigned', 'status_changed', 'first_response_human',
    'first_response_automation', 'response', 'resolved', 'imported_as_historical', 'claimed', 'released'
  )),
  actor_id UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  interaction_id UUID REFERENCES public.sistema_social_interactions(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (thread_id, client_id) REFERENCES public.sistema_social_threads(id, client_id) ON DELETE CASCADE
);
CREATE INDEX idx_social_attention_events_thread ON public.sistema_social_attention_events(thread_id, occurred_at);

-- Un episodio = desde el primer entrante sin responder hasta su resolución.
CREATE TABLE public.sistema_social_attention_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  thread_id UUID NOT NULL,
  account_id UUID NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  first_response_at TIMESTAMPTZ,
  first_response_origin TEXT,
  first_human_response_at TIMESTAMPTZ,
  first_human_responder UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  first_automated_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  is_reopen BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY (thread_id, client_id) REFERENCES public.sistema_social_threads(id, client_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_social_open_episode ON public.sistema_social_attention_episodes(thread_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_social_episodes_client_opened ON public.sistema_social_attention_episodes(client_id, opened_at);

CREATE TABLE public.sistema_social_attention_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
  business_days SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  business_start TIME NOT NULL DEFAULT '09:00',
  business_end TIME NOT NULL DEFAULT '18:00',
  first_response_target_minutes INTEGER NOT NULL DEFAULT 120,
  historical_import_days INTEGER NOT NULL DEFAULT 7,
  updated_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (business_end > business_start)
);
INSERT INTO public.sistema_social_attention_settings(id) VALUES (1);

DO $server_only$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sistema_social_threads', 'sistema_social_interactions', 'sistema_social_assignments',
    'sistema_social_notes', 'sistema_social_attention_events', 'sistema_social_attention_episodes',
    'sistema_social_attention_settings'
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

-- ---------------------------------------------------------------------------
-- Clasificación de autoría de mensajes salientes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.social_outbound_origin(p_sent_via TEXT, p_outbox_match BOOLEAN)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_outbound_origin$
  SELECT CASE
    WHEN p_outbox_match THEN 'quepia_admin'
    WHEN p_sent_via IN ('comment_automation', 'workflow', 'sequence', 'broadcast', 'bulk-api') THEN 'zernio_automation'
    WHEN p_sent_via = 'human' THEN 'zernio_human'
    ELSE 'external_unknown'
  END;
$social_outbound_origin$;

-- Aplica una interacción nueva al estado de atención del hilo.
CREATE OR REPLACE FUNCTION private.social_apply_attention(
  p_thread_id UUID,
  p_interaction public.sistema_social_interactions,
  p_is_new BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $social_apply_attention$
DECLARE
  thread_row public.sistema_social_threads%ROWTYPE;
  episode_row public.sistema_social_attention_episodes%ROWTYPE;
  human BOOLEAN;
BEGIN
  IF NOT p_is_new THEN
    RETURN;
  END IF;
  SELECT * INTO thread_row FROM public.sistema_social_threads WHERE id = p_thread_id FOR UPDATE;

  IF p_interaction.direction = 'inbound' THEN
    UPDATE public.sistema_social_threads SET
      last_inbound_at = GREATEST(COALESCE(last_inbound_at, '-infinity'), p_interaction.occurred_at),
      last_activity_at = GREATEST(COALESCE(last_activity_at, '-infinity'), p_interaction.occurred_at),
      updated_at = now()
    WHERE id = p_thread_id;
    -- Un entrante anterior a la última respuesta no abre atención.
    IF thread_row.last_outbound_at IS NOT NULL AND p_interaction.occurred_at <= thread_row.last_outbound_at THEN
      RETURN;
    END IF;
    SELECT * INTO episode_row FROM public.sistema_social_attention_episodes
    WHERE thread_id = p_thread_id AND resolved_at IS NULL;
    IF NOT FOUND THEN
      INSERT INTO public.sistema_social_attention_episodes(client_id, thread_id, account_id, opened_at, is_reopen)
      VALUES (thread_row.client_id, p_thread_id, thread_row.account_id, p_interaction.occurred_at,
        thread_row.attention_status = 'resolved');
      INSERT INTO public.sistema_social_attention_events(client_id, thread_id, event, interaction_id, occurred_at)
      VALUES (thread_row.client_id, p_thread_id,
        CASE WHEN thread_row.attention_status = 'resolved' THEN 'reopened' ELSE 'opened' END,
        p_interaction.id, p_interaction.occurred_at);
    END IF;
    UPDATE public.sistema_social_threads SET
      pending_since = LEAST(COALESCE(pending_since, 'infinity'), p_interaction.occurred_at),
      attention_status = CASE
        WHEN attention_status = 'resolved' THEN CASE WHEN assignee_id IS NULL THEN 'new' ELSE 'assigned' END
        WHEN attention_status = 'waiting' THEN 'in_progress'
        ELSE attention_status
      END,
      imported_as_historical = false,
      version = version + 1,
      updated_at = now()
    WHERE id = p_thread_id;
    RETURN;
  END IF;

  -- Saliente
  UPDATE public.sistema_social_threads SET
    last_outbound_at = GREATEST(COALESCE(last_outbound_at, '-infinity'), p_interaction.occurred_at),
    last_activity_at = GREATEST(COALESCE(last_activity_at, '-infinity'), p_interaction.occurred_at),
    pending_since = CASE WHEN pending_since IS NOT NULL AND p_interaction.occurred_at >= pending_since THEN NULL ELSE pending_since END,
    version = version + 1,
    updated_at = now()
  WHERE id = p_thread_id;

  SELECT * INTO episode_row FROM public.sistema_social_attention_episodes
  WHERE thread_id = p_thread_id AND resolved_at IS NULL AND opened_at <= p_interaction.occurred_at
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  human := p_interaction.origin IN ('quepia_admin', 'zernio_human');
  UPDATE public.sistema_social_attention_episodes SET
    first_response_at = COALESCE(first_response_at, p_interaction.occurred_at),
    first_response_origin = COALESCE(first_response_origin, p_interaction.origin),
    first_human_response_at = CASE WHEN human THEN COALESCE(first_human_response_at, p_interaction.occurred_at) ELSE first_human_response_at END,
    first_human_responder = CASE WHEN human AND first_human_response_at IS NULL THEN p_interaction.sent_by ELSE first_human_responder END,
    first_automated_response_at = CASE WHEN p_interaction.origin = 'zernio_automation'
      THEN COALESCE(first_automated_response_at, p_interaction.occurred_at) ELSE first_automated_response_at END
  WHERE id = episode_row.id;
  IF human AND episode_row.first_human_response_at IS NULL THEN
    INSERT INTO public.sistema_social_attention_events(client_id, thread_id, event, actor_id, interaction_id, occurred_at)
    VALUES (episode_row.client_id, p_thread_id, 'first_response_human', p_interaction.sent_by, p_interaction.id, p_interaction.occurred_at);
  ELSIF p_interaction.origin = 'zernio_automation' AND episode_row.first_automated_response_at IS NULL THEN
    INSERT INTO public.sistema_social_attention_events(client_id, thread_id, event, interaction_id, occurred_at)
    VALUES (episode_row.client_id, p_thread_id, 'first_response_automation', p_interaction.id, p_interaction.occurred_at);
  END IF;
END
$social_apply_attention$;

-- ---------------------------------------------------------------------------
-- Ingesta de interacciones (webhooks y barridos de reconciliación)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.social_ingest_interactions(p_items JSONB, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_ingest_interactions$
DECLARE
  item JSONB;
  account_row public.sistema_zernio_accounts%ROWTYPE;
  thread_row public.sistema_social_threads%ROWTYPE;
  interaction_row public.sistema_social_interactions%ROWTYPE;
  existing_id UUID;
  outbox_row public.sistema_social_outbox%ROWTYPE;
  direction_value TEXT;
  origin_value TEXT;
  post_ref UUID;
  settings_row public.sistema_social_attention_settings%ROWTYPE;
  created_threads UUID[] := '{}';
  inserted INTEGER := 0;
  updated INTEGER := 0;
  quarantined JSONB := '[]'::JSONB;
  thread_created BOOLEAN;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR p_source NOT IN ('webhook', 'backfill') THEN
    RETURN private.social_error('invalid_request', 'Entrada de interacciones inválida');
  END IF;
  SELECT * INTO settings_row FROM public.sistema_social_attention_settings WHERE id = 1;

  FOR item IN
    SELECT value FROM jsonb_array_elements(p_items)
    ORDER BY (value #>> '{interaction,occurred_at}')::TIMESTAMPTZ NULLS LAST
  LOOP
    SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE zernio_account_id = item ->> 'zernio_account_id';
    IF NOT FOUND OR account_row.client_id IS NULL THEN
      quarantined := quarantined || jsonb_build_array(jsonb_build_object(
        'zernio_account_id', item ->> 'zernio_account_id',
        'reason', CASE WHEN account_row.id IS NULL THEN 'unknown_account' ELSE 'unassigned_client' END));
      CONTINUE;
    END IF;
    IF item ->> 'kind' NOT IN ('dm', 'comment') OR COALESCE(item ->> 'thread_external_id', '') = ''
      OR COALESCE(item #>> '{interaction,external_id}', '') = '' THEN
      quarantined := quarantined || jsonb_build_array(jsonb_build_object('reason', 'invalid_item'));
      CONTINUE;
    END IF;

    post_ref := NULL;
    IF NULLIF(item #>> '{post,platform_post_id}', '') IS NOT NULL THEN
      SELECT id INTO post_ref FROM public.sistema_social_posts
      WHERE account_id = account_row.id AND platform_post_id = item #>> '{post,platform_post_id}';
    END IF;

    INSERT INTO public.sistema_social_threads AS thread (
      client_id, account_id, kind, external_thread_id, platform, participant_external_id, participant_name,
      participant_username, post_id, platform_post_id, provider_status
    ) VALUES (
      account_row.client_id, account_row.id, item ->> 'kind', item ->> 'thread_external_id',
      COALESCE(NULLIF(item ->> 'platform', ''), account_row.platform),
      NULLIF(item #>> '{participant,id}', ''), left(NULLIF(item #>> '{participant,name}', ''), 200),
      left(NULLIF(item #>> '{participant,username}', ''), 100), post_ref,
      NULLIF(item #>> '{post,platform_post_id}', ''), NULLIF(item ->> 'provider_status', '')
    )
    ON CONFLICT (account_id, kind, external_thread_id) DO UPDATE SET
      participant_external_id = COALESCE(thread.participant_external_id, EXCLUDED.participant_external_id),
      participant_name = COALESCE(EXCLUDED.participant_name, thread.participant_name),
      participant_username = COALESCE(EXCLUDED.participant_username, thread.participant_username),
      post_id = COALESCE(thread.post_id, EXCLUDED.post_id),
      platform_post_id = COALESCE(thread.platform_post_id, EXCLUDED.platform_post_id),
      provider_status = COALESCE(EXCLUDED.provider_status, thread.provider_status)
    RETURNING * INTO thread_row;
    thread_created := NOT EXISTS (
      SELECT 1 FROM public.sistema_social_interactions WHERE thread_id = thread_row.id
    );
    IF thread_created AND NOT thread_row.id = ANY(created_threads) THEN
      created_threads := array_append(created_threads, thread_row.id);
    END IF;

    direction_value := CASE
      WHEN item #>> '{interaction,direction}' IN ('outgoing', 'outbound') THEN 'outbound'
      WHEN COALESCE((item #>> '{interaction,is_own_account}')::BOOLEAN, false) THEN 'outbound'
      ELSE 'inbound'
    END;

    SELECT id INTO existing_id FROM public.sistema_social_interactions
    WHERE account_id = account_row.id AND kind = item ->> 'kind' AND external_id = item #>> '{interaction,external_id}';

    IF existing_id IS NOT NULL THEN
      -- Evento repetido o posterior (edición, borrado, entrega): no recalcula SLA.
      UPDATE public.sistema_social_interactions SET
        body = CASE WHEN (item #>> '{interaction,edited_at}') IS NOT NULL THEN COALESCE(item #>> '{interaction,text}', body) ELSE body END,
        edited_at = COALESCE((item #>> '{interaction,edited_at}')::TIMESTAMPTZ, edited_at),
        is_deleted = is_deleted OR COALESCE((item #>> '{interaction,is_deleted}')::BOOLEAN, false),
        deleted_at = COALESCE(deleted_at, (item #>> '{interaction,deleted_at}')::TIMESTAMPTZ),
        delivery_status = COALESCE(NULLIF(item #>> '{interaction,delivery_status}', ''), delivery_status),
        sent_via = COALESCE(sent_via, NULLIF(item #>> '{interaction,sent_via}', ''))
      WHERE id = existing_id;
      updated := updated + 1;
      CONTINUE;
    END IF;

    outbox_row := NULL;
    IF direction_value = 'outbound' AND NULLIF(item #>> '{interaction,external_id}', '') IS NOT NULL THEN
      SELECT * INTO outbox_row FROM public.sistema_social_outbox
      WHERE account_id = account_row.id AND provider_reference = item #>> '{interaction,external_id}'
      LIMIT 1;
    END IF;
    origin_value := CASE WHEN direction_value = 'inbound' THEN 'contact'
      ELSE private.social_outbound_origin(NULLIF(item #>> '{interaction,sent_via}', ''), outbox_row.id IS NOT NULL) END;

    INSERT INTO public.sistema_social_interactions(
      client_id, account_id, thread_id, kind, external_id, direction, author_external_id, author_name,
      author_username, body, attachments, parent_external_id, occurred_at, source, sent_via, origin,
      sent_by, outbox_id, delivery_status, is_deleted, deleted_at, edited_at
    ) VALUES (
      account_row.client_id, account_row.id, thread_row.id, item ->> 'kind', item #>> '{interaction,external_id}',
      direction_value, NULLIF(item #>> '{interaction,author_id}', ''), left(NULLIF(item #>> '{interaction,author_name}', ''), 200),
      left(NULLIF(item #>> '{interaction,author_username}', ''), 100), left(item #>> '{interaction,text}', 8000),
      COALESCE(item #> '{interaction,attachments}', '[]'::JSONB), NULLIF(item #>> '{interaction,parent_external_id}', ''),
      COALESCE((item #>> '{interaction,occurred_at}')::TIMESTAMPTZ, now()), p_source,
      NULLIF(item #>> '{interaction,sent_via}', ''), origin_value, outbox_row.created_by, outbox_row.id,
      NULLIF(item #>> '{interaction,delivery_status}', ''),
      COALESCE((item #>> '{interaction,is_deleted}')::BOOLEAN, false), (item #>> '{interaction,deleted_at}')::TIMESTAMPTZ,
      (item #>> '{interaction,edited_at}')::TIMESTAMPTZ
    ) RETURNING * INTO interaction_row;
    inserted := inserted + 1;
    PERFORM private.social_apply_attention(thread_row.id, interaction_row, true);
  END LOOP;

  -- Historial importado (sin webhooks del proveedor): lo antiguo no genera carga.
  IF p_source = 'backfill' AND cardinality(created_threads) > 0 THEN
    WITH stale AS (
      UPDATE public.sistema_social_threads SET
        attention_status = 'resolved', pending_since = NULL, imported_as_historical = true, version = version + 1
      WHERE id = ANY(created_threads)
        AND COALESCE(last_activity_at, created_at) < now() - make_interval(days => settings_row.historical_import_days)
      RETURNING id, client_id
    ), closed AS (
      UPDATE public.sistema_social_attention_episodes AS episode SET resolved_at = now()
      FROM stale WHERE episode.thread_id = stale.id AND episode.resolved_at IS NULL
      RETURNING episode.thread_id
    )
    INSERT INTO public.sistema_social_attention_events(client_id, thread_id, event, details)
    SELECT stale.client_id, stale.id, 'imported_as_historical', jsonb_build_object('reason', 'backfill_older_than_cutoff')
    FROM stale;
  END IF;

  RETURN private.social_ok(jsonb_build_object('inserted', inserted, 'updated', updated, 'quarantined', quarantined));
END
$social_ingest_interactions$;

-- ---------------------------------------------------------------------------
-- Acciones de administradores sobre hilos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.social_admin_update_thread(
  p_actor UUID,
  p_thread_id UUID,
  p_expected_version INTEGER,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_update_thread$
DECLARE
  thread_row public.sistema_social_threads%ROWTYPE;
  new_status TEXT;
  new_assignee UUID;
  new_project UUID;
  changed JSONB := '{}'::JSONB;
  key TEXT;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  FOR key IN SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::JSONB)) LOOP
    IF NOT key = ANY(ARRAY['status', 'assignee_id', 'project_id']) THEN
      RETURN private.social_error('unknown_parameter', 'Cambio no permitido: ' || key);
    END IF;
  END LOOP;
  SELECT * INTO thread_row FROM public.sistema_social_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Hilo inexistente');
  END IF;
  IF thread_row.version <> p_expected_version THEN
    RETURN private.social_error('version_conflict', 'El hilo cambió mientras lo editabas; recargá para ver la versión actual',
      jsonb_build_object('current_version', thread_row.version));
  END IF;

  new_status := thread_row.attention_status;
  new_assignee := thread_row.assignee_id;
  new_project := thread_row.project_id;

  IF p_changes ? 'assignee_id' THEN
    new_assignee := NULLIF(p_changes ->> 'assignee_id', '')::UUID;
    IF new_assignee IS NOT NULL AND NOT private.social_is_global_admin(new_assignee) THEN
      RETURN private.social_error('invalid_assignee', 'Solo se puede asignar a administradores globales activos');
    END IF;
    IF new_assignee IS DISTINCT FROM thread_row.assignee_id THEN
      UPDATE public.sistema_social_assignments SET ended_at = now() WHERE thread_id = p_thread_id AND ended_at IS NULL;
      IF new_assignee IS NOT NULL THEN
        INSERT INTO public.sistema_social_assignments(client_id, thread_id, assignee_id, assigned_by)
        VALUES (thread_row.client_id, p_thread_id, new_assignee, p_actor);
      END IF;
      INSERT INTO public.sistema_social_attention_events(client_id, thread_id, event, actor_id, details)
      VALUES (thread_row.client_id, p_thread_id, CASE WHEN new_assignee IS NULL THEN 'unassigned' ELSE 'assigned' END,
        p_actor, jsonb_build_object('assignee_id', new_assignee));
      changed := changed || jsonb_build_object('assignee_id', new_assignee);
      IF new_status = 'new' AND new_assignee IS NOT NULL THEN
        new_status := 'assigned';
      END IF;
    END IF;
  END IF;

  IF p_changes ? 'project_id' THEN
    new_project := NULLIF(p_changes ->> 'project_id', '')::UUID;
    IF new_project IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.sistema_projects WHERE id = new_project AND client_id = thread_row.client_id
    ) THEN
      RETURN private.social_error('scope_mismatch', 'El proyecto no pertenece al cliente del hilo');
    END IF;
    changed := changed || jsonb_build_object('project_id', new_project);
  END IF;

  IF p_changes ? 'status' THEN
    IF p_changes ->> 'status' NOT IN ('new', 'assigned', 'in_progress', 'waiting', 'resolved') THEN
      RETURN private.social_error('invalid_status', 'Estado de atención inválido');
    END IF;
    new_status := p_changes ->> 'status';
    IF new_status = 'assigned' AND new_assignee IS NULL THEN
      RETURN private.social_error('assignee_required', 'Asigná un responsable antes de marcar como asignado');
    END IF;
    IF new_status <> thread_row.attention_status THEN
      INSERT INTO public.sistema_social_attention_events(client_id, thread_id, event, actor_id, details)
      VALUES (thread_row.client_id, p_thread_id, CASE WHEN new_status = 'resolved' THEN 'resolved' ELSE 'status_changed' END,
        p_actor, jsonb_build_object('from', thread_row.attention_status, 'to', new_status));
      changed := changed || jsonb_build_object('status', new_status);
    END IF;
    IF new_status = 'resolved' THEN
      UPDATE public.sistema_social_attention_episodes SET resolved_at = now(), resolved_by = p_actor
      WHERE thread_id = p_thread_id AND resolved_at IS NULL;
    END IF;
  END IF;

  UPDATE public.sistema_social_threads SET
    attention_status = new_status,
    assignee_id = new_assignee,
    project_id = new_project,
    pending_since = CASE WHEN new_status = 'resolved' THEN NULL ELSE pending_since END,
    version = version + 1,
    updated_at = now()
  WHERE id = p_thread_id
  RETURNING * INTO thread_row;

  PERFORM private.social_audit(p_actor, 'admin', thread_row.client_id, 'thread', p_thread_id::TEXT, 'thread.updated', changed);
  RETURN private.social_ok(jsonb_build_object('id', p_thread_id, 'version', thread_row.version,
    'attention_status', thread_row.attention_status, 'assignee_id', thread_row.assignee_id, 'project_id', thread_row.project_id));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_update_thread$;

CREATE OR REPLACE FUNCTION public.social_admin_add_note(p_actor UUID, p_thread_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_add_note$
DECLARE
  thread_client UUID;
  note_id UUID;
  clean_body TEXT := btrim(COALESCE(p_body, ''));
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF length(clean_body) = 0 OR length(clean_body) > 5000 THEN
    RETURN private.social_error('invalid_note', 'La nota debe tener entre 1 y 5000 caracteres');
  END IF;
  SELECT client_id INTO thread_client FROM public.sistema_social_threads WHERE id = p_thread_id;
  IF thread_client IS NULL THEN
    RETURN private.social_error('not_found', 'Hilo inexistente');
  END IF;
  INSERT INTO public.sistema_social_notes(client_id, thread_id, author_id, body)
  VALUES (thread_client, p_thread_id, p_actor, clean_body) RETURNING id INTO note_id;
  -- La auditoría registra la acción, no el contenido de la nota.
  PERFORM private.social_audit(p_actor, 'admin', thread_client, 'note', note_id::TEXT, 'note.created',
    jsonb_build_object('thread_id', p_thread_id, 'length', length(clean_body)));
  RETURN private.social_ok(jsonb_build_object('id', note_id));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_add_note$;

-- Claim de atención: evita que dos admins respondan a la vez.
CREATE OR REPLACE FUNCTION public.social_admin_claim_thread(p_actor UUID, p_thread_id UUID, p_release BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_claim_thread$
DECLARE
  thread_row public.sistema_social_threads%ROWTYPE;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT * INTO thread_row FROM public.sistema_social_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Hilo inexistente');
  END IF;
  IF p_release THEN
    IF thread_row.claimed_by = p_actor THEN
      UPDATE public.sistema_social_threads SET claimed_by = NULL, claimed_until = NULL WHERE id = p_thread_id;
    END IF;
    RETURN private.social_ok(jsonb_build_object('released', true));
  END IF;
  IF thread_row.claimed_by IS NOT NULL AND thread_row.claimed_by <> p_actor AND thread_row.claimed_until > now() THEN
    RETURN private.social_error('claimed_by_other', 'Otro administrador está respondiendo este hilo',
      jsonb_build_object('claimed_by', thread_row.claimed_by, 'claimed_until', thread_row.claimed_until));
  END IF;
  UPDATE public.sistema_social_threads SET claimed_by = p_actor, claimed_until = now() + interval '10 minutes'
  WHERE id = p_thread_id;
  RETURN private.social_ok(jsonb_build_object('claimed_until', now() + interval '10 minutes'));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_claim_thread$;

-- Encola una respuesta. p_request_id es la clave idempotente de la acción:
-- reenviar el mismo formulario no crea una segunda respuesta.
CREATE OR REPLACE FUNCTION public.social_admin_enqueue_reply(
  p_actor UUID,
  p_thread_id UUID,
  p_expected_version INTEGER,
  p_action TEXT,
  p_text TEXT,
  p_reply_to_external_id TEXT,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_enqueue_reply$
DECLARE
  thread_row public.sistema_social_threads%ROWTYPE;
  account_row public.sistema_zernio_accounts%ROWTYPE;
  target_interaction public.sistema_social_interactions%ROWTYPE;
  existing public.sistema_social_outbox%ROWTYPE;
  clean_text TEXT := btrim(COALESCE(p_text, ''));
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF p_request_id IS NULL THEN
    RETURN private.social_error('request_id_required', 'Falta la clave idempotente de la respuesta');
  END IF;
  SELECT * INTO existing FROM public.sistema_social_outbox WHERE id = p_request_id;
  IF FOUND THEN
    IF existing.created_by <> p_actor OR existing.target_ref ->> 'thread_id' <> p_thread_id::TEXT THEN
      RETURN private.social_error('request_id_conflict', 'La clave idempotente pertenece a otra acción');
    END IF;
    RETURN private.social_ok(jsonb_build_object('outbox_id', existing.id, 'status', existing.status, 'replayed', true));
  END IF;
  IF length(clean_text) = 0 OR length(clean_text) > 2000 THEN
    RETURN private.social_error('invalid_text', 'La respuesta debe tener entre 1 y 2000 caracteres');
  END IF;

  SELECT * INTO thread_row FROM public.sistema_social_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Hilo inexistente');
  END IF;
  IF thread_row.version <> p_expected_version THEN
    RETURN private.social_error('version_conflict', 'Llegaron novedades al hilo; revisalas antes de responder',
      jsonb_build_object('current_version', thread_row.version));
  END IF;
  IF thread_row.claimed_by IS NOT NULL AND thread_row.claimed_by <> p_actor AND thread_row.claimed_until > now() THEN
    RETURN private.social_error('claimed_by_other', 'Otro administrador está respondiendo este hilo');
  END IF;
  IF EXISTS (SELECT 1 FROM public.sistema_social_outbox
    WHERE target_ref ->> 'thread_id' = p_thread_id::TEXT AND status IN ('pending', 'sending', 'ambiguous')
      AND created_by <> p_actor) THEN
    RETURN private.social_error('reply_in_flight', 'Hay una respuesta de otro administrador en curso o por confirmar');
  END IF;

  SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE id = thread_row.account_id;
  IF NOT account_row.is_active OR account_row.needs_reconnection OR account_row.provider_removed_at IS NOT NULL THEN
    RETURN private.social_error('account_unavailable', 'La cuenta remitente necesita reconexión o fue eliminada');
  END IF;

  IF p_action = 'send_dm' THEN
    IF thread_row.kind <> 'dm' THEN
      RETURN private.social_error('unsupported_action', 'Los mensajes directos solo aplican a conversaciones');
    END IF;
  ELSIF p_action = 'reply_comment' THEN
    IF thread_row.kind <> 'comment' THEN
      RETURN private.social_error('unsupported_action', 'La respuesta pública solo aplica a comentarios');
    END IF;
  ELSIF p_action = 'private_reply' THEN
    IF thread_row.kind <> 'comment' OR account_row.platform NOT IN ('instagram', 'facebook') THEN
      RETURN private.social_error('unsupported_action', 'La respuesta privada solo existe en comentarios de Instagram y Facebook');
    END IF;
    SELECT * INTO target_interaction FROM public.sistema_social_interactions
    WHERE thread_id = p_thread_id AND external_id = COALESCE(p_reply_to_external_id, thread_row.external_thread_id);
    IF NOT FOUND OR target_interaction.direction <> 'inbound' THEN
      RETURN private.social_error('invalid_target', 'Elegí un comentario entrante para responder en privado');
    END IF;
    IF target_interaction.occurred_at < now() - interval '7 days' THEN
      RETURN private.social_error('window_expired', 'La respuesta privada solo se permite dentro de los 7 días del comentario');
    END IF;
    IF EXISTS (SELECT 1 FROM public.sistema_social_outbox
      WHERE action_type = 'private_reply' AND target_ref ->> 'comment_id' = target_interaction.external_id
        AND status IN ('pending', 'sending', 'sent', 'ambiguous')) THEN
      RETURN private.social_error('private_reply_consumed', 'Ese comentario ya tiene su única respuesta privada');
    END IF;
  ELSE
    RETURN private.social_error('unsupported_action', 'Acción de respuesta desconocida');
  END IF;

  INSERT INTO public.sistema_social_outbox(id, client_id, account_id, action_type, target_ref, request, created_by)
  VALUES (
    p_request_id, thread_row.client_id, thread_row.account_id, p_action,
    jsonb_strip_nulls(jsonb_build_object(
      'thread_id', p_thread_id,
      'kind', thread_row.kind,
      'conversation_id', CASE WHEN thread_row.kind = 'dm' THEN thread_row.external_thread_id END,
      'platform_post_id', thread_row.platform_post_id,
      'comment_id', CASE WHEN thread_row.kind = 'comment' THEN COALESCE(p_reply_to_external_id, thread_row.external_thread_id) END,
      'zernio_account_id', account_row.zernio_account_id
    )),
    jsonb_build_object('text', clean_text),
    p_actor
  );
  UPDATE public.sistema_social_threads SET
    claimed_by = p_actor, claimed_until = now() + interval '10 minutes',
    attention_status = CASE WHEN attention_status IN ('new', 'assigned') THEN 'in_progress' ELSE attention_status END,
    version = version + 1, updated_at = now()
  WHERE id = p_thread_id;
  PERFORM private.social_audit(p_actor, 'admin', thread_row.client_id, 'outbox', p_request_id::TEXT, 'reply.enqueued',
    jsonb_build_object('thread_id', p_thread_id, 'action', p_action, 'length', length(clean_text)));
  RETURN private.social_ok(jsonb_build_object('outbox_id', p_request_id, 'status', 'pending', 'replayed', false));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_enqueue_reply$;

-- Worker: toma una acción pendiente, revalidando que su autor siga siendo
-- administrador global (una revocación bloquea acciones diferidas).
CREATE OR REPLACE FUNCTION public.social_outbox_begin(p_outbox_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_outbox_begin$
DECLARE
  outbox_row public.sistema_social_outbox%ROWTYPE;
BEGIN
  SELECT * INTO outbox_row FROM public.sistema_social_outbox WHERE id = p_outbox_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN private.social_error('busy_or_missing', 'Acción inexistente o tomada por otro worker');
  END IF;
  IF outbox_row.status <> 'pending' THEN
    RETURN private.social_error('not_pending', 'La acción ya no está pendiente', jsonb_build_object('status', outbox_row.status));
  END IF;
  IF NOT private.social_is_global_admin(outbox_row.created_by) THEN
    UPDATE public.sistema_social_outbox SET status = 'cancelled', last_error = 'El autor ya no es administrador global', updated_at = now()
    WHERE id = p_outbox_id;
    PERFORM private.social_audit(NULL, 'worker', outbox_row.client_id, 'outbox', p_outbox_id::TEXT, 'outbox.cancelled_revoked_author', '{}'::JSONB);
    RETURN private.social_error('author_revoked', 'Acción cancelada: el autor perdió acceso');
  END IF;
  UPDATE public.sistema_social_outbox SET status = 'sending', attempts = attempts + 1, updated_at = now()
  WHERE id = p_outbox_id RETURNING * INTO outbox_row;
  RETURN private.social_ok(to_jsonb(outbox_row));
END
$social_outbox_begin$;

-- Resultado de una acción. 'ambiguous' (timeout/5xx tras enviar) nunca se
-- reintenta automáticamente: requiere conciliación.
CREATE OR REPLACE FUNCTION public.social_outbox_finish(
  p_outbox_id UUID,
  p_status TEXT,
  p_provider_reference TEXT,
  p_provider_result JSONB,
  p_error TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_outbox_finish$
DECLARE
  outbox_row public.sistema_social_outbox%ROWTYPE;
  thread_row public.sistema_social_threads%ROWTYPE;
  interaction_row public.sistema_social_interactions%ROWTYPE;
  external_value TEXT;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'ambiguous', 'pending') THEN
    RETURN private.social_error('invalid_status', 'Estado de outbox inválido');
  END IF;
  UPDATE public.sistema_social_outbox SET
    status = p_status,
    provider_reference = COALESCE(NULLIF(p_provider_reference, ''), provider_reference),
    provider_result = COALESCE(p_provider_result, provider_result),
    last_error = left(p_error, 2000),
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
    updated_at = now()
  WHERE id = p_outbox_id AND status IN ('sending', 'ambiguous')
  RETURNING * INTO outbox_row;
  IF NOT FOUND THEN
    RETURN private.social_error('not_sending', 'La acción no estaba en curso');
  END IF;

  IF p_status = 'sent' AND outbox_row.action_type IN ('send_dm', 'reply_comment', 'private_reply') THEN
    SELECT * INTO thread_row FROM public.sistema_social_threads WHERE id = (outbox_row.target_ref ->> 'thread_id')::UUID;
    external_value := COALESCE(NULLIF(p_provider_reference, ''), 'quepia-outbox:' || outbox_row.id::TEXT);
    -- Si el eco del webhook llegó antes, solo se vincula el outbox.
    UPDATE public.sistema_social_interactions SET outbox_id = outbox_row.id, sent_by = outbox_row.created_by, origin = 'quepia_admin'
    WHERE account_id = outbox_row.account_id AND external_id = external_value AND outbox_id IS NULL;
    IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.sistema_social_interactions WHERE account_id = outbox_row.account_id AND external_id = external_value) THEN
      INSERT INTO public.sistema_social_interactions(
        client_id, account_id, thread_id, kind, external_id, direction, body, parent_external_id, occurred_at,
        source, sent_via, origin, sent_by, outbox_id, delivery_status
      ) VALUES (
        outbox_row.client_id, outbox_row.account_id, thread_row.id,
        CASE WHEN outbox_row.action_type = 'send_dm' THEN 'dm' ELSE thread_row.kind END,
        external_value, 'outbound', outbox_row.request ->> 'text',
        outbox_row.target_ref ->> 'comment_id', now(), 'quepia', 'api', 'quepia_admin', outbox_row.created_by,
        outbox_row.id, 'sent'
      ) RETURNING * INTO interaction_row;
      -- Una respuesta privada va por DM: no cierra el hilo público de comentarios.
      IF outbox_row.action_type <> 'private_reply' THEN
        PERFORM private.social_apply_attention(thread_row.id, interaction_row, true);
      END IF;
    END IF;
    UPDATE public.sistema_social_threads SET
      claimed_by = NULL, claimed_until = NULL,
      attention_status = CASE WHEN attention_status IN ('new', 'assigned', 'in_progress') THEN 'waiting' ELSE attention_status END,
      version = version + 1, updated_at = now()
    WHERE id = thread_row.id AND outbox_row.action_type <> 'private_reply';
  END IF;

  PERFORM private.social_audit(outbox_row.created_by, 'worker', outbox_row.client_id, 'outbox', outbox_row.id::TEXT,
    'outbox.' || p_status, jsonb_build_object('action', outbox_row.action_type, 'error', left(p_error, 300)));
  RETURN private.social_ok(jsonb_build_object('id', outbox_row.id, 'status', outbox_row.status));
END
$social_outbox_finish$;

CREATE OR REPLACE FUNCTION public.social_outbox_pending(p_limit INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_outbox_pending$
  SELECT private.social_ok(COALESCE(jsonb_agg(id ORDER BY created_at), '[]'::JSONB))
  FROM (
    SELECT id, created_at FROM public.sistema_social_outbox
    WHERE status = 'pending' ORDER BY created_at LIMIT GREATEST(1, LEAST(p_limit, 50))
  ) AS pending;
$social_outbox_pending$;

CREATE OR REPLACE FUNCTION public.social_admin_update_attention_settings(p_actor UUID, p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_update_attention_settings$
DECLARE
  social_err_detail TEXT;
  result public.sistema_social_attention_settings%ROWTYPE;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF p_settings ? 'timezone' AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_settings ->> 'timezone') THEN
    RETURN private.social_error('invalid_timezone', 'Zona horaria desconocida');
  END IF;
  UPDATE public.sistema_social_attention_settings SET
    timezone = COALESCE(p_settings ->> 'timezone', timezone),
    business_days = COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_settings -> 'business_days')::SMALLINT), business_days),
    business_start = COALESCE((p_settings ->> 'business_start')::TIME, business_start),
    business_end = COALESCE((p_settings ->> 'business_end')::TIME, business_end),
    first_response_target_minutes = COALESCE((p_settings ->> 'first_response_target_minutes')::INTEGER, first_response_target_minutes),
    updated_by = p_actor, updated_at = now()
  WHERE id = 1 RETURNING * INTO result;
  PERFORM private.social_audit(p_actor, 'admin', NULL, 'attention_settings', '1', 'attention_settings.updated', p_settings);
  RETURN private.social_ok(to_jsonb(result));
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
    RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
  WHEN check_violation OR invalid_datetime_format OR invalid_text_representation THEN
    RETURN private.social_error('invalid_settings', 'Configuración de horario inválida');
END
$social_admin_update_attention_settings$;

-- ---------------------------------------------------------------------------
-- Lecturas de bandeja para la UI (DMs solo visibles aquí, nunca en IA/MCP)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.social_admin_list_threads(p_actor UUID, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_list_threads$
DECLARE
  scope JSONB;
  statuses TEXT[];
  kinds TEXT[];
  only_mine BOOLEAN := COALESCE((p_params ->> 'only_mine')::BOOLEAN, false);
  row_limit INTEGER := LEAST(GREATEST(COALESCE((p_params ->> 'limit')::INTEGER, 50), 1), 100);
  result JSONB;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  scope := private.social_resolve_scope(COALESCE(p_params, '{}'::JSONB) - 'statuses' - 'kinds' - 'only_mine' - 'limit', false);
  statuses := private.social_text_array(p_params -> 'statuses', 'statuses', '^(new|assigned|in_progress|waiting|resolved)$');
  kinds := private.social_text_array(p_params -> 'kinds', 'kinds', '^(dm|comment)$');
  SELECT jsonb_build_object('threads', COALESCE(jsonb_agg(row_data ORDER BY sort_key DESC), '[]'::JSONB)) INTO result
  FROM (
    SELECT COALESCE(thread.pending_since, thread.last_activity_at, thread.created_at) AS sort_key,
      jsonb_build_object(
        'id', thread.id, 'client_id', thread.client_id, 'account_id', thread.account_id, 'kind', thread.kind,
        'platform', thread.platform, 'participant_name', thread.participant_name,
        'participant_username', thread.participant_username, 'attention_status', thread.attention_status,
        'assignee_id', thread.assignee_id, 'project_id', thread.project_id, 'pending_since', thread.pending_since,
        'last_activity_at', thread.last_activity_at, 'version', thread.version,
        'claimed_by', CASE WHEN thread.claimed_until > now() THEN thread.claimed_by END,
        'account_username', account.username, 'client_name', client.name,
        'post_permalink', post.permalink, 'post_caption', left(post.caption_excerpt, 120),
        'last_message', (SELECT left(interaction.body, 160) FROM public.sistema_social_interactions AS interaction
          WHERE interaction.thread_id = thread.id AND NOT interaction.is_deleted ORDER BY interaction.occurred_at DESC LIMIT 1),
        'imported_as_historical', thread.imported_as_historical
      ) AS row_data
    FROM public.sistema_social_threads AS thread
    JOIN public.sistema_zernio_accounts AS account ON account.id = thread.account_id
    JOIN public.clients AS client ON client.id = thread.client_id
    LEFT JOIN public.sistema_social_posts AS post ON post.id = thread.post_id
    WHERE thread.account_id = ANY(private.social_scope_uuids(scope, 'resolved_account_ids'))
      AND (cardinality(statuses) = 0 OR thread.attention_status = ANY(statuses))
      AND (cardinality(kinds) = 0 OR thread.kind = ANY(kinds))
      AND (NOT only_mine OR thread.assignee_id = p_actor)
      AND (cardinality(private.social_scope_uuids(scope, 'project_ids')) = 0
        OR thread.project_id = ANY(private.social_scope_uuids(scope, 'project_ids')))
    ORDER BY COALESCE(thread.pending_since, thread.last_activity_at, thread.created_at) DESC
    LIMIT row_limit
  ) AS listed;
  RETURN private.social_ok(result);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_list_threads$;

CREATE OR REPLACE FUNCTION public.social_admin_get_thread(p_actor UUID, p_thread_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_get_thread$
DECLARE
  thread_row public.sistema_social_threads%ROWTYPE;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT * INTO thread_row FROM public.sistema_social_threads WHERE id = p_thread_id;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Hilo inexistente');
  END IF;
  RETURN private.social_ok(jsonb_build_object(
    'thread', to_jsonb(thread_row),
    'account', (SELECT jsonb_build_object('id', id, 'platform', platform, 'username', username, 'is_active', is_active,
      'needs_reconnection', needs_reconnection, 'permissions', to_jsonb(permissions), 'messaging_restriction', messaging_restriction)
      FROM public.sistema_zernio_accounts WHERE id = thread_row.account_id),
    'client', (SELECT jsonb_build_object('id', id, 'name', name) FROM public.clients WHERE id = thread_row.client_id),
    'post', (SELECT jsonb_build_object('id', id, 'permalink', permalink, 'caption_excerpt', caption_excerpt, 'thumbnail_url', thumbnail_url)
      FROM public.sistema_social_posts WHERE id = thread_row.post_id),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', nombre) ORDER BY nombre)
      FROM public.sistema_projects WHERE client_id = thread_row.client_id), '[]'::JSONB),
    'interactions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', interaction.id, 'external_id', interaction.external_id, 'direction', interaction.direction,
      'author_name', interaction.author_name, 'author_username', interaction.author_username,
      'body', CASE WHEN interaction.is_deleted THEN NULL ELSE interaction.body END,
      'is_deleted', interaction.is_deleted, 'attachments', interaction.attachments,
      'occurred_at', interaction.occurred_at, 'origin', interaction.origin, 'sent_via', interaction.sent_via,
      'sent_by', interaction.sent_by, 'delivery_status', interaction.delivery_status,
      'parent_external_id', interaction.parent_external_id, 'edited_at', interaction.edited_at
    ) ORDER BY interaction.occurred_at) FROM public.sistema_social_interactions AS interaction
      WHERE interaction.thread_id = p_thread_id), '[]'::JSONB),
    'notes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', note.id, 'author_id', note.author_id,
      'author_name', author.nombre, 'body', note.body, 'created_at', note.created_at) ORDER BY note.created_at)
      FROM public.sistema_social_notes AS note JOIN public.sistema_users AS author ON author.id = note.author_id
      WHERE note.thread_id = p_thread_id AND note.deleted_at IS NULL), '[]'::JSONB),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('event', event.event, 'actor_id', event.actor_id,
      'details', event.details, 'occurred_at', event.occurred_at) ORDER BY event.occurred_at)
      FROM public.sistema_social_attention_events AS event WHERE event.thread_id = p_thread_id), '[]'::JSONB),
    'outbox', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', outbox.id, 'action_type', outbox.action_type,
      'status', outbox.status, 'last_error', outbox.last_error, 'created_by', outbox.created_by, 'created_at', outbox.created_at)
      ORDER BY outbox.created_at) FROM public.sistema_social_outbox AS outbox
      WHERE outbox.target_ref ->> 'thread_id' = p_thread_id::TEXT), '[]'::JSONB),
    'assignable_admins', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', nombre) ORDER BY nombre)
      FROM public.sistema_users WHERE private.social_is_global_admin(id)), '[]'::JSONB)
  ));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_get_thread$;

-- ---------------------------------------------------------------------------
-- SLA agregado (sin cuerpos de mensajes): lo usan UI, IA y MCP
-- ---------------------------------------------------------------------------

-- Segundos laborables entre dos instantes según la configuración.
CREATE OR REPLACE FUNCTION private.social_business_seconds(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_business_seconds$
DECLARE
  settings_row public.sistema_social_attention_settings%ROWTYPE;
  day_cursor DATE;
  last_day DATE;
  window_start TIMESTAMPTZ;
  window_end TIMESTAMPTZ;
  total NUMERIC := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RETURN 0;
  END IF;
  SELECT * INTO settings_row FROM public.sistema_social_attention_settings WHERE id = 1;
  day_cursor := (p_start AT TIME ZONE settings_row.timezone)::DATE;
  last_day := (p_end AT TIME ZONE settings_row.timezone)::DATE;
  IF last_day - day_cursor > 400 THEN
    last_day := day_cursor + 400;
  END IF;
  WHILE day_cursor <= last_day LOOP
    IF extract(isodow FROM day_cursor)::SMALLINT = ANY(settings_row.business_days) THEN
      window_start := GREATEST(p_start, (day_cursor + settings_row.business_start) AT TIME ZONE settings_row.timezone);
      window_end := LEAST(p_end, (day_cursor + settings_row.business_end) AT TIME ZONE settings_row.timezone);
      IF window_end > window_start THEN
        total := total + extract(epoch FROM window_end - window_start);
      END IF;
    END IF;
    day_cursor := day_cursor + 1;
  END LOOP;
  RETURN total;
END
$social_business_seconds$;

CREATE OR REPLACE FUNCTION private.social_q_attention(p_scope JSONB, p_params JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_q_attention$
  WITH episodes AS (
    SELECT episode.*,
      extract(epoch FROM episode.first_human_response_at - episode.opened_at) AS human_wall_seconds,
      private.social_business_seconds(episode.opened_at, episode.first_human_response_at) AS human_business_seconds,
      extract(epoch FROM episode.first_automated_response_at - episode.opened_at) AS auto_wall_seconds,
      extract(epoch FROM episode.resolved_at - episode.opened_at) AS resolution_wall_seconds
    FROM public.sistema_social_attention_episodes AS episode
    JOIN public.sistema_social_threads AS thread ON thread.id = episode.thread_id
    WHERE episode.account_id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
      AND episode.opened_at >= (p_scope ->> 'start_ts')::TIMESTAMPTZ
      AND episode.opened_at < (p_scope ->> 'end_ts')::TIMESTAMPTZ
      AND NOT thread.imported_as_historical
  ), pending AS (
    SELECT thread.* FROM public.sistema_social_threads AS thread
    WHERE thread.account_id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
      AND thread.pending_since IS NOT NULL AND thread.attention_status <> 'resolved'
  ), settings AS (
    SELECT * FROM public.sistema_social_attention_settings WHERE id = 1
  )
  SELECT jsonb_build_object(
    'episodes_opened', (SELECT count(*) FROM episodes),
    'episodes_with_human_response', (SELECT count(*) FROM episodes WHERE first_human_response_at IS NOT NULL),
    'episodes_answered_only_by_automation', (SELECT count(*) FROM episodes WHERE first_automated_response_at IS NOT NULL AND first_human_response_at IS NULL),
    'episodes_first_answered_outside_quepia_unknown', (SELECT count(*) FROM episodes WHERE first_response_origin = 'external_unknown'),
    'episodes_without_response', (SELECT count(*) FROM episodes WHERE first_response_at IS NULL),
    'episodes_resolved', (SELECT count(*) FROM episodes WHERE resolved_at IS NOT NULL),
    'first_human_response_minutes', jsonb_build_object(
      'median_wall', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY human_wall_seconds) / 60)::NUMERIC, 1) FROM episodes WHERE human_wall_seconds IS NOT NULL),
      'p90_wall', (SELECT round((percentile_cont(0.9) WITHIN GROUP (ORDER BY human_wall_seconds) / 60)::NUMERIC, 1) FROM episodes WHERE human_wall_seconds IS NOT NULL),
      'median_business', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY human_business_seconds) / 60)::NUMERIC, 1) FROM episodes WHERE human_wall_seconds IS NOT NULL),
      'p90_business', (SELECT round((percentile_cont(0.9) WITHIN GROUP (ORDER BY human_business_seconds) / 60)::NUMERIC, 1) FROM episodes WHERE human_wall_seconds IS NOT NULL),
      'within_target', (SELECT count(*) FROM episodes, settings WHERE human_business_seconds IS NOT NULL AND human_wall_seconds IS NOT NULL
        AND human_business_seconds <= settings.first_response_target_minutes * 60),
      'target_minutes_business', (SELECT first_response_target_minutes FROM settings)
    ),
    'first_automated_response_minutes', jsonb_build_object(
      'median_wall', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY auto_wall_seconds) / 60)::NUMERIC, 1) FROM episodes WHERE auto_wall_seconds IS NOT NULL),
      'n', (SELECT count(*) FROM episodes WHERE auto_wall_seconds IS NOT NULL)
    ),
    'resolution_minutes', jsonb_build_object(
      'median_wall', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY resolution_wall_seconds) / 60)::NUMERIC, 1) FROM episodes WHERE resolution_wall_seconds IS NOT NULL),
      'p90_wall', (SELECT round((percentile_cont(0.9) WITHIN GROUP (ORDER BY resolution_wall_seconds) / 60)::NUMERIC, 1) FROM episodes WHERE resolution_wall_seconds IS NOT NULL)
    ),
    'pending_now', jsonb_build_object(
      'threads', (SELECT count(*) FROM pending),
      'oldest_pending_minutes', (SELECT round((extract(epoch FROM now() - min(pending_since)) / 60)::NUMERIC, 1) FROM pending),
      'unassigned', (SELECT count(*) FROM pending WHERE assignee_id IS NULL)
    ),
    'by_status', COALESCE((SELECT jsonb_object_agg(attention_status, n) FROM (
      SELECT attention_status, count(*) AS n FROM public.sistema_social_threads
      WHERE account_id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
      GROUP BY attention_status) AS statuses), '{}'::JSONB),
    'business_hours', (SELECT jsonb_build_object('timezone', timezone, 'days', to_jsonb(business_days),
      'start', business_start, 'end', business_end) FROM settings),
    'definitions', jsonb_build_object(
      'episode', 'Desde el primer mensaje/comentario entrante sin respuesta hasta la resolución.',
      'human_response', 'Respuesta enviada desde Quepia por un admin o desde la bandeja de Zernio (sentVia=human). Salientes sin autoría conocida no cuentan como humanas.',
      'excluded', 'Historial importado sin actividad reciente no se mide.'
    ),
    'privacy', 'Solo agregados: no incluye cuerpos de mensajes ni datos de contactos.'
  );
$social_q_attention$;

DO $rpc_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.social_ingest_interactions(jsonb,text)',
    'public.social_admin_update_thread(uuid,uuid,integer,jsonb)',
    'public.social_admin_add_note(uuid,uuid,text)',
    'public.social_admin_claim_thread(uuid,uuid,boolean)',
    'public.social_admin_enqueue_reply(uuid,uuid,integer,text,text,text,uuid)',
    'public.social_outbox_begin(uuid)',
    'public.social_outbox_finish(uuid,text,text,jsonb,text)',
    'public.social_outbox_pending(integer)',
    'public.social_admin_update_attention_settings(uuid,jsonb)',
    'public.social_admin_list_threads(uuid,jsonb)',
    'public.social_admin_get_thread(uuid,uuid)'
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

-- Acciones con resultado ambiguo pendientes de conciliación.
CREATE OR REPLACE FUNCTION public.social_outbox_ambiguous(p_limit INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_outbox_ambiguous$
  SELECT private.social_ok(COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.updated_at), '[]'::JSONB))
  FROM (
    SELECT id, action_type, target_ref, request, created_at, updated_at, attempts
    FROM public.sistema_social_outbox WHERE status = 'ambiguous'
    ORDER BY updated_at LIMIT GREATEST(1, LEAST(p_limit, 50))
  ) AS item;
$social_outbox_ambiguous$;
REVOKE EXECUTE ON FUNCTION public.social_outbox_ambiguous(integer) FROM PUBLIC, anon, authenticated;
DO $ambiguous_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.social_outbox_ambiguous(integer) FROM mcp_authenticated;
  END IF;
END
$ambiguous_grants$;
GRANT EXECUTE ON FUNCTION public.social_outbox_ambiguous(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
