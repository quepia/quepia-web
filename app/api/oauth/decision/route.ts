import { NextRequest, NextResponse } from "next/server"
import {
  buildOAuthConsentPath,
  buildOAuthRedirectDocument,
  parseOAuthDecisionRequest,
} from "@/lib/mcp/oauth"
import {
  getOAuthAuthorization,
  provisionMcpOAuthClient,
  requireMcpOAuthAdmin,
  resolveOAuthDecisionRedirect,
} from "@/lib/mcp/oauth-server"
import { McpWebError } from "@/lib/mcp/errors"
import { getMcpWebSession } from "@/lib/mcp/server"
import {
  isOpaqueSameOriginOAuthRequest,
  parseAllowedOrigins,
  validateSameOriginRequest,
} from "@/lib/mcp/security"
import { verifyOAuthCsrfToken } from "@/lib/mcp/oauth-csrf"
import {
  isOAuthCsrfCookieSecret,
  MCP_OAUTH_CSRF_COOKIE_NAME,
} from "@/lib/mcp/oauth-csrf-cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_DECISION_BODY_BYTES = 2_048
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function originFromHeader(value: string | null): string | null {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return value === "null" ? "null" : "invalid"
  }
}

function textResponse(message: string, status: number): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}

function internalRedirect(
  requestUrl: string,
  path: string,
): NextResponse {
  return NextResponse.redirect(new URL(path, requestUrl), {
    status: 303,
    headers: NO_STORE_HEADERS,
  })
}

// Devuelve un documento same-origin en vez de un 303 cross-origin: la CSP del
// sitio declara `form-action 'self'` y los navegadores la aplican también al
// redirect que sigue al envío del formulario, de modo que el retorno al cliente
// OAuth quedaría bloqueado sin ningún error visible.
function oauthRedirect(url: string): NextResponse {
  return new NextResponse(buildOAuthRedirectDocument(url), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
    },
  })
}

function errorCodeFor(error: McpWebError): string {
  if (error.code === "UNAUTHENTICATED") return "session_expired"
  if (error.code === "FORBIDDEN") return "admin_required"
  if (error.code === "NOT_FOUND") return "authorization_expired"
  if (error.code === "CONTROL_PLANE_UNAVAILABLE") {
    return "oauth_unavailable"
  }
  return "request_failed"
}

