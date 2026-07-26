export const MCP_OPERATION_STATUSES = [
  "prepared",
  "awaiting_approval",
  "approved",
  "committed",
  "rejected",
  "expired",
  "cancelled",
  "failed",
  "revoked",
] as const

export type McpOperationStatus = (typeof MCP_OPERATION_STATUSES)[number]

export type McpRiskLevel = number | "low" | "medium" | "high" | "critical"

export interface McpExpenseOperation {
  operationId: string
  operationType: string
  normalizedPayload: Record<string, unknown>
  payloadHash: string
  riskLevel: McpRiskLevel
  expiresAt: string
  status: McpOperationStatus
  requiresAal2: boolean
}

export interface McpApprovalResult {
  operationId: string
  status: McpOperationStatus
  approvedAt: string | null
}

export interface McpApprovalChallenge {
  operation: McpExpenseOperation
  nonce: string
  expiresAt: string
}

export type McpRpcEnvelope =
  | { ok: true; data: unknown }
  | {
      ok: false
      error: {
        code: string
        message: string
        details?: string
      }
    }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH_PATTERN = /^[0-9a-f]{64}$/
const STATUS_SET = new Set<string>(MCP_OPERATION_STATUSES)
const NAMED_RISKS = new Set(["low", "medium", "high", "critical"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function unwrapRpcObject(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value) && value.length === 1 ? value[0] : value
  if (!isRecord(candidate)) {
    throw new Error("INVALID_RPC_RESPONSE")
  }

  return candidate
}

export function parseMcpRpcEnvelope(value: unknown): McpRpcEnvelope {
  const envelope = unwrapRpcObject(value)

  if (envelope.ok === true && "data" in envelope) {
    return { ok: true, data: envelope.data }
  }

  if (envelope.ok === false && isRecord(envelope.error)) {
    const code =
      typeof envelope.error.code === "string"
        ? envelope.error.code
        : "RPC_ERROR"
    const message =
      typeof envelope.error.message === "string"
        ? envelope.error.message
        : "El RPC rechazó la operación."
    const details =
      typeof envelope.error.details === "string"
        ? envelope.error.details
        : undefined

    return {
      ok: false,
      error: { code, message, details },
    }
  }

  throw new Error("INVALID_RPC_ENVELOPE")
}

function readString(
  value: Record<string, unknown>,
  snakeCaseKey: string,
  camelCaseKey: string,
): string | null {
  const candidate = value[snakeCaseKey] ?? value[camelCaseKey]
  return typeof candidate === "string" ? candidate : null
}

function parseRiskLevel(value: unknown): McpRiskLevel {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4
  ) {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase()
    if (NAMED_RISKS.has(normalized)) {
      return normalized as McpRiskLevel
    }

    if (/^[1-4]$/.test(normalized)) {
      return Number(normalized)
    }
  }

  throw new Error("INVALID_RISK_LEVEL")
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function isPayloadHash(value: string): boolean {
  return HASH_PATTERN.test(value)
}

export function parseMcpExpenseOperation(value: unknown): McpExpenseOperation {
  const root = unwrapRpcObject(value)
  const record = isRecord(root.operation) ? root.operation : root
  const approval = isRecord(root.approval) ? root.approval : null
  const operationId = readString(record, "operation_id", "operationId")
    ?? readString(record, "id", "id")
  const operationType = readString(record, "operation_type", "operationType")
  const payload =
    record.normalized_payload === undefined
      ? record.normalizedPayload === undefined
        ? record.payload
        : record.normalizedPayload
      : record.normalized_payload
  const payloadHash = readString(record, "payload_hash", "payloadHash")
  const expiresAt = readString(record, "expires_at", "expiresAt")
  const status = readString(record, "status", "status")
  const riskValue =
    record.risk_level === undefined ? record.riskLevel : record.risk_level
  const explicitAal2 =
    record.requires_aal2 === undefined
      ? record.requiresAal2
      : record.requires_aal2

  if (!operationId || !isUuid(operationId)) {
    throw new Error("INVALID_OPERATION_ID")
  }

  if (!operationType || operationType.length > 100) {
    throw new Error("INVALID_OPERATION_TYPE")
  }

  if (!isRecord(payload)) {
    throw new Error("INVALID_NORMALIZED_PAYLOAD")
  }

  if (!payloadHash || !isPayloadHash(payloadHash)) {
    throw new Error("INVALID_PAYLOAD_HASH")
  }

  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("INVALID_EXPIRATION")
  }

  if (!status || !STATUS_SET.has(status)) {
    throw new Error("INVALID_OPERATION_STATUS")
  }

  const riskLevel = parseRiskLevel(riskValue)
  const requiresAal2 =
    typeof explicitAal2 === "boolean"
      ? explicitAal2
      : approval?.requires_aal2 === true || approval?.requiresAal2 === true
        ? true
      : approval?.aal_required === "aal2"
        ? true
      : (typeof riskLevel === "number" && riskLevel >= 3) ||
        riskLevel === "high" ||
        riskLevel === "critical"

  return {
    operationId,
    operationType,
    normalizedPayload: payload,
    payloadHash,
    riskLevel,
    expiresAt,
    status: status as McpOperationStatus,
    requiresAal2,
  }
}

