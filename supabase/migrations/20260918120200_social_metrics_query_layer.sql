-- Gestión social: capa semántica común de métricas.
--
-- Una sola implementación determinista para la UI, el análisis con IA dentro
-- de Quepia y las herramientas MCP. Ningún consumidor escribe SQL: elige una
-- operación permitida y parámetros validados. Cada respuesta incluye evidencia
-- (consulta normalizada, versiones de definiciones, período, zona horaria,
-- frescura y cobertura) para que toda cifra sea rastreable.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.sistema_social_posts') IS NULL THEN
    RAISE EXCEPTION 'Aplicar primero 20260918120100_social_analytics_storage.sql';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Validación de parámetros y resolución de alcance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.social_uuid_array(p_value JSONB, p_name TEXT)
RETURNS UUID[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $social_uuid_array$
DECLARE
  result UUID[] := '{}';
  item JSONB;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN '{}';
  END IF;
  IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 200 THEN
    PERFORM private.social_raise('invalid_' || p_name, p_name || ' debe ser un arreglo de hasta 200 UUID');
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
    IF jsonb_typeof(item) <> 'string'
      OR (item #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      PERFORM private.social_raise('invalid_' || p_name, p_name || ' contiene un identificador inválido');
    END IF;
    result := array_append(result, (item #>> '{}')::UUID);
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT unnest(result));
END
$social_uuid_array$;

CREATE OR REPLACE FUNCTION private.social_text_array(p_value JSONB, p_name TEXT, p_pattern TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $social_text_array$
DECLARE
  result TEXT[] := '{}';
  item JSONB;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN '{}';
  END IF;
  IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 50 THEN
    PERFORM private.social_raise('invalid_' || p_name, p_name || ' debe ser un arreglo');
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
    IF jsonb_typeof(item) <> 'string' OR (item #>> '{}') !~ p_pattern THEN
      PERFORM private.social_raise('invalid_' || p_name, p_name || ' contiene un valor inválido');
    END IF;
    result := array_append(result, item #>> '{}');
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT unnest(result));
END
$social_text_array$;

-- Devuelve el alcance normalizado. Rechaza IDs inexistentes o que no
-- pertenezcan a los clientes indicados (un filtro manipulado no amplía ni
-- cruza el alcance). Deduplica cuentas compartidas entre proyectos.
CREATE OR REPLACE FUNCTION private.social_resolve_scope(p_params JSONB, p_require_period BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_resolve_scope$
DECLARE
  params JSONB := COALESCE(p_params, '{}'::JSONB);
  client_ids UUID[];
  project_ids UUID[];
  account_ids UUID[];
  platforms TEXT[];
  formats TEXT[];
  origins TEXT[];
  tz TEXT := COALESCE(NULLIF(params ->> 'timezone', ''), 'America/Argentina/Cordoba');
  project_mode TEXT := COALESCE(NULLIF(params ->> 'project_mode', ''), 'attributed');
  from_date DATE;
  to_date DATE;
  today_local DATE;
  resolved_accounts UUID[];
  resolved_clients UUID[];
  invalid_count INTEGER;
  key TEXT;
BEGIN
  IF jsonb_typeof(params) <> 'object' THEN
    PERFORM private.social_raise('invalid_request', 'Los parámetros deben ser un objeto');
  END IF;
  FOR key IN SELECT jsonb_object_keys(params) LOOP
    IF NOT key = ANY(ARRAY['client_ids', 'project_ids', 'account_ids', 'platforms', 'formats', 'origins',
      'from', 'to', 'timezone', 'project_mode', 'metric', 'age_days', 'limit', 'order', 'granularity',
      'attribution', 'compare_from', 'compare_to', 'post_id', 'include_series']) THEN
      PERFORM private.social_raise('unknown_parameter', 'Parámetro no permitido: ' || key);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = tz) THEN
    PERFORM private.social_raise('invalid_timezone', 'Zona horaria desconocida');
  END IF;
  IF project_mode NOT IN ('attributed', 'accounts') THEN
    PERFORM private.social_raise('invalid_project_mode', 'project_mode debe ser attributed o accounts');
  END IF;

  client_ids := private.social_uuid_array(params -> 'client_ids', 'client_ids');
  project_ids := private.social_uuid_array(params -> 'project_ids', 'project_ids');
  account_ids := private.social_uuid_array(params -> 'account_ids', 'account_ids');
  platforms := private.social_text_array(params -> 'platforms', 'platforms', '^[a-z]{2,20}$');
  formats := private.social_text_array(params -> 'formats', 'formats', '^(reel|image|carousel|video|story|text|unknown)$');
  origins := private.social_text_array(params -> 'origins', 'origins', '^(quepia|zernio_api|external)$');

  SELECT count(*) INTO invalid_count FROM unnest(client_ids) AS requested(id)
  WHERE NOT EXISTS (SELECT 1 FROM public.clients WHERE clients.id = requested.id);
  IF invalid_count > 0 THEN
    PERFORM private.social_raise('scope_not_found', 'Uno de los clientes no existe');
  END IF;

  SELECT count(*) INTO invalid_count FROM unnest(project_ids) AS requested(id)
  LEFT JOIN public.sistema_projects AS project ON project.id = requested.id
  WHERE project.id IS NULL OR project.client_id IS NULL
    OR (cardinality(client_ids) > 0 AND NOT project.client_id = ANY(client_ids));
  IF invalid_count > 0 THEN
    PERFORM private.social_raise('scope_mismatch', 'Un proyecto no existe, no tiene cliente o pertenece a otro cliente');
  END IF;

  SELECT count(*) INTO invalid_count FROM unnest(account_ids) AS requested(id)
  LEFT JOIN public.sistema_zernio_accounts AS account ON account.id = requested.id
  WHERE account.id IS NULL OR account.client_id IS NULL
    OR (cardinality(client_ids) > 0 AND NOT account.client_id = ANY(client_ids))
    OR (cardinality(project_ids) > 0 AND NOT EXISTS (
      SELECT 1 FROM public.sistema_projects AS project
      WHERE project.id = ANY(project_ids) AND project.client_id = account.client_id
    ));
  IF invalid_count > 0 THEN
    PERFORM private.social_raise('scope_mismatch', 'Una cuenta no existe, no tiene cliente o no corresponde al alcance');
  END IF;

  today_local := (now() AT TIME ZONE tz)::DATE;
  IF params ? 'to' AND jsonb_typeof(params -> 'to') = 'string' THEN
    to_date := (params ->> 'to')::DATE;
  ELSE
    to_date := today_local;
  END IF;
  IF params ? 'from' AND jsonb_typeof(params -> 'from') = 'string' THEN
    from_date := (params ->> 'from')::DATE;
  ELSE
    from_date := to_date - 29;
  END IF;
  IF p_require_period AND (from_date > to_date OR to_date - from_date > 400) THEN
    PERFORM private.social_raise('invalid_period', 'El período debe ser válido y de hasta 400 días');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT account.id), '{}'), COALESCE(array_agg(DISTINCT account.client_id), '{}')
  INTO resolved_accounts, resolved_clients
  FROM public.sistema_zernio_accounts AS account
  WHERE account.client_id IS NOT NULL
    AND (cardinality(client_ids) = 0 OR account.client_id = ANY(client_ids))
    AND (cardinality(account_ids) = 0 OR account.id = ANY(account_ids))
    AND (cardinality(platforms) = 0 OR account.platform = ANY(platforms))
    AND (cardinality(project_ids) = 0 OR EXISTS (
      SELECT 1 FROM public.sistema_projects AS project
      WHERE project.id = ANY(project_ids) AND project.client_id = account.client_id
    ))
    AND (
      cardinality(project_ids) = 0 OR project_mode = 'attributed' OR EXISTS (
        SELECT 1 FROM public.sistema_social_project_accounts AS link
        WHERE link.account_id = account.id AND link.project_id = ANY(project_ids)
          AND link.valid_from < ((to_date + 1)::TIMESTAMP AT TIME ZONE tz)
          AND (link.valid_to IS NULL OR link.valid_to > (from_date::TIMESTAMP AT TIME ZONE tz))
      )
    );

  RETURN jsonb_build_object(
    'client_ids', to_jsonb(client_ids),
    'project_ids', to_jsonb(project_ids),
    'account_ids', to_jsonb(account_ids),
    'platforms', to_jsonb(platforms),
    'formats', to_jsonb(formats),
    'origins', to_jsonb(origins),
    'project_mode', project_mode,
    'timezone', tz,
    'from', from_date,
    'to', to_date,
    'start_ts', (from_date::TIMESTAMP AT TIME ZONE tz),
    'end_ts', ((to_date + 1)::TIMESTAMP AT TIME ZONE tz),
    'period_days', to_date - from_date + 1,
    'period_incomplete', to_date >= today_local,
    'resolved_account_ids', to_jsonb(resolved_accounts),
    'resolved_client_ids', to_jsonb(resolved_clients)
  );
END
$social_resolve_scope$;

CREATE OR REPLACE FUNCTION private.social_scope_uuids(p_scope JSONB, p_key TEXT)
RETURNS UUID[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_scope_uuids$
  SELECT COALESCE(ARRAY(SELECT (value #>> '{}')::UUID FROM jsonb_array_elements(p_scope -> p_key)), '{}');
$social_scope_uuids$;

CREATE OR REPLACE FUNCTION private.social_scope_texts(p_scope JSONB, p_key TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_scope_texts$
  SELECT COALESCE(ARRAY(SELECT value #>> '{}' FROM jsonb_array_elements(p_scope -> p_key)), '{}');
$social_scope_texts$;

-- Publicaciones del alcance. p_published_in_period=false incluye también
-- publicaciones anteriores (para atribución "received").
CREATE OR REPLACE FUNCTION private.social_scope_posts(p_scope JSONB, p_published_in_period BOOLEAN DEFAULT true)
RETURNS SETOF public.sistema_social_posts
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_scope_posts$
  SELECT post.*
  FROM public.sistema_social_posts AS post
  WHERE post.account_id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
    AND NOT post.is_deleted
    AND post.published_at IS NOT NULL
    AND post.published_at < (p_scope ->> 'end_ts')::TIMESTAMPTZ
    AND (NOT p_published_in_period OR post.published_at >= (p_scope ->> 'start_ts')::TIMESTAMPTZ)
    AND (cardinality(private.social_scope_texts(p_scope, 'formats')) = 0
      OR post.format = ANY(private.social_scope_texts(p_scope, 'formats')))
    AND (cardinality(private.social_scope_texts(p_scope, 'origins')) = 0
      OR post.origin = ANY(private.social_scope_texts(p_scope, 'origins')))
    AND (
      cardinality(private.social_scope_uuids(p_scope, 'project_ids')) = 0
      OR p_scope ->> 'project_mode' = 'accounts'
      OR EXISTS (
        SELECT 1 FROM public.sistema_social_post_projects AS attribution
        WHERE attribution.post_id = post.id
          AND attribution.project_id = ANY(private.social_scope_uuids(p_scope, 'project_ids'))
      )
    );
$social_scope_posts$;

CREATE OR REPLACE FUNCTION private.social_period_value(p_value NUMERIC, p_base NUMERIC)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $social_period_value$
  SELECT jsonb_build_object(
    'current', p_value,
    'previous', p_base,
    'absolute_change', CASE WHEN p_value IS NOT NULL AND p_base IS NOT NULL THEN p_value - p_base END,
    'percent_change', CASE WHEN p_value IS NOT NULL AND p_base IS NOT NULL AND p_base <> 0
      THEN round((p_value - p_base) / abs(p_base) * 100, 2) END,
    'percent_change_unavailable_reason', CASE
      WHEN p_value IS NULL OR p_base IS NULL THEN 'dato_faltante'
      WHEN p_base = 0 THEN 'denominador_cero'
    END
  );
$social_period_value$;

-- Valor acumulado de una métrica a una edad dada (días desde publicación).
-- Exige un snapshot dentro de ±1 día del objetivo; si no, devuelve NULL.
CREATE OR REPLACE FUNCTION private.social_value_at_age(
  p_post_id UUID,
  p_metric TEXT,
  p_published_at TIMESTAMPTZ,
  p_age_days INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_value_at_age$
  SELECT snapshot.value
  FROM public.sistema_social_post_metric_snapshots AS snapshot
  WHERE snapshot.post_id = p_post_id
    AND snapshot.metric_key = p_metric
    AND snapshot.observed_on BETWEEN (p_published_at AT TIME ZONE 'UTC')::DATE + p_age_days - 1
      AND (p_published_at AT TIME ZONE 'UTC')::DATE + p_age_days + 1
  ORDER BY abs(snapshot.observed_on - ((p_published_at AT TIME ZONE 'UTC')::DATE + p_age_days)), snapshot.observed_on DESC
  LIMIT 1;
$social_value_at_age$;

-- ---------------------------------------------------------------------------
-- 2. Operaciones de consulta
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.social_q_scopes()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_q_scopes$
  SELECT jsonb_build_object(
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', client.id, 'name', client.name, 'is_active', client.is_active) ORDER BY client.name)
      FROM public.clients AS client
      WHERE EXISTS (SELECT 1 FROM public.sistema_projects WHERE client_id = client.id)
        OR EXISTS (SELECT 1 FROM public.sistema_zernio_profiles WHERE client_id = client.id)
        OR client.social_created_by IS NOT NULL
    ), '[]'::JSONB),
    'projects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', project.id, 'name', project.nombre, 'client_id', project.client_id) ORDER BY project.nombre)
      FROM public.sistema_projects AS project WHERE project.client_id IS NOT NULL
    ), '[]'::JSONB),
    'accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', account.id, 'client_id', account.client_id, 'platform', account.platform,
        'username', account.username, 'display_name', account.display_name,
        'health_status', account.health_status, 'is_active', account.is_active,
        'project_ids', COALESCE((
          SELECT jsonb_agg(DISTINCT link.project_id) FROM public.sistema_social_project_accounts AS link
          WHERE link.account_id = account.id AND link.valid_to IS NULL
        ), '[]'::JSONB)
      ) ORDER BY account.platform, account.username)
      FROM public.sistema_zernio_accounts AS account WHERE account.client_id IS NOT NULL
    ), '[]'::JSONB),
    'unassigned', jsonb_build_object(
      'profiles', (SELECT count(*) FROM public.sistema_zernio_profiles WHERE client_id IS NULL AND provider_removed_at IS NULL),
      'accounts', (SELECT count(*) FROM public.sistema_zernio_accounts WHERE client_id IS NULL AND provider_removed_at IS NULL),
      'projects', (SELECT count(*) FROM public.sistema_projects WHERE client_id IS NULL)
    )
  );
$social_q_scopes$;

CREATE OR REPLACE FUNCTION private.social_q_definitions()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_q_definitions$
  SELECT jsonb_build_object(
    'definitions', COALESCE((
      SELECT jsonb_agg(to_jsonb(definition) - 'created_at' - 'is_current' ORDER BY definition.scope, definition.metric_key)
      FROM public.sistema_social_metric_definitions AS definition WHERE definition.is_current
    ), '[]'::JSONB),
    'support', COALESCE((
      SELECT jsonb_agg(to_jsonb(support) ORDER BY support.platform, support.metric_key, support.media_product_type)
      FROM public.sistema_social_metric_support AS support
    ), '[]'::JSONB),
    'rules', jsonb_build_array(
      'Los valores de publicación son acumulados absolutos: nunca se suman snapshots entre fechas.',
      'La suma de alcances no equivale a personas únicas.',
      'La suma de seguidores de varias cuentas es acumulada, no audiencia deduplicada.',
      'Ausencia no equivale a cero: una métrica no soportada o sin validar se informa con su estado.',
      'Las tasas se calculan ponderadas (suma de numeradores / suma de denominadores); nunca se promedian porcentajes.',
      'Si el denominador es cero, el porcentaje no está disponible y se informa la variación absoluta.',
      'Los insights de cuenta no se mezclan con sumas de publicaciones.'
    )
  );
$social_q_definitions$;

-- Métricas de contenido para un conjunto de publicaciones (por cuenta y total).
CREATE OR REPLACE FUNCTION private.social_content_block(p_scope JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_content_block$
DECLARE
  per_account JSONB;
  totals JSONB;
  platform_count INTEGER;
BEGIN
  WITH posts AS (
    SELECT * FROM private.social_scope_posts(p_scope, true)
  ), core(metric_key) AS (
    VALUES ('views'), ('reach'), ('likes'), ('comments'), ('shares'), ('saves')
  ), cells AS (
    SELECT post.account_id, post.id AS post_id, core.metric_key,
      private.social_metric_status(post.platform, core.metric_key, post.media_product_type) AS support_status,
      latest.value
    FROM posts AS post
    CROSS JOIN core
    LEFT JOIN public.sistema_social_post_metrics_latest AS latest
      ON latest.post_id = post.id AND latest.metric_key = core.metric_key
  ), per_metric AS (
    SELECT account_id, metric_key,
      count(*) AS posts_total,
      count(*) FILTER (WHERE support_status = 'supported') AS posts_supported,
      count(*) FILTER (WHERE support_status = 'supported' AND value IS NOT NULL) AS posts_with_value,
      count(*) FILTER (WHERE support_status IN ('unverified')) AS posts_unverified,
      sum(value) FILTER (WHERE support_status = 'supported') AS total
    FROM cells GROUP BY account_id, metric_key
  ), engagement AS (
    SELECT post.account_id,
      count(*) AS eligible_posts,
      sum(likes.value + comments.value + shares.value + saves.value) AS interactions,
      sum(reach.value) AS reach
    FROM posts AS post
    JOIN public.sistema_social_post_metrics_latest AS likes ON likes.post_id = post.id AND likes.metric_key = 'likes'
    JOIN public.sistema_social_post_metrics_latest AS comments ON comments.post_id = post.id AND comments.metric_key = 'comments'
    JOIN public.sistema_social_post_metrics_latest AS shares ON shares.post_id = post.id AND shares.metric_key = 'shares'
    JOIN public.sistema_social_post_metrics_latest AS saves ON saves.post_id = post.id AND saves.metric_key = 'saves'
    JOIN public.sistema_social_post_metrics_latest AS reach ON reach.post_id = post.id AND reach.metric_key = 'reach'
    WHERE private.social_metric_status(post.platform, 'likes', post.media_product_type) = 'supported'
      AND private.social_metric_status(post.platform, 'comments', post.media_product_type) = 'supported'
      AND private.social_metric_status(post.platform, 'shares', post.media_product_type) = 'supported'
      AND private.social_metric_status(post.platform, 'saves', post.media_product_type) = 'supported'
      AND private.social_metric_status(post.platform, 'reach', post.media_product_type) = 'supported'
    GROUP BY post.account_id
  ), post_counts AS (
    SELECT account_id, count(*) AS posts, max(metrics_observed_at) AS data_as_of,
      count(*) FILTER (WHERE provider_sync_status IN ('pending', 'partial')) AS posts_pending
    FROM posts GROUP BY account_id
  ), accounts AS (
    SELECT account.id, account.client_id, account.platform, account.username
    FROM public.sistema_zernio_accounts AS account
    WHERE account.id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'account_id', accounts.id,
    'client_id', accounts.client_id,
    'platform', accounts.platform,
    'username', accounts.username,
    'posts_published', COALESCE(post_counts.posts, 0),
    'posts_pending_provider_sync', COALESCE(post_counts.posts_pending, 0),
    'data_as_of', post_counts.data_as_of,
    'metrics', COALESCE((
      SELECT jsonb_object_agg(per_metric.metric_key, jsonb_build_object(
        'value', per_metric.total,
        'status', CASE
          WHEN per_metric.posts_supported = 0 AND per_metric.posts_unverified > 0 THEN 'unverified'
          WHEN per_metric.posts_supported = 0 THEN 'not_supported'
          WHEN per_metric.posts_with_value = 0 THEN 'no_data'
          WHEN per_metric.posts_with_value < per_metric.posts_total THEN 'partial'
          ELSE 'valid'
        END,
        'posts_with_value', per_metric.posts_with_value,
        'posts_total', per_metric.posts_total
      ))
      FROM per_metric WHERE per_metric.account_id = accounts.id
    ), '{}'::JSONB),
    'engagement_rate_reach', jsonb_build_object(
      'value', CASE WHEN COALESCE(engagement.reach, 0) > 0 THEN round(engagement.interactions / engagement.reach, 6) END,
      'numerator_interactions', engagement.interactions,
      'denominator_reach', engagement.reach,
      'eligible_posts', COALESCE(engagement.eligible_posts, 0),
      'excluded_posts', COALESCE(post_counts.posts, 0) - COALESCE(engagement.eligible_posts, 0),
      'unavailable_reason', CASE
        WHEN COALESCE(post_counts.posts, 0) = 0 THEN 'sin_publicaciones'
        WHEN COALESCE(engagement.reach, 0) = 0 THEN 'denominador_cero_o_sin_datos'
      END
    )
  ) ORDER BY accounts.platform, accounts.username), '[]'::JSONB)
  INTO per_account
  FROM accounts
  LEFT JOIN post_counts ON post_counts.account_id = accounts.id
  LEFT JOIN engagement ON engagement.account_id = accounts.id;

  SELECT count(DISTINCT platform) INTO platform_count FROM public.sistema_zernio_accounts
  WHERE id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'));

  WITH account_rows AS (
    SELECT value AS row FROM jsonb_array_elements(per_account)
  ), metric_totals AS (
    SELECT metric.key AS metric_key,
      sum((metric.value ->> 'value')::NUMERIC) FILTER (WHERE metric.value ->> 'status' IN ('valid', 'partial')) AS total,
      count(*) FILTER (WHERE metric.value ->> 'status' IN ('valid', 'partial')) AS accounts_with_data,
      count(*) FILTER (WHERE metric.value ->> 'status' = 'partial') AS accounts_partial,
      count(*) FILTER (WHERE metric.value ->> 'status' IN ('not_supported', 'unverified')) AS accounts_without_support
    FROM account_rows, jsonb_each(account_rows.row -> 'metrics') AS metric
    GROUP BY metric.key
  )
  SELECT jsonb_build_object(
    'posts_published', COALESCE((SELECT sum((row ->> 'posts_published')::INTEGER) FROM account_rows), 0),
    'metrics', COALESCE((SELECT jsonb_object_agg(metric_key, jsonb_build_object(
      'value', total,
      'status', CASE WHEN accounts_with_data = 0 THEN 'no_data' WHEN accounts_partial > 0 OR accounts_without_support > 0 THEN 'partial' ELSE 'valid' END,
      'accounts_with_data', accounts_with_data,
      'accounts_without_support', accounts_without_support,
      'label_note', CASE WHEN metric_key = 'reach' THEN 'Suma de alcances por publicación; no son personas únicas.' END
    )) FROM metric_totals), '{}'::JSONB),
    'engagement_rate_reach', (
      SELECT jsonb_build_object(
        'value', CASE WHEN sum((row -> 'engagement_rate_reach' ->> 'denominator_reach')::NUMERIC) > 0
          THEN round(sum((row -> 'engagement_rate_reach' ->> 'numerator_interactions')::NUMERIC)
            / sum((row -> 'engagement_rate_reach' ->> 'denominator_reach')::NUMERIC), 6) END,
        'numerator_interactions', sum((row -> 'engagement_rate_reach' ->> 'numerator_interactions')::NUMERIC),
        'denominator_reach', sum((row -> 'engagement_rate_reach' ->> 'denominator_reach')::NUMERIC),
        'eligible_posts', sum((row -> 'engagement_rate_reach' ->> 'eligible_posts')::INTEGER),
        'excluded_posts', sum((row -> 'engagement_rate_reach' ->> 'excluded_posts')::INTEGER),
        'formula', 'sum(likes+comments+shares+saves) / sum(reach) sobre publicaciones con los cinco componentes soportados'
      ) FROM account_rows
    ),
    'warnings', to_jsonb(ARRAY_REMOVE(ARRAY[
      CASE WHEN platform_count > 1 THEN 'El alcance mezcla redes con definiciones distintas de views/reach; los totales son orientativos.' END
    ], NULL))
  ) INTO totals;

  RETURN jsonb_build_object('per_account', per_account, 'totals', totals);
