-- Detalle del producto o servicio que se imprime en la factura.
--
-- WSFE no transmite el detalle a ARCA: solo existe en la representación
-- impresa. Se fija al emitir, junto con el resto del comprobante, y no se
-- edita después para que el PDF de una factura sea siempre el mismo.

ALTER TABLE public.accounting_invoices
  ADD COLUMN description TEXT
  CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 500);

COMMENT ON COLUMN public.accounting_invoices.description IS
  'Detalle impreso en la factura (Producto / Servicio). No viaja a ARCA.';

-- Igual que 20260928120000_arca_invoicing.sql, sumando la clave description.
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
