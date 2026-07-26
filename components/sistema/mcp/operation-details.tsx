import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ShieldAlert,
  XCircle,
} from "lucide-react"
import {
  operationCanBeApproved,
  operationIsExpired,
  type McpExpenseOperation,
} from "@/lib/mcp/contracts"
import type { McpAuthenticatorLevel } from "@/lib/mcp/server"
import { ApprovalButton } from "@/components/sistema/mcp/approval-button"
import { StatusCard } from "@/components/sistema/mcp/status-card"

const STATUS_LABELS: Record<McpExpenseOperation["status"], string> = {
  prepared: "Preparada",
  awaiting_approval: "Esperando aprobación",
  approved: "Aprobada",
  committed: "Registrada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
  failed: "Fallida",
  revoked: "Revocada",
}

function terminalState(operation: McpExpenseOperation) {
  if (operationIsExpired(operation)) {
    return {
      icon: Clock3,
      tone: "warning" as const,
      title: "La solicitud expiró",
      description:
        "No puede aprobarse. Pedí al cliente MCP que prepare una operación nueva.",
    }
  }

  switch (operation.status) {
    case "approved":
      return {
        icon: CheckCircle2,
        tone: "success" as const,
        title: "Esta operación ya fue aprobada",
        description:
          "No se emitirá una segunda aprobación. El cliente MCP puede continuar con el commit.",
      }
    case "committed":
      return {
        icon: FileCheck2,
        tone: "success" as const,
        title: "El gasto ya fue registrado",
        description:
          "La operación terminó y no admite otra aprobación desde esta página.",
      }
    case "revoked":
    case "cancelled":
      return {
        icon: Ban,
        tone: "danger" as const,
        title:
          operation.status === "revoked"
            ? "La operación fue revocada"
            : "La operación fue cancelada",
        description:
          "El permiso o la operación dejó de estar vigente. No se realizó una nueva aprobación.",
      }
    case "rejected":
      return {
        icon: XCircle,
        tone: "danger" as const,
        title: "La operación fue rechazada",
        description: "Su estado es final y no puede aprobarse desde este enlace.",
      }
    case "failed":
      return {
        icon: AlertTriangle,
        tone: "danger" as const,
        title: "La operación falló",
        description:
          "No puede aprobarse. Revisá el audit log antes de volver a prepararla.",
      }
    case "prepared":
      return {
        icon: Clock3,
        tone: "neutral" as const,
        title: "Todavía no solicitó aprobación",
        description:
          "El control plane debe pasarla a awaiting_approval antes de habilitar esta acción.",
      }
    default:
      return null
  }
}

export function OperationDetails({
  operation,
  aal,
}: {
  operation: McpExpenseOperation
  aal: McpAuthenticatorLevel
}) {
  const state = terminalState(operation)
  const insufficientAal = aal !== "aal2"
  const canApprove = operationCanBeApproved(operation) && !insufficientAal

  return (
    <div className="space-y-5">
      {state && (
        <StatusCard icon={state.icon} title={state.title} tone={state.tone}>
          {state.description}
        </StatusCard>
      )}

      {!state && insufficientAal && (
        <StatusCard
          icon={ShieldAlert}
          title="Se requiere autenticación AAL2"
          tone="warning"
        >
          Tu sesión actual es {aal ?? "desconocida"}. La base también rechazará la
          aprobación hasta que completes MFA y obtengas una sesión AAL2.
        </StatusCard>
      )}

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
        <div className="grid gap-px bg-white/10 sm:grid-cols-2">
          <Detail label="Estado" value={STATUS_LABELS[operation.status]} />
          <Detail label="Riesgo" value={String(operation.riskLevel)} />
          <Detail label="Expiración" value={operation.expiresAt} />
          <Detail label="Hash del payload" value={operation.payloadHash} mono />
        </div>

        <div className="border-t border-white/10 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
              Payload normalizado
            </h2>
            <span className="text-[11px] text-white/35">Solo lectura</span>
          </div>
          <pre className="max-h-[28rem] overflow-auto rounded-xl border border-white/10 bg-black/35 p-4 font-mono text-xs leading-6 text-white/75">
            {JSON.stringify(operation.normalizedPayload, null, 2)}
          </pre>
        </div>
      </section>

      {operation.status === "awaiting_approval" && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-sm font-semibold text-white">Confirmación humana</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            La aprobación se liga al hash mostrado. Este paso no registra el gasto:
            solamente habilita al control plane para ejecutar el commit validado.
          </p>
          <div className="mt-5">
            <ApprovalButton
              operationId={operation.operationId}
              payloadHash={operation.payloadHash}
              disabled={!canApprove}
              disabledReason={
                insufficientAal
                  ? "Completá autenticación multifactor antes de aprobar."
                  : operationIsExpired(operation)
                    ? "La operación expiró."
                    : undefined
              }
            />
          </div>
        </section>
      )}
    </div>
  )
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0 bg-[#111] p-5">
      <dt className="text-xs uppercase tracking-[0.16em] text-white/35">{label}</dt>
      <dd
        className={`mt-2 break-all text-sm text-white/80 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  )
}
