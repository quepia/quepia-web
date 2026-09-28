"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { ClientPaymentWithProject } from "@/types/accounting"
import { CreditNotePanel, type PaymentCreditNote } from "./accounting-credit-note-panel"

export interface InvoicingStatus {
    configured: boolean
    environment?: "test" | "production"
    sales_point?: number
}

export interface PaymentInvoice {
    id: string
    payment_id: string
    environment: "test" | "production"
    status: "pending" | "authorized" | "rejected" | "indeterminate" | "conflict" | "discarded" | "credited"
    amount_cents: number
    voucher_class: string | null
    voucher_number: number | null
    sales_point: number
    cae: string | null
    cae_expiry: string | null
    qr_url: string | null
    receiver_condition: string
    receiver_doc_number: string | null
    receiver_name: string | null
    last_error: string | null
    created_at: string
}

const RECEIVER_CONDITIONS = [
    { value: "responsable_inscripto", label: "Responsable inscripto" },
    { value: "monotributo", label: "Monotributista" },
    { value: "exento", label: "Exento" },
    { value: "no_alcanzado", label: "No alcanzado" },
    { value: "consumidor_final", label: "Consumidor final (con documento)" },
] as const

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export function formatVoucherNumber(invoice: Pick<PaymentInvoice, "voucher_class" | "sales_point" | "voucher_number">) {
    return `${invoice.voucher_class ?? ""} ${String(invoice.sales_point).padStart(5, "0")}-${String(invoice.voucher_number ?? 0).padStart(8, "0")}`.trim()
}

function DateField({
    label,
    value,
    min,
    max,
    onChange,
}: {
    label: string
    value: string
    min?: string
    max?: string
    onChange: (value: string) => void
}) {
    return (
        <label className="block">
            <span className="block text-xs text-white/50 mb-1.5">{label}</span>
            <input
                type="date"
                value={value}
                min={min}
                max={max}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white tabular-nums [color-scheme:dark] focus:outline-none focus:border-white/30"
            />
        </label>
    )
}

interface AccountingInvoiceDialogProps {
    payment: ClientPaymentWithProject
    invoice: PaymentInvoice | null
    status: InvoicingStatus
    creditNotes: PaymentCreditNote[]
    onClose: () => void
    onIssued: () => void
}

type ReceiverMode = "final" | "identified"

