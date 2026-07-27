import { NextResponse } from "next/server"
import { utf8ByteLength } from "@/lib/mcp/approval-request"
import { voidMcpOperation } from "@/lib/mcp/activity"
import { isUuid } from "@/lib/mcp/contracts"
import { McpWebError } from "@/lib/mcp/errors"
import { getMcpWebSession } from "@/lib/mcp/server"
import {
  parseAllowedOrigins,
  validateSameOriginRequest,
} from "@/lib/mcp/security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_VOID_BODY_BYTES = 1024
const MAX_REASON_LENGTH = 500

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function errorResponse(error: McpWebError): NextResponse {
  return jsonResponse(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    },
    error.status,
  )
}

function parseReason(body: unknown): string | undefined | null {
  if (body === undefined || body === null) {
    return undefined
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return null
  }

  const candidate = (body as Record<string, unknown>).reason
  if (candidate === undefined || candidate === null) {
    return undefined
  }
  if (typeof candidate !== "string") {
    return null
  }

  const reason = candidate.trim()
  if (reason.length === 0) {
    return undefined
  }
  return reason.length <= MAX_REASON_LENGTH ? reason : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await params

  if (!isUuid(operationId)) {
    return errorResponse(
      new McpWebError(
        "NOT_FOUND",
        "El identificador de operación no es válido.",
        404,
      ),
    )
  }

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
    return errorResponse(
      new McpWebError(
        "FORBIDDEN",
        "La solicitud no proviene del panel web autorizado.",
        403,
      ),
    )
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
  if (contentType !== "application/json") {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "La anulación requiere JSON.",
        },
      },
      415,
    )
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_VOID_BODY_BYTES) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "La solicitud excede el tamaño permitido.",
        },
      },
      413,
    )
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "No se pudo leer la solicitud.",
        },
      },
      400,
    )
  }

  if (utf8ByteLength(rawBody) > MAX_VOID_BODY_BYTES) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "La solicitud excede el tamaño permitido.",
        },
      },
      413,
    )
  }

  let body: unknown
  if (rawBody.trim().length > 0) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: { code: "INVALID_JSON", message: "El JSON no es válido." },
        },
        400,
      )
    }
  }

  const reason = parseReason(body)
  if (reason === null) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "El motivo debe ser un texto de hasta 500 caracteres.",
        },
      },
      400,
    )
  }

  try {
    const session = await getMcpWebSession()
    const entry = await voidMcpOperation(session, operationId, reason)

    return jsonResponse(
      {
        ok: true,
        data: {
          operation_id: entry.operationId,
          status: entry.status,
          voided_at: entry.voidedAt,
        },
      },
      200,
    )
  } catch (error) {
    if (error instanceof McpWebError) {
      return errorResponse(error)
    }

    console.error("[MCP void] Unexpected internal error")
    return errorResponse(
      new McpWebError(
        "INTERNAL_ERROR",
        "No se pudo anular la operación.",
        500,
      ),
    )
  }
}
