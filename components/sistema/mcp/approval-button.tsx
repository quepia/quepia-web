"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, LoaderCircle } from "lucide-react"

interface ApprovalApiResponse {
  ok: boolean
  data?: {
    operation_id: string
    status: string
    approved_at: string | null
  }
  error?: {
    code: string
    message: string
  }
}
export function ApprovalButton({
  operationId,
  payloadHash,
  disabled,
  disabledReason,
}: {
  operationId: string
  payloadHash: string
  disabled: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)

  async function approve() {
    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/mcp/approvals/${operationId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "approve_expense",
          viewed_hash: payloadHash,
        }),
      })
      const result = (await response.json()) as ApprovalApiResponse

      if (response.status === 401) {
        const redirectTo = encodeURIComponent(window.location.pathname)
        window.location.assign(`/auth/login?redirectTo=${redirectTo}`)
        return
      }

      if (!response.ok || !result.ok) {
        setMessage(
          result.error?.message ??
            "No se pudo registrar la aprobación. Volvé a cargar la página.",
        )
        return
      }

      setApproved(true)
      setMessage("Aprobación registrada. El gasto todavía no fue confirmado.")
      router.refresh()
    } catch {
      setMessage(
        "No pudimos contactar al control plane. La operación no fue aprobada.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled || isSubmitting || approved}
        onClick={approve}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-quepia-cyan px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#63efed] focus:outline-none focus:ring-2 focus:ring-quepia-cyan/50 focus:ring-offset-2 focus:ring-offset-[#111] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
      >
        {isSubmitting ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" aria-hidden="true" />
        )}
        {isSubmitting
          ? "Verificando…"
          : approved
            ? "Aprobación registrada"
            : "Aprobar esta operación"}
      </button>
      {(disabledReason || message) && (
        <p
          className={`mt-3 text-sm ${message && !approved ? "text-amber-300" : "text-white/50"}`}
          role="status"
          aria-live="polite"
        >
          {message ?? disabledReason}
        </p>
      )}
    </div>
  )
}
