-- Facturación electrónica ARCA (ex AFIP) para cobros de clientes.
--
-- * public.accounting_invoices: un comprobante por intento de facturar un
--   cobro. Solo lectura para admins; toda escritura pasa por RPC.
-- * private.arca_store / private.arca_store_locks: el store durable que exige
--   el SDK `facturas` para no duplicar comprobantes ni pedir otro ticket WSAA
--   mientras el anterior sigue vigente. Nunca se borran reservas.
-- * RPC con doble autorización: sesión web de un admin, o token MCP con la
--   capacidad accounting.invoice.write de un admin. La clave privada de ARCA
--   vive solo en el servidor web; el MCP no la conoce.
-- * Un cobro con comprobante de producción autorizado, pendiente o en
--   conflicto no se puede borrar (ni anular por MCP): ARCA no anula
--   comprobantes y la corrección es una nota de crédito.

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

CREATE TABLE public.accounting_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL
    REFERENCES public.accounting_client_payments(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'authorized',
      'rejected',
      'indeterminate',
      'conflict',
      'discarded'
    )
  ),
  idempotency_key TEXT NOT NULL UNIQUE,
  issuer_condition TEXT NOT NULL CHECK (
    issuer_condition IN ('monotributo', 'responsable_inscripto', 'exento', 'no_alcanzado')
  ),
  sales_point INTEGER NOT NULL CHECK (sales_point BETWEEN 1 AND 99998),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
  voucher_date DATE NOT NULL,
  service_from DATE NOT NULL,
  service_to DATE NOT NULL,
  payment_due_date DATE NOT NULL,
  receiver_condition TEXT NOT NULL CHECK (
    receiver_condition IN (
      'consumidor_final',
      'responsable_inscripto',
      'monotributo',
      'exento',
      'no_alcanzado'
    )
  ),
  receiver_doc_type TEXT CHECK (receiver_doc_type IN ('cuit', 'dni')),
  receiver_doc_number TEXT,
  receiver_name TEXT CHECK (char_length(receiver_name) <= 200),
  voucher_class TEXT CHECK (voucher_class IN ('A', 'B', 'C')),
  voucher_type INTEGER,
  voucher_number BIGINT,
  cae TEXT,
  cae_expiry DATE,
  qr_url TEXT,
  issues JSONB,
  evidence JSONB,
  -- Datos del emisor y del receptor tal como los informó el Padrón de ARCA al
  -- emitir, para reimprimir la factura igual aunque después cambien.
  fiscal_snapshot JSONB,
  last_error TEXT,
  created_via TEXT NOT NULL CHECK (created_via IN ('web', 'mcp')),
  mcp_client_id UUID,
  created_by UUID REFERENCES public.sistema_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  authorized_at TIMESTAMPTZ,
  CHECK (service_to >= service_from),
  CHECK (
    (receiver_doc_type IS NULL AND receiver_doc_number IS NULL)
    OR (receiver_doc_type = 'cuit' AND receiver_doc_number ~ '^[0-9]{11}$')
    OR (receiver_doc_type = 'dni' AND receiver_doc_number ~ '^[0-9]{7,8}$')
  ),
  CHECK (receiver_condition = 'consumidor_final' OR receiver_doc_type = 'cuit'),
  CHECK (
    status <> 'authorized'
    OR (cae IS NOT NULL AND voucher_number IS NOT NULL AND voucher_type IS NOT NULL)
  )
);

COMMENT ON TABLE public.accounting_invoices IS
  'Comprobantes electrónicos ARCA emitidos (o intentados) por cada cobro. Escritura solo por RPC.';

-- Un cobro tiene como máximo un comprobante vivo por entorno. Los rechazados y
-- descartados no cuentan: el input corregido va con una clave nueva.
CREATE UNIQUE INDEX accounting_invoices_one_live_per_payment
  ON public.accounting_invoices(payment_id, environment)
  WHERE status NOT IN ('rejected', 'discarded');

