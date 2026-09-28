-- Configuración de facturación ARCA administrada desde el sistema.
--
-- * private.invoicing_settings: una fila con los datos del emisor y el
--   entorno activo (homologación o producción).
-- * private.invoicing_credentials: una fila por entorno con el punto de venta,
--   el certificado y la clave privada. La clave se guarda cifrada con
--   AES-256-GCM por el servidor web con una clave maestra que la base nunca
--   ve (INVOICING_ENCRYPTION_KEY): acá solo vive el texto cifrado.
-- * Leer la configuración requiere la misma autorización que emitir (sesión
--   web de un admin o token MCP de un admin con accounting.invoice.write).
--   Cambiarla requiere una sesión web directa de un admin.

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

CREATE TABLE private.invoicing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  active_environment TEXT NOT NULL DEFAULT 'test'
    CHECK (active_environment IN ('test', 'production')),
  tax_id TEXT CHECK (tax_id ~ '^[0-9]{11}$'),
  issuer_condition TEXT CHECK (issuer_condition IN ('monotributo', 'exento', 'no_alcanzado')),
  issuer_name TEXT CHECK (char_length(issuer_name) BETWEEN 1 AND 200),
  issuer_address TEXT CHECK (char_length(issuer_address) BETWEEN 1 AND 300),
  issuer_activity_start DATE,
  issuer_gross_income TEXT CHECK (char_length(issuer_gross_income) BETWEEN 1 AND 40),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.sistema_users(id)
);

INSERT INTO private.invoicing_settings(id) VALUES (true);

CREATE TABLE private.invoicing_credentials (
  environment TEXT PRIMARY KEY CHECK (environment IN ('test', 'production')),
  sales_point INTEGER CHECK (sales_point BETWEEN 1 AND 99998),
  certificate_pem TEXT CHECK (char_length(certificate_pem) <= 20000),
  certificate_expires_at TIMESTAMPTZ,
  -- Texto cifrado "v1:<iv>:<tag>:<datos>" en base64; nunca la clave en claro.
  private_key_encrypted TEXT CHECK (
    private_key_encrypted IS NULL OR private_key_encrypted LIKE 'v1:%'
  ),
  csr_pem TEXT CHECK (char_length(csr_pem) <= 20000),
  key_created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.sistema_users(id)
);

INSERT INTO private.invoicing_credentials(environment) VALUES ('test'), ('production');

REVOKE ALL ON private.invoicing_settings, private.invoicing_credentials FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Lectura
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoicing_settings_get(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $invoicing_settings_get$
DECLARE
  authorization_result JSONB;
BEGIN
  authorization_result := private.invoicing_authorize('invoicing_settings_get', false);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'settings', (SELECT to_jsonb(settings) FROM private.invoicing_settings AS settings),
      'credentials', COALESCE(
        (
          SELECT jsonb_object_agg(credentials.environment, to_jsonb(credentials))
          FROM private.invoicing_credentials AS credentials
        ),
        '{}'::JSONB
      )
    )
  );
END
$invoicing_settings_get$;

-- ---------------------------------------------------------------------------
-- 3. Escritura
-- ---------------------------------------------------------------------------

