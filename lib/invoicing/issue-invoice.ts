import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ArcaInputError,
  createArcaClient,
  toArcaSafeErrorMetadata,
  type ArcaClient,
  type IssueInput,
  type IssueOutcome,
  type Receiver,
  type WsfeDateInput,
} from "facturas"
import { loadInvoicingConfig, type InvoicingConfig } from "./config"
import { recordOutcome } from "./outcome"
import type { IssueInvoiceRequest } from "./request-schema"
import { createSupabaseArcaStore } from "./supabase-store"

// Una sola ventana de tiempo para login WSAA, escritura y consultas. Si vence
// después del envío, el resultado es indeterminate y la reserva queda.
export const ISSUE_TIMEOUT_MS = 25_000

export interface InvoiceRow {
  id: string
  payment_id: string
  environment: "test" | "production"
  status:
    | "pending"
    | "authorized"
    | "rejected"
    | "indeterminate"
    | "conflict"
    | "discarded"
    | "credited"
  idempotency_key: string
  issuer_condition: InvoicingConfig["issuer"]
  sales_point: number
  amount_cents: number
  voucher_date: string
  service_from: string
  service_to: string
  payment_due_date: string
  receiver_condition: Receiver["condition"] & string
  receiver_doc_type: "cuit" | "dni" | null
  receiver_doc_number: string | null
  receiver_name: string | null
  description?: string | null
  voucher_class: string | null
  voucher_type: number | null
  voucher_number: number | null
  cae: string | null
  cae_expiry: string | null
  qr_url: string | null
  issues: unknown
  last_error: string | null
}

export type IssueInvoiceResult =
  | {
      ok: true
      outcome: "authorized" | "already_authorized"
      invoice: InvoiceRow
      message: string
    }
  | {
      ok: false
      outcome:
        | "rejected"
        | "indeterminate"
        | "conflict"
        | "invalid_input"
        | "not_configured"
        | "unavailable"
        | "denied"
      invoice?: InvoiceRow
      code: string
      message: string
    }

type Envelope = {
  ok: boolean
  data?: {
    invoice?: InvoiceRow
    resumed?: boolean
    already_authorized?: boolean
  }
  error?: { code: string; message: string } | null
}

async function rpc(
  db: SupabaseClient,
  name: "accounting_invoice_begin" | "accounting_invoice_complete",
  request: Record<string, unknown>,
): Promise<Envelope> {
  const { data, error } = await db.rpc(name, { p_request: request })
  if (error) {
    throw new Error(`${name} failed: ${error.message}`)
  }
  return data as Envelope
}

/** Cliente de ARCA con el store durable, usando la identidad de quien pide. */
export function createIssuingClient(db: SupabaseClient, config: InvoicingConfig): ArcaClient {
  return createArcaClient({
    taxId: config.taxId,
    certificatePem: config.certificatePem,
    privateKeyPem: config.privateKeyPem,
    environment: config.environment,
    store: createSupabaseArcaStore(db),
    logger: { level: "warn" },
  })
}

