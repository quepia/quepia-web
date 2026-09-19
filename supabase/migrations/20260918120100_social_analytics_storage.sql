-- Gestión social, fase 1: publicaciones nativas por cuenta, atribución a
-- proyectos, catálogo versionado de métricas, snapshots y métricas de cuenta.
--
-- Semántica verificada el 2026-09-18 contra la cuenta real (GET acotados):
-- * /analytics devuelve valores ABSOLUTOS acumulados por publicación.
-- * /analytics/post-timeline devuelve una fila por día con el ACUMULADO al
--   cierre de ese día (serie monótona cuyo último valor coincide con el total),
--   no incrementos diarios. Nunca se suman filas de timeline.
-- * El delta documenta que "metrics a platform does not report are 0": un cero
--   puede significar "no soportado". El catálogo de soporte decide qué se
--   muestra; los valores no soportados nunca se presentan como cero real.
-- * En Instagram, impressions coincide con views (Meta unificó la métrica); se
--   registra como alias para no contarla dos veces.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regprocedure('private.social_is_global_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplicar primero 20260918120000_social_foundations.sql';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Catálogo versionado de métricas y soporte por plataforma/formato
-- ---------------------------------------------------------------------------

CREATE TABLE public.sistema_social_metric_definitions (
  metric_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  provider_field TEXT,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('count', 'ratio', 'milliseconds', 'seconds', 'percent')),
  scope TEXT NOT NULL CHECK (scope IN ('post', 'account')),
  value_kind TEXT NOT NULL CHECK (value_kind IN ('cumulative', 'point_in_time', 'period_total', 'derived')),
  aggregation TEXT NOT NULL CHECK (aggregation IN ('sum', 'weighted_ratio', 'latest', 'none', 'change')),
  denominator TEXT,
  formula TEXT,
  is_engagement_component BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL,
  caveats TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_key, version)
);
CREATE UNIQUE INDEX uq_social_metric_current ON public.sistema_social_metric_definitions(metric_key) WHERE is_current;

-- status: supported (verificado con datos reales), unverified (documentado,
-- sin validar en cuenta real), not_supported, alias (duplica otra métrica).
CREATE TABLE public.sistema_social_metric_support (
  platform TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  media_product_type TEXT NOT NULL DEFAULT '*',
  status TEXT NOT NULL CHECK (status IN ('supported', 'unverified', 'not_supported', 'alias')),
  alias_of TEXT,
  note TEXT,
  verified_at DATE,
  PRIMARY KEY (platform, metric_key, media_product_type)
);