-- Cada llamada cambia solo las claves que trae: `settings` para el emisor y el
-- entorno activo, `credentials` para un entorno. Una clave con null borra el
-- valor. Pasar a producción exige que ese entorno esté completo.
CREATE OR REPLACE FUNCTION public.invoicing_settings_save(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $invoicing_settings_save$
DECLARE
  authorization_result JSONB;
  caller_user_id UUID;
  settings_patch JSONB := p_request -> 'settings';
  credentials_patch JSONB := p_request -> 'credentials';
  environment_value TEXT := p_request ->> 'environment';
  target_row private.invoicing_credentials%ROWTYPE;
BEGIN
  authorization_result := private.invoicing_authorize('invoicing_settings_save', false);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  IF authorization_result #>> '{data,via}' <> 'web' THEN
    RETURN private.mcp_error('forbidden', 'Invoicing settings can only be changed from the web panel.');
  END IF;
  caller_user_id := (authorization_result #>> '{data,user_id}')::UUID;

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['settings', 'credentials', 'environment']
    )
    OR (settings_patch IS NOT NULL AND (
      jsonb_typeof(settings_patch) <> 'object'
      OR NOT private.mcp_json_has_only_keys(
        settings_patch,
        ARRAY[
          'active_environment', 'tax_id', 'issuer_condition', 'issuer_name',
          'issuer_address', 'issuer_activity_start', 'issuer_gross_income'
        ]
      )
    ))
    OR (credentials_patch IS NOT NULL AND (
      jsonb_typeof(credentials_patch) <> 'object'
      OR environment_value NOT IN ('test', 'production')
      OR NOT private.mcp_json_has_only_keys(
        credentials_patch,
        ARRAY[
          'sales_point', 'certificate_pem', 'certificate_expires_at',
          'private_key_encrypted', 'csr_pem', 'key_created_at'
        ]
      )
    ))
  THEN
    RETURN private.mcp_error('invalid_request', 'Unknown invoicing settings fields.');
  END IF;

  BEGIN
    IF credentials_patch IS NOT NULL THEN
      UPDATE private.invoicing_credentials AS credentials
      SET sales_point = CASE WHEN credentials_patch ? 'sales_point'
            THEN (credentials_patch ->> 'sales_point')::INTEGER ELSE credentials.sales_point END,
          certificate_pem = CASE WHEN credentials_patch ? 'certificate_pem'
            THEN credentials_patch ->> 'certificate_pem' ELSE credentials.certificate_pem END,
          certificate_expires_at = CASE WHEN credentials_patch ? 'certificate_expires_at'
            THEN (credentials_patch ->> 'certificate_expires_at')::TIMESTAMPTZ ELSE credentials.certificate_expires_at END,
          private_key_encrypted = CASE WHEN credentials_patch ? 'private_key_encrypted'
            THEN credentials_patch ->> 'private_key_encrypted' ELSE credentials.private_key_encrypted END,
          csr_pem = CASE WHEN credentials_patch ? 'csr_pem'
            THEN credentials_patch ->> 'csr_pem' ELSE credentials.csr_pem END,
          key_created_at = CASE WHEN credentials_patch ? 'key_created_at'
            THEN (credentials_patch ->> 'key_created_at')::TIMESTAMPTZ ELSE credentials.key_created_at END,
          updated_at = now(),
          updated_by = caller_user_id
      WHERE credentials.environment = environment_value;
    END IF;

    IF settings_patch IS NOT NULL THEN
      IF settings_patch ->> 'active_environment' = 'production' THEN
        SELECT * INTO target_row
        FROM private.invoicing_credentials AS credentials
        WHERE credentials.environment = 'production';
        IF target_row.sales_point IS NULL
          OR target_row.certificate_pem IS NULL
          OR target_row.private_key_encrypted IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM private.invoicing_settings AS settings
            WHERE settings.tax_id IS NOT NULL AND settings.issuer_condition IS NOT NULL
          )
        THEN
          RETURN private.mcp_error(
            'production_not_ready',
            'Production needs the issuer CUIT and condition, a sales point, a certificate and its private key.'
          );
        END IF;
      END IF;

      UPDATE private.invoicing_settings AS settings
      SET active_environment = CASE WHEN settings_patch ? 'active_environment'
            THEN settings_patch ->> 'active_environment' ELSE settings.active_environment END,
          tax_id = CASE WHEN settings_patch ? 'tax_id'
            THEN settings_patch ->> 'tax_id' ELSE settings.tax_id END,
          issuer_condition = CASE WHEN settings_patch ? 'issuer_condition'
            THEN settings_patch ->> 'issuer_condition' ELSE settings.issuer_condition END,
          issuer_name = CASE WHEN settings_patch ? 'issuer_name'
            THEN settings_patch ->> 'issuer_name' ELSE settings.issuer_name END,
          issuer_address = CASE WHEN settings_patch ? 'issuer_address'
            THEN settings_patch ->> 'issuer_address' ELSE settings.issuer_address END,
          issuer_activity_start = CASE WHEN settings_patch ? 'issuer_activity_start'
            THEN (settings_patch ->> 'issuer_activity_start')::DATE ELSE settings.issuer_activity_start END,
          issuer_gross_income = CASE WHEN settings_patch ? 'issuer_gross_income'
            THEN settings_patch ->> 'issuer_gross_income' ELSE settings.issuer_gross_income END,
          updated_at = now(),
          updated_by = caller_user_id
      WHERE settings.id;
    END IF;
  EXCEPTION
    WHEN check_violation OR invalid_datetime_format OR datetime_field_overflow
      OR invalid_text_representation THEN
      RETURN private.mcp_error('invalid_request', 'Some invoicing settings values are not valid.');
  END;

  RETURN public.invoicing_settings_get('{}'::JSONB);
END
$invoicing_settings_save$;

DO $invoicing_settings_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.invoicing_settings_get(jsonb)',
    'public.invoicing_settings_save(jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', function_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
  END LOOP;
  -- El MCP solo lee la configuración para emitir; nunca la cambia.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.invoicing_settings_get(jsonb) TO mcp_authenticated;
  END IF;
END
$invoicing_settings_grants$;

-- ---------------------------------------------------------------------------
-- 4. Allowlist de PostgREST para tokens OAuth
-- ---------------------------------------------------------------------------

-- Se recrea la función vigente (20260929000000) agregando solo la lectura de
-- la configuración, que la web necesita al emitir con el token del MCP.
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
