-- Notas de crédito ARCA sobre facturas emitidas por el sistema.
--
-- * public.accounting_credit_notes: cada nota corrige una factura autorizada,
--   por el total o por una parte. Escritura solo por RPC.
-- * El SDK no lleva la cuenta de notas anteriores: la suma de las notas vivas
--   de una factura nunca supera su total, y eso se controla acá con la factura
--   bloqueada.
-- * Una factura anulada del todo pasa a 'credited': deja de ocupar el cobro,
--   que puede volver a facturarse con los datos corregidos.
-- * Nada fiscal se borra: un cobro con comprobantes de producción no se puede
--   eliminar, y una factura con notas no se puede eliminar.

-- ---------------------------------------------------------------------------
-- 1. Factura anulada
-- ---------------------------------------------------------------------------

ALTER TABLE public.accounting_invoices
  DROP CONSTRAINT accounting_invoices_status_check;
ALTER TABLE public.accounting_invoices
  ADD CONSTRAINT accounting_invoices_status_check CHECK (
    status IN (
      'pending',
      'authorized',
      'rejected',
      'indeterminate',
      'conflict',
      'discarded',
      'credited'
    )
  );

DROP INDEX public.accounting_invoices_one_live_per_payment;
CREATE UNIQUE INDEX accounting_invoices_one_live_per_payment
  ON public.accounting_invoices(payment_id, environment)
  WHERE status NOT IN ('rejected', 'discarded', 'credited');

-- Igual que 20260928230000_invoice_description.sql, salvo que una factura
-- anulada ('credited') ya no ocupa el cobro.
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
  description_value TEXT := NULLIF(btrim(COALESCE(p_request ->> 'description', '')), '');
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
        'receiver',
        'description'
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

  IF char_length(description_value) > 500 THEN
    RETURN private.mcp_error('invalid_request', 'description must be at most 500 characters.');
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
    AND invoice.status NOT IN ('rejected', 'discarded', 'credited')
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
      description,
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
      description_value,
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
-- 2. Tabla
-- ---------------------------------------------------------------------------

CREATE TABLE public.accounting_credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL
    REFERENCES public.accounting_invoices(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'authorized', 'rejected', 'indeterminate', 'conflict', 'discarded')
  ),
  idempotency_key TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('total', 'partial')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  voucher_date DATE NOT NULL,
  sales_point INTEGER NOT NULL CHECK (sales_point BETWEEN 1 AND 99998),
  voucher_class TEXT CHECK (voucher_class IN ('A', 'B', 'C')),
  voucher_type INTEGER,
  voucher_number BIGINT,
  cae TEXT,
  cae_expiry DATE,
  qr_url TEXT,
  payment_due_date DATE,
  issues JSONB,
  evidence JSONB,
  last_error TEXT,
  created_via TEXT NOT NULL CHECK (created_via IN ('web', 'mcp')),
  mcp_client_id UUID,
  created_by UUID REFERENCES public.sistema_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  authorized_at TIMESTAMPTZ,
  CHECK (
    status <> 'authorized'
    OR (cae IS NOT NULL AND voucher_number IS NOT NULL AND voucher_type IS NOT NULL)
  )
);

COMMENT ON TABLE public.accounting_credit_notes IS
  'Notas de crédito ARCA emitidas (o intentadas) contra una factura. Escritura solo por RPC.';

-- Una sola nota en curso por factura: un reintento retoma esa misma.
CREATE UNIQUE INDEX accounting_credit_notes_one_open_per_invoice
  ON public.accounting_credit_notes(invoice_id)
  WHERE status IN ('pending', 'indeterminate');

CREATE INDEX accounting_credit_notes_invoice_idx
  ON public.accounting_credit_notes(invoice_id);
CREATE INDEX accounting_credit_notes_created_by_idx
  ON public.accounting_credit_notes(created_by);

CREATE TRIGGER trigger_accounting_credit_notes_updated_at
  BEFORE UPDATE ON public.accounting_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_accounting_updated_at();

ALTER TABLE public.accounting_credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_credit_notes_admin_read
  ON public.accounting_credit_notes
  FOR SELECT TO authenticated
  USING ((SELECT public.sistema_is_admin((SELECT auth.uid()))));

