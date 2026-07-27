import "server-only"

import { isUuid, parseMcpRpcEnvelope } from "@/lib/mcp/contracts"
import { mapSupabaseMcpError, McpWebError } from "@/lib/mcp/errors"
import type { McpWebSession } from "@/lib/mcp/server"

export const MCP_ACTIVITY_KINDS = [
  "accounting.create_expense",
  "accounting.create_income",
  "accounting.create_transfer",
] as const

export type McpActivityKind = (typeof MCP_ACTIVITY_KINDS)[number]

export interface McpActivityEntry {
  operationId: string
  kind: McpActivityKind
  status: "committed" | "voided"
  amount: string | null
  currency: string | null
  date: string | null
  description: string | null
  accountName: string | null
  projectName: string | null
  clientName: string | null
  riskLevel: number | null
  recordedAt: string | null
  voidedAt: string | null
  voidReason: string | null
}

export interface McpActivity {
  windowHours: number
  entries: readonly McpActivityEntry[]
}

const KIND_SET = new Set<string>(MCP_ACTIVITY_KINDS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

// Cada texto proviene de lo que el asistente escribió y se trata como dato: se
// valida la forma, nunca se interpreta como instrucción ni se inyecta como HTML.
function parseEntry(value: unknown): McpActivityEntry {
  if (!isRecord(value)) {
    throw new Error("INVALID_ACTIVITY_ENTRY")
  }

  const operationId = optionalString(value.operation_id)
  const kind = optionalString(value.operation_type)
  const status = optionalString(value.status)

  if (
    !operationId ||
    !isUuid(operationId) ||
    !kind ||
    !KIND_SET.has(kind) ||
    (status !== "committed" && status !== "voided")
  ) {
    throw new Error("INVALID_ACTIVITY_ENTRY")
  }

  const payload = isRecord(value.payload) ? value.payload : {}
  const riskLevel =
    typeof value.risk_level === "number" && Number.isInteger(value.risk_level)
      ? value.risk_level
      : null

  return {
    operationId,
    kind: kind as McpActivityKind,
    status,
    amount: optionalString(payload.amount),
    currency: optionalString(payload.currency),
    date: optionalString(payload.date),
    description: optionalString(payload.description),
    accountName: optionalString(value.account_name),
    projectName: optionalString(value.project_name),
    clientName: optionalString(payload.client_name),
    riskLevel,
    recordedAt: optionalString(value.recorded_at),
    voidedAt: optionalString(value.voided_at),
    voidReason: optionalString(value.void_reason),
  }
}

function parseActivity(value: unknown): McpActivity {
  if (!isRecord(value) || !Array.isArray(value.operations)) {
    throw new Error("INVALID_ACTIVITY")
  }

  const windowHours =
    typeof value.window_hours === "number" && value.window_hours > 0
      ? value.window_hours
      : 24

  return {
    windowHours,
    entries: value.operations.map(parseEntry),
  }
}

function invalidResponse(): McpWebError {
  return new McpWebError(
    "INVALID_RESPONSE",
    "El control plane devolvió actividad inválida.",
    502,
  )
}

export async function getMcpActivity(
  session: McpWebSession,
  { hours = 24, limit = 50 }: { hours?: number; limit?: number } = {},
): Promise<McpActivity> {
  const { data, error } = await session.supabase.rpc(
    "mcp_web_list_recent_operations",
    {
      p_request: { hours, limit, include_voided: true },
    },
  )

  if (error) {
    throw mapSupabaseMcpError(error)
  }

  try {
    const envelope = parseMcpRpcEnvelope(data)
    if (!envelope.ok) {
      throw mapSupabaseMcpError(envelope.error)
    }
    return parseActivity(envelope.data)
  } catch (parseError) {
    if (parseError instanceof McpWebError) {
      throw parseError
    }
    throw invalidResponse()
  }
}

export async function voidMcpOperation(
  session: McpWebSession,
  operationId: string,
  reason?: string,
): Promise<McpActivityEntry> {
  if (!isUuid(operationId)) {
    throw new McpWebError(
      "NOT_FOUND",
      "El identificador de operación no es válido.",
      404,
    )
  }

  const { data, error } = await session.supabase.rpc(
    "mcp_web_void_operation",
    {
      p_request: reason
        ? { operation_id: operationId, reason }
        : { operation_id: operationId },
    },
  )

  if (error) {
    throw mapSupabaseMcpError(error)
  }

  try {
    const envelope = parseMcpRpcEnvelope(data)
    if (!envelope.ok) {
      throw mapSupabaseMcpError(envelope.error)
    }

    const entry = parseEntry(envelope.data)
    if (entry.operationId !== operationId) {
      throw new Error("OPERATION_ID_MISMATCH")
    }
    return entry
  } catch (parseError) {
    if (parseError instanceof McpWebError) {
      throw parseError
    }
    throw invalidResponse()
  }
}
