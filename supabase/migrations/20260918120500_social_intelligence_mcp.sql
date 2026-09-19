-- Gestión social: inteligencia analítica (análisis con IA dentro de Quepia) y
-- herramientas MCP de solo lectura.
--
-- * El análisis persiste la pregunta, el alcance normalizado, cada consulta a
--   la capa semántica (evidencia reproducible) y el resultado estructurado
--   (hallazgos, interpretaciones, limitaciones, recomendaciones, experimento).
-- * La IA nunca recibe SQL libre, credenciales ni acceso a tablas: solo invoca
--   operaciones permitidas de private.social_query_dispatch.
-- * MCP: nueva capacidad social.analytics.read, NO otorgada por defecto y sin
--   backfill a grants existentes. Cada ejecución exige además administrador
--   global activo y autorizado (más estricto que el resto del MCP).
-- * Ninguna herramienta de análisis devuelve DMs, notas internas ni datos de
--   contacto: attention devuelve solo agregados.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regprocedure('private.social_query_dispatch(text,jsonb)') IS NULL
    OR to_regclass('private.mcp_capabilities') IS NULL
    OR to_regprocedure('private.mcp_authorize(text,text,text,boolean)') IS NULL
  THEN
    RAISE EXCEPTION 'Faltan la capa semántica social o el control plane MCP';
  END IF;
END
$preflight$;

CREATE TABLE public.sistema_social_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.sistema_users(id) ON DELETE RESTRICT,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 3 AND 2000),
  scope JSONB NOT NULL,
  client_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'budget_exceeded')),
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6),
  result JSONB,
  error TEXT,
  includes_private_content BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_social_analysis_runs_actor ON public.sistema_social_analysis_runs(actor_id, started_at DESC);
CREATE INDEX idx_social_analysis_runs_clients ON public.sistema_social_analysis_runs USING GIN (client_ids);

CREATE TABLE public.sistema_social_analysis_evidence (
  run_id UUID NOT NULL REFERENCES public.sistema_social_analysis_runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq BETWEEN 1 AND 30),
  op TEXT NOT NULL,
  params JSONB NOT NULL,
  query_hash TEXT,
  result JSONB NOT NULL,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq),
  CHECK (pg_column_size(result) < 262144)
);

CREATE TABLE public.sistema_social_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.sistema_social_analysis_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('finding', 'interpretation', 'limitation', 'recommendation', 'experiment')),
  statement TEXT NOT NULL CHECK (length(statement) BETWEEN 3 AND 2000),
  evidence_refs JSONB NOT NULL DEFAULT '[]'::JSONB,
  evaluation_metric TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected', 'done')),
  reviewed_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_insights_run ON public.sistema_social_insights(run_id);