END
$social_content_block$;

-- Seguidores: inicio (último día previo al período) y fin (último día del período).
CREATE OR REPLACE FUNCTION private.social_followers_block(p_scope JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_followers_block$
  WITH accounts AS (
    SELECT account.id, account.platform, account.username
    FROM public.sistema_zernio_accounts AS account
    WHERE account.id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
  ), bounds AS (
    SELECT accounts.id, accounts.platform, accounts.username,
      (SELECT jsonb_build_object('day', daily.day, 'value', daily.value) FROM public.sistema_social_account_daily AS daily
       WHERE daily.account_id = accounts.id AND daily.metric_key = 'followers' AND daily.day < (p_scope ->> 'from')::DATE
       ORDER BY daily.day DESC LIMIT 1) AS before_start,
      (SELECT jsonb_build_object('day', daily.day, 'value', daily.value) FROM public.sistema_social_account_daily AS daily
       WHERE daily.account_id = accounts.id AND daily.metric_key = 'followers'
         AND daily.day BETWEEN (p_scope ->> 'from')::DATE AND (p_scope ->> 'to')::DATE
       ORDER BY daily.day ASC LIMIT 1) AS first_in_period,
      (SELECT jsonb_build_object('day', daily.day, 'value', daily.value) FROM public.sistema_social_account_daily AS daily
       WHERE daily.account_id = accounts.id AND daily.metric_key = 'followers' AND daily.day <= (p_scope ->> 'to')::DATE
       ORDER BY daily.day DESC LIMIT 1) AS at_end,
      (SELECT count(*) FROM public.sistema_social_account_daily AS daily
       WHERE daily.account_id = accounts.id AND daily.metric_key = 'followers'
         AND daily.day BETWEEN (p_scope ->> 'from')::DATE AND (p_scope ->> 'to')::DATE) AS days_covered
    FROM accounts
  ), rows AS (
    SELECT bounds.*, COALESCE(before_start, first_in_period) AS start_point
    FROM bounds
  )
  SELECT jsonb_build_object(
    'per_account', COALESCE(jsonb_agg(jsonb_build_object(
      'account_id', rows.id,
      'platform', rows.platform,
      'username', rows.username,
      'start', rows.start_point,
      'end', rows.at_end,
      'start_is_inside_period', rows.before_start IS NULL AND rows.first_in_period IS NOT NULL,
      'change', CASE WHEN rows.start_point IS NOT NULL AND rows.at_end IS NOT NULL
        THEN (rows.at_end ->> 'value')::NUMERIC - (rows.start_point ->> 'value')::NUMERIC END,
      'percent_change', CASE WHEN rows.start_point IS NOT NULL AND rows.at_end IS NOT NULL AND (rows.start_point ->> 'value')::NUMERIC > 0
        THEN round(((rows.at_end ->> 'value')::NUMERIC - (rows.start_point ->> 'value')::NUMERIC) / (rows.start_point ->> 'value')::NUMERIC * 100, 2) END,
      'days_covered', rows.days_covered,
      'days_in_period', (p_scope ->> 'period_days')::INTEGER,
      'status', CASE WHEN rows.at_end IS NULL THEN 'no_data'
        WHEN rows.days_covered < (p_scope ->> 'period_days')::INTEGER THEN 'partial' ELSE 'valid' END
    ) ORDER BY rows.platform, rows.username), '[]'::JSONB),
    'totals', jsonb_build_object(
      'accumulated_followers_end', sum((rows.at_end ->> 'value')::NUMERIC),
      'accumulated_change', sum(CASE WHEN rows.start_point IS NOT NULL AND rows.at_end IS NOT NULL
        THEN (rows.at_end ->> 'value')::NUMERIC - (rows.start_point ->> 'value')::NUMERIC END),
      'accounts_with_data', count(*) FILTER (WHERE rows.at_end IS NOT NULL),
      'accounts_total', count(*),
      'note', 'Seguidores acumulados de las cuentas del alcance; no es audiencia deduplicada. El crecimiento de cuenta no se atribuye a campañas ni proyectos.'
    )
  )
  FROM rows;
$social_followers_block$;

CREATE OR REPLACE FUNCTION private.social_account_insights_block(p_scope JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_account_insights_block$
  SELECT jsonb_build_object(
    'rows', COALESCE(jsonb_agg(jsonb_build_object(
      'account_id', metric.account_id, 'metric', metric.metric_key, 'value', metric.value,
      'unavailable_reason', metric.unavailable_reason, 'period_start', metric.period_start,
      'period_end', metric.period_end, 'observed_at', metric.observed_at
    ) ORDER BY metric.account_id, metric.metric_key), '[]'::JSONB),
    'note', 'Insights de cuenta (Instagram) de la ventana almacenada más amplia contenida en el período (ver period_start/period_end); no se suman con métricas de publicaciones. Pueden demorar hasta 48 h.'
  )
  FROM public.sistema_social_account_period_metrics AS metric
  WHERE metric.account_id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
    AND metric.period_start >= (p_scope ->> 'from')::DATE
    AND metric.period_end <= (p_scope ->> 'to')::DATE
    AND metric.breakdown_key = ''
    -- Solo la ventana más amplia y reciente de cada métrica dentro del período.
    AND NOT EXISTS (
      SELECT 1 FROM public.sistema_social_account_period_metrics AS wider
      WHERE wider.account_id = metric.account_id AND wider.metric_key = metric.metric_key AND wider.breakdown_key = ''
        AND wider.period_start >= (p_scope ->> 'from')::DATE AND wider.period_end <= (p_scope ->> 'to')::DATE
        AND (wider.period_end - wider.period_start, wider.period_end) > (metric.period_end - metric.period_start, metric.period_end)
    );
$social_account_insights_block$;

CREATE OR REPLACE FUNCTION private.social_q_overview(p_scope JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_q_overview$
  SELECT jsonb_build_object(
    'content', private.social_content_block(p_scope),
    'followers', private.social_followers_block(p_scope),
    'account_insights', private.social_account_insights_block(p_scope)
  );
$social_q_overview$;

-- Comparación determinista de períodos, con descomposición volumen/tasa de
-- las interacciones: ΔI = (P₁−P₀)·r₀ + P₁·(r₁−r₀), r = interacciones/post.
CREATE OR REPLACE FUNCTION private.social_q_compare_periods(p_scope JSONB, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_q_compare_periods$
DECLARE
  base_scope JSONB;
  base_from DATE;
  base_to DATE;
  current_block JSONB;
  base_block JSONB;
  current_followers JSONB;
  base_followers JSONB;
  comparison JSONB := '{}'::JSONB;
  metric_key TEXT;
  p1 NUMERIC; p0 NUMERIC; i1 NUMERIC; i0 NUMERIC; r1 NUMERIC; r0 NUMERIC;
BEGIN
  IF p_params ? 'compare_from' AND p_params ? 'compare_to' THEN
    base_from := (p_params ->> 'compare_from')::DATE;
    base_to := (p_params ->> 'compare_to')::DATE;
  ELSE
    base_to := (p_scope ->> 'from')::DATE - 1;
    base_from := base_to - ((p_scope ->> 'period_days')::INTEGER - 1);
  END IF;
  IF base_from > base_to OR base_to - base_from > 400 THEN
    PERFORM private.social_raise('invalid_period', 'Período de comparación inválido');
  END IF;
  base_scope := p_scope || jsonb_build_object(
    'from', base_from, 'to', base_to,
    'start_ts', (base_from::TIMESTAMP AT TIME ZONE (p_scope ->> 'timezone')),
    'end_ts', ((base_to + 1)::TIMESTAMP AT TIME ZONE (p_scope ->> 'timezone')),
    'period_days', base_to - base_from + 1,
    'period_incomplete', false
  );

  current_block := private.social_content_block(p_scope);
  base_block := private.social_content_block(base_scope);
  current_followers := private.social_followers_block(p_scope);
  base_followers := private.social_followers_block(base_scope);

  comparison := comparison || jsonb_build_object('posts_published', private.social_period_value(
    (current_block -> 'totals' ->> 'posts_published')::NUMERIC, (base_block -> 'totals' ->> 'posts_published')::NUMERIC));
  FOREACH metric_key IN ARRAY ARRAY['views', 'reach', 'likes', 'comments', 'shares', 'saves'] LOOP
    comparison := comparison || jsonb_build_object(metric_key, private.social_period_value(
      (current_block -> 'totals' -> 'metrics' -> metric_key ->> 'value')::NUMERIC,
      (base_block -> 'totals' -> 'metrics' -> metric_key ->> 'value')::NUMERIC
    ) || jsonb_build_object(
      'current_status', current_block -> 'totals' -> 'metrics' -> metric_key ->> 'status',
      'previous_status', base_block -> 'totals' -> 'metrics' -> metric_key ->> 'status'
    ));
  END LOOP;
  comparison := comparison || jsonb_build_object('engagement_rate_reach', private.social_period_value(
    (current_block -> 'totals' -> 'engagement_rate_reach' ->> 'value')::NUMERIC,
    (base_block -> 'totals' -> 'engagement_rate_reach' ->> 'value')::NUMERIC));
  comparison := comparison || jsonb_build_object('followers_change', private.social_period_value(
    (current_followers -> 'totals' ->> 'accumulated_change')::NUMERIC,
    (base_followers -> 'totals' ->> 'accumulated_change')::NUMERIC));

  -- Descomposición de interacciones (solo publicaciones elegibles).
  p1 := (current_block -> 'totals' -> 'engagement_rate_reach' ->> 'eligible_posts')::NUMERIC;
  p0 := (base_block -> 'totals' -> 'engagement_rate_reach' ->> 'eligible_posts')::NUMERIC;
  i1 := (current_block -> 'totals' -> 'engagement_rate_reach' ->> 'numerator_interactions')::NUMERIC;
  i0 := (base_block -> 'totals' -> 'engagement_rate_reach' ->> 'numerator_interactions')::NUMERIC;
  r1 := CASE WHEN p1 > 0 THEN i1 / p1 END;
  r0 := CASE WHEN p0 > 0 THEN i0 / p0 END;

  RETURN jsonb_build_object(
    'current_period', jsonb_build_object('from', p_scope ->> 'from', 'to', p_scope ->> 'to', 'incomplete', (p_scope ->> 'period_incomplete')::BOOLEAN),
    'previous_period', jsonb_build_object('from', base_from, 'to', base_to),
    'comparison', comparison,
    'interaction_decomposition', CASE WHEN r1 IS NOT NULL AND r0 IS NOT NULL THEN jsonb_build_object(
      'eligible_posts_current', p1,
      'eligible_posts_previous', p0,
      'interactions_per_post_current', round(r1, 2),
      'interactions_per_post_previous', round(r0, 2),
      'total_change', i1 - i0,
      'volume_effect', round((p1 - p0) * r0, 2),
      'rate_effect', round(p1 * (r1 - r0), 2),
      'formula', 'ΔI = (P₁−P₀)·r₀ + P₁·(r₁−r₀); r = interacciones por publicación elegible'
    ) ELSE jsonb_build_object('unavailable_reason', 'Sin publicaciones elegibles en alguno de los períodos') END,
    'current', jsonb_build_object('content', current_block, 'followers', current_followers),
    'previous', jsonb_build_object('content', base_block, 'followers', base_followers),
    'warnings', to_jsonb(ARRAY_REMOVE(ARRAY[
      CASE WHEN (p_scope ->> 'period_incomplete')::BOOLEAN THEN 'El período actual incluye el día en curso: está incompleto y los valores recientes siguen acumulando.' END,
      CASE WHEN COALESCE(p1, 0) < 5 OR COALESCE(p0, 0) < 5 THEN 'Muestra pequeña (menos de 5 publicaciones elegibles en algún período): tratar diferencias como indicios, no conclusiones.' END,
      'Las publicaciones recientes acumulan menos días de exposición que las antiguas; para comparar rendimiento usar ranking a igual edad.'
    ], NULL))
  );
END
$social_q_compare_periods$;

CREATE OR REPLACE FUNCTION private.social_q_timeseries(p_scope JSONB, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_q_timeseries$
DECLARE
  metric TEXT := COALESCE(p_params ->> 'metric', 'followers');
  granularity TEXT := COALESCE(p_params ->> 'granularity', 'day');
  attribution TEXT := COALESCE(p_params ->> 'attribution', 'publish');
  series JSONB;
  tz TEXT := p_scope ->> 'timezone';
BEGIN
  IF granularity NOT IN ('day', 'week', 'month') THEN
    PERFORM private.social_raise('invalid_granularity', 'granularity debe ser day, week o month');
  END IF;
  IF attribution NOT IN ('publish', 'received') THEN
    PERFORM private.social_raise('invalid_attribution', 'attribution debe ser publish o received');
  END IF;
  IF metric NOT IN ('followers', 'posts_published', 'views', 'reach', 'likes', 'comments', 'shares', 'saves') THEN
    PERFORM private.social_raise('invalid_metric', 'Métrica no disponible para series');
  END IF;

  IF metric = 'followers' THEN
    WITH days AS (
      SELECT generate_series((p_scope ->> 'from')::DATE, (p_scope ->> 'to')::DATE, interval '1 day')::DATE AS day
    ), points AS (
      SELECT daily.account_id, daily.day, daily.value FROM public.sistema_social_account_daily AS daily
      WHERE daily.metric_key = 'followers'
        AND daily.account_id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
        AND daily.day BETWEEN (p_scope ->> 'from')::DATE AND (p_scope ->> 'to')::DATE
    ), bucketed AS (
      SELECT date_trunc(granularity, points.day)::DATE AS bucket, points.account_id,
        (array_agg(points.value ORDER BY points.day DESC))[1] AS value
      FROM points GROUP BY 1, 2
    )
    SELECT jsonb_build_object(
      'by_account', COALESCE((SELECT jsonb_object_agg(account_id, series_rows) FROM (
        SELECT account_id, jsonb_agg(jsonb_build_object('bucket', bucket, 'value', value) ORDER BY bucket) AS series_rows
        FROM bucketed GROUP BY account_id) AS per_account), '{}'::JSONB),
      -- Un bucket sin dato de alguna cuenta no se suma parcialmente (sería una
      -- caída falsa): el total queda nulo y la suma parcial se informa aparte.
      'total', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'bucket', bucket,
          'value', CASE WHEN reporting = cardinality(private.social_scope_uuids(p_scope, 'resolved_account_ids')) THEN total END,
          'partial_sum', CASE WHEN reporting < cardinality(private.social_scope_uuids(p_scope, 'resolved_account_ids')) THEN total END,
          'accounts_reporting', reporting,
          'complete', reporting = cardinality(private.social_scope_uuids(p_scope, 'resolved_account_ids'))) ORDER BY bucket)
        FROM (SELECT bucket, sum(value) AS total, count(*) AS reporting FROM bucketed GROUP BY bucket) AS totals), '[]'::JSONB),
      'expected_buckets', (SELECT count(DISTINCT date_trunc(granularity, day)) FROM days),
      'semantics', 'Valor puntual al cierre del período de cada bucket; total = seguidores acumulados, no deduplicados. Si falta el dato de alguna cuenta, el total queda vacío (no se muestra una caída falsa).'
    ) INTO series;
  ELSIF metric = 'posts_published' OR attribution = 'publish' THEN
    WITH posts AS (
      SELECT * FROM private.social_scope_posts(p_scope, true)
    ), valued AS (
      SELECT date_trunc(granularity, (post.published_at AT TIME ZONE tz)::DATE)::DATE AS bucket,
        post.id,
        CASE WHEN metric = 'posts_published' THEN 1 ELSE latest.value END AS value,
        CASE WHEN metric = 'posts_published' THEN 'supported'
          ELSE private.social_metric_status(post.platform, metric, post.media_product_type) END AS support_status
      FROM posts AS post
      LEFT JOIN public.sistema_social_post_metrics_latest AS latest ON latest.post_id = post.id AND latest.metric_key = metric
    )
    SELECT jsonb_build_object(
      'total', COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'value', total, 'posts', posts, 'posts_with_value', with_value) ORDER BY bucket), '[]'::JSONB),
      'semantics', CASE WHEN metric = 'posts_published' THEN 'Publicaciones por fecha local de publicación.'
        ELSE 'attribution=publish: el acumulado vigente de cada publicación se asigna a su fecha de publicación (no a cuándo se generó).' END
    ) INTO series
    FROM (
      SELECT bucket, sum(value) FILTER (WHERE support_status = 'supported') AS total, count(*) AS posts,
        count(value) FILTER (WHERE support_status = 'supported') AS with_value
      FROM valued GROUP BY bucket
    ) AS grouped;
  ELSE
    -- attribution=received: incremento diario entre snapshots consecutivos.
    WITH posts AS (
      SELECT * FROM private.social_scope_posts(p_scope, false)
      WHERE private.social_metric_status(platform, metric, media_product_type) = 'supported'
    ), snaps AS (
      SELECT snapshot.post_id, snapshot.observed_on, snapshot.value,
        lag(snapshot.value) OVER (PARTITION BY snapshot.post_id ORDER BY snapshot.observed_on) AS previous_value,
        lag(snapshot.observed_on) OVER (PARTITION BY snapshot.post_id ORDER BY snapshot.observed_on) AS previous_day
      FROM public.sistema_social_post_metric_snapshots AS snapshot
      JOIN posts ON posts.id = snapshot.post_id
      WHERE snapshot.metric_key = metric
        AND snapshot.observed_on BETWEEN (p_scope ->> 'from')::DATE - 1 AND (p_scope ->> 'to')::DATE
    ), increments AS (
      SELECT date_trunc(granularity, snaps.observed_on)::DATE AS bucket,
        CASE
          WHEN snaps.previous_day = snaps.observed_on - 1 THEN GREATEST(snaps.value - snaps.previous_value, 0)
          WHEN snaps.previous_day IS NULL AND posts.published_at::DATE = snaps.observed_on THEN snaps.value
        END AS increment
      FROM snaps JOIN posts ON posts.id = snaps.post_id
      WHERE snaps.observed_on >= (p_scope ->> 'from')::DATE
    )
    SELECT jsonb_build_object(
      'total', COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'value', total, 'observations', observations, 'observations_without_previous_day', gaps) ORDER BY bucket), '[]'::JSONB),
      'semantics', 'attribution=received: suma de incrementos diarios del acumulado de cada publicación (incluye publicaciones anteriores al período). Días de snapshot en UTC. Los huecos de observación no se interpolan.'
    ) INTO series
    FROM (
      SELECT bucket, sum(increment) AS total, count(*) AS observations, count(*) FILTER (WHERE increment IS NULL) AS gaps
      FROM increments GROUP BY bucket
    ) AS grouped;
  END IF;

  RETURN jsonb_build_object('metric', metric, 'granularity', granularity, 'attribution', attribution, 'series', series);