INSERT INTO public.sistema_social_metric_definitions(
  metric_key, version, provider_field, label, description, unit, scope, value_kind, aggregation,
  denominator, formula, is_engagement_component, source, caveats
) VALUES
  ('views', 1, 'views', 'Reproducciones/visualizaciones', 'Visualizaciones acumuladas informadas por la plataforma para la publicación.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', 'La definición de "view" difiere entre redes; no comparar entre plataformas como equivalentes.'),
  ('reach', 1, 'reach', 'Alcance (cuentas únicas por publicación)', 'Cuentas únicas alcanzadas por la publicación. Sumar alcances de varias publicaciones NO da personas únicas.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', 'La suma entre publicaciones se rotula "suma de alcances", nunca audiencia única.'),
  ('impressions', 1, 'impressions', 'Impresiones', 'Impresiones informadas por la plataforma.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', 'En Instagram coincide con views; se trata como alias.'),
  ('likes', 1, 'likes', 'Me gusta', 'Me gusta acumulados.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, true, 'zernio:/analytics', NULL),
  ('comments', 1, 'comments', 'Comentarios', 'Comentarios acumulados informados por la plataforma.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, true, 'zernio:/analytics', NULL),
  ('shares', 1, 'shares', 'Compartidos', 'Veces compartida.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, true, 'zernio:/analytics', NULL),
  ('saves', 1, 'saves', 'Guardados', 'Veces guardada.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, true, 'zernio:/analytics', NULL),
  ('clicks', 1, 'clicks', 'Clics', 'Clics informados por la plataforma.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', 'Instagram orgánico suele devolver 0 aunque no lo exponga: sin validar.'),
  ('follows', 1, 'follows', 'Seguimientos atribuidos', 'Seguidores atribuidos a la publicación.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', 'Nulo cuando la plataforma no lo informa.'),
  ('reposts', 1, 'reposts', 'Reposteos', 'Reposteos informados.', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', NULL),
  ('ig_reels_avg_watch_time', 1, 'igReelsAvgWatchTime', 'Tiempo medio de visualización (Reels)', 'Promedio de tiempo de reproducción de un Reel.', 'milliseconds', 'post', 'point_in_time', 'none', NULL, NULL, false, 'zernio:/analytics', 'Promedio del proveedor: no se suma ni se promedia sin ponderación.'),
  ('ig_reels_total_watch_time', 1, 'igReelsVideoViewTotalTime', 'Tiempo total de visualización (Reels)', 'Tiempo total reproducido del Reel.', 'milliseconds', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', NULL),
  ('reels_skip_rate', 1, 'reelsSkipRate', 'Tasa de salto (Reels)', 'Proporción de espectadores que saltan el Reel (0 a 1).', 'ratio', 'post', 'point_in_time', 'none', NULL, NULL, false, 'zernio:/analytics', 'Tasa nativa: no se promedia entre publicaciones sin ponderar.'),
  ('completion_rate', 1, 'completionRate', 'Tasa de finalización', 'Proporción que vio hasta el final (TikTok, lane business).', 'ratio', 'post', 'point_in_time', 'none', NULL, NULL, false, 'zernio:/analytics', NULL),
  ('profile_views', 1, 'profileViews', 'Visitas al perfil atribuidas', 'Visitas al perfil atribuidas a la publicación (TikTok business).', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', NULL),
  ('website_clicks', 1, 'websiteClicks', 'Clics al sitio', 'Clics al enlace del perfil atribuidos (TikTok business).', 'count', 'post', 'cumulative', 'sum', NULL, NULL, false, 'zernio:/analytics', NULL),
  ('provider_engagement_rate', 1, 'engagementRate', 'Tasa de engagement nativa', 'Tasa calculada por Zernio/plataforma. Se muestra separada de la fórmula de Quepia.', 'percent', 'post', 'point_in_time', 'none', NULL, NULL, false, 'zernio:/analytics', 'Fórmula del proveedor no documentada con precisión: no se agrega.'),
  ('interactions', 1, NULL, 'Interacciones', 'likes + comentarios + compartidos + guardados, solo si los cuatro componentes están soportados para la publicación.', 'count', 'post', 'derived', 'sum', NULL, 'likes + comments + shares + saves', false, 'quepia', 'Publicaciones con componentes no soportados se excluyen y se informan.'),
  ('engagement_rate_reach', 1, NULL, 'Engagement por alcance (Quepia)', 'Interacciones / alcance, ponderado: suma de interacciones dividida por suma de alcances de publicaciones compatibles.', 'ratio', 'post', 'derived', 'weighted_ratio', 'reach', 'sum(likes+comments+shares+saves) / sum(reach)', false, 'quepia', 'No se promedian tasas individuales. Denominador cero ⇒ no disponible.'),
  ('followers', 1, 'followers', 'Seguidores', 'Seguidores de la cuenta al cierre del día (Zernio actualiza una vez por día).', 'count', 'account', 'point_in_time', 'change', NULL, NULL, false, 'zernio:/accounts/follower-stats', 'Sumar seguidores de varias cuentas da seguidores acumulados, no audiencia deduplicada.'),
  ('ig_account_reach', 1, 'reach', 'Alcance de cuenta (Instagram)', 'Cuentas únicas alcanzadas por toda la cuenta en el período, según Instagram.', 'count', 'account', 'period_total', 'none', NULL, NULL, false, 'zernio:/analytics/instagram/account-insights', 'Insight de cuenta: no se mezcla con sumas de publicaciones. Demora hasta 48 h; máximo 90 días por consulta.'),
  ('ig_account_views', 1, 'views', 'Visualizaciones de cuenta (Instagram)', 'Visualizaciones de todo el contenido de la cuenta en el período.', 'count', 'account', 'period_total', 'none', NULL, NULL, false, 'zernio:/analytics/instagram/account-insights', 'Incluye stories, explorar y perfil.'),
  ('ig_account_accounts_engaged', 1, 'accounts_engaged', 'Cuentas que interactuaron (Instagram)', 'Cuentas únicas que interactuaron en el período.', 'count', 'account', 'period_total', 'none', NULL, NULL, false, 'zernio:/analytics/instagram/account-insights', NULL),
  ('ig_account_total_interactions', 1, 'total_interactions', 'Interacciones totales de cuenta (Instagram)', 'Interacciones totales en el período según Instagram.', 'count', 'account', 'period_total', 'none', NULL, NULL, false, 'zernio:/analytics/instagram/account-insights', NULL),
  ('posts_published', 1, NULL, 'Publicaciones', 'Cantidad de publicaciones nativas (una por cuenta) publicadas en el período.', 'count', 'post', 'derived', 'sum', NULL, 'count(distinct post)', false, 'quepia', 'Una publicación multiplataforma cuenta una vez por cuenta.');

-- Instagram: verificado con 31 publicaciones reales el 2026-09-18.
INSERT INTO public.sistema_social_metric_support(platform, metric_key, media_product_type, status, alias_of, note, verified_at) VALUES
  ('instagram', 'views', '*', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'reach', '*', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'impressions', '*', 'alias', 'views', 'Igual a views en todas las publicaciones observadas', DATE '2026-09-18'),
  ('instagram', 'likes', '*', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'comments', '*', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'shares', '*', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'saves', '*', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'likes', 'STORY', 'not_supported', NULL, 'Las Stories no exponen me gusta por API', NULL),
  ('instagram', 'comments', 'STORY', 'not_supported', NULL, 'Las Stories no tienen comentarios', NULL),
  ('instagram', 'saves', 'STORY', 'not_supported', NULL, NULL, NULL),
  ('instagram', 'clicks', '*', 'unverified', NULL, 'Zernio devolvió 0 en todas las publicaciones; puede ser "no informado"', NULL),
  ('instagram', 'follows', '*', 'unverified', NULL, 'Nulo en la mayoría de publicaciones observadas', NULL),
  ('instagram', 'reposts', '*', 'unverified', NULL, NULL, NULL),
  ('instagram', 'ig_reels_avg_watch_time', 'REELS', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'ig_reels_total_watch_time', 'REELS', 'supported', NULL, NULL, DATE '2026-09-18'),
  ('instagram', 'reels_skip_rate', 'REELS', 'unverified', NULL, NULL, NULL),
  ('instagram', 'ig_reels_avg_watch_time', '*', 'not_supported', NULL, 'Solo Reels', NULL),
  ('instagram', 'ig_reels_total_watch_time', '*', 'not_supported', NULL, 'Solo Reels', NULL),
  ('instagram', 'reels_skip_rate', '*', 'not_supported', NULL, 'Solo Reels', NULL),
  ('instagram', 'completion_rate', '*', 'not_supported', NULL, 'Solo TikTok business', NULL),
  ('instagram', 'profile_views', '*', 'not_supported', NULL, 'Solo TikTok business', NULL),
  ('instagram', 'website_clicks', '*', 'not_supported', NULL, 'Solo TikTok business', NULL),
  ('instagram', 'provider_engagement_rate', '*', 'supported', NULL, 'Tasa nativa de Zernio', DATE '2026-09-18'),
  ('instagram', 'followers', '*', 'supported', NULL, 'Actualización diaria', DATE '2026-09-18'),
  ('instagram', 'ig_account_reach', '*', 'unverified', NULL, 'Documentado; pendiente de primera sincronización', NULL),
  ('instagram', 'ig_account_views', '*', 'unverified', NULL, NULL, NULL),
  ('instagram', 'ig_account_accounts_engaged', '*', 'unverified', NULL, NULL, NULL),
  ('instagram', 'ig_account_total_interactions', '*', 'unverified', NULL, NULL, NULL);

-- Resto de redes: documentado pero sin cuentas reales para validar.
INSERT INTO public.sistema_social_metric_support(platform, metric_key, media_product_type, status, note)
SELECT platform, metric_key, '*', 'unverified', 'Documentado por Zernio; sin cuenta conectada para validar'
FROM unnest(ARRAY['facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'twitter', 'pinterest', 'bluesky']) AS platform
CROSS JOIN unnest(ARRAY['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'clicks', 'followers']) AS metric_key;
INSERT INTO public.sistema_social_metric_support(platform, metric_key, media_product_type, status, note)
SELECT 'tiktok', metric_key, '*', 'unverified', 'Lane business de TikTok; puede demorar 24–48 h'
FROM unnest(ARRAY['completion_rate', 'profile_views', 'website_clicks']) AS metric_key;

-- Estado de soporte efectivo de una métrica para una publicación.
CREATE OR REPLACE FUNCTION private.social_metric_status(p_platform TEXT, p_metric TEXT, p_product_type TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_metric_status$
  SELECT COALESCE(
    (SELECT status FROM public.sistema_social_metric_support
     WHERE platform = p_platform AND metric_key = p_metric AND media_product_type = COALESCE(p_product_type, '*')),
    (SELECT status FROM public.sistema_social_metric_support
     WHERE platform = p_platform AND metric_key = p_metric AND media_product_type = '*'),
    'unverified'
  );
$social_metric_status$;

-- ---------------------------------------------------------------------------
-- 2. Publicaciones nativas por cuenta y atribución a proyectos
-- ---------------------------------------------------------------------------

CREATE TABLE public.sistema_social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_post_id TEXT NOT NULL,
  zernio_external_post_id TEXT,
  zernio_post_id TEXT,
  origin TEXT NOT NULL DEFAULT 'external' CHECK (origin IN ('quepia', 'zernio_api', 'external')),
  publication_id UUID REFERENCES public.sistema_zernio_publications(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.sistema_tasks(id) ON DELETE SET NULL,
  format TEXT NOT NULL DEFAULT 'unknown'
    CHECK (format IN ('reel', 'image', 'carousel', 'video', 'story', 'text', 'unknown')),
  media_type TEXT,
  media_product_type TEXT,
  is_ad BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  permalink TEXT,
  thumbnail_url TEXT,
  caption_excerpt TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_detected_at TIMESTAMPTZ,
  provider_sync_status TEXT,
  metrics_observed_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id),
  UNIQUE (account_id, platform_post_id),
  UNIQUE (id, client_id)
);
CREATE UNIQUE INDEX uq_social_posts_external ON public.sistema_social_posts(zernio_external_post_id)
  WHERE zernio_external_post_id IS NOT NULL;
CREATE INDEX idx_social_posts_client_published ON public.sistema_social_posts(client_id, published_at DESC);
CREATE INDEX idx_social_posts_account_published ON public.sistema_social_posts(account_id, published_at DESC);
CREATE INDEX idx_social_posts_zernio_post ON public.sistema_social_posts(zernio_post_id) WHERE zernio_post_id IS NOT NULL;
CREATE INDEX idx_social_posts_publication ON public.sistema_social_posts(publication_id) WHERE publication_id IS NOT NULL;

CREATE TABLE public.sistema_social_post_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  post_id UUID NOT NULL,
  project_id UUID NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  attribution_source TEXT NOT NULL CHECK (attribution_source IN ('publication', 'manual')),
  assigned_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (post_id, client_id) REFERENCES public.sistema_social_posts(id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, client_id) REFERENCES public.sistema_projects(id, client_id) ON DELETE CASCADE,
  UNIQUE (post_id, project_id)
);
CREATE UNIQUE INDEX uq_social_post_primary_project ON public.sistema_social_post_projects(post_id) WHERE is_primary;
CREATE INDEX idx_social_post_projects_project ON public.sistema_social_post_projects(project_id);

-- Valor vigente por publicación/métrica (absoluto; nunca se suma).
CREATE TABLE public.sistema_social_post_metrics_latest (
  post_id UUID NOT NULL REFERENCES public.sistema_social_posts(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  value NUMERIC NOT NULL,
  provider_synced_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  definition_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (post_id, metric_key)
);

-- Snapshot acumulado al cierre de cada día observado.
CREATE TABLE public.sistema_social_post_metric_snapshots (
  post_id UUID NOT NULL REFERENCES public.sistema_social_posts(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  observed_on DATE NOT NULL,
  value NUMERIC NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('analytics', 'delta', 'timeline', 'single')),
  PRIMARY KEY (post_id, metric_key, observed_on)
);
CREATE INDEX idx_social_snapshots_post_metric ON public.sistema_social_post_metric_snapshots(post_id, metric_key, observed_on DESC);

-- Métricas de cuenta puntuales por día (seguidores).
CREATE TABLE public.sistema_social_account_daily (
  account_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  metric_key TEXT NOT NULL,
  day DATE NOT NULL,
  value NUMERIC NOT NULL,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, metric_key, day),
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id)
);
CREATE INDEX idx_social_account_daily_client ON public.sistema_social_account_daily(client_id, metric_key, day);

-- Totales de cuenta por período (insights de Instagram), con motivo si faltan.
CREATE TABLE public.sistema_social_account_period_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  metric_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  breakdown_key TEXT NOT NULL DEFAULT '',
  value NUMERIC,
  unavailable_reason TEXT,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, client_id) REFERENCES public.sistema_zernio_accounts(id, client_id),
  UNIQUE (account_id, metric_key, period_start, period_end, breakdown_key),
  CHECK ((value IS NULL) <> (unavailable_reason IS NULL))
);

DO $server_only$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sistema_social_metric_definitions',
    'sistema_social_metric_support',
    'sistema_social_posts',
    'sistema_social_post_projects',
    'sistema_social_post_metrics_latest',
    'sistema_social_post_metric_snapshots',
    'sistema_social_account_daily',
    'sistema_social_account_period_metrics'
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
-- 3. Ingesta (idempotente, a prueba de orden inverso)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.social_format_for(p_media_type TEXT, p_product_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_format_for$
  SELECT CASE
    WHEN upper(COALESCE(p_product_type, '')) = 'REELS' THEN 'reel'
    WHEN upper(COALESCE(p_product_type, '')) = 'STORY' THEN 'story'
    WHEN lower(COALESCE(p_media_type, '')) = 'carousel' THEN 'carousel'
    WHEN lower(COALESCE(p_media_type, '')) = 'image' THEN 'image'
    WHEN lower(COALESCE(p_media_type, '')) = 'video' THEN 'video'
    WHEN lower(COALESCE(p_media_type, '')) = 'text' THEN 'text'
    ELSE 'unknown'
  END;
$social_format_for$;

-- Registra un valor absoluto: actualiza "latest" solo si es más reciente y
-- guarda el snapshot del día conservando la observación más tardía.
CREATE OR REPLACE FUNCTION private.social_record_metric(
  p_post_id UUID,
  p_metric TEXT,
  p_value NUMERIC,
  p_observed_at TIMESTAMPTZ,
  p_provider_synced_at TIMESTAMPTZ,
  p_source TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $social_record_metric$
BEGIN
  IF p_value IS NULL OR p_value = 'NaN'::NUMERIC THEN
    RETURN;
  END IF;
  INSERT INTO public.sistema_social_post_metrics_latest(post_id, metric_key, value, provider_synced_at, observed_at, source)
  VALUES (p_post_id, p_metric, p_value, p_provider_synced_at, p_observed_at, p_source)
  ON CONFLICT (post_id, metric_key) DO UPDATE SET
    value = EXCLUDED.value,
    provider_synced_at = EXCLUDED.provider_synced_at,
    observed_at = EXCLUDED.observed_at,
    source = EXCLUDED.source
  WHERE COALESCE(EXCLUDED.provider_synced_at, EXCLUDED.observed_at)
    >= COALESCE(public.sistema_social_post_metrics_latest.provider_synced_at, public.sistema_social_post_metrics_latest.observed_at);

  INSERT INTO public.sistema_social_post_metric_snapshots(post_id, metric_key, observed_on, value, observed_at, source)
  VALUES (p_post_id, p_metric, (COALESCE(p_provider_synced_at, p_observed_at) AT TIME ZONE 'UTC')::DATE, p_value,
    COALESCE(p_provider_synced_at, p_observed_at), p_source)
  ON CONFLICT (post_id, metric_key, observed_on) DO UPDATE SET
    value = EXCLUDED.value, observed_at = EXCLUDED.observed_at, source = EXCLUDED.source
  WHERE EXCLUDED.observed_at >= public.sistema_social_post_metric_snapshots.observed_at;
END
$social_record_metric$;

-- p_items: publicaciones normalizadas por el adaptador (una por cuenta).
-- p_source: analytics | delta | single.
CREATE OR REPLACE FUNCTION public.social_ingest_posts(
  p_items JSONB,
  p_source TEXT,
  p_observed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_ingest_posts$
DECLARE
  item JSONB;
  metric RECORD;
  account_row public.sistema_zernio_accounts%ROWTYPE;
  post_row public.sistema_social_posts%ROWTYPE;
  publication_row public.sistema_zernio_publications%ROWTYPE;
  project_client UUID;
  written INTEGER := 0;
  skipped_unknown INTEGER := 0;
  skipped_unassigned INTEGER := 0;
  attribution_conflicts INTEGER := 0;
  metric_values INTEGER := 0;
  provider_time TIMESTAMPTZ;
  origin_value TEXT;
  unknown_accounts TEXT[] := '{}';
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR p_source NOT IN ('analytics', 'delta', 'single') THEN
    RETURN private.social_error('invalid_request', 'Entrada de ingesta inválida');
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO account_row FROM public.sistema_zernio_accounts
    WHERE zernio_account_id = item ->> 'zernio_account_id';
    IF NOT FOUND THEN
      skipped_unknown := skipped_unknown + 1;
      IF NOT (item ->> 'zernio_account_id' = ANY(unknown_accounts)) AND cardinality(unknown_accounts) < 20 THEN
        unknown_accounts := array_append(unknown_accounts, item ->> 'zernio_account_id');
      END IF;
      CONTINUE;
    END IF;
    IF account_row.client_id IS NULL THEN
      skipped_unassigned := skipped_unassigned + 1;
      CONTINUE;
    END IF;
    IF COALESCE(item ->> 'platform_post_id', '') = '' THEN
      skipped_unknown := skipped_unknown + 1;
      CONTINUE;
    END IF;

    provider_time := COALESCE((item ->> 'provider_synced_at')::TIMESTAMPTZ, p_observed_at);
    publication_row := NULL;
    IF NULLIF(item ->> 'zernio_post_id', '') IS NOT NULL THEN
      SELECT * INTO publication_row FROM public.sistema_zernio_publications
      WHERE zernio_post_id = item ->> 'zernio_post_id';
    END IF;
    origin_value := CASE
      WHEN publication_row.id IS NOT NULL THEN 'quepia'
      WHEN NULLIF(item ->> 'zernio_post_id', '') IS NOT NULL THEN 'zernio_api'
      ELSE 'external'
    END;

    INSERT INTO public.sistema_social_posts AS post (
      client_id, account_id, platform, platform_post_id, zernio_external_post_id, zernio_post_id, origin,
      publication_id, task_id, format, media_type, media_product_type, is_ad, published_at, permalink,
      thumbnail_url, caption_excerpt, is_deleted, deleted_detected_at, provider_sync_status, metrics_observed_at, updated_at
    ) VALUES (
      account_row.client_id, account_row.id, COALESCE(NULLIF(item ->> 'platform', ''), account_row.platform),
      item ->> 'platform_post_id', NULLIF(item ->> 'zernio_external_post_id', ''), NULLIF(item ->> 'zernio_post_id', ''),
      origin_value, publication_row.id, publication_row.task_id,
      private.social_format_for(item ->> 'media_type', item ->> 'media_product_type'),
      NULLIF(item ->> 'media_type', ''), NULLIF(item ->> 'media_product_type', ''),
      COALESCE((item ->> 'is_ad')::BOOLEAN, false), (item ->> 'published_at')::TIMESTAMPTZ,
      NULLIF(item ->> 'permalink', ''), NULLIF(item ->> 'thumbnail_url', ''), left(item ->> 'caption', 500),
      COALESCE((item ->> 'is_deleted')::BOOLEAN, false),
      CASE WHEN COALESCE((item ->> 'is_deleted')::BOOLEAN, false) THEN now() END,
      NULLIF(item ->> 'sync_status', ''), provider_time, now()
    )
    ON CONFLICT (account_id, platform_post_id) DO UPDATE SET
      zernio_external_post_id = COALESCE(EXCLUDED.zernio_external_post_id, post.zernio_external_post_id),
      zernio_post_id = COALESCE(EXCLUDED.zernio_post_id, post.zernio_post_id),
      origin = CASE WHEN post.origin = 'quepia' THEN 'quepia' ELSE EXCLUDED.origin END,
      publication_id = COALESCE(post.publication_id, EXCLUDED.publication_id),
      task_id = COALESCE(post.task_id, EXCLUDED.task_id),
      format = CASE WHEN EXCLUDED.format = 'unknown' THEN post.format ELSE EXCLUDED.format END,
      media_type = COALESCE(EXCLUDED.media_type, post.media_type),
      media_product_type = COALESCE(EXCLUDED.media_product_type, post.media_product_type),
      published_at = COALESCE(EXCLUDED.published_at, post.published_at),
      permalink = COALESCE(EXCLUDED.permalink, post.permalink),
      thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, post.thumbnail_url),
      caption_excerpt = COALESCE(EXCLUDED.caption_excerpt, post.caption_excerpt),
      is_deleted = CASE WHEN provider_time >= COALESCE(post.metrics_observed_at, '-infinity') THEN EXCLUDED.is_deleted ELSE post.is_deleted END,
      deleted_detected_at = CASE WHEN EXCLUDED.is_deleted AND NOT post.is_deleted THEN now() ELSE post.deleted_detected_at END,
      provider_sync_status = COALESCE(EXCLUDED.provider_sync_status, post.provider_sync_status),
      metrics_observed_at = GREATEST(post.metrics_observed_at, EXCLUDED.metrics_observed_at),
      updated_at = now()
    RETURNING * INTO post_row;
    written := written + 1;

    -- Atribución heredada de la tarea: solo si el proyecto es del mismo cliente.
    IF post_row.publication_id IS NOT NULL THEN
      SELECT client_id INTO project_client FROM public.sistema_projects
      WHERE id = (SELECT project_id FROM public.sistema_zernio_publications WHERE id = post_row.publication_id);
      IF project_client = post_row.client_id THEN
        INSERT INTO public.sistema_social_post_projects(client_id, post_id, project_id, is_primary, attribution_source)
        SELECT post_row.client_id, post_row.id, publication.project_id, true, 'publication'
        FROM public.sistema_zernio_publications AS publication
        WHERE publication.id = post_row.publication_id
          AND NOT EXISTS (SELECT 1 FROM public.sistema_social_post_projects WHERE post_id = post_row.id AND is_primary)
        ON CONFLICT DO NOTHING;
      ELSE
        attribution_conflicts := attribution_conflicts + 1;
      END IF;
    END IF;

    IF jsonb_typeof(item -> 'metrics') = 'object' THEN
      FOR metric IN SELECT key, value FROM jsonb_each(item -> 'metrics') LOOP
        CONTINUE WHEN jsonb_typeof(metric.value) <> 'number';
        CONTINUE WHEN NOT EXISTS (
          SELECT 1 FROM public.sistema_social_metric_definitions WHERE metric_key = metric.key AND is_current AND scope = 'post'
        );
        PERFORM private.social_record_metric(post_row.id, metric.key, (metric.value #>> '{}')::NUMERIC,
          p_observed_at, provider_time, p_source);
        metric_values := metric_values + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN private.social_ok(jsonb_build_object(
    'written', written,
    'metric_values', metric_values,
    'skipped_unknown_account', skipped_unknown,
    'skipped_unassigned_client', skipped_unassigned,
    'attribution_conflicts', attribution_conflicts,
    'unknown_accounts', to_jsonb(unknown_accounts)
  ));
END
$social_ingest_posts$;

-- Página del delta + cursor en una sola transacción (checkpoint atómico).
-- Compare-and-swap: si otro worker ya avanzó el cursor, no se aplica nada.
CREATE OR REPLACE FUNCTION public.social_apply_delta_page(
  p_entries JSONB,
  p_previous_cursor TEXT,
  p_next_cursor TEXT,
  p_scope_key TEXT DEFAULT 'global'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_apply_delta_page$
DECLARE
  state_row public.sistema_social_sync_state%ROWTYPE;
  ingest JSONB;
BEGIN
  SELECT * INTO state_row FROM public.sistema_social_sync_state
  WHERE stream = 'analytics_delta' AND scope_key = p_scope_key FOR UPDATE;
  IF NOT FOUND OR state_row.cursor IS DISTINCT FROM p_previous_cursor THEN
    RETURN private.social_error('cursor_conflict', 'El cursor almacenado cambió; se descarta la página');
  END IF;
  IF COALESCE(p_next_cursor, '') = '' THEN
    RETURN private.social_error('invalid_cursor', 'El proveedor no devolvió nextCursor');
  END IF;

  ingest := public.social_ingest_posts(COALESCE(p_entries, '[]'::JSONB), 'delta', now());
  IF NOT COALESCE((ingest ->> 'ok')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'Ingesta del delta falló: %', ingest -> 'error';
  END IF;

  UPDATE public.sistema_social_sync_state SET
    cursor = p_next_cursor,
    cursor_obtained_at = now(),
    status = 'ok',
    last_attempt_at = now(),
    last_success_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE stream = 'analytics_delta' AND scope_key = p_scope_key;

  RETURN private.social_ok(jsonb_build_object('ingest', ingest -> 'data', 'cursor_advanced', true));
END
$social_apply_delta_page$;

-- Timeline diario acumulado de una publicación.
CREATE OR REPLACE FUNCTION public.social_ingest_post_timeline(
  p_zernio_external_post_id TEXT,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_ingest_post_timeline$
DECLARE
  post_row public.sistema_social_posts%ROWTYPE;
  row_item JSONB;
  metric RECORD;
  day_value DATE;
  day_end TIMESTAMPTZ;
  written INTEGER := 0;
BEGIN
  SELECT * INTO post_row FROM public.sistema_social_posts WHERE zernio_external_post_id = p_zernio_external_post_id;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Publicación desconocida');
  END IF;
  FOR row_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) LOOP
    CONTINUE WHEN row_item ->> 'platform_post_id' IS NOT NULL AND row_item ->> 'platform_post_id' <> post_row.platform_post_id;
    day_value := (row_item ->> 'date')::DATE;
    CONTINUE WHEN day_value IS NULL;
    day_end := (day_value + 1)::TIMESTAMP AT TIME ZONE 'UTC' - interval '1 second';
    FOR metric IN SELECT key, value FROM jsonb_each(row_item -> 'metrics') LOOP
      CONTINUE WHEN jsonb_typeof(metric.value) <> 'number';
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM public.sistema_social_metric_definitions WHERE metric_key = metric.key AND is_current AND scope = 'post'
      );
      INSERT INTO public.sistema_social_post_metric_snapshots(post_id, metric_key, observed_on, value, observed_at, source)
      VALUES (post_row.id, metric.key, day_value, (metric.value #>> '{}')::NUMERIC, day_end, 'timeline')
      ON CONFLICT (post_id, metric_key, observed_on) DO UPDATE SET
        value = EXCLUDED.value, observed_at = EXCLUDED.observed_at, source = EXCLUDED.source
      WHERE EXCLUDED.observed_at >= public.sistema_social_post_metric_snapshots.observed_at;
      written := written + 1;
    END LOOP;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('written', written, 'post_id', post_row.id));
END
$social_ingest_post_timeline$;

-- Seguidores diarios (u otra métrica puntual de cuenta).
CREATE OR REPLACE FUNCTION public.social_ingest_account_daily(p_items JSONB, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_ingest_account_daily$
DECLARE
  item JSONB;
  account_row public.sistema_zernio_accounts%ROWTYPE;
  written INTEGER := 0;
  skipped INTEGER := 0;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB)) LOOP
    SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE zernio_account_id = item ->> 'zernio_account_id';
    IF NOT FOUND OR account_row.client_id IS NULL OR jsonb_typeof(item -> 'value') <> 'number' THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.sistema_social_account_daily(account_id, client_id, metric_key, day, value, source, observed_at)
    VALUES (account_row.id, account_row.client_id, item ->> 'metric_key', (item ->> 'day')::DATE,
      (item ->> 'value')::NUMERIC, p_source, now())
    ON CONFLICT (account_id, metric_key, day) DO UPDATE SET
      value = EXCLUDED.value, source = EXCLUDED.source, observed_at = EXCLUDED.observed_at;
    written := written + 1;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('written', written, 'skipped', skipped));
END
$social_ingest_account_daily$;

CREATE OR REPLACE FUNCTION public.social_ingest_account_period_metrics(p_items JSONB, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_ingest_account_period_metrics$
DECLARE
  item JSONB;
  account_row public.sistema_zernio_accounts%ROWTYPE;
  written INTEGER := 0;
  skipped INTEGER := 0;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB)) LOOP
    SELECT * INTO account_row FROM public.sistema_zernio_accounts WHERE zernio_account_id = item ->> 'zernio_account_id';
    IF NOT FOUND OR account_row.client_id IS NULL THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.sistema_social_account_period_metrics(
      account_id, client_id, metric_key, period_start, period_end, breakdown_key, value, unavailable_reason, source, observed_at
    ) VALUES (
      account_row.id, account_row.client_id, item ->> 'metric_key', (item ->> 'period_start')::DATE,
      (item ->> 'period_end')::DATE, COALESCE(item ->> 'breakdown_key', ''),
      CASE WHEN jsonb_typeof(item -> 'value') = 'number' THEN (item ->> 'value')::NUMERIC END,
      CASE WHEN jsonb_typeof(item -> 'value') = 'number' THEN NULL ELSE COALESCE(item ->> 'unavailable_reason', 'no_data') END,
      p_source, now()
    )
    ON CONFLICT (account_id, metric_key, period_start, period_end, breakdown_key) DO UPDATE SET
      value = EXCLUDED.value, unavailable_reason = EXCLUDED.unavailable_reason, observed_at = EXCLUDED.observed_at;
    written := written + 1;
  END LOOP;
  RETURN private.social_ok(jsonb_build_object('written', written, 'skipped', skipped));
END
$social_ingest_account_period_metrics$;

-- Atribución manual de un post externo a un proyecto del mismo cliente.
CREATE OR REPLACE FUNCTION public.social_admin_attribute_post(p_actor UUID, p_post_id UUID, p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_attribute_post$
DECLARE
  post_client UUID;
  project_client UUID;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT client_id INTO post_client FROM public.sistema_social_posts WHERE id = p_post_id;
  SELECT client_id INTO project_client FROM public.sistema_projects WHERE id = p_project_id;
  IF post_client IS NULL OR project_client IS NULL THEN
    RETURN private.social_error('not_found', 'Publicación o proyecto inexistente');
  END IF;
  IF post_client <> project_client THEN
    RETURN private.social_error('scope_mismatch', 'El proyecto pertenece a otro cliente');
  END IF;
  DELETE FROM public.sistema_social_post_projects WHERE post_id = p_post_id AND is_primary AND attribution_source = 'manual';
  IF EXISTS (SELECT 1 FROM public.sistema_social_post_projects WHERE post_id = p_post_id AND is_primary) THEN
    RETURN private.social_error('already_attributed', 'La publicación ya hereda proyecto desde su tarea');
  END IF;
  INSERT INTO public.sistema_social_post_projects(client_id, post_id, project_id, is_primary, attribution_source, assigned_by)
  VALUES (post_client, p_post_id, p_project_id, true, 'manual', p_actor);
  PERFORM private.social_audit(p_actor, 'admin', post_client, 'post', p_post_id::TEXT, 'post.attributed',
    jsonb_build_object('project_id', p_project_id));
  RETURN private.social_ok(jsonb_build_object('post_id', p_post_id, 'project_id', p_project_id));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_attribute_post$;

-- Publicaciones sin timeline suficiente (para backfill acotado).
CREATE OR REPLACE FUNCTION public.social_posts_needing_timeline(p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_posts_needing_timeline$
  SELECT private.social_ok(COALESCE(jsonb_agg(candidate.zernio_external_post_id), '[]'::JSONB))
  FROM (
    SELECT post.zernio_external_post_id
    FROM public.sistema_social_posts AS post
    WHERE post.zernio_external_post_id IS NOT NULL
      AND post.published_at IS NOT NULL
      AND post.published_at > now() - interval '120 days'
      AND NOT post.is_deleted
      AND NOT EXISTS (
        SELECT 1 FROM public.sistema_social_post_metric_snapshots AS snapshot
        WHERE snapshot.post_id = post.id AND snapshot.source = 'timeline'
          AND snapshot.observed_on >= LEAST((now() AT TIME ZONE 'UTC')::DATE - 2, (post.published_at AT TIME ZONE 'UTC')::DATE + 30)
      )
    ORDER BY post.published_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  ) AS candidate;
$social_posts_needing_timeline$;

DO $rpc_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.social_ingest_posts(jsonb,text,timestamptz)',
    'public.social_apply_delta_page(jsonb,text,text,text)',
    'public.social_ingest_post_timeline(text,jsonb)',
    'public.social_ingest_account_daily(jsonb,text)',
    'public.social_ingest_account_period_metrics(jsonb,text)',
    'public.social_admin_attribute_post(uuid,uuid,uuid)',
    'public.social_posts_needing_timeline(integer)'
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

REVOKE EXECUTE ON FUNCTION private.social_metric_status(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.social_format_for(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.social_record_metric(UUID, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
