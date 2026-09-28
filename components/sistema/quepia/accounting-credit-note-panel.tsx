"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

export interface PaymentCreditNote {
    id: string
    invoice_id: string
    status: "pending" | "authorized" | "rejected" | "indeterminate" | "conflict" | "discarded"
    mode: "total" | "partial"
    amount_cents: number
    description: string
    voucher_class: string | null
    voucher_number: number | null
    sales_point: number
    cae: string | null
    last_error: string | null
}

interface CreditNotePanelProps {
    invoice: {
        id: string
        amount_cents: number
        voucher_class: string | null
        sales_point: number
        voucher_number: number | null
    }
    creditNotes: PaymentCreditNote[]
    isTest: boolean
    onIssued: () => void
}

const number = (salesPoint: number, voucherNumber: number | null) =>
    `${String(salesPoint).padStart(5, "0")}-${String(voucherNumber ?? 0).padStart(8, "0")}`

const money = (cents: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(cents / 100)

// "1.500,50" o "1500.50" → "1500.50"; null si no es un importe válido.
function normalizeAmount(value: string): string | null {
    const clean = value.trim().replace(/\s/g, "")
    const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean
    return /^\d{1,10}(\.\d{1,2})?$/.test(normalized) ? normalized : null
}

/**
 * Notas de crédito de una factura emitida: las ya autorizadas, una en curso
 * para reintentar y el formulario para emitir una nueva (total o parcial).
 */
export function CreditNotePanel({ invoice, creditNotes, isTest, onIssued }: CreditNotePanelProps) {
    const invoiceLabel = `Factura ${invoice.voucher_class ?? "C"} ${number(invoice.sales_point, invoice.voucher_number)}`
    const authorized = creditNotes.filter((note) => note.status === "authorized")
    const open = creditNotes.find((note) => note.status === "pending" || note.status === "indeterminate")
    const credited = authorized.reduce((sum, note) => sum + note.amount_cents, 0)
    const available = invoice.amount_cents - credited

    const [showForm, setShowForm] = useState(false)
    const [mode, setMode] = useState<"total" | "partial">(credited > 0 ? "partial" : "total")
    const [amount, setAmount] = useState("")
    const [description, setDescription] = useState(`Anulación de la ${invoiceLabel}`)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; message: string; noteId?: string } | null>(null)

    const normalizedAmount = normalizeAmount(amount)
    const amountCents = normalizedAmount ? Math.round(Number(normalizedAmount) * 100) : 0
    const amountError =
        mode === "partial" && amount && (!normalizedAmount || amountCents <= 0 || amountCents > available)
            ? `Ingresá un importe entre $ 0,01 y ${money(available)}.`
            : null
    const valid = description.trim().length > 0 && (mode === "total" || (Boolean(normalizedAmount) && !amountError))

    const submit = async (retry?: PaymentCreditNote) => {
        if (submitting || (!retry && !valid)) return
        setSubmitting(true)
        setResult(null)
        try {
            const body = retry
                ? {
                    invoice_id: invoice.id,
                    mode: retry.mode,
                    description: retry.description,
                    ...(retry.mode === "partial" ? { amount: (retry.amount_cents / 100).toFixed(2) } : {}),
                }
                : {
                    invoice_id: invoice.id,
                    mode,
                    description: description.trim(),
                    ...(mode === "partial" ? { amount: normalizedAmount } : {}),
                }
            const response = await fetch("/api/invoicing/credit-notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            const json = await response.json().catch(() => null)
            setResult({
                ok: Boolean(json?.ok),
                message: json?.data?.message ?? json?.error?.message ?? "No se pudo emitir la nota de crédito.",
                noteId: json?.ok ? json?.data?.credit_note?.id : undefined,
            })
            if (json?.ok) setShowForm(false)
            onIssued()
        } catch {
            setResult({ ok: false, message: "No se pudo contactar al servidor. Reintentá: nunca se duplica." })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="mb-5 space-y-3 border-t border-white/10 pt-4">
            {authorized.length > 0 && (
                <ul className="space-y-1 text-sm">
                    {authorized.map((note) => (
                        <li key={note.id} className="flex items-center justify-between gap-3">
                            <a
                                href={`/sistema/notas-de-credito/${note.id}`}
                                target="_blank"
                                rel="noopener"
                                className="text-white/70 hover:text-white hover:underline underline-offset-2 tabular-nums"
                            >
                                Nota de crédito {note.voucher_class ?? "C"} {number(note.sales_point, note.voucher_number)}
                            </a>
                            <span className="text-white/50 tabular-nums">{money(note.amount_cents)}</span>
                        </li>
                    ))}
                </ul>
            )}

            {result && (
                <p className={cn(
                    "text-sm rounded-lg px-3 py-2 border",
                    result.ok ? "text-emerald-300 border-emerald-400/20" : "text-red-300 border-red-400/20",
                )}>
                    {result.message}
                    {result.ok && result.noteId && (
                        <a
                            href={`/sistema/notas-de-credito/${result.noteId}`}
                            target="_blank"
                            rel="noopener"
                            className="ml-2 underline underline-offset-2"
                        >
                            Ver PDF
                        </a>
                    )}
                </p>
            )}

            {open ? (
                <div className="text-sm text-amber-300/90 border border-amber-400/20 rounded-lg px-3 py-2 space-y-2">
                    <p>
                        Hay una nota de crédito de {money(open.amount_cents)} sin confirmar
                        {open.last_error ? ` (${open.last_error})` : ""}. Se reintenta con el mismo número reservado; ARCA nunca recibe dos.
                    </p>
                    <button
                        onClick={() => submit(open)}
                        disabled={submitting}
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/90 hover:bg-amber-500 disabled:opacity-50 text-black rounded-md text-xs font-medium"
                    >
                        {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                        Reintentar nota de crédito
                    </button>
                </div>
            ) : available <= 0 ? (
                <p className="text-sm text-white/50">La factura está anulada por completo.</p>
            ) : !showForm ? (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-white/40">
                        {credited > 0 ? `Queda por acreditar ${money(available)}.` : "¿Hay que corregirla? Se anula con una nota de crédito."}
                    </p>
                    <button
                        onClick={() => { setShowForm(true); setResult(null) }}
                        className="shrink-0 px-3 py-1.5 text-xs text-white/70 hover:text-white border border-white/10 hover:border-white/20 rounded-md"
                    >
                        Nota de crédito
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        {([
                            ["total", "Anular toda la factura"],
                            ["partial", "Por un importe"],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                disabled={value === "total" && credited > 0}
                                onClick={() => {
                                    setMode(value)
                                    setDescription(`${value === "total" ? "Anulación" : "Ajuste"} de la ${invoiceLabel}`)
                                }}
                                className={cn(
                                    "px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-40",
                                    mode === value
                                        ? "border-white/30 bg-white/[0.06] text-white"
                                        : "border-white/10 text-white/50 hover:bg-white/[0.04]",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {mode === "partial" && (
                        <label className="block">
                            <span className="block text-xs text-white/50 mb-1.5">Importe a acreditar (máximo {money(available)})</span>
                            <input
                                inputMode="decimal"
                                placeholder="0,00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:border-white/30"
                            />
                        </label>
                    )}

                    <label className="block">
                        <span className="block text-xs text-white/50 mb-1.5">Producto / Servicio</span>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={500}
                            rows={2}
                            className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white resize-none focus:outline-none focus:border-white/30"
                        />
                    </label>

                    <p className={cn("text-xs", amountError ? "text-red-300" : "text-white/40")}>
                        {amountError ?? (
                            mode === "total"
                                ? `Se acredita ${money(invoice.amount_cents)} y el cobro queda libre para emitir una factura nueva.`
                                : "La nota de crédito también es un comprobante fiscal y no se puede borrar."
                        )}
                        {isTest && !amountError && " Homologación: sin validez fiscal."}
                    </p>

                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-white/60 hover:text-white rounded-lg">
                            Cancelar
                        </button>
                        <button
                            onClick={() => submit()}
                            disabled={!valid || submitting}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/90 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                        >
                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            Emitir nota de crédito
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
