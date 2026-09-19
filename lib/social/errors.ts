export class SocialError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = "SocialError"
    this.status = status
    this.code = code
    this.details = details
  }
}

// Códigos de negocio devueltos por las RPC → estado HTTP.
const STATUS_BY_CODE: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  scope_mismatch: 403,
  scope_escalation: 403,
  scope_not_found: 404,
  version_conflict: 409,
  claimed_by_other: 409,
  reply_in_flight: 409,
  cursor_conflict: 409,
  locked: 409,
  blocking_conflict: 409,
  confirmation_mismatch: 409,
  client_reassignment_blocked: 409,
  request_id_conflict: 409,
  private_reply_consumed: 409,
  budget_exceeded: 429,
  tool_budget_exceeded: 429,
  account_unavailable: 409,
  missing_permissions: 409,
}

export function statusForCode(code: string) {
  return STATUS_BY_CODE[code] ?? 400
}

export function errorBody(error: unknown) {
  if (error instanceof SocialError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) },
    }
  }
  console.error("[social] error inesperado", error instanceof Error ? error.message : error)
  return { status: 500, body: { error: "Error interno del módulo social", code: "internal_error" } }
}
