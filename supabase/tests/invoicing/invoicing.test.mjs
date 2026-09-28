// Prueba la migración real de facturación ARCA sobre PGlite: autorización
// web/MCP, retomar sin duplicar, store del SDK y protección de cobros.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { PGlite } from "@electric-sql/pglite"

const root = resolve(import.meta.dirname, "../../..")

const IDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  member: "00000000-0000-4000-8000-000000000003",
  client: "00000000-0000-4000-8000-0000000000c1",
  grant: "00000000-0000-4000-8000-0000000000a1",
}

const db = new PGlite()
await db.exec(readFileSync(join(root, "supabase/tests/social/bootstrap.sql"), "utf8"))
// Lo mínimo del módulo contable y de autorización que la migración usa.
await db.exec(`
  CREATE FUNCTION private.mcp_parse_uuid(p_value TEXT) RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
  BEGIN RETURN p_value::UUID; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;
  CREATE FUNCTION public.sistema_is_admin(p_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM public.sistema_users su WHERE su.id = p_user_id AND su.role = 'admin')
  $$;
  CREATE FUNCTION private.sistema_user_is_authorized(p_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.sistema_users su
      WHERE su.id = p_user_id AND su.is_active AND su.is_authorized AND su.deleted_at IS NULL)
  $$;
  CREATE FUNCTION public.update_accounting_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;
  CREATE TABLE public.accounting_client_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    client_name VARCHAR(200),
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    status VARCHAR(20) DEFAULT 'pending',
    payment_date DATE,
    invoice_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  GRANT SELECT, DELETE ON public.accounting_client_payments TO authenticated;
  INSERT INTO public.sistema_users(id, email, nombre, role, is_active, is_authorized) VALUES
    ('${IDS.admin}', 'admin@quepia.test', 'Admin', 'admin', true, true),
    ('${IDS.member}', 'member@quepia.test', 'Integrante', 'member', true, true);
  INSERT INTO private.mcp_client_policies(client_id) VALUES ('${IDS.client}');
  INSERT INTO private.mcp_access_grants(id, user_id, client_id) VALUES ('${IDS.grant}', '${IDS.admin}', '${IDS.client}');
`)
for (const name of [
  "20260928120000_arca_invoicing.sql",
  "20260928230000_invoice_description.sql",
  "20260929000000_arca_credit_notes.sql",
  "20260929120000_invoicing_settings.sql",
]) {
  await db.exec(readFileSync(join(root, "supabase/migrations", name), "utf8"))
}

const WEB_ADMIN = { sub: IDS.admin, role: "authenticated" }
const WEB_MEMBER = { sub: IDS.member, role: "authenticated" }
const MCP_ADMIN = { sub: IDS.admin, role: "mcp_authenticated", client_id: IDS.client }

async function call(claims, fn, request) {
  const role = claims.role
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)])
  await db.exec(`SET ROLE ${role}`)
  try {
    const result = await db.query(`SELECT public.${fn}($1::jsonb) AS r`, [JSON.stringify(request)])
    return result.rows[0].r
  } finally {
    await db.exec("RESET ROLE")
    await db.query("SELECT set_config('request.jwt.claims', '', false)")
  }
}

async function payment({ amount = "150000.00", currency = "ARS", status = "paid" } = {}) {
  const { rows } = await db.query(
    `INSERT INTO public.accounting_client_payments(client_name, month, year, amount, currency, status)
     VALUES ('Cliente', 8, 2026, $1, $2, $3) RETURNING id`,
    [amount, currency, status],
  )
  return rows[0].id
}

function beginRequest(paymentId, environment = "test", receiver = { condition: "consumidor_final" }) {
  return {
    payment_id: paymentId,
    environment,
    sales_point: 3,
    issuer_condition: "monotributo",
    receiver,
  }
}

test("la migración concede la capacidad a los grants vigentes de administradores", async () => {
  const { rows } = await db.query(
    "SELECT capability FROM private.mcp_access_grant_capabilities WHERE grant_id = $1",
    [IDS.grant],
  )
  assert.deepEqual(rows.map((row) => row.capability), ["accounting.invoice.write"])
})

