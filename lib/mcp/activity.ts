import "server-only"

import { isUuid, parseMcpRpcEnvelope } from "@/lib/mcp/contracts"
import { mapSupabaseMcpError, McpWebError } from "@/lib/mcp/errors"
import type { McpWebSession } from "@/lib/mcp/server"

export const MCP_ACTIVITY_KINDS = [
  "accounting.create_expense",
  "accounting.create_income",
  "accounting.create_transfer",
  "tasks.create_task",
  "tasks.create_tasks_batch",
  "tasks.update_task",
  "tasks.create_subtasks",
  "tasks.update_subtask",
  "tasks.set_dependencies",
  "tasks.add_links",
  "tasks.post_update",
  "tasks.create_column",
  "tasks.create_project",
] as const

export type McpActivityKind = (typeof MCP_ACTIVITY_KINDS)[number]

export type McpActivityModule = "accounting" | "tasks"

export interface McpActivityEntry {
  operationId: string
  module: McpActivityModule
  kind: McpActivityKind
  status: "committed" | "voided"
  amount: string | null
  currency: string | null
  date: string | null
  description: string | null
  accountName: string | null
  projectName: string | null
  clientName: string | null
  taskTitle: string | null
  rowCount: number | null
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

function optionalCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null
}

// Cada tipo de escritura describe lo que hizo con un campo distinto del payload
// normalizado; acá se elige uno solo para que la fila se lea de un vistazo.
function taskDescription(
  kind: McpActivityKind,
  payload: Record<string, unknown>,
  entry: Record<string, unknown>,
): string | null {
  const task = isRecord(payload.task) ? payload.task : null

  switch (kind) {
    case "tasks.create_task":
      return optionalString(task?.title)
    case "tasks.create_tasks_batch": {
      const count = optionalCount(payload.task_count)
      return count === null ? null : `${count} tareas nuevas`
    }
    case "tasks.create_subtasks": {
      const count = optionalCount(payload.subtask_count)
      return count === null ? null : `${count} subtareas`
    }
    case "tasks.add_links": {
      const count = optionalCount(payload.link_count)
      return count === null ? null : `${count} links`
    }
    case "tasks.post_update":
      return optionalString(payload.message)
    case "tasks.create_column":
    case "tasks.create_project":
      return optionalString(payload.name)
    default:
      return optionalString(entry.task_title)
  }
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
  const activityKind = kind as McpActivityKind
  const activityModule: McpActivityModule = activityKind.startsWith("tasks.")
    ? "tasks"
    : "accounting"

  return {
    operationId,
    module: activityModule,
    kind: activityKind,
    status,
    amount: optionalString(payload.amount),
    currency: optionalString(payload.currency),
    date: optionalString(payload.date),
    description:
      activityModule === "tasks"
        ? taskDescription(activityKind, payload, value)
        : optionalString(payload.description),
    accountName: optionalString(value.account_name),
    projectName: optionalString(value.project_name),
    clientName: optionalString(payload.client_name),
    taskTitle: optionalString(value.task_title),
    rowCount: optionalCount(value.row_count),
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

  // Una operación de un tipo que esta versión no conoce no debe dejar sin
  // revisión a las demás: se descarta esa fila y se muestran las que sí se
  // entienden. Nada se inventa para reemplazarla.
  const entries: McpActivityEntry[] = []
  for (const operation of value.operations) {
    try {
      entries.push(parseEntry(operation))
    } catch {
      continue
    }
  }

  return { windowHours, entries }
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