END
$social_q_timeseries$;

CREATE OR REPLACE FUNCTION private.social_q_rank_posts(p_scope JSONB, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_q_rank_posts$
DECLARE
  metric TEXT := COALESCE(p_params ->> 'metric', 'views');
  age_days INTEGER := NULLIF(p_params ->> 'age_days', '')::INTEGER;
  row_limit INTEGER := LEAST(GREATEST(COALESCE((p_params ->> 'limit')::INTEGER, 10), 1), 50);
  sort_order TEXT := COALESCE(p_params ->> 'order', 'desc');
  result JSONB;
BEGIN
  IF metric NOT IN ('views', 'reach', 'likes', 'comments', 'shares', 'saves', 'interactions', 'engagement_rate_reach',
    'ig_reels_avg_watch_time', 'ig_reels_total_watch_time') THEN
    PERFORM private.social_raise('invalid_metric', 'Métrica no permitida para ranking');
  END IF;
  IF age_days IS NOT NULL AND age_days NOT IN (1, 3, 7, 14, 30) THEN
    PERFORM private.social_raise('invalid_age', 'age_days debe ser 1, 3, 7, 14 o 30');
  END IF;
  IF sort_order NOT IN ('asc', 'desc') THEN
    PERFORM private.social_raise('invalid_order', 'order debe ser asc o desc');
  END IF;

  WITH posts AS (
    SELECT * FROM private.social_scope_posts(p_scope, true)
  ), components AS (
    SELECT post.*,
      CASE WHEN metric IN ('interactions', 'engagement_rate_reach') THEN
        CASE WHEN private.social_metric_status(post.platform, 'likes', post.media_product_type) = 'supported'
          AND private.social_metric_status(post.platform, 'comments', post.media_product_type) = 'supported'
          AND private.social_metric_status(post.platform, 'shares', post.media_product_type) = 'supported'
          AND private.social_metric_status(post.platform, 'saves', post.media_product_type) = 'supported'
          AND (metric = 'interactions' OR private.social_metric_status(post.platform, 'reach', post.media_product_type) = 'supported')
        THEN 'supported' ELSE 'not_comparable' END
      ELSE private.social_metric_status(post.platform, metric, post.media_product_type) END AS support_status,
      age_days IS NOT NULL AND post.published_at > now() - make_interval(days => age_days) AS too_young
    FROM posts AS post
  ), valued AS (
    SELECT components.*,
      CASE
        WHEN support_status <> 'supported' OR too_young THEN NULL
        WHEN metric IN ('interactions', 'engagement_rate_reach') THEN (
          SELECT CASE
            WHEN metric = 'interactions' THEN sum(value)
            ELSE NULL END
          FROM (
            SELECT CASE WHEN age_days IS NULL
              THEN (SELECT latest.value FROM public.sistema_social_post_metrics_latest AS latest WHERE latest.post_id = components.id AND latest.metric_key = component)
              ELSE private.social_value_at_age(components.id, component, components.published_at, age_days) END AS value
            FROM unnest(ARRAY['likes', 'comments', 'shares', 'saves']) AS component
          ) AS parts HAVING count(value) = 4
        )
        WHEN age_days IS NULL THEN (SELECT latest.value FROM public.sistema_social_post_metrics_latest AS latest
          WHERE latest.post_id = components.id AND latest.metric_key = metric)
        ELSE private.social_value_at_age(components.id, metric, components.published_at, age_days)
      END AS raw_value,
      CASE WHEN metric = 'engagement_rate_reach' AND support_status = 'supported' AND NOT too_young THEN
        CASE WHEN age_days IS NULL
          THEN (SELECT latest.value FROM public.sistema_social_post_metrics_latest AS latest WHERE latest.post_id = components.id AND latest.metric_key = 'reach')
          ELSE private.social_value_at_age(components.id, 'reach', components.published_at, age_days) END
      END AS reach_value
    FROM components
  ), final AS (
    SELECT valued.*,
      CASE
        WHEN metric = 'engagement_rate_reach' THEN (
          SELECT CASE WHEN valued.reach_value > 0 AND count(parts.value) = 4 THEN round(sum(parts.value) / valued.reach_value, 6) END
          FROM (
            SELECT CASE WHEN age_days IS NULL
              THEN (SELECT latest.value FROM public.sistema_social_post_metrics_latest AS latest WHERE latest.post_id = valued.id AND latest.metric_key = component)
              ELSE private.social_value_at_age(valued.id, component, valued.published_at, age_days) END AS value
            FROM unnest(ARRAY['likes', 'comments', 'shares', 'saves']) AS component
          ) AS parts
        )
        ELSE raw_value
      END AS metric_value
    FROM valued
  ), ranked AS (
    SELECT final.*,
      rank() OVER (ORDER BY CASE WHEN sort_order = 'desc' THEN -metric_value ELSE metric_value END) AS position
    FROM final WHERE metric_value IS NOT NULL
  )
  SELECT jsonb_build_object(
    'metric', metric,
    'age_days', age_days,
    'order', sort_order,
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rank', position, 'post_id', id, 'account_id', account_id, 'client_id', client_id, 'platform', platform,
      'format', format, 'origin', origin, 'published_at', published_at, 'permalink', permalink,
      'thumbnail_url', thumbnail_url, 'caption_excerpt', left(caption_excerpt, 280), 'value', metric_value
    ) ORDER BY position, published_at DESC) FROM (SELECT * FROM ranked ORDER BY position LIMIT row_limit) AS top), '[]'::JSONB),
    'sample', jsonb_build_object(
      'posts_in_scope', (SELECT count(*) FROM final),
      'ranked', (SELECT count(*) FROM ranked),
      'excluded_not_supported', (SELECT count(*) FROM final WHERE support_status <> 'supported'),
      'excluded_too_young', (SELECT count(*) FROM final WHERE support_status = 'supported' AND too_young),
      'excluded_missing_observation', (SELECT count(*) FROM final WHERE support_status = 'supported' AND NOT too_young AND metric_value IS NULL)
    ),
    'method', CASE WHEN age_days IS NULL
      THEN 'Valor acumulado vigente. Publicaciones más antiguas tuvieron más tiempo de exposición: usar age_days para comparar a igual edad.'
      ELSE format('Valor acumulado a %s día(s) de publicada (snapshot dentro de ±1 día). Se excluyen publicaciones más jóvenes o sin observación.', age_days) END
  ) INTO result;
  RETURN result;