test("un admin web inicia la factura con el importe del cobro y el mes del servicio", async () => {
  const paymentId = await payment()
  const result = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId))
  assert.equal(result.ok, true, JSON.stringify(result))
  const invoice = result.data.invoice
  assert.equal(invoice.status, "pending")
  assert.equal(Number(invoice.amount_cents), 15_000_000)
  assert.equal(invoice.service_from, "2026-08-01")
  assert.equal(invoice.service_to, "2026-08-31")
  assert.equal(invoice.created_via, "web")
  assert.equal(invoice.idempotency_key, `invoice:${invoice.id}`)
  assert.equal(result.data.resumed, false)

  const again = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId))
  assert.equal(again.data.invoice.id, invoice.id)
  assert.equal(again.data.resumed, true)
})

test("el detalle impreso se guarda al emitir y tiene un límite", async () => {
  const paymentId = await payment()
  const tooLong = await call(WEB_ADMIN, "accounting_invoice_begin", {
    ...beginRequest(paymentId),
    description: "x".repeat(501),
  })
  assert.equal(tooLong.error.code, "invalid_request")

  const result = await call(WEB_ADMIN, "accounting_invoice_begin", {
    ...beginRequest(paymentId),
    description: "  Community manager - Septiembre  ",
  })
  assert.equal(result.data.invoice.description, "Community manager - Septiembre")
})

test("un integrante no admin, un cobro pendiente o en USD no se facturan", async () => {
  const paymentId = await payment()
  const denied = await call(WEB_MEMBER, "accounting_invoice_begin", beginRequest(paymentId))
  assert.equal(denied.error.code, "forbidden")

  const pending = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(await payment({ status: "pending" })))
  assert.equal(pending.error.code, "payment_not_paid")

  const usd = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(await payment({ currency: "USD" })))
  assert.equal(usd.error.code, "unsupported_currency")
})

test("un receptor distinto de consumidor final necesita CUIT válido", async () => {
  const paymentId = await payment()
  const noCuit = await call(
    WEB_ADMIN,
    "accounting_invoice_begin",
    beginRequest(paymentId, "test", { condition: "responsable_inscripto" }),
  )
  assert.equal(noCuit.error.code, "invalid_receiver")
  const badCuit = await call(
    WEB_ADMIN,
    "accounting_invoice_begin",
    beginRequest(paymentId, "test", { condition: "monotributo", doc_type: "cuit", doc_number: "123" }),
  )
  assert.equal(badCuit.error.code, "invalid_receiver")
  const ok = await call(
    WEB_ADMIN,
    "accounting_invoice_begin",
    beginRequest(paymentId, "test", {
      condition: "responsable_inscripto",
      doc_type: "cuit",
      doc_number: "20-12345678-6",
      name: "Empresa SA",
    }),
  )
  assert.equal(ok.ok, true, JSON.stringify(ok))
  assert.equal(ok.data.invoice.receiver_doc_number, "20123456786")
})

test("autorizar en producción numera el cobro y bloquea borrarlo", async () => {
  const paymentId = await payment()
  const begin = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId, "production"))
  const done = await call(WEB_ADMIN, "accounting_invoice_complete", {
    invoice_id: begin.data.invoice.id,
    status: "authorized",
    voucher_class: "C",
    voucher_type: 11,
    voucher_number: 42,
    cae: "70417054367476",
    cae_expiry: "2026-10-08",
  })
  assert.equal(done.data.invoice.status, "authorized")
  const { rows } = await db.query("SELECT invoice_number FROM public.accounting_client_payments WHERE id = $1", [paymentId])
  assert.equal(rows[0].invoice_number, "C 00003-00000042")

  const repeat = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId, "production"))
  assert.equal(repeat.data.already_authorized, true)

  // Un resultado cerrado no se reescribe.
  const overwrite = await call(WEB_ADMIN, "accounting_invoice_complete", {
    invoice_id: begin.data.invoice.id,
    status: "rejected",
  })
  assert.equal(overwrite.data.invoice.status, "authorized")

  await assert.rejects(
    db.query("DELETE FROM public.accounting_client_payments WHERE id = $1", [paymentId]),
    /credit note/,
  )
})

