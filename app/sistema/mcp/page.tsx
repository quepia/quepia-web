import { redirect } from "next/navigation"
import {
  CircleDot,
  KeyRound,
  Link2,
  LockKeyhole,
  UserRoundCheck,
} from "lucide-react"
import { McpShell } from "@/components/sistema/mcp/mcp-shell"
import { StatusCard } from "@/components/sistema/mcp/status-card"
import { McpWebError } from "@/lib/mcp/errors"
import { getMcpWebSession } from "@/lib/mcp/server"

export const dynamic = "force-dynamic"

export default async function McpControlPage() {
  let session: Awaited<ReturnType<typeof getMcpWebSession>>
  try {
    session = await getMcpWebSession()
  } catch (error) {
    if (error instanceof McpWebError && error.code === "UNAUTHENTICATED") {
      redirect("/auth/login?redirectTo=%2Fsistema%2Fmcp")
    }
    throw error
  }

  return (
    <McpShell
      eyebrow="Seguridad y conexiones"
      title="Control del acceso MCP"
      description="Este panel separa la sesión web humana del cliente MCP. No utiliza service_role y no concede permisos implícitos."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <StatusCard
          icon={UserRoundCheck}
          title="Sesión web verificada"
          tone="success"
        >
          <p className="break-all">{session.user.email ?? session.user.id}</p>
          <p className="mt-1">Nivel actual: {session.aal ?? "no disponible"}</p>
        </StatusCard>

        <StatusCard icon={LockKeyhole} title="Aprobaciones separadas" tone="info">
          El navegador solo puede aprobar una preparación vigente. Nunca ejecuta
          el commit del gasto ni recibe el nonce de aprobación. El nonce existe
          únicamente de forma efímera dentro del handler, entre dos llamadas a la
          base.
        </StatusCard>

        <StatusCard icon={Link2} title="Conexiones MCP" tone="neutral">
          La migración MVP no expone todavía un RPC web dedicado para listar o
          revocar conexiones. Este panel no consulta tablas privadas directamente.
        </StatusCard>

        <StatusCard icon={KeyRound} title="Capacidades" tone="neutral">
          El contexto del servicio se obtiene mediante{" "}
          <code className="font-mono text-xs text-white/80">mcp_get_context</code>,
          ligado al JWT OAuth. Una sesión web normal no suplanta ese contexto.
        </StatusCard>
      </div>

      <section className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
        <div className="flex items-start gap-3">
          <CircleDot className="mt-1 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-amber-100">
              Estado honesto del MVP
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-100/65">
              El flujo de revisión humana está implementado. La administración de
              grants, conexiones y el kill switch requiere un RPC web específico
              antes de habilitar controles en esta pantalla.
            </p>
          </div>
        </div>
      </section>
    </McpShell>
  )
}