END
$social_q_rank_posts$;

CREATE OR REPLACE FUNCTION private.social_q_compare_formats(p_scope JSONB, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_q_compare_formats$
DECLARE
  metric TEXT := COALESCE(p_params ->> 'metric', 'views');
  age_days INTEGER := NULLIF(p_params ->> 'age_days', '')::INTEGER;
  result JSONB;
BEGIN
  IF metric NOT IN ('views', 'reach', 'likes', 'comments', 'shares', 'saves') THEN
    PERFORM private.social_raise('invalid_metric', 'Métrica no permitida para comparar formatos');
  END IF;
  IF age_days IS NOT NULL AND age_days NOT IN (1, 3, 7, 14, 30) THEN
    PERFORM private.social_raise('invalid_age', 'age_days debe ser 1, 3, 7, 14 o 30');
  END IF;
  WITH posts AS (
    SELECT * FROM private.social_scope_posts(p_scope, true)
  ), valued AS (
    SELECT post.format, post.platform,
      private.social_metric_status(post.platform, metric, post.media_product_type) AS support_status,
      CASE WHEN age_days IS NOT NULL AND post.published_at > now() - make_interval(days => age_days) THEN NULL
        WHEN age_days IS NULL THEN (SELECT latest.value FROM public.sistema_social_post_metrics_latest AS latest
          WHERE latest.post_id = post.id AND latest.metric_key = metric)
        ELSE private.social_value_at_age(post.id, metric, post.published_at, age_days) END AS value
    FROM posts AS post
  ), stats AS (
    SELECT format, platform,
      count(*) AS posts_total,
      count(value) FILTER (WHERE support_status = 'supported') AS n,
      round(avg(value) FILTER (WHERE support_status = 'supported'), 2) AS mean,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY value) FILTER (WHERE support_status = 'supported') AS median,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY value) FILTER (WHERE support_status = 'supported') AS p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY value) FILTER (WHERE support_status = 'supported') AS p75,
      min(value) FILTER (WHERE support_status = 'supported') AS min_value,
      max(value) FILTER (WHERE support_status = 'supported') AS max_value
    FROM valued GROUP BY format, platform
  )
  SELECT jsonb_build_object(
    'metric', metric,
    'age_days', age_days,
    'groups', COALESCE(jsonb_agg(jsonb_build_object(
      'format', format, 'platform', platform, 'n', n, 'posts_total', posts_total,
      'mean', mean, 'median', median, 'p25', p25, 'p75', p75, 'min', min_value, 'max', max_value,
      'small_sample', n < 5
    ) ORDER BY platform, median DESC NULLS LAST), '[]'::JSONB),
    'method', 'Estadísticos por formato y plataforma (no se mezclan redes). Mediana e intercuartiles son más robustos que la media ante publicaciones virales. Muestras < 5 se marcan.'
  ) INTO result FROM stats;
  RETURN result;
