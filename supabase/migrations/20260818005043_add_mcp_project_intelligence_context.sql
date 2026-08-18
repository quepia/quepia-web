-- Contexto estrategico de clientes por MCP.
--
-- Expone un unico snapshot de solo lectura por proyecto. El RPC valida la
-- capacidad MCP y vuelve a comprobar acceso al proyecto antes de leer datos,
-- porque SECURITY DEFINER no debe depender de RLS para aislar clientes.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('private.mcp_capabilities') IS NULL
    OR to_regclass('public.sistema_projects') IS NULL
    OR to_regclass('public.sistema_client_briefs') IS NULL
    OR to_regclass('public.sistema_competitors') IS NULL
    OR to_regclass('public.sistema_strategy_documents') IS NULL
    OR to_regclass('public.sistema_research_sources') IS NULL
    OR to_regclass('public.sistema_opportunities') IS NULL
    OR to_regprocedure('private.mcp_authorize(text,text,text,boolean)') IS NULL
    OR to_regprocedure('public.sistema_can_access_project(uuid,uuid)') IS NULL
  THEN
    RAISE EXCEPTION
      'MCP intelligence prerequisites are missing; apply the MCP and strategy migrations first';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Capacidad de lectura y backfill de grants existentes
-- ---------------------------------------------------------------------------

INSERT INTO private.mcp_capabilities(capability, description)
VALUES (
  'intelligence.read',
  'Leer brief, estrategia aprobada, competidores, evidencia y oportunidades de proyectos autorizados.'
)
ON CONFLICT (capability) DO NOTHING;

UPDATE private.mcp_capabilities
SET granted_by_default = true
WHERE capability = 'intelligence.read';

INSERT INTO private.mcp_client_capabilities(client_id, capability)
SELECT policy.client_id, 'intelligence.read'
FROM private.mcp_client_policies AS policy
ON CONFLICT (client_id, capability) DO NOTHING;

INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability)
SELECT grant_record.id, 'intelligence.read'
FROM private.mcp_access_grants AS grant_record
WHERE grant_record.revoked_at IS NULL
ON CONFLICT (grant_id, capability) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Defensa en profundidad contra acceso OAuth directo a tablas
-- ---------------------------------------------------------------------------

DO $intelligence_oauth_fence$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sistema_client_briefs',
    'sistema_competitors',
    'sistema_research_runs',
    'sistema_strategy_documents',
    'sistema_research_sources',
    'sistema_opportunities'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_select ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated, mcp_authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_insert ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated, mcp_authenticated WITH CHECK (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_update ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated, mcp_authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL) WITH CHECK (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS sistema_deny_oauth_direct_delete ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY sistema_deny_oauth_direct_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated, mcp_authenticated USING (((SELECT auth.jwt()) ->> ''client_id'') IS NULL)',
      table_name
    );

    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM mcp_authenticated',
      table_name
    );
  END LOOP;
END
$intelligence_oauth_fence$;