export function parseMcpApprovalChallenge(
  value: unknown,
  expectedOperationId: string,
): McpApprovalChallenge {
  const root = unwrapRpcObject(value)
  const approval = isRecord(root.approval) ? root.approval : null
  const operation = parseMcpExpenseOperation(root)
  const nonce = approval
    ? readString(approval, "challenge_nonce", "challengeNonce")
    : null
  const expiresAt = approval
    ? readString(approval, "challenge_expires_at", "challengeExpiresAt")
    : null

  if (operation.operationId !== expectedOperationId) {
    throw new Error("OPERATION_ID_MISMATCH")
  }

  if (!nonce || nonce.length < 32 || nonce.length > 512) {
    throw new Error("INVALID_APPROVAL_CHALLENGE")
  }

  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("INVALID_APPROVAL_CHALLENGE_EXPIRATION")
  }

  return { operation, nonce, expiresAt }
}

export function parseMcpApprovalResult(
  value: unknown,
  expectedOperationId: string,
): McpApprovalResult {
  const root = unwrapRpcObject(value)
  const record = isRecord(root.operation) ? root.operation : root
  const operationId =
    readString(record, "operation_id", "operationId") ??
    readString(record, "id", "id") ??
    expectedOperationId
  const status = readString(record, "status", "status")
  const approvedAt = readString(record, "approved_at", "approvedAt")

  if (operationId !== expectedOperationId || !isUuid(operationId)) {
    throw new Error("INVALID_OPERATION_ID")
  }

  if (!status || !STATUS_SET.has(status)) {
    throw new Error("INVALID_OPERATION_STATUS")
  }

  if (approvedAt !== null && !Number.isFinite(Date.parse(approvedAt))) {
    throw new Error("INVALID_APPROVAL_TIMESTAMP")
  }

  return {
    operationId,
    status: status as McpOperationStatus,
    approvedAt,
  }
}

export function operationNeedsAal2(
  operation: Pick<McpExpenseOperation, "requiresAal2" | "riskLevel">,
): boolean {
  return (
    operation.requiresAal2 ||
    (typeof operation.riskLevel === "number" && operation.riskLevel >= 3) ||
    operation.riskLevel === "high" ||
    operation.riskLevel === "critical"
  )
}

export function operationIsExpired(
  operation: Pick<McpExpenseOperation, "expiresAt" | "status">,
  now = Date.now(),
): boolean {
  return operation.status === "expired" || Date.parse(operation.expiresAt) <= now
}

export function operationCanBeApproved(
  operation: Pick<McpExpenseOperation, "expiresAt" | "status">,
  now = Date.now(),
): boolean {
  return (
    operation.status === "awaiting_approval" &&
    !operationIsExpired(operation, now)
  )
}
