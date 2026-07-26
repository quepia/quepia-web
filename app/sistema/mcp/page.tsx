import { redirect } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  LockKeyhole,
  UserRoundCheck,
} from "lucide-react"
import { McpShell } from "@/components/sistema/mcp/mcp-shell"
import { OAuthLifecycleList } from "@/components/sistema/mcp/oauth-lifecycle-list"
import { StatusCard } from "@/components/sistema/mcp/status-card"
import { McpWebError } from "@/lib/mcp/errors"
import { getMcpOAuthLifecycle } from "@/lib/mcp/oauth-server"
import { getMcpWebSession } from "@/lib/mcp/server"

export const dynamic = "force-dynamic"

export default async function McpControlPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[]
    error?: string | string[]
  }>
}) {
  const query = await searchParams
  let session: Awaited<ReturnType<typeof getMcpWebSession>>
  try {
    session = await getMcpWebSession()
  } catch (error) {
    if (error instanceof McpWebError && error.code === "UNAUTHENTICATED") {
      redirect("/auth/login?redirectTo=%2Fsistema%2Fmcp")
    }
    throw error
  }

  let lifecycle: Awaited<ReturnType<typeof getMcpOAuthLifecycle>>
  try {
    lifecycle = await getMcpOAuthLifecycle(session)
  } catch (error) {
    if (error instanceof McpWebError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/auth/login?redirectTo=%2Fsistema%2Fmcp")
      }

      if (error.code === "FORBIDDEN") {
        return (
          <LifecycleError
            title="Acceso denegado"
            message="El RPC no reconoce esta sesión web como administradora global habilitada."
          />
        )
      }

      if (
        error.code === "CONTROL_PLANE_UNAVAILABLE" ||
        error.code === "INVALID_RESPONSE"
      ) {
        return (
          <LifecycleError
            title="Lifecycle no disponible"
            message="No fue posible obtener el estado mediante mcp_list_oauth_clients. No se consultaron tablas privadas ni se mostró información simulada."
          />
        )
      }

      return (
        <LifecycleError
          title="Lifecycle no disponible"
          message="El control plane no pudo validar esta sesión ni devolver un estado confiable."
        />
      )
    }

    throw error
  }

  const notice = lifecycleNotice(query.status, query.error)

  return (
    <McpShell
      eyebrow="Seguridad y conexiones"
      title="Control del acceso MCP"
      description="Este panel separa la sesión web humana del cliente MCP. No utiliza service_role y no concede permisos implícitos."
    >
      {notice ? (
        <StatusCard
          icon={notice.tone === "success" ? CheckCircle2 : AlertTriangle}
          title={notice.title}
          tone={notice.tone}
        >
          {notice.message}
        </StatusCard>
      ) : null}

      <div className={`grid gap-4 md:grid-cols-2 ${notice ? "mt-4" : ""}`}>
        <StatusCard
          icon={UserRoundCheck}
          title="Sesión web verificada"
          tone="success"
        >
          <p className="break-all">{session.user.email ?? session.user.id}</p>
          <p className="mt-1">
            Administrador global validado por RPC.
          </p>
        </StatusCard>

        <StatusCard icon={Link2} title="Recurso protegido" tone="info">
          <p className="break-all font-mono text-xs">
            {lifecycle.resourceUri}
          </p>
          <p className="mt-1">
            Clientes y grants se obtienen por RPC con tu sesión web directa.
          </p>
        </StatusCard>
      </div>

      <OAuthLifecycleList lifecycle={lifecycle} />

      <StatusCard
        icon={LockKeyhole}
        title="Límite de visibilidad"
        tone="neutral"
      >
        El RPC expone clientes y el grant propio, pero no enumera sesiones de
        conexión individuales. Al revocar, la base sí marca las conexiones
        activas del mismo usuario y cliente como revocadas.
      </StatusCard>
    </McpShell>
  )
}

function LifecycleError({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <McpShell
      eyebrow="Seguridad y conexiones"
      title="Control del acceso MCP"
      description="El panel permanece cerrado si no puede obtener estado autorizado desde el control plane."
    >
      <StatusCard icon={AlertTriangle} title={title} tone="warning">
        {message}
      </StatusCard>
    </McpShell>
  )
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function lifecycleNotice(
  statusValue: string | string[] | undefined,
  errorValue: string | string[] | undefined,
): {
  title: string
  message: string
  tone: "success" | "warning" | "danger"
} | null {
  const error = firstQueryValue(errorValue)
  if (error === "forbidden") {
    return {
      title: "Revocación rechazada",
      message: "Tu sesión no tiene permiso para administrar este grant.",
      tone: "danger",
    }
  }
  if (error === "control_plane_unavailable") {
    return {
      title: "Control plane no disponible",
      message: "No se modificó ningún grant.",
      tone: "warning",
    }
  }
  if (error) {
    return {
      title: "No se pudo revocar",
      message: "El acceso conserva el estado mostrado por el RPC.",
      tone: "danger",
    }
  }

  const status = firstQueryValue(statusValue)
  if (status === "revoked") {
    return {
      title: "Acceso revocado",
      message:
        "Se revocó el grant MCP, se cortaron sus conexiones activas y Supabase Auth invalidó el grant OAuth.",
      tone: "success",
    }
  }
  if (status === "already_revoked") {
    return {
      title: "Acceso ya revocado",
      message:
        "No había un grant MCP activo y se invalidó cualquier grant OAuth restante.",
      tone: "success",
    }
  }
  if (status === "revoked_db_only") {
    return {
      title: "Kill switch MCP aplicado",
      message:
        "El grant y las conexiones MCP quedaron revocados, pero Supabase Auth no confirmó la invalidación de sus tokens OAuth. El hook ya no emitirá la audiencia MCP, por lo que esos tokens no obtienen acceso; reintentá la revocación para eliminar también consentimiento, sesiones y refresh tokens.",
      tone: "warning",
    }
  }
  if (status === "revoked_auth_only") {
    return {
      title: "OAuth revocado; falta confirmar MCP",
      message:
        "Supabase Auth revocó consentimiento, sesiones y refresh tokens, pero el RPC no confirmó el grant MCP. Las sesiones OAuth revocadas no pueden usar el servicio; reintentá para completar el kill switch y su auditoría DB.",
      tone: "warning",
    }
  }
  if (status === "revocation_failed") {
    return {
      title: "Revocación no confirmada",
      message:
        "Ni Supabase Auth ni el control plane confirmaron la revocación. El estado no se da por modificado: reintentá desde el mismo cliente.",
      tone: "danger",
    }
  }

  return null
}