-- ---------------------------------------------------------------------------
-- 3. Snapshot operativo del proyecto
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_intelligence_get_project_context(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_intelligence_get_project_context$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  user_id_value UUID;
  has_project_id BOOLEAN;
  has_project_query BOOLEAN;
  project_id_value UUID;
  project_query_value TEXT;
  project_match_count INTEGER;
  project_candidates JSONB;
  include_sources_value BOOLEAN := true;
  project_payload JSONB;
  brief_payload JSONB;
  active_documents_payload JSONB := '[]'::JSONB;
  latest_documents_payload JSONB := '[]'::JSONB;
  competitors_payload JSONB := '[]'::JSONB;
  opportunities_payload JSONB := '[]'::JSONB;
  sources_payload JSONB := '[]'::JSONB;
  research_payload JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['project_id', 'project_query', 'include_sources']
    )
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'Only project_id, project_query, and include_sources are accepted.'
    );
  END IF;

  has_project_id := (p_request ? 'project_id')
    AND jsonb_typeof(p_request -> 'project_id') <> 'null';
  has_project_query := (p_request ? 'project_query')
    AND jsonb_typeof(p_request -> 'project_query') <> 'null';

  IF has_project_id = has_project_query THEN
    RETURN private.mcp_error(
      'invalid_project_selector',
      'Supply exactly one of project_id or project_query.'
    );
  END IF;

  IF p_request ? 'include_sources' THEN
    IF jsonb_typeof(p_request -> 'include_sources') <> 'boolean' THEN
      RETURN private.mcp_error(
        'invalid_include_sources',
        'include_sources must be a boolean.'
      );
    END IF;
    include_sources_value := (p_request ->> 'include_sources')::BOOLEAN;
  END IF;

  authorization_result := private.mcp_authorize(
    'intelligence.read',
    'mcp_intelligence_get_project_context',
    'read'
  );
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';
  user_id_value := (context_data ->> 'user_id')::UUID;

  IF has_project_id THEN
    IF jsonb_typeof(p_request -> 'project_id') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_project_id',
        'project_id must be a UUID string.'
      );
    END IF;
    project_id_value := private.mcp_parse_uuid(p_request ->> 'project_id');
    IF project_id_value IS NULL THEN
      RETURN private.mcp_error(
        'invalid_project_id',
        'project_id must be a UUID.'
      );
    END IF;
    IF NOT public.sistema_can_access_project(project_id_value, user_id_value) THEN
      RETURN private.mcp_error(
        'project_not_found',
        'project_id does not identify an accessible project.'
      );
    END IF;
  ELSE
    IF jsonb_typeof(p_request -> 'project_query') <> 'string' THEN
      RETURN private.mcp_error(
        'invalid_project_query',
        'project_query must be a string.'
      );
    END IF;
    project_query_value := BTRIM(p_request ->> 'project_query');
    IF char_length(project_query_value) NOT BETWEEN 1 AND 200 THEN
      RETURN private.mcp_error(
        'invalid_project_query',
        'project_query must contain 1-200 characters.'
      );
    END IF;

    SELECT
      COUNT(*)::INTEGER,
      COALESCE(
        jsonb_agg(
          jsonb_build_object('id', candidate.id, 'name', candidate.nombre)
          ORDER BY candidate.nombre, candidate.id
        ),
        '[]'::JSONB
      )
    INTO project_match_count, project_candidates
    FROM (
      SELECT project.id, project.nombre
      FROM public.sistema_projects AS project
      WHERE project.nombre ILIKE '%' || project_query_value || '%'
        AND public.sistema_can_access_project(project.id, user_id_value)
      ORDER BY project.nombre, project.id
      LIMIT 6
    ) AS candidate;

    IF project_match_count = 0 THEN
      RETURN private.mcp_error(
        'project_not_found',
        'project_query did not match an accessible project.'
      );
    ELSIF project_match_count > 1 THEN
      RETURN private.mcp_error(
        'ambiguous_project_query',
        'project_query matched more than one accessible project.',
        jsonb_build_object('candidates', project_candidates)
      );
    END IF;
    project_id_value := (project_candidates -> 0 ->> 'id')::UUID;
  END IF;

  SELECT jsonb_build_object(
    'id', project.id,
    'name', project.nombre,
    'description', project.descripcion,
    'parent_id', project.parent_id,
    'resources', COALESCE(project.resources, '[]'::JSONB),
    'updated_at', project.updated_at
  )
  INTO project_payload
  FROM public.sistema_projects AS project
  WHERE project.id = project_id_value;

  SELECT to_jsonb(brief)
  INTO brief_payload
  FROM public.sistema_client_briefs AS brief
  WHERE brief.project_id = project_id_value;

  WITH ranked_active AS (
    SELECT
      document.*,
      row_number() OVER (
        PARTITION BY document.document_type
        ORDER BY document.version DESC, document.updated_at DESC, document.id DESC
      ) AS rank
    FROM public.sistema_strategy_documents AS document
    WHERE document.project_id = project_id_value
      AND document.status IN ('reviewed', 'published')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', active.id,
        'document_type', active.document_type,
        'title', active.title,
        'status', active.status,
        'version', active.version,
        'content', active.content,
        'source_run_id', active.source_run_id,
        'generated_at', active.generated_at,
        'reviewed_at', active.reviewed_at,
        'published_at', active.published_at,
        'updated_at', active.updated_at
      )
      ORDER BY CASE active.document_type
        WHEN 'product_information' THEN 1
        WHEN 'marketing_strategy' THEN 2
        WHEN 'competitor_analysis' THEN 3
        WHEN 'brand_voice' THEN 4
        WHEN 'content_strategy' THEN 5
        ELSE 6
      END
    ),
    '[]'::JSONB
  )
  INTO active_documents_payload
  FROM ranked_active AS active
  WHERE active.rank = 1;

  WITH ranked_latest AS (
    SELECT
      document.*,
      row_number() OVER (
        PARTITION BY document.document_type
        ORDER BY document.version DESC, document.updated_at DESC, document.id DESC
      ) AS rank
    FROM public.sistema_strategy_documents AS document
    WHERE document.project_id = project_id_value
  ),
  ranked_active AS (
    SELECT
      document.*,
      row_number() OVER (
        PARTITION BY document.document_type
        ORDER BY document.version DESC, document.updated_at DESC, document.id DESC
      ) AS rank
    FROM public.sistema_strategy_documents AS document
    WHERE document.project_id = project_id_value
      AND document.status IN ('reviewed', 'published')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'document_type', latest.document_type,
        'latest_document_id', latest.id,
        'latest_version', latest.version,
        'latest_status', latest.status,
        'active_document_id', active.id,
        'active_version', active.version,
        'has_unreviewed_update', active.id IS NULL OR latest.id <> active.id,
        'latest_updated_at', latest.updated_at
      )
      ORDER BY CASE latest.document_type
        WHEN 'product_information' THEN 1
        WHEN 'marketing_strategy' THEN 2
        WHEN 'competitor_analysis' THEN 3
        WHEN 'brand_voice' THEN 4
        WHEN 'content_strategy' THEN 5
        ELSE 6
      END
    ),
    '[]'::JSONB
  )
  INTO latest_documents_payload
  FROM ranked_latest AS latest
  LEFT JOIN ranked_active AS active
    ON active.document_type = latest.document_type
    AND active.rank = 1
  WHERE latest.rank = 1;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', competitor.id,
        'name', competitor.name,
        'website_url', competitor.website_url,
        'category', competitor.category,
        'notes', competitor.notes,
        'updated_at', competitor.updated_at
      )
      ORDER BY competitor.created_at, competitor.id
    ),
    '[]'::JSONB
  )
  INTO competitors_payload
  FROM public.sistema_competitors AS competitor
  WHERE competitor.project_id = project_id_value
    AND competitor.is_active;

  WITH ranked_active AS (
    SELECT
      document.id,
      row_number() OVER (
        PARTITION BY document.document_type
        ORDER BY document.version DESC, document.updated_at DESC, document.id DESC
      ) AS rank
    FROM public.sistema_strategy_documents AS document
    WHERE document.project_id = project_id_value
      AND document.status IN ('reviewed', 'published')
  )
  SELECT COALESCE(
    jsonb_agg(opportunity_payload.value ORDER BY opportunity_payload.ordinal),
    '[]'::JSONB
  )
  INTO opportunities_payload
  FROM (
    SELECT
      jsonb_build_object(
        'id', opportunity.id,
        'document_id', opportunity.document_id,
        'title', opportunity.title,
        'description', opportunity.description,
        'impact', opportunity.impact,
        'effort', opportunity.effort,
        'confidence', opportunity.confidence,
        'evidence', opportunity.evidence,
        'status', opportunity.status,
        'linked_task_id', opportunity.linked_task_id,
        'updated_at', opportunity.updated_at
      ) AS value,
      row_number() OVER (
        ORDER BY
          CASE opportunity.impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          opportunity.confidence DESC,
          opportunity.created_at,
          opportunity.id
      ) AS ordinal
    FROM public.sistema_opportunities AS opportunity
    JOIN ranked_active AS active
      ON active.id = opportunity.document_id
      AND active.rank = 1
    WHERE opportunity.project_id = project_id_value
      AND opportunity.status <> 'dismissed'
    ORDER BY
      CASE opportunity.impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      opportunity.confidence DESC,
      opportunity.created_at,
      opportunity.id
    LIMIT 100
  ) AS opportunity_payload;

  IF include_sources_value THEN
    WITH ranked_active AS (
      SELECT
        document.source_run_id,
        row_number() OVER (
          PARTITION BY document.document_type
          ORDER BY document.version DESC, document.updated_at DESC, document.id DESC
        ) AS rank
      FROM public.sistema_strategy_documents AS document
      WHERE document.project_id = project_id_value
        AND document.status IN ('reviewed', 'published')
    )
    SELECT COALESCE(
      jsonb_agg(source_payload.value ORDER BY source_payload.ordinal),
      '[]'::JSONB
    )
    INTO sources_payload
    FROM (
      SELECT
        jsonb_build_object(
          'id', source.id,
          'run_id', source.run_id,
          'title', source.title,
          'url', source.url,
          'source_type', source.source_type,
          'accessed_at', source.accessed_at
        ) AS value,
        row_number() OVER (
          ORDER BY source.accessed_at DESC, source.id DESC
        ) AS ordinal
      FROM public.sistema_research_sources AS source
      WHERE source.project_id = project_id_value
        AND source.run_id IN (
          SELECT active.source_run_id
          FROM ranked_active AS active
          WHERE active.rank = 1
            AND active.source_run_id IS NOT NULL
        )
      ORDER BY source.accessed_at DESC, source.id DESC
      LIMIT 100
    ) AS source_payload;
  END IF;

  SELECT jsonb_build_object(
    'id', research_run.id,
    'status', research_run.status,
    'model_id', research_run.model_id,
    'started_at', research_run.started_at,
    'completed_at', research_run.completed_at,
    'created_at', research_run.created_at
  )
  INTO research_payload
  FROM public.sistema_research_runs AS research_run
  WHERE research_run.project_id = project_id_value
  ORDER BY research_run.created_at DESC, research_run.id DESC
  LIMIT 1;

  PERFORM private.mcp_audit_event(
    'intelligence.project_context.read',
    'mcp_intelligence_get_project_context',
    'success',
    user_id_value,
    (context_data ->> 'client_id')::UUID,
    (context_data ->> 'session_id')::UUID,
    NULL,
    'intelligence.read',
    jsonb_build_object(
      'project_id', project_id_value,
      'active_document_count', jsonb_array_length(active_documents_payload),
      'source_count', jsonb_array_length(sources_payload)
    )
  );

  RETURN private.mcp_ok(
    jsonb_build_object(
      'project', project_payload,
      'brief', brief_payload,
      'strategy', jsonb_build_object(
        'active_documents', active_documents_payload,
        'latest_document_status', latest_documents_payload
      ),
      'competitors', competitors_payload,
      'opportunities', opportunities_payload,
      'sources', sources_payload,
      'latest_research_run', research_payload,
      'context_hierarchy', jsonb_build_array(
        'explicit_user_instruction',
        'client_brief',
        'human_reviewed_strategy',
        'research_evidence'
      ),
      'limits', jsonb_build_object(
        'opportunities', 100,
        'sources', CASE WHEN include_sources_value THEN 100 ELSE 0 END
      )
    )
  );