export async function POST(request: NextRequest) {
  let stage = "request_validation"
  const allowedOrigins = parseAllowedOrigins(
    process.env.MCP_WEB_ALLOWED_ORIGINS,
  )
  const origin = request.headers.get("origin")
  const secFetchSite = request.headers.get("sec-fetch-site")
  const hasTrustedOrigin = validateSameOriginRequest({
    requestUrl: request.url,
    origin,
    secFetchSite,
    additionalAllowedOrigins: allowedOrigins,
  })
  const hasOpaqueSameOrigin =
    isOpaqueSameOriginOAuthRequest({ origin, secFetchSite })
  if (!hasTrustedOrigin && !hasOpaqueSameOrigin) {
    console.warn(
      "[OAuth decision] Request origin rejected",
      JSON.stringify({
        requestOrigin: new URL(request.url).origin,
        origin: originFromHeader(origin),
        refererOrigin: originFromHeader(request.headers.get("referer")),
        secFetchSite,
        host: request.headers.get("host"),
        forwardedHost: request.headers.get("x-forwarded-host"),
      }),
    )
    return textResponse("Solicitud cross-site rechazada.", 403)
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
  if (contentType !== "application/x-www-form-urlencoded") {
    return textResponse("Tipo de contenido no admitido.", 415)
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_DECISION_BODY_BYTES
  ) {
    return textResponse("Solicitud demasiado grande.", 413)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return textResponse("No se pudo leer la solicitud.", 400)
  }

  if (utf8ByteLength(rawBody) > MAX_DECISION_BODY_BYTES) {
    return textResponse("Solicitud demasiado grande.", 413)
  }

  const decisionRequest = parseOAuthDecisionRequest(rawBody)
  if (!decisionRequest) {
    return textResponse("Solicitud OAuth inválida.", 400)
  }

  const consentPath = buildOAuthConsentPath(
    decisionRequest.authorizationId,
  )

  try {
    stage = "session_validation"
    const session = await getMcpWebSession()
    const cookieSecret = request.cookies.get(
      MCP_OAUTH_CSRF_COOKIE_NAME,
    )?.value
    if (
      !isOAuthCsrfCookieSecret(cookieSecret) ||
      !verifyOAuthCsrfToken(decisionRequest.csrfToken, {
        authorizationId: decisionRequest.authorizationId,
        userId: session.user.id,
        sessionId: session.sessionId,
        cookieSecret,
      })
    ) {
      console.warn(
        "[OAuth decision] CSRF token rejected",
        JSON.stringify({
          origin: originFromHeader(origin),
          secFetchSite,
          hasOpaqueSameOrigin,
          hasCookie: Boolean(cookieSecret),
        }),
      )
      return textResponse("Token CSRF inválido o vencido.", 403)
    }

    stage = "admin_validation"
    await requireMcpOAuthAdmin(session)

    stage = "authorization_details"
    const authorization = await getOAuthAuthorization(
      session,
      decisionRequest.authorizationId,
    )

    if (authorization.kind === "redirect") {
      // Salida temprana: la autorización ya venía resuelta, así que no se
      // provisiona ni se registra decisión alguna. Produce la misma pantalla de
      // retorno que el camino normal, y sin este registro las dos rutas eran
      // imposibles de distinguir desde afuera.
      console.info(
        "[OAuth decision] Autorización ya resuelta por el servidor OAuth",
        JSON.stringify({ decision: decisionRequest.decision }),
      )
      return oauthRedirect(authorization.redirectUrl)
    }

    if (decisionRequest.decision === "approve") {
      stage = "client_provisioning"
      await provisionMcpOAuthClient(
        session,
        authorization.details.client.id,
      )
    }

    stage = "consent_decision"
    const redirectUrl = await resolveOAuthDecisionRedirect(
      session,
      decisionRequest.authorizationId,
      decisionRequest.decision,
    )

    // El destino final decide si el cliente OAuth recibe un código o un error,
    // y hasta acá era invisible: la pantalla de retorno se ve igual en ambos
    // casos. Se registran los nombres de los parámetros y el origen, nunca el
    // código de autorización ni el state.
    try {
      const target = new URL(redirectUrl)
      console.info(
        "[OAuth decision] Redirigiendo al cliente",
        JSON.stringify({
          decision: decisionRequest.decision,
          targetOrigin: target.origin,
          params: [...target.searchParams.keys()].sort(),
          hasCode: target.searchParams.has("code"),
          error: target.searchParams.get("error"),
        }),
      )
    } catch {
      console.warn("[OAuth decision] Destino de redirect ilegible")
    }

    return oauthRedirect(redirectUrl)
  } catch (error) {
    if (error instanceof McpWebError) {
      console.error(
        "[OAuth decision] Request failed",
        JSON.stringify({
          stage,
          code: error.code,
          status: error.status,
        }),
      )
      if (error.code === "UNAUTHENTICATED") {
        return internalRedirect(
          request.url,
          `/auth/login?redirectTo=${encodeURIComponent(consentPath)}`,
        )
      }

      return internalRedirect(
        request.url,
        buildOAuthConsentPath(
          decisionRequest.authorizationId,
          errorCodeFor(error),
        ),
      )
    }

    console.error("[OAuth decision] Unexpected internal error")
    return internalRedirect(
      request.url,
      buildOAuthConsentPath(
        decisionRequest.authorizationId,
        "request_failed",
      ),
    )
  }
}
