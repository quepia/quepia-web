import "server-only"

import { NextResponse } from "next/server"
import { utf8ByteLength } from "@/lib/mcp/approval-request"
import type { IssueInvoiceResult } from "./issue-invoice"
import type { z } from "zod"
import type { IssueCreditNoteResult } from "./issue-credit-note"
import {
  issueCreditNoteRequestSchema,
  issueInvoiceRequestSchema,
  type IssueCreditNoteRequest,
  type IssueInvoiceRequest,
} from "./request-schema"

const MAX_BODY_BYTES = 4096

export function jsonResponse(
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

export function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return jsonResponse({ ok: false, error: { code, message } }, status)
}

async function readJsonRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | NextResponse> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
  if (contentType !== "application/json") {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "La solicitud requiere JSON.", 415)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return errorResponse("INVALID_REQUEST_BODY", "No se pudo leer la solicitud.", 400)
  }
  if (utf8ByteLength(rawBody) > MAX_BODY_BYTES) {
    return errorResponse("PAYLOAD_TOO_LARGE", "La solicitud excede el tamaño permitido.", 413)
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return errorResponse("INVALID_JSON", "El JSON no es válido.", 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return errorResponse(
      "INVALID_REQUEST",
      issue ? `${issue.path.join(".") || "request"}: ${issue.message}` : "Solicitud inválida.",
      400,
    )
  }
  return parsed.data
}

export function readIssueRequest(request: Request): Promise<IssueInvoiceRequest | NextResponse> {
  return readJsonRequest(request, issueInvoiceRequestSchema)
}

export function readCreditNoteRequest(request: Request): Promise<IssueCreditNoteRequest | NextResponse> {
  return readJsonRequest(request, issueCreditNoteRequestSchema)
}

// Los resultados fiscales no son errores HTTP: rejected o indeterminate son
// respuestas válidas que la UI y el MCP tienen que mostrar tal cual.
export function issueResultResponse(result: IssueInvoiceResult): NextResponse {
  const status = result.ok
    ? 200
    : result.outcome === "not_configured"
      ? 503
      : result.outcome === "denied"
        ? 409
        : 200
  if (result.ok) {
    return jsonResponse(
      {
        ok: true,
        data: { outcome: result.outcome, message: result.message, invoice: result.invoice },
      },
      status,
    )
  }
  return jsonResponse(
    {
      ok: false,
      data: result.invoice ? { outcome: result.outcome, invoice: result.invoice } : { outcome: result.outcome },
      error: { code: result.code, message: result.message },
    },
    status,
  )
}

export function creditNoteResultResponse(result: IssueCreditNoteResult): NextResponse {
  if (result.ok) {
    return jsonResponse(
      {
        ok: true,
        data: {
          outcome: result.outcome,
          message: result.message,
          credit_note: result.creditNote,
          invoice: result.invoice,
        },
      },
      200,
    )
  }
  const status = result.outcome === "not_configured" ? 503 : result.outcome === "denied" ? 409 : 200
  return jsonResponse(
    {
      ok: false,
      data: { outcome: result.outcome, credit_note: result.creditNote, invoice: result.invoice },
      error: { code: result.code, message: result.message },
    },
    status,
  )
}
