import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ArcaInputError,
  toArcaSafeErrorMetadata,
  type ArcaClient,
  type CreditNoteInput,
  type IssueOutcome,
} from "facturas"
import { loadInvoicingConfig } from "./config"
import {
  createIssuingClient,
  fiscalDate,
  ISSUE_TIMEOUT_MS,
  type InvoiceRow,
} from "./issue-invoice"
import { recordOutcome } from "./outcome"
import { amountToCents, type IssueCreditNoteRequest } from "./request-schema"

export interface CreditNoteRow {
  id: string
  invoice_id: string
  environment: "test" | "production"
  status: "pending" | "authorized" | "rejected" | "indeterminate" | "conflict" | "discarded"
  idempotency_key: string
  mode: "total" | "partial"
  amount_cents: number
  description: string
  voucher_date: string
  sales_point: number
  voucher_class: string | null
  voucher_type: number | null
  voucher_number: number | null
  cae: string | null
  cae_expiry: string | null
  qr_url: string | null
  payment_due_date: string | null
  last_error: string | null
}

export type IssueCreditNoteResult =
  | { ok: true; outcome: "authorized"; creditNote: CreditNoteRow; invoice?: InvoiceRow; message: string }
  | {
      ok: false
      outcome: "rejected" | "indeterminate" | "conflict" | "invalid_input" | "not_configured" | "unavailable" | "denied"
      creditNote?: CreditNoteRow
      invoice?: InvoiceRow
      code: string
      message: string
    }

type Envelope = {
  ok: boolean
  data?: { credit_note?: CreditNoteRow; invoice?: InvoiceRow; resumed?: boolean }
  error?: { code: string; message: string; details?: Record<string, unknown> } | null
}

async function rpc(
  db: SupabaseClient,
  name: "accounting_credit_note_begin" | "accounting_credit_note_complete",
  request: Record<string, unknown>,
): Promise<Envelope> {
  const { data, error } = await db.rpc(name, { p_request: request })
  if (error) {
    throw new Error(`${name} failed: ${error.message}`)
  }
  return data as Envelope
}

// Mensajes en castellano para los rechazos de la base; el resto pasa tal cual.
function beginErrorMessage(error: NonNullable<Envelope["error"]>): string {
  switch (error.code) {
    case "amount_exceeds_invoice": {
      const available = Number(error.details?.available_amount_cents ?? 0) / 100
      return `El importe supera lo que queda por acreditar de la factura ($ ${available.toFixed(2).replace(".", ",")}).`
    }
    case "invoice_partially_credited":
      return "La factura ya tiene notas de crédito parciales: acreditá el resto con otra nota parcial."
    case "invoice_not_creditable":
      return "Solo se puede hacer una nota de crédito sobre una factura autorizada que no esté anulada."
    case "environment_mismatch":
      return "La factura es de otro entorno de ARCA (prueba o producción) que el configurado ahora."
    default:
      return error.message
  }
}

/** Igual que en las facturas: el input sale de la fila guardada. */
export function buildCreditNoteInput(note: CreditNoteRow, invoice: InvoiceRow): CreditNoteInput {
  if (!invoice.voucher_type || !invoice.voucher_number) {
    throw new Error("La factura original no tiene número autorizado.")
  }
  const common = {
    for: {
      salesPoint: invoice.sales_point,
      voucherType: invoice.voucher_type,
      number: invoice.voucher_number,
    },
    salesPoint: note.sales_point,
    date: fiscalDate(note.voucher_date),
  }
  return note.mode === "total"
    ? { ...common, all: true }
    : { ...common, items: [{ amount: note.amount_cents }], total: note.amount_cents }
}

async function discard(
  db: SupabaseClient,
  note: CreditNoteRow,
  invoice: InvoiceRow,
  error: unknown,
): Promise<IssueCreditNoteResult> {
  const message =
    error instanceof ArcaInputError && error.code === "ARCA_INPUT_DATE_OUTSIDE_WINDOW" && error.window
      ? `ARCA solo acepta fechas entre ${error.window.from} y ${error.window.to}.`
      : error instanceof Error
        ? error.message
        : "Datos de la nota de crédito inválidos."
  const saved = await rpc(db, "accounting_credit_note_complete", {
    credit_note_id: note.id,
    status: "discarded",
    last_error: message,
  }).catch(() => null)
  return {
    ok: false,
    outcome: "invalid_input",
    creditNote: saved?.data?.credit_note ?? note,
    invoice,
    code: error instanceof ArcaInputError ? error.code : "credit_note_invalid_input",
    message,
  }
}

