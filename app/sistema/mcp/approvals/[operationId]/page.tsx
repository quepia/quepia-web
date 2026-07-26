import { redirect } from "next/navigation"
import {
  AlertTriangle,
  LockKeyhole,
  SearchX,
  ShieldX,
} from "lucide-react"
import { McpShell } from "@/components/sistema/mcp/mcp-shell"
import { OperationDetails } from "@/components/sistema/mcp/operation-details"
import { StatusCard } from "@/components/sistema/mcp/status-card"
import { isUuid } from "@/lib/mcp/contracts"
import { McpWebError } from "@/lib/mcp/errors"
import {
  getMcpExpenseOperation,
  getMcpWebSession,
} from "@/lib/mcp/server"

export const dynamic = "force-dynamic"

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ operationId: string }>
}) {
  const { operationId } = await params

  if (!isUuid(operationId)) {
    return (
      <ApprovalError
        icon={SearchX}
        title="Identificador inválido"
        message="La URL no contiene un identificador de operación válido. No se leyó ni aprobó ningún payload."
      />
    )
  }

  try {
    const session = await getMcpWebSession()
    const operation = await getMcpExpenseOperation(
      session.supabase,
      operationId,
    )

    return (
      <McpShell
        eyebrow="Aprobación humana"
        title="Revisá la operación preparada"
        description="Los datos de abajo se cargan desde el control plane usando tu sesión. Ningún importe, estado ni payload se toma de la URL."
      >
        <OperationDetails operation={operation} aal={session.aal} />
      </McpShell>
    )
  } catch (error) {
    if (error instanceof McpWebError) {
      if (error.code === "UNAUTHENTICATED") {
        const redirectTo = encodeURIComponent(
          `/sistema/mcp/approvals/${operationId}`,
        )
        redirect(`/auth/login?redirectTo=${redirectTo}`)
      }

      if (error.code === "FORBIDDEN") {
        return (
          <ApprovalError
            icon={ShieldX}
            title="Acceso denegado"
            message="La sesión está autenticada, pero no puede revisar esta operación. No se reveló su payload."
            tone="danger"
          />
        )
      }

      if (error.code === "NOT_FOUND") {
        return (
          <ApprovalError
            icon={SearchX}
            title="Operación no disponible"
            message="No existe, expiró fuera del período de retención o no pertenece a tu sesión."
          />
        )
      }

      if (error.code === "INVALID_RESPONSE") {
        return (
          <ApprovalError
            icon={AlertTriangle}
            title="Payload inválido"
            message="La respuesta no cumple el contrato seguro. La página bloqueó la vista y no emitió una aprobación."
            tone="danger"
          />
        )
      }

      if (error.code === "CONTROL_PLANE_UNAVAILABLE") {
        return (
          <ApprovalError
            icon={LockKeyhole}
            title="Control plane no disponible"
            message="El RPC de consulta aún no está desplegado en este entorno. No se simuló ningún dato."
          />
        )
      }
    }

    throw error
  }
}
function ApprovalError({
  icon,
  title,
  message,
  tone = "warning",
}: {
  icon: typeof AlertTriangle
  title: string
  message: string
  tone?: "warning" | "danger"
}) {
  return (
    <McpShell
      eyebrow="Aprobación humana"
      title="No se puede revisar la operación"
      description="La aprobación permanece bloqueada hasta obtener una operación válida desde la base."
    >
      <StatusCard icon={icon} title={title} tone={tone}>
        {message}
      </StatusCard>
    </McpShell>
  )
}
