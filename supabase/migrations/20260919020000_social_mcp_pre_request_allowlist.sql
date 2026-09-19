-- Las herramientas sociales del MCP (20260918120500) no estaban en la lista
-- de RPC permitidas del rol OAuth: toda llamada fallaba con "OAuth Data API
-- access is limited to the MCP machine RPC allowlist". Se recrea la función
-- idéntica, agregando solo las 10 RPC mcp_social_* de solo lectura.
CREATE OR REPLACE FUNCTION public.mcp_postgrest_pre_request()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'rpc/mcp_intelligence_get_project_context',
        'rpc/mcp_social_list_scopes',
        'rpc/mcp_social_get_metric_definitions',
        'rpc/mcp_social_get_data_coverage',
        'rpc/mcp_social_get_overview',
        'rpc/mcp_social_get_timeseries',
        'rpc/mcp_social_compare_periods',
        'rpc/mcp_social_rank_posts',
        'rpc/mcp_social_get_post_performance',
        'rpc/mcp_social_compare_formats',
        'rpc/mcp_social_get_attention_metrics'
      ]::TEXT[]
    )
  THEN
    RAISE EXCEPTION
      'OAuth Data API access is limited to the MCP machine RPC allowlist'
      USING ERRCODE = '42501';
  END IF;
END
$function$;