function issueOnce(arca: ArcaClient, note: CreditNoteRow, input: CreditNoteInput): Promise<IssueOutcome> {
  return arca.issueCreditNote(input, {
    idempotencyKey: note.idempotency_key,
    abortSignal: AbortSignal.timeout(ISSUE_TIMEOUT_MS),
  })
}

/**
 * Emite (o retoma) una nota de crédito sobre una factura del sistema. Igual
 * que la factura, `db` lleva la identidad de quien pide y Postgres autoriza.
 */
export async function issueCreditNote(
  db: SupabaseClient,
  request: IssueCreditNoteRequest,
): Promise<IssueCreditNoteResult> {
  let config: Awaited<ReturnType<typeof loadInvoicingConfig>>
  try {
    config = await loadInvoicingConfig(db)
  } catch (error) {
    return {
      ok: false,
      outcome: "not_configured",
      code: "invoicing_key_error",
      message: error instanceof Error ? error.message : "No se pudo leer la configuración de facturación.",
    }
  }
  if (!config) {
    return {
      ok: false,
      outcome: "not_configured",
      code: "invoicing_not_configured",
      message: "La facturación ARCA no está configurada: completala en Contabilidad → Facturación.",
    }
  }

  const begin = await rpc(db, "accounting_credit_note_begin", {
    invoice_id: request.invoice_id,
    environment: config.environment,
    mode: request.mode,
    description: request.description,
    ...(request.mode === "partial" && request.amount ? { amount_cents: amountToCents(request.amount) } : {}),
    ...(request.voucher_date ? { voucher_date: request.voucher_date } : {}),
  })

  if (!begin.ok || !begin.data?.credit_note || !begin.data.invoice) {
    return {
      ok: false,
      outcome: "denied",
      code: begin.error?.code ?? "credit_note_begin_failed",
      message: begin.error ? beginErrorMessage(begin.error) : "No se pudo iniciar la nota de crédito.",
    }
  }

  const note = begin.data.credit_note
  const invoice = begin.data.invoice
  const resumed = Boolean(begin.data.resumed)

  let input: CreditNoteInput
  try {
    input = buildCreditNoteInput(note, invoice)
  } catch (error) {
    return discard(db, note, invoice, error)
  }

  const arca = createIssuingClient(db, config)

  // La vista previa consulta la factura original en ARCA y nunca escribe:
  // si falla, no se reservó número y la nota se descarta sin riesgo.
  if (!resumed) {
    try {
      const preview = await arca.previewCreditNote(input, { abortSignal: AbortSignal.timeout(ISSUE_TIMEOUT_MS) })
      if (preview.amounts.sentTotal !== note.amount_cents) {
        return discard(db, note, invoice, new Error("El total de la nota no coincide con el importe pedido."))
      }
    } catch (error) {
      if (error instanceof ArcaInputError) return discard(db, note, invoice, error)
      const safe = toArcaSafeErrorMetadata(error)
      return discard(db, note, invoice, new Error(`No se pudo consultar la factura original en ARCA: ${safe.message}`))
    }
  }

  try {
    let outcome = await issueOnce(arca, note, input)
    // not_found: el número reservado sigue vacío; la guía indica repetir igual.
    if (outcome.kind === "indeterminate" && outcome.lookup.kind === "not_found") {
      outcome = await issueOnce(arca, note, input)
    }
    const recorded = recordOutcome(outcome, "Nota de crédito")
    const saved = await rpc(db, "accounting_credit_note_complete", {
      credit_note_id: note.id,
      status: recorded.status,
      ...recorded.fields,
    })
    const savedNote = saved.data?.credit_note ?? note
    const savedInvoice = saved.data?.invoice ?? invoice
    if (recorded.ok) {
      return { ok: true, outcome: "authorized", creditNote: savedNote, invoice: savedInvoice, message: recorded.message }
    }
    return {
      ok: false,
      outcome: recorded.outcome as Exclude<typeof recorded.outcome, "authorized">,
      creditNote: savedNote,
      invoice: savedInvoice,
      code: recorded.code ?? "arca_error",
      message: recorded.message,
    }
  } catch (error) {
    if (error instanceof ArcaInputError && !resumed) {
      return discard(db, note, invoice, error)
    }
    // Antes de escribir en ARCA: queda pendiente y se reintenta con la misma clave.
    const safe = toArcaSafeErrorMetadata(error)
    await rpc(db, "accounting_credit_note_complete", {
      credit_note_id: note.id,
      status: "pending",
      last_error: `${safe.name}: ${safe.message}`,
    }).catch(() => undefined)
    return {
      ok: false,
      outcome: "unavailable",
      creditNote: note,
      invoice,
      code: "arca_unavailable",
      message: `No se pudo hablar con ARCA (${safe.message}). Reintentá: se usará el mismo número reservado.`,
    }
  }
}
