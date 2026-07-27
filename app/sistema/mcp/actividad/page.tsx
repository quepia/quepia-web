import { redirect } from "next/navigation"
import { AlertTriangle, History, ShieldX } from "lucide-react"
import { ActivityList } from "@/components/sistema/mcp/activity-list"
import { McpShell } from "@/components/sistema/mcp/mcp-shell"
import { StatusCard } from "@/components/sistema/mcp/status-card"
import { getMcpActivity } from "@/lib/mcp/activity"
import { McpWebError } from "@/lib/mcp/errors"
import { getMcpWebSession } from "@/lib/mcp/server"

export const dynamic = "force-dynamic"

const WINDOW_HOURS = 24

export default async function McpActivityPage() {
  try {
    const session = await getMcpWebSession()
    const activity = await getMcpActivity(session, { hours: WINDOW_HOURS })

    return (
      <McpShell
        eyebrow="Control posterior"
        title="Actividad contable del MCP"
        description="Los movimientos se registran al instante, sin aprobación previa. Acá revisás lo que quedó escrito y anulás lo que no corresponda."
      >
        <StatusCard
          icon={History}
          title={`Últimas ${activity.windowHours} horas`}
          tone="info"
        >
          Anular elimina la fila que creó esa operación y corrige el saldo. Solo
          alcanza lo que registró el MCP: la contabilidad cargada a mano queda
          fuera de su alcance.
        </StatusCard>

        <ActivityList
          entries={activity.entries}
          windowHours={activity.windowHours}
        />
      </McpShell>
    )
  } catch (error) {
    if (error instanceof McpWebError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/auth/login?redirectTo=%2Fsistema%2Fmcp%2Factividad")
      }

      if (error.code === "FORBIDDEN") {
        return (
          <ActivityError
            icon={ShieldX}
            title="Acceso denegado"
            message="La sesión está autenticada, pero el control plane no la reconoce como administradora de contabilidad."
            tone="danger"
          />
        )
      }

      if (
        error.code === "CONTROL_PLANE_UNAVAILABLE" ||
        error.code === "INVALID_RESPONSE"
      ) {
        return (
          <ActivityError
            icon={AlertTriangle}
            title="Actividad no disponible"
            message="No fue posible obtener la actividad mediante mcp_web_list_recent_operations. No se mostró información simulada."
          />
        )
      }
    }

    throw error
  }
}

function ActivityError({
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
      eyebrow="Control posterior"
      title="Actividad contable del MCP"
      description="El panel permanece cerrado si no puede obtener actividad autorizada desde el control plane."
    >
      <StatusCard icon={icon} title={title} tone={tone}>
        {message}
      </StatusCard>
    </McpShell>
  )
}
