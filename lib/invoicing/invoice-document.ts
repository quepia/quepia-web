import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import QRCode from "qrcode"
import { loadInvoicingConfig, type InvoicingConfig } from "./config"
import { buildFiscalSnapshot, offlineSnapshot, type FiscalSnapshot } from "./fiscal-snapshot"
import type { CreditNoteRow } from "./issue-credit-note"
import type { InvoiceRow } from "./issue-invoice"

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

type StoredInvoice = InvoiceRow & {
  fiscal_snapshot: FiscalSnapshot | null
  payment: {
    month: number
    year: number
    client_name: string | null
    payment_method: string | null
    project: { nombre: string } | null
  } | null
}

/** Todo lo que se imprime en la factura o nota, ya en el formato de ARCA. */
export interface InvoiceDocument {
  isTest: boolean
  fileName: string
  /** "FACTURA" o "NOTA DE CRÉDITO", como lo titula ARCA. */
  title: string
  voucherClass: string
  typeCode: string
  salesPoint: string
  number: string
  issueDate: string
  issuer: {
    name: string
    address: string
    condition: string
    taxId: string
    grossIncome: string
    activityStart: string
  }
  periodFrom: string
  periodTo: string
  dueDate: string
  receiver: {
    docLabel: string | null
    docNumber: string | null
    name: string
    condition: string
    address: string
    saleCondition: string
  }
  description: string
  amount: string
  cae: string
  caeExpiry: string
  qrDataUrl: string | null
  /** Comprobante que corrige una nota: "Factura C 00001-00000001 del 28/09/2026". */
  associated?: string
  warning?: string
}

// dd/mm/aaaa, o mm/aaaa si ARCA solo informa el período.
function arDate(value: string | null | undefined): string {
  if (!value) return ""
  const [year, month, day] = value.slice(0, 10).split("-")
  return day ? `${day}/${month}/${year}` : `${month}/${year}`
}

// ARCA imprime importes con coma decimal y sin separador de miles.
function arMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",")
}

function formatCuit(value: string): string {
  return /^\d{11}$/.test(value) ? `${value.slice(0, 2)}-${value.slice(2, 10)}-${value.slice(10)}` : value
}

// Opciones de "Condición de venta" de Comprobantes en línea.
function saleCondition(method: string | null | undefined): string {
  const value = method ?? ""
  if (/transfer/i.test(value)) return "Transferencia Bancaria"
  if (/d[eé]bito/i.test(value)) return "Tarjeta de Débito"
  if (/cr[eé]dito/i.test(value)) return "Tarjeta de Crédito"
  if (/cheque/i.test(value)) return "Cheque"
  if (/mercado\s*pago|billetera|qr|electr[oó]nic/i.test(value)) return "Otros medios de pago electrónico"
  return "Contado"
}

// Si el Padrón falló, no se lo vuelve a consultar en cada apertura.
const PADRON_RETRY_MS = 10 * 60 * 1000

function needsPadron(snapshot: FiscalSnapshot | null): boolean {
  if (!snapshot) return true
  if (snapshot.source === "padron") return false
  return Date.now() - Date.parse(snapshot.fetched_at) > PADRON_RETRY_MS
}

// Ver un comprobante nunca falla por la configuración: sin ella se imprime
// con lo guardado.
async function loadConfigSafely(db: SupabaseClient): Promise<InvoicingConfig | null> {
  try {
    return await loadInvoicingConfig(db)
  } catch {
    return null
  }
}

async function loadInvoiceParts(
  db: SupabaseClient,
  invoice: StoredInvoice,
  refreshPadron: boolean,
) {
  const clientName = invoice.payment?.project?.nombre ?? invoice.payment?.client_name ?? null

  let snapshot = invoice.fiscal_snapshot
  if (refreshPadron && needsPadron(snapshot)) {
    snapshot = await buildFiscalSnapshot(db, await loadConfigSafely(db), invoice, clientName)
    await db
      .rpc("accounting_invoice_set_snapshot", { p_request: { invoice_id: invoice.id, snapshot } })
      .then(() => undefined, () => undefined)
  } else if (!snapshot) {
    snapshot = offlineSnapshot(await loadConfigSafely(db), invoice, clientName)
  }
  return { snapshot, clientName }
}

function qrImage(url: string | null): Promise<string | null> {
  return url
    ? QRCode.toDataURL(url, { margin: 0, width: 360, errorCorrectionLevel: "M" })
    : Promise.resolve(null)
}

const pad = (value: number | null, length: number) => String(value ?? 0).padStart(length, "0")