END
$social_q_compare_formats$;

CREATE OR REPLACE FUNCTION private.social_q_post_performance(p_scope JSONB, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_q_post_performance$
DECLARE
  post_row public.sistema_social_posts%ROWTYPE;
  requested UUID;
BEGIN
  IF COALESCE(p_params ->> 'post_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM private.social_raise('invalid_post_id', 'post_id debe ser un UUID');
  END IF;
  requested := (p_params ->> 'post_id')::UUID;
  SELECT * INTO post_row FROM public.sistema_social_posts WHERE id = requested;
  IF NOT FOUND OR NOT post_row.account_id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids')) THEN
    PERFORM private.social_raise('not_found', 'Publicación inexistente o fuera del alcance');
  END IF;
  RETURN jsonb_build_object(
    'post', jsonb_build_object(
      'id', post_row.id, 'client_id', post_row.client_id, 'account_id', post_row.account_id, 'platform', post_row.platform,
      'platform_post_id', post_row.platform_post_id, 'format', post_row.format, 'origin', post_row.origin,
      'media_product_type', post_row.media_product_type, 'published_at', post_row.published_at,
      'permalink', post_row.permalink, 'thumbnail_url', post_row.thumbnail_url,
      'caption_excerpt', post_row.caption_excerpt, 'is_ad', post_row.is_ad,
      'task_id', post_row.task_id, 'publication_id', post_row.publication_id,
      'provider_sync_status', post_row.provider_sync_status, 'metrics_observed_at', post_row.metrics_observed_at
    ),
    'account', (SELECT jsonb_build_object('username', username, 'platform', platform) FROM public.sistema_zernio_accounts WHERE id = post_row.account_id),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('project_id', attribution.project_id, 'name', project.nombre,
      'is_primary', attribution.is_primary, 'source', attribution.attribution_source))
      FROM public.sistema_social_post_projects AS attribution
      JOIN public.sistema_projects AS project ON project.id = attribution.project_id
      WHERE attribution.post_id = post_row.id), '[]'::JSONB),
    'metrics', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'metric', definition.metric_key, 'label', definition.label, 'unit', definition.unit,
      'status', private.social_metric_status(post_row.platform, definition.metric_key, post_row.media_product_type),
      'value', latest.value, 'provider_synced_at', latest.provider_synced_at, 'source', latest.source
    ) ORDER BY definition.metric_key)
      FROM public.sistema_social_metric_definitions AS definition
      LEFT JOIN public.sistema_social_post_metrics_latest AS latest ON latest.post_id = post_row.id AND latest.metric_key = definition.metric_key
      WHERE definition.is_current AND definition.scope = 'post' AND definition.value_kind <> 'derived'), '[]'::JSONB),
    'series', COALESCE((SELECT jsonb_object_agg(metric_key, points) FROM (
      SELECT snapshot.metric_key, jsonb_agg(jsonb_build_object('day', snapshot.observed_on, 'value', snapshot.value, 'source', snapshot.source) ORDER BY snapshot.observed_on) AS points
      FROM public.sistema_social_post_metric_snapshots AS snapshot
      WHERE snapshot.post_id = post_row.id AND snapshot.metric_key IN ('views', 'reach', 'likes', 'comments', 'shares', 'saves')
      GROUP BY snapshot.metric_key) AS grouped), '{}'::JSONB),
    'series_semantics', 'Acumulado al cierre de cada día (UTC). La diferencia entre días consecutivos es lo ganado ese día.'
  );
