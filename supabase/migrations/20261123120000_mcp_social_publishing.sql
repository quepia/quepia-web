-- MCP: subir piezas y publicar en las redes del cliente vía Zernio.
--
-- * Nueva capacidad social.publish.write: concedida por defecto (como la
--   emisión de facturas), pero cada uso exige además administrador global.
-- * La clave de Zernio vive solo en la web. El servicio MCP reenvía el token
--   OAuth del usuario a /api/social/mcp/*, y la web llama a
--   social_publish_authorize antes de tocar Zernio o el almacenamiento.
-- * El perfil Zernio de cada cliente sale de sistema_zernio_profiles por
--   proyecto: nunca lo elige el modelo.

INSERT INTO private.mcp_capabilities(capability, description, granted_by_default)
VALUES (
  'social.publish.write',
  'Subir videos e imágenes a una tarjeta, cargar el copy y crear, programar, editar, cancelar o reintentar publicaciones en las cuentas Zernio del cliente. Solo administradores globales.',
  true
)
ON CONFLICT (capability) DO UPDATE SET granted_by_default = true;

INSERT INTO private.mcp_client_capabilities(client_id, capability)
SELECT DISTINCT grant_row.client_id, 'social.publish.write'
FROM private.mcp_access_grants AS grant_row
WHERE grant_row.revoked_at IS NULL
  AND private.social_is_global_admin(grant_row.user_id)
ON CONFLICT DO NOTHING;

INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability)
SELECT grant_row.id, 'social.publish.write'
FROM private.mcp_access_grants AS grant_row
WHERE grant_row.revoked_at IS NULL
  AND private.social_is_global_admin(grant_row.user_id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.social_publish_authorize(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $social_publish_authorize$
DECLARE
  action_value TEXT := COALESCE(p_request ->> 'action', '');
  rate_class TEXT := CASE WHEN p_request ->> 'rate_class' = 'read' THEN 'read' ELSE 'write' END;
  authorization_result JSONB;
  user_id_value UUID;
BEGIN
  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR action_value NOT IN (
      'social_list_publish_targets',
      'social_list_publications',
      'social_create_media_upload',
      'social_attach_media',
      'social_remove_media',
      'social_publish_task',
      'social_cancel_publication',
      'social_retry_publication'
    )
  THEN
    RETURN private.mcp_error('invalid_request', 'Unknown social publishing action.');
  END IF;

  authorization_result := private.mcp_authorize('social.publish.write', action_value, rate_class);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;

  user_id_value := (authorization_result #>> '{data,user_id}')::UUID;
  IF NOT private.social_is_global_admin(user_id_value) THEN
    PERFORM private.mcp_audit_event('authorization.denied', action_value, 'denied', user_id_value,
      NULL, NULL, NULL, 'social.publish.write', jsonb_build_object('reason', 'not_global_admin'));
    RETURN private.mcp_error('forbidden', 'Publishing requires an active, authorized global Quepia administrator.');
  END IF;

  PERFORM private.mcp_audit_event(
    CASE WHEN rate_class = 'read' THEN 'tool.read' ELSE 'tool.write' END,
    action_value, 'success', user_id_value, NULL, NULL, NULL, 'social.publish.write',
    jsonb_build_object(
      'project_id', p_request ->> 'project_id',
      'task_id', p_request ->> 'task_id',
      'publication_id', p_request ->> 'publication_id'
    )
  );

  RETURN private.mcp_ok(jsonb_build_object(
    'user_id', user_id_value,
    'client_id', authorization_result #>> '{data,client_id}',
    'session_id', authorization_result #>> '{data,session_id}'
  ));
END
$social_publish_authorize$;

REVOKE EXECUTE ON FUNCTION public.social_publish_authorize(JSONB) FROM PUBLIC, anon, authenticated;
DO $social_publish_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.social_publish_authorize(JSONB) TO mcp_authenticated;
  END IF;
END
$social_publish_grants$;

-- Allowlist de PostgREST para tokens OAuth: suma social_publish_authorize.
CREATE OR REPLACE FUNCTION public.mcp_postgrest_pre_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
        'rpc/accounting_invoice_begin',
        'rpc/accounting_invoice_complete',
        'rpc/accounting_invoice_store',
        'rpc/accounting_invoice_set_snapshot',
        'rpc/accounting_credit_note_begin',
        'rpc/accounting_credit_note_complete',
        'rpc/invoicing_settings_get',
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
        'rpc/mcp_social_get_attention_metrics',
        'rpc/social_publish_authorize'
      ]::TEXT[]
    )
  THEN
    RAISE EXCEPTION
      'OAuth Data API access is limited to the MCP machine RPC allowlist'
      USING ERRCODE = '42501';
  END IF;
END
$function$;
