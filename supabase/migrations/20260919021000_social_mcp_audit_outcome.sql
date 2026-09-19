-- private.mcp_social_run auditaba las lecturas exitosas con outcome
-- 'succeeded', pero private.mcp_audit_log solo acepta 'success', 'denied' o
-- 'failed': el INSERT violaba la restricción y toda llamada social del MCP
-- terminaba en error. Se recrea la función idéntica cambiando solo ese valor.
CREATE OR REPLACE FUNCTION private.mcp_social_run(p_op text, p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