export function fiscalDate(value: string): WsfeDateInput {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Fecha inválida: ${value}`)
  }
  return value as WsfeDateInput
}

/** El input fiscal se arma siempre desde la fila guardada, así un reintento
 * con la misma clave manda exactamente lo mismo. */
export function buildIssueInput(invoice: InvoiceRow): IssueInput {
  const document =
    invoice.receiver_doc_type === "cuit"
      ? { cuit: invoice.receiver_doc_number! }
      : invoice.receiver_doc_type === "dni"
        ? { dni: invoice.receiver_doc_number! }
        : {}

  const to = (
    invoice.receiver_condition === "consumidor_final"
      ? { condition: "consumidor_final", ...document }
      : { condition: invoice.receiver_condition, cuit: invoice.receiver_doc_number! }
  ) as Receiver

  const common = {
    salesPoint: invoice.sales_point,
    date: fiscalDate(invoice.voucher_date),
    to,
    service: {
      from: fiscalDate(invoice.service_from),
      to: fiscalDate(invoice.service_to),
      dueDate: fiscalDate(invoice.payment_due_date),
    },
  }

  if (invoice.issuer_condition === "responsable_inscripto") {
    // Un RI discrimina IVA y necesita la alícuota de cada ítem: todavía no
    // hay un dato de negocio que la informe, así que no se emite a ciegas.
    throw new Error(
      "La emisión como responsable inscripto necesita la alícuota de IVA de cada ítem.",
    )
  }

  return {
    ...common,
    issuer: invoice.issuer_condition,
    items: [{ amount: invoice.amount_cents }],
    total: invoice.amount_cents,
  }
}

function describeInputError(error: ArcaInputError): string {
  if (error.code === "ARCA_INPUT_DATE_OUTSIDE_WINDOW" && error.window) {
    return `ARCA solo acepta fechas entre ${error.window.from} y ${error.window.to}.`
  }
  return error.message
}

async function saveOutcome(
  db: SupabaseClient,
  invoice: InvoiceRow,
  outcome: IssueOutcome,
): Promise<IssueInvoiceResult> {
  const recorded = recordOutcome(outcome, "Factura")
  const saved = await rpc(db, "accounting_invoice_complete", {
    invoice_id: invoice.id,
    status: recorded.status,
    ...recorded.fields,
  })
  const row = saved.data?.invoice ?? invoice
  if (recorded.ok) {
    return { ok: true, outcome: "authorized", invoice: row, message: recorded.message }
  }
  return {
    ok: false,
    outcome: recorded.outcome as Exclude<typeof recorded.outcome, "authorized">,
    invoice: row,
    code: recorded.code ?? "arca_error",
    message: recorded.message,
  }
}

async function issueOnce(
  arca: ArcaClient,
  invoice: InvoiceRow,
  input: IssueInput,
): Promise<IssueOutcome> {
  return arca.issue(input, {
    idempotencyKey: invoice.idempotency_key,
    abortSignal: AbortSignal.timeout(ISSUE_TIMEOUT_MS),
  })
}

/**
 * Emite (o retoma) la factura de un cobro. `db` lleva la identidad de quien
 * pide, una sesión web o un token MCP, y Postgres decide si puede hacerlo.
 */
export async function issueInvoiceForPayment(
  db: SupabaseClient,
  request: IssueInvoiceRequest,
): Promise<IssueInvoiceResult> {
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
      message:
        "La facturación ARCA no está configurada: completala en Contabilidad → Facturación.",
    }
  }

  const begin = await rpc(db, "accounting_invoice_begin", {
    payment_id: request.payment_id,
    environment: config.environment,
    sales_point: config.salesPoint,
    issuer_condition: config.issuer,
    receiver: {
      condition: request.receiver.condition,
      doc_type: request.receiver.doc_type ?? null,
      doc_number: request.receiver.doc_number ?? null,
      name: request.receiver.name ?? null,
    },
    ...(request.description ? { description: request.description } : {}),
    ...(request.voucher_date ? { voucher_date: request.voucher_date } : {}),
    ...(request.service_from ? { service_from: request.service_from } : {}),
    ...(request.service_to ? { service_to: request.service_to } : {}),
    ...(request.payment_due_date ? { payment_due_date: request.payment_due_date } : {}),
  })

  if (!begin.ok || !begin.data?.invoice) {
    return {
      ok: false,
      outcome: "denied",
      invoice: (begin.error as { details?: { invoice?: InvoiceRow } } | null)
        ?.details?.invoice,
      code: begin.error?.code ?? "invoice_begin_failed",
      message: begin.error?.message ?? "No se pudo iniciar la factura.",
    }
  }

  const invoice = begin.data.invoice
  if (begin.data.already_authorized) {
    return {
      ok: true,
      outcome: "already_authorized",
      invoice,
      message: "Este cobro ya tiene una factura autorizada.",
    }
  }

  let input: IssueInput
  try {
    input = buildIssueInput(invoice)
  } catch (error) {
    return discardInvalid(db, invoice, error)
  }

  const arca = createIssuingClient(db, config)

  // Un intento nuevo se valida sin I/O antes de reservar número. Uno retomado
  // va directo a issue(): con su clave consulta lo que ARCA ya tenga aunque la
  // ventana de fechas se haya movido.
  if (!begin.data.resumed) {
    try {
      const preview = arca.preview(input)
      if (preview.amounts.sentTotal !== invoice.amount_cents) {
        return discardInvalid(
          db,
          invoice,
          new Error("El total de la factura no coincide con el del cobro."),
        )
      }
    } catch (error) {
      return discardInvalid(db, invoice, error)
    }
  }

  try {
    let outcome = await issueOnce(arca, invoice, input)
    // not_found: ARCA confirmó que el número reservado está vacío. La guía
    // indica repetir la misma llamada con la misma clave y el mismo input.
    if (outcome.kind === "indeterminate" && outcome.lookup.kind === "not_found") {
      outcome = await issueOnce(arca, invoice, input)
    }
    return await saveOutcome(db, invoice, outcome)
  } catch (error) {
    if (error instanceof ArcaInputError && !begin.data.resumed) {
      return discardInvalid(db, invoice, error)
    }
    // Configuración, WSAA o red antes de escribir: la fila queda pendiente y
    // el próximo intento reutiliza la misma clave, sin riesgo de duplicar.
    const safe = toArcaSafeErrorMetadata(error)
    await rpc(db, "accounting_invoice_complete", {
      invoice_id: invoice.id,
      status: "pending",
      last_error: `${safe.name}: ${safe.message}`,
    }).catch(() => undefined)
    return {
      ok: false,
      outcome: "unavailable",
      invoice,
      code: "arca_unavailable",
      message: `No se pudo hablar con ARCA (${safe.message}). Reintentá: se usará el mismo número reservado.`,
    }
  }
}

async function discardInvalid(
  db: SupabaseClient,
  invoice: InvoiceRow,
  error: unknown,
): Promise<IssueInvoiceResult> {
  const message =
    error instanceof ArcaInputError
      ? describeInputError(error)
      : error instanceof Error
        ? error.message
        : "Datos de factura inválidos."
  const saved = await rpc(db, "accounting_invoice_complete", {
    invoice_id: invoice.id,
    status: "discarded",
    last_error: message,
  }).catch(() => null)
  return {
    ok: false,
    outcome: "invalid_input",
    invoice: saved?.data?.invoice ?? invoice,
    code:
      error instanceof ArcaInputError ? error.code : "invoice_invalid_input",
    message,
  }
}