// Lo que la factura y sus notas comparten: emisor, receptor y período.
function sharedParts(invoice: StoredInvoice, snapshot: FiscalSnapshot) {
  const docType = invoice.receiver_doc_type
  return {
    isTest: invoice.environment === "test",
    issuer: {
      name: snapshot.issuer.name ?? formatCuit(snapshot.issuer.tax_id),
      address: snapshot.issuer.address ?? "",
      condition: snapshot.issuer.condition_label,
      taxId: snapshot.issuer.tax_id,
      grossIncome: snapshot.issuer.gross_income,
      activityStart: arDate(snapshot.issuer.activity_start),
    },
    periodFrom: arDate(invoice.service_from),
    periodTo: arDate(invoice.service_to),
    receiver: {
      docLabel: docType ? docType.toUpperCase() : null,
      docNumber: invoice.receiver_doc_number ?? null,
      name: snapshot.receiver.name ?? "",
      condition: snapshot.receiver.condition_label,
      address: snapshot.receiver.address ?? "",
      saleCondition: saleCondition(invoice.payment?.payment_method),
    },
    warning: snapshot.warning,
  }
}

const INVOICE_SELECT =
  "*, payment:accounting_client_payments(month, year, client_name, payment_method, project:sistema_projects(nombre))"

/**
 * Carga una factura autorizada (o ya anulada) y la deja lista para imprimir.
 * Con `refreshPadron` consulta el Padrón de ARCA si todavía no hay datos (o si
 * el último intento falló hace un rato) y los guarda en la factura; sin él usa
 * lo guardado y nunca sale a la red, así el PDF se genera al instante.
 * Devuelve null si no existe, no está autorizada o el usuario no puede verla.
 */
export async function loadInvoiceDocument(
  db: SupabaseClient,
  invoiceId: string,
  { refreshPadron = false }: { refreshPadron?: boolean } = {},
): Promise<InvoiceDocument | null> {
  const { data } = await db.from("accounting_invoices").select(INVOICE_SELECT).eq("id", invoiceId).maybeSingle()

  const invoice = data as StoredInvoice | null
  if (!invoice || (invoice.status !== "authorized" && invoice.status !== "credited")) return null

  const { snapshot } = await loadInvoiceParts(db, invoice, refreshPadron)
  const salesPoint = pad(invoice.sales_point, 5)
  const number = pad(invoice.voucher_number, 8)
  const period = invoice.payment ? `${MONTHS[invoice.payment.month - 1]} ${invoice.payment.year}` : ""
  const voucherClass = invoice.voucher_class ?? "C"

  return {
    ...sharedParts(invoice, snapshot),
    fileName: `Factura_${voucherClass}_${salesPoint}-${number}.pdf`,
    title: "FACTURA",
    voucherClass,
    typeCode: pad(invoice.voucher_type ?? 11, 3),
    salesPoint,
    number,
    issueDate: arDate(invoice.voucher_date),
    dueDate: arDate(invoice.payment_due_date),
    description: invoice.description ?? `Servicios correspondientes a ${period}`.trim(),
    amount: arMoney(invoice.amount_cents),
    cae: invoice.cae ?? "",
    caeExpiry: arDate(invoice.cae_expiry),
    qrDataUrl: await qrImage(invoice.qr_url),
  }
}

type StoredCreditNote = CreditNoteRow & { invoice: StoredInvoice | null }

/**
 * Nota de crédito autorizada, con el emisor, el receptor y el período de la
 * factura que corrige, igual que los hereda ARCA.
 */
export async function loadCreditNoteDocument(
  db: SupabaseClient,
  creditNoteId: string,
  { refreshPadron = false }: { refreshPadron?: boolean } = {},
): Promise<InvoiceDocument | null> {
  const { data } = await db
    .from("accounting_credit_notes")
    .select(`*, invoice:accounting_invoices(${INVOICE_SELECT})`)
    .eq("id", creditNoteId)
    .maybeSingle()

  const note = data as StoredCreditNote | null
  if (!note || note.status !== "authorized" || !note.invoice) return null

  const invoice = note.invoice
  const { snapshot } = await loadInvoiceParts(db, invoice, refreshPadron)
  const salesPoint = pad(note.sales_point, 5)
  const number = pad(note.voucher_number, 8)
  const voucherClass = note.voucher_class ?? "C"
  const invoiceClass = invoice.voucher_class ?? "C"

  return {
    ...sharedParts(invoice, snapshot),
    fileName: `Nota_de_Credito_${voucherClass}_${salesPoint}-${number}.pdf`,
    title: "NOTA DE CRÉDITO",
    voucherClass,
    typeCode: pad(note.voucher_type ?? 13, 3),
    salesPoint,
    number,
    issueDate: arDate(note.voucher_date),
    dueDate: arDate(note.payment_due_date ?? note.voucher_date),
    description: note.description,
    amount: arMoney(note.amount_cents),
    cae: note.cae ?? "",
    caeExpiry: arDate(note.cae_expiry),
    qrDataUrl: await qrImage(note.qr_url),
    associated: `Factura ${invoiceClass} ${pad(invoice.sales_point, 5)}-${pad(invoice.voucher_number, 8)} del ${arDate(invoice.voucher_date)}`,
  }
}