CREATE INDEX accounting_invoices_payment_idx
  ON public.accounting_invoices(payment_id);
CREATE INDEX accounting_invoices_created_by_idx
  ON public.accounting_invoices(created_by);

CREATE TRIGGER trigger_accounting_invoices_updated_at
  BEFORE UPDATE ON public.accounting_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_accounting_updated_at();

ALTER TABLE public.accounting_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_invoices_admin_read
  ON public.accounting_invoices
  FOR SELECT TO authenticated
  USING ((SELECT public.sistema_is_admin((SELECT auth.uid()))));

REVOKE ALL ON public.accounting_invoices FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.accounting_invoices FROM authenticated;
GRANT SELECT ON public.accounting_invoices TO authenticated;

CREATE TABLE private.arca_store (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 512),
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.arca_store IS
  'Store durable del SDK facturas: reservas de numeración y tickets WSAA cifrados. No borrar reservas.';

CREATE TABLE private.arca_store_locks (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 512),
  owner UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

REVOKE ALL ON private.arca_store, private.arca_store_locks FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Capacidad MCP
-- ---------------------------------------------------------------------------

-- Emitir un comprobante fiscal es una decisión explícita del usuario: se
-- concede por defecto a los clientes OAuth nuevos y a los grants vigentes de
-- administradores, porque el MCP emite directo cuando se le pide.
INSERT INTO private.mcp_capabilities(capability, description, granted_by_default)
VALUES (
  'accounting.invoice.write',
  'Emitir en ARCA la factura electrónica de un cobro ya registrado. Solo administradores.',
  true
)
ON CONFLICT (capability) DO UPDATE SET granted_by_default = true;

INSERT INTO private.mcp_client_capabilities(client_id, capability)
SELECT DISTINCT grant_row.client_id, 'accounting.invoice.write'
FROM private.mcp_access_grants AS grant_row
WHERE grant_row.revoked_at IS NULL
  AND public.sistema_is_admin(grant_row.user_id)
ON CONFLICT DO NOTHING;

INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability)
SELECT grant_row.id, 'accounting.invoice.write'
FROM private.mcp_access_grants AS grant_row
WHERE grant_row.revoked_at IS NULL
  AND public.sistema_is_admin(grant_row.user_id)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Autorización compartida web / MCP
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.invoicing_authorize(
  p_action TEXT,
  p_consume_rate BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $invoicing_authorize$
DECLARE
  jwt_claims JSONB := COALESCE(auth.jwt(), '{}'::JSONB);
  caller_user_id UUID := auth.uid();
  authorization_result JSONB;
BEGIN
  IF NULLIF(jwt_claims ->> 'client_id', '') IS NOT NULL THEN
    authorization_result := private.mcp_authorize(
      'accounting.invoice.write',
      p_action,
      'write',
      p_consume_rate
    );
    IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
      RETURN authorization_result;
    END IF;
    caller_user_id := (authorization_result #>> '{data,user_id}')::UUID;
    IF NOT public.sistema_is_admin(caller_user_id) THEN
      RETURN private.mcp_error(
        'forbidden',
        'Only Quepia administrators can issue invoices.'
      );
    END IF;
    RETURN private.mcp_ok(
      jsonb_build_object(
        'user_id', caller_user_id,
        'via', 'mcp',
        'client_id', authorization_result #>> '{data,client_id}',
        'session_id', authorization_result #>> '{data,session_id}'
      )
    );
  END IF;

  IF caller_user_id IS NULL OR COALESCE(jwt_claims ->> 'role', '') <> 'authenticated' THEN
    RETURN private.mcp_error('unauthenticated', 'A valid web session is required.');
  END IF;

  IF NOT public.sistema_is_admin(caller_user_id)
    OR NOT private.sistema_user_is_authorized(caller_user_id)
  THEN
    RETURN private.mcp_error(
      'forbidden',
      'Only Quepia administrators can issue invoices.'
    );
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object('user_id', caller_user_id, 'via', 'web')
  );
END
$invoicing_authorize$;

REVOKE EXECUTE ON FUNCTION private.invoicing_authorize(TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Store del SDK
-- ---------------------------------------------------------------------------

-- Una sola RPC con `op` para no multiplicar entradas en la allowlist.
-- add es atómico (INSERT ... ON CONFLICT DO NOTHING) y nunca pisa un valor.
-- lock toma o recupera un bloqueo vencido; unlock solo lo suelta su dueño.
CREATE OR REPLACE FUNCTION public.accounting_invoice_store(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $accounting_invoice_store$
DECLARE
  authorization_result JSONB;
  op_value TEXT := p_request ->> 'op';
  key_value TEXT := p_request ->> 'key';
  value_text TEXT := p_request ->> 'value';
  owner_value UUID;
  ttl_seconds INTEGER;
  stored_value TEXT;
  affected_key TEXT;
BEGIN
  authorization_result := private.invoicing_authorize('accounting_invoice_store', false);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR op_value IS NULL
    OR key_value IS NULL
    OR char_length(key_value) NOT BETWEEN 1 AND 512
  THEN
    RETURN private.mcp_error('invalid_request', 'op and key are required.');
  END IF;

  IF op_value = 'get' THEN
    SELECT store.value INTO stored_value
    FROM private.arca_store AS store
    WHERE store.key = key_value;
    RETURN private.mcp_ok(jsonb_build_object('value', stored_value));
  END IF;

  IF op_value IN ('set', 'add') THEN
    IF value_text IS NULL OR octet_length(value_text) > 1048576 THEN
      RETURN private.mcp_error('invalid_request', 'value is required and must be under 1 MiB.');
    END IF;
    IF op_value = 'set' THEN
      INSERT INTO private.arca_store(key, value, updated_at)
      VALUES (key_value, value_text, now())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = now();
      RETURN private.mcp_ok(jsonb_build_object('written', true));
    END IF;
    INSERT INTO private.arca_store(key, value, updated_at)
    VALUES (key_value, value_text, now())
    ON CONFLICT (key) DO NOTHING
    RETURNING key INTO affected_key;
    RETURN private.mcp_ok(jsonb_build_object('added', affected_key IS NOT NULL));
  END IF;

  IF op_value = 'delete' THEN
    -- El SDK solo borra registros de coordinación; las reservas
    -- arca:v1:attempt y arca:v1:settled son evidencia y se conservan siempre.
    IF key_value LIKE 'arca:v1:attempt:%' OR key_value LIKE 'arca:v1:settled:%' THEN
      RETURN private.mcp_error('forbidden', 'Reservation records are never deleted.');
    END IF;
    DELETE FROM private.arca_store AS store WHERE store.key = key_value;
    RETURN private.mcp_ok(jsonb_build_object('deleted', true));
  END IF;

  owner_value := private.mcp_parse_uuid(p_request ->> 'owner');
  IF owner_value IS NULL THEN
    RETURN private.mcp_error('invalid_request', 'owner must be a UUID.');
  END IF;

  IF op_value = 'lock' THEN
    ttl_seconds := LEAST(GREATEST(COALESCE((p_request ->> 'ttl_seconds')::INTEGER, 120), 5), 600);
    INSERT INTO private.arca_store_locks AS lock_row(key, owner, expires_at)
    VALUES (key_value, owner_value, clock_timestamp() + make_interval(secs => ttl_seconds))
    ON CONFLICT (key) DO UPDATE
      SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
      WHERE lock_row.expires_at < clock_timestamp()
         OR lock_row.owner = EXCLUDED.owner
    RETURNING lock_row.key INTO affected_key;
    RETURN private.mcp_ok(jsonb_build_object('acquired', affected_key IS NOT NULL));
  END IF;

  IF op_value = 'unlock' THEN
    DELETE FROM private.arca_store_locks AS lock_row
    WHERE lock_row.key = key_value AND lock_row.owner = owner_value;
    RETURN private.mcp_ok(jsonb_build_object('released', true));
  END IF;

  RETURN private.mcp_error('invalid_request', 'Unknown op.');
END
$accounting_invoice_store$;

-- ---------------------------------------------------------------------------
-- 5. Inicio de una emisión
-- ---------------------------------------------------------------------------

-- Crea (o retoma) el comprobante de un cobro. El importe sale siempre del
-- cobro, nunca del pedido. Si ya hay uno pendiente o indeterminado para ese
-- cobro y entorno, se devuelve ese mismo con resumed = true: el servidor web
-- lo reintenta con la misma clave y el mismo input guardado.
CREATE OR REPLACE FUNCTION public.accounting_invoice_begin(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $accounting_invoice_begin$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  payment_row public.accounting_client_payments%ROWTYPE;
  existing_invoice public.accounting_invoices%ROWTYPE;
  new_invoice public.accounting_invoices%ROWTYPE;
  environment_value TEXT := p_request ->> 'environment';
  receiver JSONB := p_request -> 'receiver';
  receiver_condition_value TEXT;
  doc_type_value TEXT;
  doc_number_value TEXT;
  receiver_name_value TEXT;
  invoice_id_value UUID := gen_random_uuid();
  voucher_date_value DATE;
  service_from_value DATE;
  service_to_value DATE;
BEGIN
  authorization_result := private.invoicing_authorize('accounting_invoice_begin', true);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY[
        'payment_id',
        'environment',
        'sales_point',
        'issuer_condition',
        'voucher_date',
        'service_from',
        'service_to',
        'payment_due_date',
        'receiver'
      ]
    )
    OR private.mcp_parse_uuid(p_request ->> 'payment_id') IS NULL
    OR environment_value NOT IN ('test', 'production')
    OR jsonb_typeof(receiver) <> 'object'
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'payment_id, environment and receiver are required.'
    );
  END IF;

  SELECT * INTO payment_row
  FROM public.accounting_client_payments AS payment
  WHERE payment.id = (p_request ->> 'payment_id')::UUID
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.mcp_error('payment_not_found', 'The payment does not exist.');
  END IF;
  IF payment_row.status <> 'paid' THEN
    RETURN private.mcp_error('payment_not_paid', 'Only received payments can be invoiced.');
  END IF;
  IF payment_row.currency <> 'ARS' THEN
    RETURN private.mcp_error(
      'unsupported_currency',
      'Only ARS payments can be invoiced for now.'
    );
  END IF;

  SELECT * INTO existing_invoice
  FROM public.accounting_invoices AS invoice
  WHERE invoice.payment_id = payment_row.id
    AND invoice.environment = environment_value
    AND invoice.status NOT IN ('rejected', 'discarded')
  ORDER BY invoice.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF existing_invoice.status = 'conflict' THEN
      RETURN private.mcp_error(
        'invoice_conflict',
        'ARCA reported another voucher in the reserved number. A person must review it before retrying.',
        jsonb_build_object('invoice', to_jsonb(existing_invoice))
      );
    END IF;
    RETURN private.mcp_ok(
      jsonb_build_object(
        'invoice', to_jsonb(existing_invoice),
        'resumed', existing_invoice.status IN ('pending', 'indeterminate'),
        'already_authorized', existing_invoice.status = 'authorized'
      )
    );
  END IF;

  receiver_condition_value := receiver ->> 'condition';
  doc_type_value := NULLIF(receiver ->> 'doc_type', '');
  doc_number_value := NULLIF(regexp_replace(COALESCE(receiver ->> 'doc_number', ''), '[^0-9]', '', 'g'), '');
  receiver_name_value := NULLIF(btrim(COALESCE(receiver ->> 'name', '')), '');

  IF receiver_condition_value IS NULL
    OR receiver_condition_value NOT IN (
      'consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_alcanzado'
    )
  THEN
    RETURN private.mcp_error('invalid_receiver', 'Unknown receiver IVA condition.');
  END IF;
  IF (doc_type_value IS NULL) <> (doc_number_value IS NULL)
    OR (doc_type_value IS NOT NULL AND doc_type_value NOT IN ('cuit', 'dni'))
    OR (doc_type_value = 'cuit' AND doc_number_value !~ '^[0-9]{11}$')
    OR (doc_type_value = 'dni' AND doc_number_value !~ '^[0-9]{7,8}$')
  THEN
    RETURN private.mcp_error(
      'invalid_receiver',
      'The receiver document must be an 11-digit CUIT or a 7-8 digit DNI.'
    );
  END IF;
  IF receiver_condition_value <> 'consumidor_final' AND doc_type_value IS DISTINCT FROM 'cuit' THEN
    RETURN private.mcp_error(
      'invalid_receiver',
      'A receiver other than consumidor final requires a CUIT.'
    );
  END IF;

  -- Por defecto: la factura es de hoy en Buenos Aires y el servicio facturado
  -- es el mes al que se imputó el cobro.
  BEGIN
    voucher_date_value := COALESCE(
      (p_request ->> 'voucher_date')::DATE,
      (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE
    );
    service_from_value := COALESCE(
      (p_request ->> 'service_from')::DATE,
      make_date(payment_row.year, payment_row.month, 1)
    );
    service_to_value := COALESCE(
      (p_request ->> 'service_to')::DATE,
      (make_date(payment_row.year, payment_row.month, 1) + INTERVAL '1 month - 1 day')::DATE
    );
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN private.mcp_error('invalid_request', 'Dates must use YYYY-MM-DD.');
  END;

  BEGIN
    INSERT INTO public.accounting_invoices(
      id,
      payment_id,
      environment,
      status,
      idempotency_key,
      issuer_condition,
      sales_point,
      amount_cents,
      currency,
      voucher_date,
      service_from,
      service_to,
      payment_due_date,
      receiver_condition,
      receiver_doc_type,
      receiver_doc_number,
      receiver_name,
      created_via,
      mcp_client_id,
      created_by
    )
    VALUES (
      invoice_id_value,
      payment_row.id,
      environment_value,
      'pending',
      'invoice:' || invoice_id_value::TEXT,
      p_request ->> 'issuer_condition',
      (p_request ->> 'sales_point')::INTEGER,
      (round(payment_row.amount * 100))::BIGINT,
      'ARS',
      voucher_date_value,
      service_from_value,
      service_to_value,
      GREATEST(
        COALESCE((p_request ->> 'payment_due_date')::DATE, voucher_date_value),
        voucher_date_value
      ),
      receiver_condition_value,
      doc_type_value,
      doc_number_value,
      left(receiver_name_value, 200),
      context_data ->> 'via',
      private.mcp_parse_uuid(context_data ->> 'client_id'),
      (context_data ->> 'user_id')::UUID
    )
    RETURNING * INTO new_invoice;
  EXCEPTION
    WHEN check_violation OR invalid_datetime_format OR datetime_field_overflow
      OR invalid_text_representation OR not_null_violation THEN
      RETURN private.mcp_error('invalid_request', 'The invoice data is not valid.');
    WHEN unique_violation THEN
      RETURN private.mcp_error(
        'invoice_in_progress',
        'Another invoice for this payment is being issued. Retry in a moment.'
      );
  END;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'invoice', to_jsonb(new_invoice),
      'resumed', false,
      'already_authorized', false
    )
  );
END
$accounting_invoice_begin$;

-- ---------------------------------------------------------------------------
-- 6. Resultado de una emisión
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accounting_invoice_complete(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $accounting_invoice_complete$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  invoice_row public.accounting_invoices%ROWTYPE;
  status_value TEXT := p_request ->> 'status';
BEGIN
  authorization_result := private.invoicing_authorize('accounting_invoice_complete', false);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR private.mcp_parse_uuid(p_request ->> 'invoice_id') IS NULL
    OR status_value NOT IN (
      'pending', 'authorized', 'rejected', 'indeterminate', 'conflict', 'discarded'
    )
  THEN
    RETURN private.mcp_error('invalid_request', 'invoice_id and a valid status are required.');
  END IF;

  SELECT * INTO invoice_row
  FROM public.accounting_invoices AS invoice
  WHERE invoice.id = (p_request ->> 'invoice_id')::UUID
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.mcp_error('invoice_not_found', 'The invoice does not exist.');
  END IF;

  -- Un comprobante cerrado no cambia: authorized y conflict son definitivos
  -- y rejected/discarded liberan el cobro para una clave nueva.
  IF invoice_row.status NOT IN ('pending', 'indeterminate') THEN
    RETURN private.mcp_ok(jsonb_build_object('invoice', to_jsonb(invoice_row)));
  END IF;

  IF status_value = 'authorized' THEN
    UPDATE public.accounting_invoices AS invoice
    SET status = 'authorized',
        voucher_class = p_request ->> 'voucher_class',
        voucher_type = (p_request ->> 'voucher_type')::INTEGER,
        voucher_number = (p_request ->> 'voucher_number')::BIGINT,
        voucher_date = COALESCE((p_request ->> 'voucher_date')::DATE, invoice.voucher_date),
        cae = p_request ->> 'cae',
        cae_expiry = (p_request ->> 'cae_expiry')::DATE,
        qr_url = p_request ->> 'qr_url',
        evidence = p_request -> 'evidence',
        issues = NULL,
        last_error = NULL,
        authorized_at = now()
    WHERE invoice.id = invoice_row.id
    RETURNING * INTO invoice_row;

    -- El número fiscal real queda también en el cobro, donde ya lo mira la
    -- contabilidad. Los comprobantes de homologación no tienen validez fiscal.
    IF invoice_row.environment = 'production' THEN
      UPDATE public.accounting_client_payments AS payment
      SET invoice_number = invoice_row.voucher_class || ' '
        || lpad(invoice_row.sales_point::TEXT, 5, '0') || '-'
        || lpad(invoice_row.voucher_number::TEXT, 8, '0')
      WHERE payment.id = invoice_row.payment_id;
    END IF;

    IF context_data ->> 'via' = 'mcp' THEN
      PERFORM private.mcp_audit_event(
        'accounting.invoice.issued',
        'accounting_invoice_complete',
        'success',
        (context_data ->> 'user_id')::UUID,
        private.mcp_parse_uuid(context_data ->> 'client_id'),
        private.mcp_parse_uuid(context_data ->> 'session_id'),
        NULL,
        'accounting.invoice.write',
        jsonb_build_object(
          'invoice_id', invoice_row.id,
          'payment_id', invoice_row.payment_id,
          'environment', invoice_row.environment,
          'voucher_number', invoice_row.voucher_number
        )
      );
    END IF;
  ELSE
    UPDATE public.accounting_invoices AS invoice
    SET status = status_value,
        voucher_type = COALESCE((p_request ->> 'voucher_type')::INTEGER, invoice.voucher_type),
        voucher_number = COALESCE((p_request ->> 'voucher_number')::BIGINT, invoice.voucher_number),
        issues = COALESCE(p_request -> 'issues', invoice.issues),
        evidence = COALESCE(p_request -> 'evidence', invoice.evidence),
        last_error = left(p_request ->> 'last_error', 2000)
    WHERE invoice.id = invoice_row.id
    RETURNING * INTO invoice_row;
  END IF;

  RETURN private.mcp_ok(jsonb_build_object('invoice', to_jsonb(invoice_row)));
EXCEPTION
  WHEN check_violation OR invalid_datetime_format OR datetime_field_overflow
    OR invalid_text_representation THEN
    RETURN private.mcp_error('invalid_request', 'The invoice result is not valid.');
END
$accounting_invoice_complete$;

-- ---------------------------------------------------------------------------
-- 6b. Datos fiscales para la representación impresa
-- ---------------------------------------------------------------------------

-- Guarda la foto del Padrón de un comprobante autorizado. Solo se reemplaza
-- una foto armada sin el Padrón; una del Padrón queda fija.
CREATE OR REPLACE FUNCTION public.accounting_invoice_set_snapshot(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $accounting_invoice_set_snapshot$
DECLARE
  authorization_result JSONB;
  invoice_row public.accounting_invoices%ROWTYPE;
  snapshot JSONB := p_request -> 'snapshot';
BEGIN
  authorization_result := private.invoicing_authorize('accounting_invoice_set_snapshot', false);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR private.mcp_parse_uuid(p_request ->> 'invoice_id') IS NULL
    OR jsonb_typeof(snapshot) <> 'object'
    OR snapshot ->> 'source' NOT IN ('padron', 'fallback')
    OR octet_length(snapshot::TEXT) > 16384
  THEN
    RETURN private.mcp_error('invalid_request', 'invoice_id and a snapshot object are required.');
  END IF;

  UPDATE public.accounting_invoices AS invoice
  SET fiscal_snapshot = snapshot
  WHERE invoice.id = (p_request ->> 'invoice_id')::UUID
    AND invoice.status = 'authorized'
    AND (
      invoice.fiscal_snapshot IS NULL
      OR invoice.fiscal_snapshot ->> 'source' <> 'padron'
    )
  RETURNING * INTO invoice_row;

  IF NOT FOUND THEN
    SELECT * INTO invoice_row
    FROM public.accounting_invoices AS invoice
    WHERE invoice.id = (p_request ->> 'invoice_id')::UUID;
  END IF;

  RETURN private.mcp_ok(jsonb_build_object('invoice', to_jsonb(invoice_row)));
END
$accounting_invoice_set_snapshot$;

DO $invoicing_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.accounting_invoice_store(jsonb)',
    'public.accounting_invoice_begin(jsonb)',
    'public.accounting_invoice_complete(jsonb)',
    'public.accounting_invoice_set_snapshot(jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', function_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO mcp_authenticated', function_signature);
    END IF;
  END LOOP;
END
$invoicing_grants$;

-- ---------------------------------------------------------------------------
-- 7. Un cobro facturado no se borra
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.accounting_guard_invoiced_payment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $accounting_guard_invoiced_payment_delete$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.accounting_invoices AS invoice
    WHERE invoice.payment_id = OLD.id
      AND invoice.environment = 'production'
      AND invoice.status IN ('authorized', 'pending', 'indeterminate', 'conflict')
  ) THEN
    RAISE EXCEPTION
      'This payment has an ARCA invoice. Issue a credit note instead of deleting it.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END
$accounting_guard_invoiced_payment_delete$;

REVOKE EXECUTE ON FUNCTION private.accounting_guard_invoiced_payment_delete()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trigger_guard_invoiced_payment_delete
  BEFORE DELETE ON public.accounting_client_payments
  FOR EACH ROW EXECUTE FUNCTION private.accounting_guard_invoiced_payment_delete();

-- ---------------------------------------------------------------------------
-- 8. Allowlist de PostgREST para tokens OAuth
-- ---------------------------------------------------------------------------

-- Se recrea la función vigente (20260919020000) agregando solo las cuatro RPC de
-- facturación. El servidor web las llama con el token MCP del usuario cuando
-- el asistente pide emitir, así la autorización final sigue en Postgres.
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