END
$social_q_post_performance$;

CREATE OR REPLACE FUNCTION private.social_q_coverage(p_scope JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_q_coverage$
  WITH accounts AS (
    SELECT account.*,
      (SELECT client.name FROM public.clients AS client WHERE client.id = account.client_id) AS client_name
    FROM public.sistema_zernio_accounts AS account
    WHERE account.id = ANY(private.social_scope_uuids(p_scope, 'resolved_account_ids'))
  )
  SELECT jsonb_build_object(
    'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'account_id', accounts.id, 'client_id', accounts.client_id, 'client_name', accounts.client_name,
      'platform', accounts.platform, 'username', accounts.username,
      'is_active', accounts.is_active, 'health_status', accounts.health_status,
      'health_issues', accounts.health_issues, 'needs_reconnection', accounts.needs_reconnection,
      'permissions', to_jsonb(accounts.permissions),
      'provider_analytics_synced_at', accounts.provider_analytics_synced_at,
      'last_health_check_at', accounts.last_health_check_at,
      'provider_removed_at', accounts.provider_removed_at,
      'dm_backfill_status', accounts.dm_backfill_status,
      'posts_in_period', (SELECT count(*) FROM private.social_scope_posts(p_scope, true) AS post WHERE post.account_id = accounts.id),
      'posts_without_metrics', (SELECT count(*) FROM private.social_scope_posts(p_scope, true) AS post
        WHERE post.account_id = accounts.id AND NOT EXISTS (SELECT 1 FROM public.sistema_social_post_metrics_latest AS latest WHERE latest.post_id = post.id)),
      'posts_with_timeline', (SELECT count(*) FROM private.social_scope_posts(p_scope, true) AS post
        WHERE post.account_id = accounts.id AND EXISTS (SELECT 1 FROM public.sistema_social_post_metric_snapshots AS snapshot WHERE snapshot.post_id = post.id AND snapshot.source = 'timeline')),
      'latest_post_metrics_at', (SELECT max(post.metrics_observed_at) FROM public.sistema_social_posts AS post WHERE post.account_id = accounts.id),
      'followers_days_covered', (SELECT count(*) FROM public.sistema_social_account_daily AS daily
        WHERE daily.account_id = accounts.id AND daily.metric_key = 'followers'
          AND daily.day BETWEEN (p_scope ->> 'from')::DATE AND (p_scope ->> 'to')::DATE),
      'followers_last_day', (SELECT max(daily.day) FROM public.sistema_social_account_daily AS daily
        WHERE daily.account_id = accounts.id AND daily.metric_key = 'followers'),
      'last_webhook_at', (SELECT max(event.received_at) FROM public.sistema_social_webhook_events AS event
        WHERE event.zernio_account_id = accounts.zernio_account_id)
    ) ORDER BY accounts.client_name, accounts.platform, accounts.username) FROM accounts), '[]'::JSONB),
    'streams', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'stream', state.stream, 'scope_key', state.scope_key, 'status', state.status,
      'last_success_at', state.last_success_at, 'last_attempt_at', state.last_attempt_at,
      'last_error', state.last_error,
      'cursor_age_hours', CASE WHEN state.cursor_obtained_at IS NOT NULL
        THEN round(extract(epoch FROM now() - state.cursor_obtained_at) / 3600, 1) END
    ) ORDER BY state.stream, state.scope_key) FROM public.sistema_social_sync_state AS state), '[]'::JSONB),
    'queue', jsonb_build_object(
      'queued', (SELECT count(*) FROM public.sistema_social_jobs WHERE status = 'queued'),
      'running', (SELECT count(*) FROM public.sistema_social_jobs WHERE status = 'running'),
      'dead_or_failed_24h', (SELECT count(*) FROM public.sistema_social_jobs WHERE status IN ('dead', 'failed') AND updated_at > now() - interval '24 hours'),
      'oldest_queued_minutes', (SELECT round(extract(epoch FROM now() - min(created_at)) / 60, 1) FROM public.sistema_social_jobs WHERE status = 'queued' AND run_after <= now())
    ),
    'webhooks', jsonb_build_object(
      'last_received_at', (SELECT max(received_at) FROM public.sistema_social_webhook_events),
      'quarantined', (SELECT count(*) FROM public.sistema_social_webhook_events WHERE status = 'quarantined'),
      'failed', (SELECT count(*) FROM public.sistema_social_webhook_events WHERE status = 'failed')
    ),
    'provider_freshness_note', 'Zernio cachea analítica de publicaciones ~60 min, seguidores 1 vez/día, publicaciones externas ~90 min; insights de Instagram hasta 48 h de demora.'
  );