// Fechas YYYY-MM-DD en la zona de ARCA (Buenos Aires).
function todayInBuenosAires(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

function addDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

function monthBounds(year: number, month: number): [string, string] {
    const pad = (value: number) => String(value).padStart(2, "0")
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(lastDay)}`]
}

// ARCA acepta una factura de servicios fechada hasta 10 días antes o después.
const SERVICE_DATE_WINDOW_DAYS = 10

export function AccountingInvoiceDialog({ payment, invoice, status, creditNotes, onClose, onIssued }: AccountingInvoiceDialogProps) {
    const [reissuing, setReissuing] = useState(false)
    // Un comprobante pendiente o indeterminado se retoma con sus datos
    // originales: el receptor ya no se puede cambiar sin riesgo de duplicar.
    const resuming = invoice?.status === "pending" || invoice?.status === "indeterminate"
    const [mode, setMode] = useState<ReceiverMode>("final")
    const [condition, setCondition] = useState<string>("responsable_inscripto")
    const [docType, setDocType] = useState<"cuit" | "dni">("cuit")
    const [docNumber, setDocNumber] = useState("")
    const [name, setName] = useState(payment.project_name ?? "")
    const [description, setDescription] = useState(
        `Servicios correspondientes a ${MONTHS[payment.month - 1]} ${payment.year}`
    )
    const today = todayInBuenosAires()
    const minVoucherDate = addDays(today, -SERVICE_DATE_WINDOW_DAYS)
    const maxVoucherDate = addDays(today, SERVICE_DATE_WINDOW_DAYS)
    const [defaultFrom, defaultTo] = monthBounds(payment.year, payment.month)
    const [voucherDate, setVoucherDate] = useState(today)
    const [serviceFrom, setServiceFrom] = useState(defaultFrom)
    const [serviceTo, setServiceTo] = useState(defaultTo)
    const [dueDate, setDueDate] = useState(today)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; message: string; invoiceId?: string } | null>(null)

    const needsCuit = mode === "identified" && condition !== "consumidor_final"
    const effectiveDocType = needsCuit ? "cuit" : docType
    const digits = docNumber.replace(/\D/g, "")
    const docValid = mode === "final" || (effectiveDocType === "cuit" ? digits.length === 11 : digits.length >= 7 && digits.length <= 8)
    const isTest = status.environment === "test"
    const dateError =
        !voucherDate || voucherDate < minVoucherDate || voucherDate > maxVoucherDate
            ? "ARCA solo acepta una fecha de emisión de hasta 10 días antes o después de hoy."
            : !serviceFrom || !serviceTo || serviceTo < serviceFrom
                ? "El período facturado termina antes de empezar."
                : !dueDate || dueDate < voucherDate
                    ? "El vencimiento para el pago no puede ser anterior a la fecha de emisión."
                    : null
    const formValid = docValid && (resuming || !dateError)

    const submit = async () => {
        if (!status.configured || !formValid || submitting) return
        setSubmitting(true)
        setResult(null)
        try {
            const receiver = mode === "final"
                ? { condition: "consumidor_final" }
                : {
                    condition,
                    doc_type: effectiveDocType,
                    doc_number: digits,
                    ...(name.trim() ? { name: name.trim() } : {}),
                }
            const response = await fetch("/api/invoicing/issue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    payment_id: payment.id,
                    receiver,
                    // Un intento retomado se reenvía con sus datos guardados.
                    ...(resuming ? {} : {
                        ...(description.trim() ? { description: description.trim() } : {}),
                        voucher_date: voucherDate,
                        service_from: serviceFrom,
                        service_to: serviceTo,
                        payment_due_date: dueDate,
                    }),
                }),
            })
            const body = await response.json().catch(() => null)
            const message = body?.data?.message ?? body?.error?.message ?? "No se pudo emitir la factura."
            setResult({
                ok: Boolean(body?.ok),
                message,
                invoiceId: body?.ok ? body?.data?.invoice?.id : undefined,
            })
            onIssued()
        } catch {
            setResult({ ok: false, message: "No se pudo contactar al servidor. Reintentá: nunca se duplica." })
        } finally {
            setSubmitting(false)
        }
    }

    const amount = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(payment.amount)

    // Una factura ya emitida nunca vuelve a mostrar el formulario, aunque el
    // diálogo se abra de nuevo o la lista se recargue detrás. Si se anula con
    // una nota de crédito sigue a la vista hasta que se pida una factura nueva.
    const showsIssued =
        invoice?.status === "authorized" || (invoice?.status === "credited" && !reissuing)
    const issuedId = result?.ok ? result.invoiceId : showsIssued ? invoice?.id : undefined
    const credited = invoice?.status === "credited"
    if (issuedId) {
        return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={onClose} />
                <div className="relative bg-[#1a1a1a] w-full sm:max-w-md p-4 sm:p-6 border border-white/10 rounded-t-xl sm:rounded-lg">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                            <h2 className="text-base font-semibold text-white">
                                {credited ? "Factura anulada" : "Factura emitida"}
                            </h2>
                            <p className="text-sm text-white/50 mt-1">
                                {payment.project_name} · {amount} · {MONTHS[payment.month - 1]} {payment.year}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1 text-white/40 hover:text-white rounded-lg">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <p className={cn(
                        "mb-4 text-sm rounded-lg px-3 py-2 border",
                        credited ? "text-white/60 border-white/10" : "text-emerald-300 border-emerald-400/20",
                    )}>
                        {credited
                            ? `La factura ${invoice ? formatVoucherNumber(invoice) : ""} quedó anulada por nota de crédito. El cobro puede facturarse de nuevo.`
                            : result?.ok
                                ? result.message
                                : `Factura ${invoice ? formatVoucherNumber(invoice) : ""} autorizada. CAE ${invoice?.cae ?? ""}.`}
                        {isTest && <span className="block mt-1 text-xs text-amber-300/90">Homologación: sin validez fiscal.</span>}
                    </p>
                    {invoice && invoice.id === issuedId && (
                        <CreditNotePanel
                            invoice={invoice}
                            creditNotes={creditNotes}
                            isTest={isTest}
                            onIssued={onIssued}
                        />
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={onClose} className="px-3 py-2 text-sm text-white/60 hover:text-white rounded-lg">
                            Cerrar
                        </button>
                        {credited && (
                            <button
                                onClick={() => { setReissuing(true); setResult(null) }}
                                className="px-3 py-2 text-sm text-white/80 hover:text-white border border-white/10 hover:border-white/20 rounded-lg"
                            >
                                Emitir factura nueva
                            </button>
                        )}
                        <a
                            href={`/api/invoicing/${issuedId}/pdf?download=1`}
                            className="px-3 py-2 text-sm text-white/80 hover:text-white border border-white/10 hover:border-white/20 rounded-lg"
                        >
                            Descargar PDF
                        </a>
                        <a
                            href={`/sistema/facturas/${issuedId}`}
                            target="_blank"
                            rel="noopener"
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Ver PDF
                        </a>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-[#1a1a1a] w-full sm:max-w-md p-4 sm:p-6 border border-white/10 rounded-t-xl sm:rounded-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                        <h2 className="text-base font-semibold text-white">
                            {resuming ? "Reintentar factura" : "Emitir factura C"}
                        </h2>
                        <p className="text-sm text-white/50 mt-1">
                            {payment.project_name} · {amount} · {MONTHS[payment.month - 1]} {payment.year}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 text-white/40 hover:text-white rounded-lg">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {!status.configured && (
                    <div className="mb-4 text-xs text-white/60 border border-white/10 rounded-lg px-3 py-2 space-y-1">
                        <p className="text-amber-300/90">La facturación ARCA todavía no está configurada en el servidor.</p>
                        <p>
                            Faltan <code className="text-white/80">ARCA_TAX_ID</code>, <code className="text-white/80">ARCA_ENVIRONMENT</code>, <code className="text-white/80">ARCA_SALES_POINT</code>, <code className="text-white/80">ARCA_ISSUER_CONDITION</code>, <code className="text-white/80">ARCA_CERTIFICATE_PEM</code> y <code className="text-white/80">ARCA_PRIVATE_KEY_PEM</code>. Los pasos están en docs/invoicing/ARCA_FACTURACION.md.
                        </p>
                    </div>
                )}

                {isTest && (
                    <p className="mb-4 text-xs text-amber-300/90 border border-amber-400/20 rounded-lg px-3 py-2">
                        Homologación de ARCA: el comprobante es de prueba y no tiene validez fiscal.
                    </p>
                )}

                {credited && (
                    <p className="mb-4 text-xs text-white/60 border border-white/10 rounded-lg px-3 py-2">
                        Nueva factura para este cobro: la {invoice ? formatVoucherNumber(invoice) : "anterior"} quedó anulada por nota de crédito.
                    </p>
                )}

                {resuming ? (
                    <p className="text-sm text-white/60 mb-5">
                        Hay un intento anterior sin confirmar{invoice?.last_error ? ` (${invoice.last_error})` : ""}. Se reintenta con el mismo número reservado y los mismos datos; ARCA nunca recibe dos facturas por este cobro.
                    </p>
                ) : (
                    <div className="space-y-4 mb-5">
                        <div className="grid grid-cols-2 gap-2">
                            {([
                                ["final", "Consumidor final"],
                                ["identified", "Con datos fiscales"],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMode(value)}
                                    className={cn(
                                        "px-3 py-2 rounded-lg text-sm border transition-colors",
                                        mode === value
                                            ? "border-white/30 bg-white/[0.06] text-white"
                                            : "border-white/10 text-white/50 hover:bg-white/[0.04]"
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {mode === "identified" && (
                            <>
                                <div>
                                    <label className="block text-xs text-white/50 mb-1.5">Condición frente al IVA</label>
                                    <select
                                        value={condition}
                                        onChange={(e) => setCondition(e.target.value)}
                                        className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30"
                                    >
                                        {RECEIVER_CONDITIONS.map((c) => (
                                            <option key={c.value} value={c.value} className="bg-[#1a1a1a]">{c.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-[96px_1fr] gap-2">
                                    <select
                                        value={effectiveDocType}
                                        disabled={needsCuit}
                                        onChange={(e) => setDocType(e.target.value as "cuit" | "dni")}
                                        className="px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white disabled:text-white/60 focus:outline-none focus:border-white/30"
                                    >
                                        <option value="cuit" className="bg-[#1a1a1a]">CUIT</option>
                                        <option value="dni" className="bg-[#1a1a1a]">DNI</option>
                                    </select>
                                    <input
                                        inputMode="numeric"
                                        placeholder={effectiveDocType === "cuit" ? "20-12345678-6" : "30111222"}
                                        value={docNumber}
                                        onChange={(e) => setDocNumber(e.target.value)}
                                        className="px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:border-white/30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-white/50 mb-1.5">Razón social (solo para el sistema)</label>
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30"
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-xs text-white/50 mb-1.5">Producto / Servicio</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                maxLength={500}
                                rows={2}
                                className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-white/30"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <DateField label="Período desde" value={serviceFrom} onChange={setServiceFrom} />
                            <DateField label="Período hasta" value={serviceTo} min={serviceFrom} onChange={setServiceTo} />
                            <DateField
                                label="Fecha de emisión"
                                value={voucherDate}
                                min={minVoucherDate}
                                max={maxVoucherDate}
                                onChange={(value) => {
                                    setVoucherDate(value)
                                    if (dueDate < value) setDueDate(value)
                                }}
                            />
                            <DateField label="Vto. para el pago" value={dueDate} min={voucherDate} onChange={setDueDate} />
                        </div>

                        {dateError ? (
                            <p className="text-xs text-red-300">{dateError}</p>
                        ) : (
                            <p className="text-xs text-white/40">
                                Una factura emitida no se borra: se corrige con nota de crédito.
                            </p>
                        )}
                    </div>
                )}

                {result && (
                    <p className={cn(
                        "mb-4 text-sm rounded-lg px-3 py-2 border",
                        result.ok ? "text-emerald-300 border-emerald-400/20" : "text-red-300 border-red-400/20"
                    )}>
                        {result.message}
                    </p>
                )}

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-2 text-sm text-white/60 hover:text-white rounded-lg">
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={!status.configured || !formValid || submitting}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {resuming ? "Reintentar" : "Emitir en ARCA"}
                    </button>
                </div>
            </div>
        </div>
    )
}
