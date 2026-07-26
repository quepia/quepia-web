import { NextResponse } from "next/server"
import {
  parseMcpApprovalRequest,
  utf8ByteLength,
} from "@/lib/mcp/approval-request"
import { isUuid } from "@/lib/mcp/contracts"
import { McpWebError } from "@/lib/mcp/errors"
import {
  approveMcpExpense,
  getMcpExpenseOperation,
  getMcpWebSession,
} from "@/lib/mcp/server"
import {
  parseAllowedOrigins,
  validateSameOriginRequest,
} from "@/lib/mcp/security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_APPROVAL_BODY_BYTES = 1024

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
          message: "La aprobación requiere JSON.",
        },
      },
      415,
    )
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_APPROVAL_BODY_BYTES
  ) {
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

  if (utf8ByteLength(rawBody) > MAX_APPROVAL_BODY_BYTES) {
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

  const approvalBody = parseMcpApprovalRequest(body)
  if (!approvalBody) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "La intención o el hash revisado no son válidos.",
        },
      },
      400,
    )
  }

  try {
    const session = await getMcpWebSession()
    const operation = await getMcpExpenseOperation(
      session.supabase,
      operationId,
    )
    const approval = await approveMcpExpense(session, {
      operation,
      viewedPayloadHash: approvalBody.viewedHash,
    })

    return jsonResponse(
      {
        ok: true,
        data: {
          operation_id: approval.operationId,
          status: approval.status,
          approved_at: approval.approvedAt,
        },
      },
      200,
    )
  } catch (error) {
    if (error instanceof McpWebError) {
      return errorResponse(error)
    }

    console.error("[MCP approval] Unexpected error", error)
    return errorResponse(
      new McpWebError(
        "INTERNAL_ERROR",
        "No se pudo registrar la aprobación.",
        500,
      ),
    )
  }
}