$social_q_coverage$;

-- ---------------------------------------------------------------------------
-- 3. Despachador único con evidencia
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.social_query_dispatch(p_op TEXT, p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $social_query_dispatch$
DECLARE
  params JSONB := COALESCE(p_params, '{}'::JSONB);
  scope JSONB;
  data JSONB;
  normalized JSONB;
  data_as_of TIMESTAMPTZ;
BEGIN
  IF p_op = 'scopes' THEN
    RETURN jsonb_build_object('op', p_op, 'result', private.social_q_scopes(),
      'evidence', jsonb_build_object('op', p_op, 'generated_at', now()));
  ELSIF p_op = 'definitions' THEN
    RETURN jsonb_build_object('op', p_op, 'result', private.social_q_definitions(),
      'evidence', jsonb_build_object('op', p_op, 'generated_at', now()));
  END IF;

  scope := private.social_resolve_scope(params, true);

  data := CASE p_op
    WHEN 'overview' THEN private.social_q_overview(scope)
    WHEN 'timeseries' THEN private.social_q_timeseries(scope, params)
    WHEN 'compare_periods' THEN private.social_q_compare_periods(scope, params)
    WHEN 'rank_posts' THEN private.social_q_rank_posts(scope, params)
    WHEN 'compare_formats' THEN private.social_q_compare_formats(scope, params)
    WHEN 'post_performance' THEN private.social_q_post_performance(scope, params)
    WHEN 'coverage' THEN private.social_q_coverage(scope)
    WHEN 'attention' THEN private.social_q_attention(scope, params)
    ELSE NULL
  END;
  IF data IS NULL THEN
    PERFORM private.social_raise('unknown_operation', 'Operación de consulta no permitida');
  END IF;

  SELECT max(post.metrics_observed_at) INTO data_as_of FROM public.sistema_social_posts AS post
  WHERE post.account_id = ANY(private.social_scope_uuids(scope, 'resolved_account_ids'));

  normalized := jsonb_build_object('op', p_op, 'params', params - 'include_series', 'scope', scope - 'start_ts' - 'end_ts');
  RETURN jsonb_build_object(
    'op', p_op,
    'result', data,
    'evidence', jsonb_build_object(
      'query_hash', md5(normalized::TEXT),
      'normalized_query', normalized,
      'timezone', scope ->> 'timezone',
      'period', jsonb_build_object('from', scope ->> 'from', 'to', scope ->> 'to', 'incomplete', (scope ->> 'period_incomplete')::BOOLEAN),
      'accounts', scope -> 'resolved_account_ids',
      'definitions', (SELECT jsonb_agg(jsonb_build_object('metric', metric_key, 'version', version) ORDER BY metric_key)
        FROM public.sistema_social_metric_definitions WHERE is_current),
      'data_as_of', data_as_of,
      'generated_at', now()
    )
  );
END
$social_query_dispatch$;

-- Placeholder de atención (se reemplaza en la migración de bandeja).
CREATE OR REPLACE FUNCTION private.social_q_attention(p_scope JSONB, p_params JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $social_q_attention$
  SELECT jsonb_build_object('status', 'not_available', 'reason', 'Bandeja no instalada');
$social_q_attention$;

-- Entrada del servidor Next.js (UI y análisis con IA dentro de Quepia).
CREATE OR REPLACE FUNCTION public.social_query(p_actor UUID, p_op TEXT, p_params JSONB DEFAULT '{}'::JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_query$
DECLARE
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  RETURN private.social_ok(private.social_query_dispatch(p_op, p_params));
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
    RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
  WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RETURN private.social_error('invalid_parameter', 'Parámetro con formato inválido');
END
$social_query$;

REVOKE EXECUTE ON FUNCTION public.social_query(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
DO $mcp_revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.social_query(UUID, TEXT, JSONB) FROM mcp_authenticated;
  END IF;
END
$mcp_revoke$;
GRANT EXECUTE ON FUNCTION public.social_query(UUID, TEXT, JSONB) TO service_role;

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