EXCEPTION
  WHEN invalid_text_representation
    OR invalid_parameter_value
    OR character_not_in_repertoire
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'The project selector is malformed.'
    );
  WHEN OTHERS THEN
    RETURN private.mcp_error(
      'intelligence_read_failed',
      'Project intelligence could not be read.'
    );
END
$mcp_intelligence_get_project_context$;

COMMENT ON FUNCTION public.mcp_intelligence_get_project_context(JSONB) IS
  'Devuelve el brief, los documentos humanos activos, competencia, oportunidades y evidencia de un proyecto accesible por MCP.';

-- ---------------------------------------------------------------------------
-- 4. Allowlist PostgREST y permisos exactos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mcp_postgrest_pre_request()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mcp_postgrest_pre_request$
DECLARE
  raw_client_id TEXT := NULLIF(auth.jwt() ->> 'client_id', '');
  client_id_value UUID;
  jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
  request_path TEXT;
  request_method TEXT;
BEGIN
  IF raw_client_id IS NULL THEN
    IF jwt_role = 'mcp_authenticated' THEN
      RAISE EXCEPTION
        'The isolated MCP role requires a valid OAuth client_id'
        USING ERRCODE = '42501';
    END IF;

    RETURN;
  END IF;

  client_id_value := private.mcp_parse_uuid(raw_client_id);
  IF client_id_value IS NULL
    OR jwt_role <> 'mcp_authenticated'
  THEN
    RAISE EXCEPTION
      'OAuth requests require the isolated MCP database role'
      USING ERRCODE = '42501';
  END IF;

  request_path := NULLIF(
    pg_catalog.current_setting('request.path', true),
    ''
  );
  request_method := NULLIF(
    UPPER(pg_catalog.current_setting('request.method', true)),
    ''
  );

  IF request_path IS NULL OR request_method IS NULL THEN
    RAISE EXCEPTION
      'PostgREST request metadata is required for OAuth requests'
      USING ERRCODE = '42501';
  END IF;

  request_path := pg_catalog.ltrim(request_path, '/');

  IF request_method <> 'POST'
    OR request_path <> ALL (
      ARRAY[
        'rpc/mcp_get_context',
        'rpc/mcp_accounting_list_accounts',
        'rpc/mcp_accounting_list_expenses',
        'rpc/mcp_accounting_list_recent_operations',
        'rpc/mcp_accounting_record_expense',
        'rpc/mcp_accounting_record_income',
        'rpc/mcp_accounting_record_transfer',
        'rpc/mcp_accounting_void_operation',
        'rpc/mcp_tasks_list_projects',
        'rpc/mcp_tasks_list_columns',
        'rpc/mcp_tasks_list_members',
        'rpc/mcp_tasks_search_tasks',
        'rpc/mcp_tasks_get_task',
        'rpc/mcp_tasks_create_task',
        'rpc/mcp_tasks_create_tasks_batch',
        'rpc/mcp_tasks_update_task',
        'rpc/mcp_tasks_add_subtasks',
        'rpc/mcp_tasks_update_subtask',
        'rpc/mcp_tasks_set_dependencies',
        'rpc/mcp_tasks_add_links',
        'rpc/mcp_tasks_create_column',
        'rpc/mcp_tasks_create_project',
        'rpc/mcp_tasks_post_update',
        'rpc/mcp_tasks_list_recent_operations',
        'rpc/mcp_tasks_void_operation',
        'rpc/mcp_intelligence_get_project_context'
      ]::TEXT[]
    )
  THEN
    RAISE EXCEPTION
      'OAuth Data API access is limited to the MCP machine RPC allowlist'
      USING ERRCODE = '42501';
  END IF;
END
$mcp_postgrest_pre_request$;

REVOKE EXECUTE ON FUNCTION public.mcp_postgrest_pre_request()
  FROM PUBLIC, mcp_authenticated, anon, authenticated, service_role,
    supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.mcp_postgrest_pre_request()
  TO mcp_authenticated, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mcp_intelligence_get_project_context(JSONB)
  FROM PUBLIC, anon, authenticated, service_role, mcp_authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_intelligence_get_project_context(JSONB)
  TO mcp_authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.mcp_postgrest_pre_request() IS
  'Limita el OAuth Data API a las RPC exactas de contabilidad, tareas e inteligencia del MCP.';

NOTIFY pgrst, 'reload schema';