test("la foto del Padrón solo se guarda en autorizados y no se pisa una vez obtenida", async () => {
  const paymentId = await payment()
  const begin = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId))
  const invoiceId = begin.data.invoice.id
  const fallback = { source: "fallback", issuer: { name: null } }
  const early = await call(WEB_ADMIN, "accounting_invoice_set_snapshot", { invoice_id: invoiceId, snapshot: fallback })
  assert.equal(early.data.invoice.fiscal_snapshot, null)

  await call(WEB_ADMIN, "accounting_invoice_complete", {
    invoice_id: invoiceId, status: "authorized", voucher_class: "C", voucher_type: 11,
    voucher_number: 99, cae: "1", cae_expiry: "2026-10-08",
  })
  await call(WEB_ADMIN, "accounting_invoice_set_snapshot", { invoice_id: invoiceId, snapshot: fallback })
  const padron = { source: "padron", issuer: { name: "EMISOR" } }
  const saved = await call(WEB_ADMIN, "accounting_invoice_set_snapshot", { invoice_id: invoiceId, snapshot: padron })
  assert.equal(saved.data.invoice.fiscal_snapshot.issuer.name, "EMISOR")
  const overwrite = await call(WEB_ADMIN, "accounting_invoice_set_snapshot", {
    invoice_id: invoiceId,
    snapshot: { source: "padron", issuer: { name: "OTRO" } },
  })
  assert.equal(overwrite.data.invoice.fiscal_snapshot.issuer.name, "EMISOR")

  const denied = await call(WEB_MEMBER, "accounting_invoice_set_snapshot", { invoice_id: invoiceId, snapshot: padron })
  assert.equal(denied.error.code, "forbidden")
})

test("un comprobante de homologación no impide borrar el cobro", async () => {
  const paymentId = await payment()
  await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId, "test"))
  await db.query("DELETE FROM public.accounting_client_payments WHERE id = $1", [paymentId])
  const { rows } = await db.query("SELECT count(*)::int AS n FROM public.accounting_invoices WHERE payment_id = $1", [paymentId])
  assert.equal(rows[0].n, 0)
})

test("un rechazo libera el cobro para una clave nueva", async () => {
  const paymentId = await payment()
  const first = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId))
  await call(WEB_ADMIN, "accounting_invoice_complete", {
    invoice_id: first.data.invoice.id,
    status: "rejected",
    issues: [{ message: "10016" }],
  })
  const second = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId))
  assert.equal(second.data.resumed, false)
  assert.notEqual(second.data.invoice.idempotency_key, first.data.invoice.idempotency_key)
})

test("el MCP emite solo con la capacidad y deja auditoría", async () => {
  const paymentId = await payment()
  const begin = await call(MCP_ADMIN, "accounting_invoice_begin", beginRequest(paymentId))
  assert.equal(begin.ok, true, JSON.stringify(begin))
  assert.equal(begin.data.invoice.created_via, "mcp")
  await call(MCP_ADMIN, "accounting_invoice_complete", {
    invoice_id: begin.data.invoice.id,
    status: "authorized",
    voucher_class: "C",
    voucher_type: 11,
    voucher_number: 7,
    cae: "1",
    cae_expiry: "2026-10-08",
  })
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM private.test_mcp_audit WHERE action = 'accounting_invoice_complete'",
  )
  assert.equal(rows[0].n, 1)

  await db.query("DELETE FROM private.mcp_access_grant_capabilities WHERE grant_id = $1", [IDS.grant])
  const denied = await call(MCP_ADMIN, "accounting_invoice_begin", beginRequest(await payment()))
  assert.equal(denied.error.code, "capability_denied")
  await db.query(
    "INSERT INTO private.mcp_access_grant_capabilities(grant_id, capability) VALUES ($1, 'accounting.invoice.write')",
    [IDS.grant],
  )
})

test("el store agrega de forma atómica y nunca borra reservas", async () => {
  const key = "arca:v1:attempt:test:20123456786:invoice:x"
  assert.equal((await call(WEB_ADMIN, "accounting_invoice_store", { op: "add", key, value: "a" })).data.added, true)
  assert.equal((await call(WEB_ADMIN, "accounting_invoice_store", { op: "add", key, value: "b" })).data.added, false)
  assert.equal((await call(WEB_ADMIN, "accounting_invoice_store", { op: "get", key })).data.value, "a")
  const deleted = await call(WEB_ADMIN, "accounting_invoice_store", { op: "delete", key })
  assert.equal(deleted.error.code, "forbidden")

  const denied = await call(WEB_MEMBER, "accounting_invoice_store", { op: "get", key })
  assert.equal(denied.error.code, "forbidden")
})