REVOKE ALL ON public.accounting_credit_notes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.accounting_credit_notes FROM authenticated;
GRANT SELECT ON public.accounting_credit_notes TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Inicio de una nota
-- ---------------------------------------------------------------------------

-- Crea (o retoma) la nota de crédito de una factura. El entorno tiene que ser
-- el de la factura: nunca se corrige una factura de prueba con una nota real.
-- Una nota en curso se devuelve con resumed = true y sus datos guardados.
CREATE OR REPLACE FUNCTION public.accounting_credit_note_begin(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $accounting_credit_note_begin$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  invoice_row public.accounting_invoices%ROWTYPE;
  open_note public.accounting_credit_notes%ROWTYPE;
  new_note public.accounting_credit_notes%ROWTYPE;
  mode_value TEXT := p_request ->> 'mode';
  amount_value BIGINT;
  credited_value BIGINT;
  description_value TEXT := NULLIF(btrim(COALESCE(p_request ->> 'description', '')), '');
  voucher_date_value DATE;
  note_id_value UUID := gen_random_uuid();
BEGIN
  authorization_result := private.invoicing_authorize('accounting_credit_note_begin', true);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR NOT private.mcp_json_has_only_keys(
      COALESCE(p_request, '{}'::JSONB),
      ARRAY['invoice_id', 'environment', 'mode', 'amount_cents', 'description', 'voucher_date']
    )
    OR private.mcp_parse_uuid(p_request ->> 'invoice_id') IS NULL
    OR p_request ->> 'environment' NOT IN ('test', 'production')
    OR mode_value NOT IN ('total', 'partial')
  THEN
    RETURN private.mcp_error(
      'invalid_request',
      'invoice_id, environment and mode (total or partial) are required.'
    );
  END IF;

  IF description_value IS NULL OR char_length(description_value) > 500 THEN
    RETURN private.mcp_error(
      'invalid_request',
      'description is required and must be at most 500 characters.'
    );
  END IF;

  SELECT * INTO invoice_row
  FROM public.accounting_invoices AS invoice
  WHERE invoice.id = (p_request ->> 'invoice_id')::UUID
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.mcp_error('invoice_not_found', 'The invoice does not exist.');
  END IF;
  IF invoice_row.environment <> p_request ->> 'environment' THEN
    RETURN private.mcp_error(
      'environment_mismatch',
      'The invoice belongs to another ARCA environment.'
    );
  END IF;

  SELECT * INTO open_note
  FROM public.accounting_credit_notes AS note
  WHERE note.invoice_id = invoice_row.id
    AND note.status IN ('pending', 'indeterminate');

  IF FOUND THEN
    RETURN private.mcp_ok(
      jsonb_build_object(
        'credit_note', to_jsonb(open_note),
        'invoice', to_jsonb(invoice_row),
        'resumed', true
      )
    );
  END IF;

  IF invoice_row.status <> 'authorized' THEN
    RETURN private.mcp_error(
      'invoice_not_creditable',
      'Only an authorized invoice that is not fully credited can receive a credit note.'
    );
  END IF;

  SELECT COALESCE(sum(note.amount_cents), 0) INTO credited_value
  FROM public.accounting_credit_notes AS note
  WHERE note.invoice_id = invoice_row.id
    AND note.status IN ('authorized', 'conflict');

  IF mode_value = 'total' THEN
    IF credited_value > 0 THEN
      RETURN private.mcp_error(
        'invoice_partially_credited',
        'The invoice already has credit notes; credit the remaining amount with a partial note.'
      );
    END IF;
    amount_value := invoice_row.amount_cents;
  ELSE
    IF jsonb_typeof(p_request -> 'amount_cents') <> 'number'
      OR (p_request ->> 'amount_cents') !~ '^[0-9]+$'
    THEN
      RETURN private.mcp_error('invalid_amount', 'amount_cents must be a positive integer.');
    END IF;
    amount_value := (p_request ->> 'amount_cents')::BIGINT;
    IF amount_value <= 0 THEN
      RETURN private.mcp_error('invalid_amount', 'amount_cents must be a positive integer.');
    END IF;
  END IF;

  IF credited_value + amount_value > invoice_row.amount_cents THEN
    RETURN private.mcp_error(
      'amount_exceeds_invoice',
      'The credit notes would exceed the invoice total.',
      jsonb_build_object(
        'invoice_amount_cents', invoice_row.amount_cents,
        'credited_amount_cents', credited_value,
        'available_amount_cents', invoice_row.amount_cents - credited_value
      )
    );
  END IF;

  BEGIN
    voucher_date_value := COALESCE(
      (p_request ->> 'voucher_date')::DATE,
      (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE
    );
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN private.mcp_error('invalid_request', 'Dates must use YYYY-MM-DD.');
  END;

  INSERT INTO public.accounting_credit_notes(
    id,
    invoice_id,
    environment,
    status,
    idempotency_key,
    mode,
    amount_cents,
    description,
    voucher_date,
    sales_point,
    created_via,
    mcp_client_id,
    created_by
  )
  VALUES (
    note_id_value,
    invoice_row.id,
    invoice_row.environment,
    'pending',
    'credit-note:' || note_id_value::TEXT,
    mode_value,
    amount_value,
    description_value,
    voucher_date_value,
    invoice_row.sales_point,
    context_data ->> 'via',
    private.mcp_parse_uuid(context_data ->> 'client_id'),
    (context_data ->> 'user_id')::UUID
  )
  RETURNING * INTO new_note;

  RETURN private.mcp_ok(
    jsonb_build_object(
      'credit_note', to_jsonb(new_note),
      'invoice', to_jsonb(invoice_row),
      'resumed', false
    )
  );
END
$accounting_credit_note_begin$;

-- ---------------------------------------------------------------------------
-- 4. Resultado de una nota
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accounting_credit_note_complete(
  p_request JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $accounting_credit_note_complete$
DECLARE
  authorization_result JSONB;
  context_data JSONB;
  note_row public.accounting_credit_notes%ROWTYPE;
  invoice_row public.accounting_invoices%ROWTYPE;
  credited_value BIGINT;
  invoice_number_value TEXT;
  status_value TEXT := p_request ->> 'status';
BEGIN
  authorization_result := private.invoicing_authorize('accounting_credit_note_complete', false);
  IF NOT COALESCE((authorization_result ->> 'ok')::BOOLEAN, false) THEN
    RETURN authorization_result;
  END IF;
  context_data := authorization_result -> 'data';

  IF jsonb_typeof(COALESCE(p_request, '{}'::JSONB)) <> 'object'
    OR private.mcp_parse_uuid(p_request ->> 'credit_note_id') IS NULL
    OR status_value NOT IN (
      'pending', 'authorized', 'rejected', 'indeterminate', 'conflict', 'discarded'
    )
  THEN
    RETURN private.mcp_error('invalid_request', 'credit_note_id and a valid status are required.');
  END IF;

  SELECT * INTO note_row
  FROM public.accounting_credit_notes AS note
  WHERE note.id = (p_request ->> 'credit_note_id')::UUID;

  IF NOT FOUND THEN
    RETURN private.mcp_error('credit_note_not_found', 'The credit note does not exist.');
  END IF;

  -- Mismo orden de bloqueo que begin: primero la factura, después la nota.
  SELECT * INTO invoice_row
  FROM public.accounting_invoices AS invoice
  WHERE invoice.id = note_row.invoice_id
  FOR UPDATE;

  SELECT * INTO note_row
  FROM public.accounting_credit_notes AS note
  WHERE note.id = note_row.id
  FOR UPDATE;

  IF note_row.status NOT IN ('pending', 'indeterminate') THEN
    RETURN private.mcp_ok(
      jsonb_build_object('credit_note', to_jsonb(note_row), 'invoice', to_jsonb(invoice_row))
    );
  END IF;

  IF status_value = 'authorized' THEN
    UPDATE public.accounting_credit_notes AS note
    SET status = 'authorized',
        voucher_class = p_request ->> 'voucher_class',
        voucher_type = (p_request ->> 'voucher_type')::INTEGER,
        voucher_number = (p_request ->> 'voucher_number')::BIGINT,
        voucher_date = COALESCE((p_request ->> 'voucher_date')::DATE, note.voucher_date),
        cae = p_request ->> 'cae',
        cae_expiry = (p_request ->> 'cae_expiry')::DATE,
        qr_url = p_request ->> 'qr_url',
        payment_due_date = (p_request ->> 'payment_due_date')::DATE,
        evidence = p_request -> 'evidence',
        issues = NULL,
        last_error = NULL,
        authorized_at = now()
    WHERE note.id = note_row.id
    RETURNING * INTO note_row;

    SELECT COALESCE(sum(note.amount_cents), 0) INTO credited_value
    FROM public.accounting_credit_notes AS note
    WHERE note.invoice_id = invoice_row.id
      AND note.status = 'authorized';

    -- Anulada del todo: libera el cobro para una factura nueva.
    IF credited_value >= invoice_row.amount_cents AND invoice_row.status = 'authorized' THEN
      UPDATE public.accounting_invoices AS invoice
      SET status = 'credited'
      WHERE invoice.id = invoice_row.id
      RETURNING * INTO invoice_row;

      IF invoice_row.environment = 'production' THEN
        invoice_number_value := invoice_row.voucher_class || ' '
          || lpad(invoice_row.sales_point::TEXT, 5, '0') || '-'
          || lpad(invoice_row.voucher_number::TEXT, 8, '0');
        UPDATE public.accounting_client_payments AS payment
        SET invoice_number = NULL
        WHERE payment.id = invoice_row.payment_id
          AND payment.invoice_number = invoice_number_value;
      END IF;
    END IF;

    IF context_data ->> 'via' = 'mcp' THEN
      PERFORM private.mcp_audit_event(
        'accounting.credit_note.issued',
        'accounting_credit_note_complete',
        'success',
        (context_data ->> 'user_id')::UUID,
        private.mcp_parse_uuid(context_data ->> 'client_id'),
        private.mcp_parse_uuid(context_data ->> 'session_id'),
        NULL,
        'accounting.invoice.write',
        jsonb_build_object(
          'credit_note_id', note_row.id,
          'invoice_id', invoice_row.id,
          'environment', note_row.environment,
          'voucher_number', note_row.voucher_number
        )
      );
    END IF;
  ELSE
    UPDATE public.accounting_credit_notes AS note
    SET status = status_value,
        voucher_type = COALESCE((p_request ->> 'voucher_type')::INTEGER, note.voucher_type),
        voucher_number = COALESCE((p_request ->> 'voucher_number')::BIGINT, note.voucher_number),
        issues = COALESCE(p_request -> 'issues', note.issues),
        evidence = COALESCE(p_request -> 'evidence', note.evidence),
        last_error = left(p_request ->> 'last_error', 2000)
    WHERE note.id = note_row.id
    RETURNING * INTO note_row;
  END IF;

  RETURN private.mcp_ok(
    jsonb_build_object('credit_note', to_jsonb(note_row), 'invoice', to_jsonb(invoice_row))
  );
EXCEPTION
  WHEN check_violation OR invalid_datetime_format OR datetime_field_overflow
    OR invalid_text_representation THEN
    RETURN private.mcp_error('invalid_request', 'The credit note result is not valid.');
END
$accounting_credit_note_complete$;

DO $credit_note_grants$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.accounting_credit_note_begin(jsonb)',
    'public.accounting_credit_note_complete(jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', function_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_authenticated') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO mcp_authenticated', function_signature);
    END IF;
  END LOOP;
END
$credit_note_grants$;

-- ---------------------------------------------------------------------------
-- 5. Un cobro con comprobantes de producción no se borra
-- ---------------------------------------------------------------------------

-- Una factura anulada sigue siendo un documento fiscal, igual que su nota:
-- borrar el cobro los arrastraría a los dos.
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
      AND invoice.status NOT IN ('rejected', 'discarded')
  ) THEN
    RAISE EXCEPTION
      'This payment has an ARCA invoice. Issue a credit note instead of deleting it.'
      USING ERRCODE = '23503';
  END IF;
  -- Las facturas de prueba se borran con el cobro; sus notas también.
  DELETE FROM public.accounting_credit_notes AS note
  USING public.accounting_invoices AS invoice
  WHERE note.invoice_id = invoice.id
    AND invoice.payment_id = OLD.id
    AND invoice.environment = 'test';
  RETURN OLD;
END
$accounting_guard_invoiced_payment_delete$;

-- ---------------------------------------------------------------------------
-- 6. Allowlist de PostgREST para tokens OAuth
-- ---------------------------------------------------------------------------

-- Se recrea la función vigente (20260928120000) agregando las dos RPC de notas.
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
