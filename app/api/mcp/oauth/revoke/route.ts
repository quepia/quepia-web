import { NextResponse } from "next/server"
import {
  classifyMcpOAuthRevocation,
  parseMcpOAuthRevokeRequest,
} from "@/lib/mcp/oauth"
import {
  requireMcpOAuthAdmin,
  revokeMcpOAuthClient,
} from "@/lib/mcp/oauth-server"
import { McpWebError } from "@/lib/mcp/errors"
import { getMcpWebSession } from "@/lib/mcp/server"
import {
  parseAllowedOrigins,
  validateSameOriginRequest,
} from "@/lib/mcp/security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_REVOKE_BODY_BYTES = 1_024
const CONTROL_PAGE = "/sistema/mcp"
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

function panelRedirect(requestUrl: string, query: string): NextResponse {
  const url = new URL(CONTROL_PAGE, requestUrl)
  const [key, value] = query.split("=", 2)
  if (key && value) {
    url.searchParams.set(key, value)
  }

  return NextResponse.redirect(url, {
    status: 303,
    headers: NO_STORE_HEADERS,
  })
}

function errorQuery(error: McpWebError): string {
  if (error.code === "FORBIDDEN") return "error=forbidden"
  if (error.code === "CONTROL_PLANE_UNAVAILABLE") {
    return "error=control_plane_unavailable"
  }
  return "error=revoke_failed"
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
    contentLength > MAX_REVOKE_BODY_BYTES
  ) {
    return textResponse("Solicitud demasiado grande.", 413)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return textResponse("No se pudo leer la solicitud.", 400)
  }

  if (utf8ByteLength(rawBody) > MAX_REVOKE_BODY_BYTES) {
    return textResponse("Solicitud demasiado grande.", 413)
  }

  const clientId = parseMcpOAuthRevokeRequest(rawBody)
  if (!clientId) {
    return textResponse("Solicitud de revocación inválida.", 400)
  }

  try {
    const session = await getMcpWebSession()
    await requireMcpOAuthAdmin(session)
    const result = await revokeMcpOAuthClient(session, clientId)
    const status = classifyMcpOAuthRevocation({
      authSucceeded: result.auth.succeeded,
      databaseSucceeded: result.database.succeeded,
      databaseRevoked:
        result.database.succeeded && result.database.result.revoked,
    })
    return panelRedirect(
      request.url,
      `status=${status}`,
    )
  } catch (error) {
    if (error instanceof McpWebError) {
      if (error.code === "UNAUTHENTICATED") {
        return NextResponse.redirect(
          new URL(
            `/auth/login?redirectTo=${encodeURIComponent(CONTROL_PAGE)}`,
            request.url,
          ),
          {
            status: 303,
            headers: NO_STORE_HEADERS,
          },
        )
      }

      return panelRedirect(request.url, errorQuery(error))
    }

    console.error("[MCP lifecycle] Unexpected revoke error")
    return panelRedirect(request.url, "error=revoke_failed")
  }
}