test("el bloqueo es exclusivo y se recupera al vencer", async () => {
  const key = "arca:v1:lock:sequence:test"
  const ownerA = "00000000-0000-4000-8000-00000000aaaa"
  const ownerB = "00000000-0000-4000-8000-00000000bbbb"
  const lock = (owner) => call(WEB_ADMIN, "accounting_invoice_store", { op: "lock", key, owner, ttl_seconds: 60 })
  assert.equal((await lock(ownerA)).data.acquired, true)
  assert.equal((await lock(ownerB)).data.acquired, false)
  await db.query("UPDATE private.arca_store_locks SET expires_at = now() - interval '1 second' WHERE key = $1", [key])
  assert.equal((await lock(ownerB)).data.acquired, true)
  await call(WEB_ADMIN, "accounting_invoice_store", { op: "unlock", key, owner: ownerA })
  assert.equal((await lock(ownerA)).data.acquired, false)
  await call(WEB_ADMIN, "accounting_invoice_store", { op: "unlock", key, owner: ownerB })
  assert.equal((await lock(ownerA)).data.acquired, true)
})

test("nadie escribe la tabla directo y solo los admins la leen", async () => {
  await db.exec("SET ROLE authenticated")
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(WEB_MEMBER)])
  try {
    const visible = await db.query("SELECT count(*)::int AS n FROM public.accounting_invoices")
    assert.equal(visible.rows[0].n, 0)
    await assert.rejects(
      db.query("UPDATE public.accounting_invoices SET status = 'authorized'"),
      /permission denied/,
    )
  } finally {
    await db.exec("RESET ROLE")
  }
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(WEB_ADMIN)])
  await db.exec("SET ROLE authenticated")
  try {
    const visible = await db.query("SELECT count(*)::int AS n FROM public.accounting_invoices")
    assert.ok(visible.rows[0].n > 0)
  } finally {
    await db.exec("RESET ROLE")
    await db.query("SELECT set_config('request.jwt.claims', '', false)")
  }
})

async function authorizedInvoice(environment = "test", amount = "150000.00") {
  const paymentId = await payment({ amount })
  const begin = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId, environment))
  const done = await call(WEB_ADMIN, "accounting_invoice_complete", {
    invoice_id: begin.data.invoice.id, status: "authorized", voucher_class: "C", voucher_type: 11,
    voucher_number: Math.floor(Math.random() * 1e6), cae: "1", cae_expiry: "2026-10-08",
  })
  return { paymentId, invoice: done.data.invoice }
}

async function authorizeNote(noteId, number = 1) {
  return call(WEB_ADMIN, "accounting_credit_note_complete", {
    credit_note_id: noteId, status: "authorized", voucher_class: "C", voucher_type: 13,
    voucher_number: number, cae: "2", cae_expiry: "2026-10-08",
  })
}

function noteRequest(invoice, extra = {}) {
  return { invoice_id: invoice.id, environment: invoice.environment, mode: "total", description: "Anulación", ...extra }
}

test("una nota total anula la factura, limpia el número del cobro y permite reemitir", async () => {
  const { paymentId, invoice } = await authorizedInvoice("production")
  const begin = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice))
  assert.equal(begin.ok, true, JSON.stringify(begin))
  assert.equal(Number(begin.data.credit_note.amount_cents), Number(invoice.amount_cents))
  assert.equal(begin.data.credit_note.idempotency_key, `credit-note:${begin.data.credit_note.id}`)

  const again = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice))
  assert.equal(again.data.resumed, true)
  assert.equal(again.data.credit_note.id, begin.data.credit_note.id)

  const done = await authorizeNote(begin.data.credit_note.id)
  assert.equal(done.data.credit_note.status, "authorized")
  assert.equal(done.data.invoice.status, "credited")
  const { rows } = await db.query("SELECT invoice_number FROM public.accounting_client_payments WHERE id = $1", [paymentId])
  assert.equal(rows[0].invoice_number, null)

  const reissue = await call(WEB_ADMIN, "accounting_invoice_begin", beginRequest(paymentId, "production"))
  assert.equal(reissue.ok, true, JSON.stringify(reissue))
  assert.notEqual(reissue.data.invoice.id, invoice.id)
  assert.equal(reissue.data.already_authorized, false)

  const secondNote = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice))
  assert.equal(secondNote.error.code, "invoice_not_creditable")

  // Los comprobantes de producción, anulados o no, impiden borrar el cobro.
  await assert.rejects(
    db.query("DELETE FROM public.accounting_client_payments WHERE id = $1", [paymentId]),
    /credit note/,
  )
})

