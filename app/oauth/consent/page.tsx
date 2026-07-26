import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { AlertTriangle, SearchX } from "lucide-react"
import { McpShell } from "@/components/sistema/mcp/mcp-shell"
import { OAuthConsentCard } from "@/components/sistema/mcp/oauth-consent-card"
import { StatusCard } from "@/components/sistema/mcp/status-card"
import {
  buildOAuthConsentPath,
  isOAuthAuthorizationId,
  oauthConsentErrorMessage,
} from "@/lib/mcp/oauth"
import {
  getOAuthAuthorization,
  requireMcpOAuthAdmin,
} from "@/lib/mcp/oauth-server"
import { McpWebError } from "@/lib/mcp/errors"
import { getMcpWebSession } from "@/lib/mcp/server"
import { createOAuthCsrfToken } from "@/lib/mcp/oauth-csrf"
import {
  isOAuthCsrfCookieSecret,
  MCP_OAUTH_CSRF_COOKIE_NAME,
} from "@/lib/mcp/oauth-csrf-cookie"

export const dynamic = "force-dynamic"

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{
    authorization_id?: string | string[]
    error?: string | string[]
  }>
}) {
  const params = await searchParams
  const authorizationId = firstSearchParam(params.authorization_id)

  if (!isOAuthAuthorizationId(authorizationId)) {
    return (
      <ConsentError
        icon={SearchX}
        title="Solicitud inválida"
        message="La URL no contiene un identificador de autorización válido. No se concedió acceso."
      />
    )
  }

  const consentPath = buildOAuthConsentPath(authorizationId)
  let session: Awaited<ReturnType<typeof getMcpWebSession>>

  try {
    session = await getMcpWebSession()
  } catch (error) {
    if (
      error instanceof McpWebError &&
      error.code === "UNAUTHENTICATED"
    ) {
      redirect(
        `/auth/login?redirectTo=${encodeURIComponent(consentPath)}`,
      )
    }
    throw error
  }

  try {
    await requireMcpOAuthAdmin(session)
    const authorization = await getOAuthAuthorization(
      session,
      authorizationId,
    )

    if (authorization.kind === "redirect") {
      // Supabase no incluye client_id en este contrato. El grant MCP no expira
      // de manera independiente del consentimiento OAuth; si fue revocado, el
      // access-token hook no emite la audiencia MCP y el servicio lo rechaza.
      redirect(authorization.redirectUrl)
    }

    const cookieStore = await cookies()
    const cookieSecret = cookieStore.get(
      MCP_OAUTH_CSRF_COOKIE_NAME,
    )?.value
    if (!isOAuthCsrfCookieSecret(cookieSecret)) {
      return (
        <ConsentError
          icon={AlertTriangle}
          title="Autorización no disponible"
          message="No fue posible preparar la protección del formulario. Volvé a iniciar la conexión."
        />
      )
    }
    const csrfToken = createOAuthCsrfToken({
      authorizationId,
      userId: session.user.id,
      sessionId: session.sessionId,
      cookieSecret,
    })

    return (
      <McpShell
        eyebrow="Autorización OAuth 2.1"
        title="Revisá antes de conectar"
        description="Una aplicación de IA quiere usar el MCP de Quepia en tu nombre. La identidad, el cliente y el destino se obtuvieron directamente del servidor de autorización."
      >
        <OAuthConsentCard
          details={authorization.details}
          errorMessage={oauthConsentErrorMessage(params.error)}
          csrfToken={csrfToken}
        />
      </McpShell>
    )
  } catch (error) {
    if (error instanceof McpWebError) {
      if (error.code === "NOT_FOUND") {
        return (
          <ConsentError
            icon={SearchX}
            title="Solicitud no disponible"
            message="La autorización venció, ya fue utilizada o el servidor OAuth todavía no está habilitado."
          />
        )
      }

      if (error.code === "FORBIDDEN") {
        return (
          <ConsentError
            icon={AlertTriangle}
            title="Acceso denegado"
            message="El RPC no reconoce esta sesión web como administradora global habilitada. No se mostró la solicitud ni se concedió acceso."
          />
        )
      }

      if (
        error.code === "CONTROL_PLANE_UNAVAILABLE" ||
        error.code === "INVALID_RESPONSE"
      ) {
        return (
          <ConsentError
            icon={AlertTriangle}
            title="Autorización no disponible"
            message="No fue posible verificar y provisionar la solicitud con Supabase. No se mostró información simulada, no se redirigió y no se concedió acceso."
          />
        )
      }

      return (
        <ConsentError
          icon={AlertTriangle}
          title="Autorización no disponible"
          message="No fue posible validar la solicitud con el control plane. No se concedió acceso."
        />
      )
    }

    throw error
  }
}

function ConsentError({
  icon,
  title,
  message,
}: {
  icon: typeof AlertTriangle
  title: string
  message: string
}) {
  return (
    <McpShell
      eyebrow="Autorización OAuth 2.1"
      title="No se puede continuar"
      description="La conexión permanece bloqueada hasta verificar una solicitud válida."
    >
      <StatusCard icon={icon} title={title} tone="warning">
        {message}
      </StatusCard>
    </McpShell>
  )
}