DO $server_only$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sistema_social_analysis_runs', 'sistema_social_analysis_evidence', 'sistema_social_insights']
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
-- 1. Ciclo de vida de un análisis dentro de Quepia
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.social_admin_start_analysis(
  p_actor UUID,
  p_question TEXT,
  p_scope_params JSONB,
  p_daily_limit INTEGER DEFAULT 40
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_start_analysis$
DECLARE
  scope JSONB;
  run_id UUID;
  used_today INTEGER;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  scope := private.social_resolve_scope(COALESCE(p_scope_params, '{}'::JSONB), true);
  SELECT count(*) INTO used_today FROM public.sistema_social_analysis_runs
  WHERE actor_id = p_actor AND started_at > now() - interval '24 hours';
  IF used_today >= GREATEST(1, LEAST(COALESCE(p_daily_limit, 40), 500)) THEN
    RETURN private.social_error('budget_exceeded', 'Se alcanzó el límite diario de análisis con IA');
  END IF;
  INSERT INTO public.sistema_social_analysis_runs(actor_id, question, scope, client_ids)
  VALUES (p_actor, btrim(p_question), scope - 'start_ts' - 'end_ts',
    ARRAY(SELECT (value #>> '{}')::UUID FROM jsonb_array_elements(scope -> 'resolved_client_ids')))
  RETURNING id INTO run_id;
  PERFORM private.social_audit(p_actor, 'ai', NULL, 'analysis', run_id::TEXT, 'analysis.started',
    jsonb_build_object('question_length', length(p_question)));
  RETURN private.social_ok(jsonb_build_object('run_id', run_id, 'scope', scope - 'start_ts' - 'end_ts'));
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
    RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
  WHEN check_violation THEN
    RETURN private.social_error('invalid_question', 'La pregunta debe tener entre 3 y 2000 caracteres');
END
$social_admin_start_analysis$;

-- Ejecuta una operación de la capa semántica dentro de un análisis y guarda
-- la evidencia. El alcance de la herramienta se restringe al del análisis: la
-- IA no puede ampliarlo pidiendo otros clientes o cuentas.
CREATE OR REPLACE FUNCTION public.social_admin_analysis_query(
  p_actor UUID,
  p_run_id UUID,
  p_op TEXT,
  p_params JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_analysis_query$
DECLARE
  run_row public.sistema_social_analysis_runs%ROWTYPE;
  merged JSONB;
  result JSONB;
  next_seq INTEGER;
  allowed_accounts UUID[];
  requested_scope JSONB;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT * INTO run_row FROM public.sistema_social_analysis_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.actor_id <> p_actor THEN
    RETURN private.social_error('not_found', 'Análisis inexistente');
  END IF;
  IF run_row.status <> 'running' THEN
    RETURN private.social_error('not_running', 'El análisis ya terminó');
  END IF;
  IF p_op NOT IN ('definitions', 'coverage', 'overview', 'timeseries', 'compare_periods', 'rank_posts',
    'compare_formats', 'post_performance', 'attention') THEN
    RETURN private.social_error('unknown_operation', 'Operación no permitida para el análisis');
  END IF;
  SELECT COALESCE(max(seq), 0) + 1 INTO next_seq FROM public.sistema_social_analysis_evidence WHERE run_id = p_run_id;
  IF next_seq > 30 THEN
    RETURN private.social_error('tool_budget_exceeded', 'Se alcanzó el máximo de consultas por análisis');
  END IF;

  -- Los filtros de alcance del análisis prevalecen sobre los pedidos por la IA.
  merged := COALESCE(p_params, '{}'::JSONB)
    - 'client_ids' - 'project_ids' - 'account_ids' - 'platforms' - 'project_mode' - 'timezone'
    || jsonb_strip_nulls(jsonb_build_object(
      'client_ids', run_row.scope -> 'client_ids',
      'project_ids', run_row.scope -> 'project_ids',
      'account_ids', run_row.scope -> 'account_ids',
      'platforms', run_row.scope -> 'platforms',
      'project_mode', run_row.scope -> 'project_mode',
      'timezone', run_row.scope -> 'timezone'
    ));
  IF NOT (merged ? 'from') THEN merged := merged || jsonb_build_object('from', run_row.scope -> 'from'); END IF;
  IF NOT (merged ? 'to') THEN merged := merged || jsonb_build_object('to', run_row.scope -> 'to'); END IF;
  IF p_params ? 'account_ids' THEN
    -- Subconjunto de cuentas permitido solo si ya está dentro del análisis.
    allowed_accounts := ARRAY(SELECT (value #>> '{}')::UUID FROM jsonb_array_elements(run_row.scope -> 'resolved_account_ids'));
    requested_scope := to_jsonb(private.social_uuid_array(p_params -> 'account_ids', 'account_ids'));
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(requested_scope) AS requested
      WHERE NOT requested::UUID = ANY(allowed_accounts)) THEN
      RETURN private.social_error('scope_escalation', 'La consulta pidió cuentas fuera del alcance del análisis');
    END IF;
    merged := merged || jsonb_build_object('account_ids', requested_scope);
  END IF;

  result := private.social_query_dispatch(p_op, merged);
  INSERT INTO public.sistema_social_analysis_evidence(run_id, seq, op, params, query_hash, result, evidence)
  VALUES (p_run_id, next_seq, p_op, merged, result #>> '{evidence,query_hash}', result -> 'result', result -> 'evidence');
  UPDATE public.sistema_social_analysis_runs SET tool_calls = tool_calls + 1 WHERE id = p_run_id;
  RETURN private.social_ok(result || jsonb_build_object('evidence_ref', jsonb_build_object('run_id', p_run_id, 'seq', next_seq)));
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
    RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
  WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RETURN private.social_error('invalid_parameter', 'Parámetro con formato inválido');
END
$social_admin_analysis_query$;

CREATE OR REPLACE FUNCTION public.social_admin_finish_analysis(
  p_actor UUID,
  p_run_id UUID,
  p_status TEXT,
  p_result JSONB,
  p_usage JSONB,
  p_error TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_finish_analysis$
DECLARE
  run_row public.sistema_social_analysis_runs%ROWTYPE;
  section RECORD;
  item JSONB;
  max_seq INTEGER;
  inserted INTEGER := 0;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF p_status NOT IN ('completed', 'failed', 'cancelled', 'budget_exceeded') THEN
    RETURN private.social_error('invalid_status', 'Estado final inválido');
  END IF;
  SELECT * INTO run_row FROM public.sistema_social_analysis_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.actor_id <> p_actor THEN
    RETURN private.social_error('not_found', 'Análisis inexistente');
  END IF;
  IF run_row.status <> 'running' THEN
    RETURN private.social_error('not_running', 'El análisis ya terminó');
  END IF;
  SELECT COALESCE(max(seq), 0) INTO max_seq FROM public.sistema_social_analysis_evidence WHERE run_id = p_run_id;

  UPDATE public.sistema_social_analysis_runs SET
    status = p_status,
    result = p_result,
    error = left(p_error, 2000),
    provider = p_usage ->> 'provider',
    model = p_usage ->> 'model',
    prompt_version = p_usage ->> 'prompt_version',
    input_tokens = NULLIF(p_usage ->> 'input_tokens', '')::INTEGER,
    output_tokens = NULLIF(p_usage ->> 'output_tokens', '')::INTEGER,
    estimated_cost_usd = NULLIF(p_usage ->> 'estimated_cost_usd', '')::NUMERIC,
    finished_at = now()
  WHERE id = p_run_id;

  IF p_status = 'completed' AND jsonb_typeof(p_result) = 'object' THEN
    FOR section IN
      SELECT * FROM (VALUES
        ('findings', 'finding'), ('interpretations', 'interpretation'), ('limitations', 'limitation'),
        ('recommendations', 'recommendation'), ('next_experiments', 'experiment')
      ) AS mapping(field, kind)
    LOOP
      CONTINUE WHEN jsonb_typeof(p_result -> section.field) <> 'array';
      FOR item IN SELECT value FROM jsonb_array_elements(p_result -> section.field) LOOP
        CONTINUE WHEN length(COALESCE(item ->> 'statement', '')) < 3;
        -- Solo se aceptan referencias a evidencia existente de este análisis.
        INSERT INTO public.sistema_social_insights(run_id, kind, statement, evidence_refs, evaluation_metric)
        VALUES (p_run_id, section.kind, left(item ->> 'statement', 2000),
          COALESCE((SELECT jsonb_agg(ref) FROM jsonb_array_elements(COALESCE(item -> 'evidence_refs', '[]'::JSONB)) AS ref
            WHERE jsonb_typeof(ref) = 'number' AND (ref #>> '{}')::INTEGER BETWEEN 1 AND max_seq), '[]'::JSONB),
          left(item ->> 'evaluation_metric', 300));
        inserted := inserted + 1;
      END LOOP;
    END LOOP;
  END IF;
  PERFORM private.social_audit(p_actor, 'ai', NULL, 'analysis', p_run_id::TEXT, 'analysis.' || p_status,
    jsonb_build_object('insights', inserted, 'tool_calls', run_row.tool_calls, 'model', p_usage ->> 'model',
      'input_tokens', p_usage ->> 'input_tokens', 'output_tokens', p_usage ->> 'output_tokens'));
  RETURN private.social_ok(jsonb_build_object('run_id', p_run_id, 'status', p_status, 'insights', inserted));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_finish_analysis$;

-- Reabrir un análisis revalida al administrador en cada lectura.
CREATE OR REPLACE FUNCTION public.social_admin_get_analysis(p_actor UUID, p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_get_analysis$
DECLARE
  run_row public.sistema_social_analysis_runs%ROWTYPE;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT * INTO run_row FROM public.sistema_social_analysis_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Análisis inexistente');
  END IF;
  RETURN private.social_ok(jsonb_build_object(
    'run', to_jsonb(run_row) || jsonb_build_object('actor_name', (SELECT nombre FROM public.sistema_users WHERE id = run_row.actor_id)),
    'evidence', COALESCE((SELECT jsonb_agg(jsonb_build_object('seq', seq, 'op', op, 'params', params,
      'query_hash', query_hash, 'result', result, 'evidence', evidence, 'created_at', created_at) ORDER BY seq)
      FROM public.sistema_social_analysis_evidence WHERE run_id = p_run_id), '[]'::JSONB),
    'insights', COALESCE((SELECT jsonb_agg(to_jsonb(insight) ORDER BY insight.kind, insight.created_at)
      FROM public.sistema_social_insights AS insight WHERE insight.run_id = p_run_id), '[]'::JSONB)
  ));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_get_analysis$;

CREATE OR REPLACE FUNCTION public.social_admin_list_analyses(p_actor UUID, p_client_ids UUID[] DEFAULT NULL, p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_list_analyses$
DECLARE
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  RETURN private.social_ok(COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', run.id, 'question', run.question, 'status', run.status,
      'client_ids', to_jsonb(run.client_ids), 'period', jsonb_build_object('from', run.scope ->> 'from', 'to', run.scope ->> 'to'),
      'actor_name', author.nombre, 'started_at', run.started_at, 'model', run.model, 'tool_calls', run.tool_calls) ORDER BY run.started_at DESC)
    FROM (SELECT * FROM public.sistema_social_analysis_runs
      WHERE p_client_ids IS NULL OR cardinality(p_client_ids) = 0 OR client_ids && p_client_ids
      ORDER BY started_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 100)) AS run
    JOIN public.sistema_users AS author ON author.id = run.actor_id
  ), '[]'::JSONB));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_list_analyses$;

CREATE OR REPLACE FUNCTION public.social_admin_review_insight(p_actor UUID, p_insight_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_review_insight$
DECLARE
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  IF p_status NOT IN ('pending', 'accepted', 'rejected', 'done') THEN
    RETURN private.social_error('invalid_status', 'Estado de revisión inválido');
  END IF;
  UPDATE public.sistema_social_insights SET review_status = p_status, reviewed_by = p_actor, reviewed_at = now()
  WHERE id = p_insight_id;
  IF NOT FOUND THEN
    RETURN private.social_error('not_found', 'Insight inexistente');
  END IF;
  PERFORM private.social_audit(p_actor, 'admin', NULL, 'insight', p_insight_id::TEXT, 'insight.reviewed', jsonb_build_object('status', p_status));
  RETURN private.social_ok(jsonb_build_object('id', p_insight_id, 'review_status', p_status));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_review_insight$;

-- Consultas de la UI (misma capa que la IA y MCP).
DO $rpc_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.social_admin_start_analysis(uuid,text,jsonb,integer)',
    'public.social_admin_analysis_query(uuid,uuid,text,jsonb)',
    'public.social_admin_finish_analysis(uuid,uuid,text,jsonb,jsonb,text)',
    'public.social_admin_get_analysis(uuid,uuid)',
    'public.social_admin_list_analyses(uuid,uuid[],integer)',
    'public.social_admin_review_insight(uuid,uuid,text)'
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
-- 2. MCP: capacidad explícita y RPC estrechas de solo lectura
-- ---------------------------------------------------------------------------

INSERT INTO private.mcp_capabilities(capability, description, granted_by_default)
VALUES (
  'social.analytics.read',
  'Leer métricas sociales agregadas, cobertura, rankings y SLA (sin DMs ni notas). Solo administradores globales.',
  false
)
ON CONFLICT (capability) DO UPDATE SET granted_by_default = false;

CREATE OR REPLACE FUNCTION private.mcp_social_run(p_op TEXT, p_action TEXT, p_request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $mcp_social_run$
DECLARE
  authorization_result JSONB;
  user_id_value UUID;
  result JSONB;
  social_err_detail TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object' THEN
    RETURN private.mcp_error('invalid_request', 'The request must be a JSON object.');
  END IF;
  authorization_result := private.mcp_authorize('social.analytics.read', p_action, 'read');
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  user_id_value := (authorization_result #>> '{data,user_id}')::UUID;
  IF NOT private.social_is_global_admin(user_id_value) THEN
    PERFORM private.mcp_audit_event('authorization.denied', p_action, 'denied', user_id_value, NULL, NULL, NULL,
      'social.analytics.read', jsonb_build_object('reason', 'not_global_admin'));
    RETURN private.mcp_error('forbidden', 'Social analytics require an active, authorized global Quepia administrator.');
  END IF;
  BEGIN
    result := private.social_query_dispatch(p_op, COALESCE(p_request, '{}'::JSONB));
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
      RETURN private.mcp_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
    WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
      RETURN private.mcp_error('invalid_parameter', 'A parameter has an invalid format.');
  END;
  PERFORM private.mcp_audit_event('tool.read', p_action, 'success', user_id_value, NULL, NULL, NULL,
    'social.analytics.read', jsonb_build_object('op', p_op, 'query_hash', result #>> '{evidence,query_hash}'));
  RETURN private.mcp_ok(result);
END
$mcp_social_run$;

REVOKE EXECUTE ON FUNCTION private.mcp_social_run(TEXT, TEXT, JSONB) FROM PUBLIC;

DO $mcp_social_tools$
DECLARE
  tool RECORD;
BEGIN
  FOR tool IN
    SELECT * FROM (VALUES
      ('mcp_social_list_scopes', 'scopes'),
      ('mcp_social_get_metric_definitions', 'definitions'),
      ('mcp_social_get_data_coverage', 'coverage'),
      ('mcp_social_get_overview', 'overview'),
      ('mcp_social_get_timeseries', 'timeseries'),
      ('mcp_social_compare_periods', 'compare_periods'),
      ('mcp_social_rank_posts', 'rank_posts'),
      ('mcp_social_get_post_performance', 'post_performance'),
      ('mcp_social_compare_formats', 'compare_formats'),
      ('mcp_social_get_attention_metrics', 'attention')
    ) AS mapping(rpc_name, op)
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(p_request JSONB DEFAULT ''{}''::JSONB) RETURNS JSONB LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '''' AS $body$ SELECT private.mcp_social_run(%L, %L, p_request); $body$',
      tool.rpc_name, tool.op, tool.rpc_name
    );
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(JSONB) FROM PUBLIC, anon, authenticated, service_role', tool.rpc_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(JSONB) TO mcp_authenticated', tool.rpc_name);
    END IF;
  END LOOP;
END
$mcp_social_tools$;

-- Concesión explícita de la capacidad a un grant MCP concreto (y a su
-- cliente OAuth). Solo para grants cuyo usuario es admin global.
CREATE OR REPLACE FUNCTION public.social_admin_set_mcp_social_access(p_actor UUID, p_grant_id UUID, p_enabled BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_set_mcp_social_access$
DECLARE
  grant_row RECORD;
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  SELECT id, user_id, client_id, revoked_at INTO grant_row FROM private.mcp_access_grants WHERE id = p_grant_id;
  IF NOT FOUND OR grant_row.revoked_at IS NOT NULL THEN
    RETURN private.social_error('not_found', 'Grant MCP inexistente o revocado');
  END IF;
  IF p_enabled AND NOT private.social_is_global_admin(grant_row.user_id) THEN
    RETURN private.social_error('not_global_admin', 'Solo grants de administradores globales pueden recibir analítica social');
  END IF;
  IF p_enabled THEN
    INSERT INTO private.mcp_client_capabilities(client_id, capability) VALUES (grant_row.client_id, 'social.analytics.read')
    ON CONFLICT DO NOTHING;
    INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability) VALUES (p_grant_id, 'social.analytics.read')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM private.mcp_access_grant_capabilities WHERE grant_id = p_grant_id AND capability = 'social.analytics.read';
  END IF;
  PERFORM private.social_audit(p_actor, 'admin', NULL, 'mcp_grant', p_grant_id::TEXT,
    CASE WHEN p_enabled THEN 'mcp.social_access_granted' ELSE 'mcp.social_access_revoked' END,
    jsonb_build_object('grant_user', grant_row.user_id));
  RETURN private.social_ok(jsonb_build_object('grant_id', p_grant_id, 'enabled', p_enabled));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_set_mcp_social_access$;

CREATE OR REPLACE FUNCTION public.social_admin_list_mcp_grants(p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $social_admin_list_mcp_grants$
DECLARE
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  RETURN private.social_ok(COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'grant_id', grant_row.id, 'user_id', grant_row.user_id, 'user_name', person.nombre,
      'client_id', grant_row.client_id, 'created_at', grant_row.created_at,
      'user_is_global_admin', private.social_is_global_admin(grant_row.user_id),
      'social_enabled', EXISTS (SELECT 1 FROM private.mcp_access_grant_capabilities AS capability
        WHERE capability.grant_id = grant_row.id AND capability.capability = 'social.analytics.read')
    ) ORDER BY grant_row.created_at DESC)
    FROM private.mcp_access_grants AS grant_row
    LEFT JOIN public.sistema_users AS person ON person.id = grant_row.user_id
    WHERE grant_row.revoked_at IS NULL
  ), '[]'::JSONB));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_list_mcp_grants$;

DO $grant_admin_rpcs$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.social_admin_set_mcp_social_access(uuid,uuid,boolean)',
    'public.social_admin_list_mcp_grants(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM mcp_authenticated', function_signature);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
  END LOOP;
END
$grant_admin_rpcs$;

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

-- Auditoría de exportaciones (solo agregados; nunca DMs ni notas).
CREATE OR REPLACE FUNCTION public.social_admin_record_export(p_actor UUID, p_op TEXT, p_params JSONB, p_rows INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $social_admin_record_export$
DECLARE
  social_err_detail TEXT;
BEGIN
  PERFORM private.social_require_admin(p_actor);
  PERFORM private.social_audit(p_actor, 'admin', NULL, 'export', p_op, 'export.downloaded',
    jsonb_build_object('params', p_params, 'rows', p_rows));
  RETURN private.social_ok(jsonb_build_object('recorded', true));
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS social_err_detail = PG_EXCEPTION_DETAIL;
  RETURN private.social_error(COALESCE(NULLIF(social_err_detail, ''), 'error'), SQLERRM);
END
$social_admin_record_export$;
REVOKE EXECUTE ON FUNCTION public.social_admin_record_export(uuid,text,jsonb,integer) FROM PUBLIC, anon, authenticated;
DO $export_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.social_admin_record_export(uuid,text,jsonb,integer) FROM mcp_authenticated;
  END IF;
END
$export_grants$;
GRANT EXECUTE ON FUNCTION public.social_admin_record_export(uuid,text,jsonb,integer) TO service_role;

NOTIFY pgrst, 'reload schema';