test("las notas parciales nunca superan el total de la factura", async () => {
  const { invoice } = await authorizedInvoice("test", "1000.00")
  const tooMuch = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice, { mode: "partial", amount_cents: 100001 }))
  assert.equal(tooMuch.error.code, "amount_exceeds_invoice")

  const first = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice, { mode: "partial", amount_cents: 60000 }))
  await authorizeNote(first.data.credit_note.id, 11)

  const total = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice))
  assert.equal(total.error.code, "invoice_partially_credited")

  const over = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice, { mode: "partial", amount_cents: 40001 }))
  assert.equal(over.error.code, "amount_exceeds_invoice")
  assert.equal(over.error.details.available_amount_cents, 40000)

  const rest = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice, { mode: "partial", amount_cents: 40000 }))
  const done = await authorizeNote(rest.data.credit_note.id, 12)
  assert.equal(done.data.invoice.status, "credited")
})

test("una nota rechazada no descuenta y no se corrige una factura de otro entorno", async () => {
  const { invoice } = await authorizedInvoice("test", "1000.00")
  const mismatch = await call(WEB_ADMIN, "accounting_credit_note_begin", { ...noteRequest(invoice), environment: "production" })
  assert.equal(mismatch.error.code, "environment_mismatch")

  const first = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice))
  await call(WEB_ADMIN, "accounting_credit_note_complete", { credit_note_id: first.data.credit_note.id, status: "rejected" })
  const retry = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice))
  assert.equal(retry.data.resumed, false)
  assert.notEqual(retry.data.credit_note.id, first.data.credit_note.id)

  const denied = await call(WEB_MEMBER, "accounting_credit_note_begin", noteRequest(invoice))
  assert.equal(denied.error.code, "forbidden")
})

test("un cobro de prueba con notas se puede borrar", async () => {
  const { paymentId, invoice } = await authorizedInvoice("test")
  const note = await call(WEB_ADMIN, "accounting_credit_note_begin", noteRequest(invoice))
  await authorizeNote(note.data.credit_note.id, 21)
  await db.query("DELETE FROM public.accounting_client_payments WHERE id = $1", [paymentId])
  const { rows } = await db.query("SELECT count(*)::int AS n FROM public.accounting_credit_notes WHERE invoice_id = $1", [invoice.id])
  assert.equal(rows[0].n, 0)
})

test("la configuración la cambia solo un admin desde la web y el MCP solo la lee", async () => {
  const saved = await call(WEB_ADMIN, "invoicing_settings_save", {
    settings: { tax_id: "20123456786", issuer_condition: "monotributo", issuer_name: "EMISOR" },
  })
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.data.settings.issuer_name, "EMISOR")
  assert.equal(saved.data.settings.active_environment, "test")

  const creds = await call(WEB_ADMIN, "invoicing_settings_save", {
    environment: "test",
    credentials: { sales_point: 3, private_key_encrypted: "v1:a:b:c", certificate_pem: "CERT" },
  })
  assert.equal(creds.data.credentials.test.sales_point, 3)

  const plainKey = await call(WEB_ADMIN, "invoicing_settings_save", {
    environment: "test",
    credentials: { private_key_encrypted: "-----BEGIN PRIVATE KEY-----" },
  })
  assert.equal(plainKey.error.code, "invalid_request")

  const member = await call(WEB_MEMBER, "invoicing_settings_save", { settings: { issuer_name: "X" } })
  assert.equal(member.error.code, "forbidden")
  const memberRead = await call(WEB_MEMBER, "invoicing_settings_get", {})
  assert.equal(memberRead.error.code, "forbidden")

  const mcpRead = await call(MCP_ADMIN, "invoicing_settings_get", {})
  assert.equal(mcpRead.ok, true, JSON.stringify(mcpRead))
  // El rol del MCP ni siquiera puede ejecutar el guardado.
  await assert.rejects(
    call(MCP_ADMIN, "invoicing_settings_save", { settings: { issuer_name: "X" } }),
    /permission denied/,
  )
})

test("no se pasa a producción sin credenciales de producción completas", async () => {
  const early = await call(WEB_ADMIN, "invoicing_settings_save", { settings: { active_environment: "production" } })
  assert.equal(early.error.code, "production_not_ready")

  await call(WEB_ADMIN, "invoicing_settings_save", {
    environment: "production",
    credentials: { sales_point: 4, private_key_encrypted: "v1:x:y:z", certificate_pem: "CERT" },
  })
  const ready = await call(WEB_ADMIN, "invoicing_settings_save", { settings: { active_environment: "production" } })
  assert.equal(ready.data.settings.active_environment, "production")
  await call(WEB_ADMIN, "invoicing_settings_save", { settings: { active_environment: "test" } })
})
