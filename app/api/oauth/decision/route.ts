import { NextResponse } from "next/server"
import {
  buildOAuthConsentPath,
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
  parseAllowedOrigins,
  validateSameOriginRequest,
} from "@/lib/mcp/security"

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

function oauthRedirect(url: string): NextResponse {
  return NextResponse.redirect(url, {
    status: 303,
    headers: NO_STORE_HEADERS,
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

export async function POST(request: Request) {
  const allowedOrigins = parseAllowedOrigins(
    process.env.MCP_WEB_ALLOWED_ORIGINS,
  )
  if (
    !validateSameOriginRequest({
      requestUrl: request.url,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      additionalAllowedOrigins: allowedOrigins,
    })
  ) {
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
    const session = await getMcpWebSession()
    await requireMcpOAuthAdmin(session)

    const authorization = await getOAuthAuthorization(
      session,
      decisionRequest.authorizationId,
    )

    if (authorization.kind === "redirect") {
      return oauthRedirect(authorization.redirectUrl)
    }

    if (decisionRequest.decision === "approve") {
      await provisionMcpOAuthClient(
        session,
        authorization.details.client.id,
      )
    }

    const redirectUrl = await resolveOAuthDecisionRedirect(
      session,
      decisionRequest.authorizationId,
      decisionRequest.decision,
    )

    return oauthRedirect(redirectUrl)
  } catch (error) {
    if (error instanceof McpWebError) {
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
