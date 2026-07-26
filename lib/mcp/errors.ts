export type McpWebErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "AAL2_REQUIRED"
  | "EXPIRED"
  | "ALREADY_APPROVED"
  | "NOT_APPROVABLE"
  | "PAYLOAD_MISMATCH"
  | "INVALID_RESPONSE"
  | "CONTROL_PLANE_UNAVAILABLE"
  | "INTERNAL_ERROR"

export class McpWebError extends Error {
  readonly code: McpWebErrorCode
  readonly status: number

  constructor(code: McpWebErrorCode, message: string, status: number) {
    super(message)
    this.name = "McpWebError"
    this.code = code
    this.status = status
  }
}

interface SupabaseLikeError {
  code?: string
  message?: string
  details?: string
}

function errorText(error: SupabaseLikeError): string {
  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toUpperCase()
}

export function mapSupabaseMcpError(error: SupabaseLikeError): McpWebError {
  const text = errorText(error)

  if (
    text.includes("PGRST301") ||
    text.includes("JWT") ||
    text.includes("UNAUTHENTICATED") ||
    text.includes("INVALID_SESSION")
  ) {
    return new McpWebError("UNAUTHENTICATED", "La sesión no es válida.", 401)
  }

  if (
    text.includes("AAL2_REQUIRED") ||
    text.includes("INSUFFICIENT_AAL")
  ) {
    return new McpWebError(
      "AAL2_REQUIRED",
      "Esta aprobación requiere autenticación multifactor.",
      403,
    )
  }

  if (
    text.includes("42501") ||
    text.includes("FORBIDDEN") ||
    text.includes("CLIENT_NOT_ALLOWED") ||
    text.includes("OAUTH_CLIENT_NOT_ALLOWED") ||
    text.includes("OAUTH_CLIENT_NOT_ACTIVE") ||
    text.includes("OAUTH_CLIENT_DISABLED") ||
    text.includes("HUMAN_APPROVAL_REQUIRED") ||
    text.includes("MISSING_CAPABILITY")
  ) {
    return new McpWebError(
      "FORBIDDEN",
      "No tenés permiso para ver o aprobar esta operación.",
      403,
    )
  }

  if (text.includes("NOT_FOUND") || text.includes("PGRST116")) {
    return new McpWebError("NOT_FOUND", "La operación no existe.", 404)
  }

  if (
    text.includes("PAYLOAD_MISMATCH") ||
    text.includes("PAYLOAD_TAMPERED")
  ) {
    return new McpWebError(
      "PAYLOAD_MISMATCH",
      "La operación cambió desde que fue revisada.",
      409,
    )
  }

  if (text.includes("ALREADY_APPROVED")) {
    return new McpWebError(
      "ALREADY_APPROVED",
      "La operación ya fue aprobada.",
      409,
    )
  }

  if (text.includes("EXPIRED")) {
    return new McpWebError("EXPIRED", "La operación expiró.", 409)
  }

  if (
    text.includes("PGRST202") ||
    text.includes("42883") ||
    text.includes("COULD NOT FIND THE FUNCTION")
  ) {
    return new McpWebError(
      "CONTROL_PLANE_UNAVAILABLE",
      "El control plane MCP todavía no está desplegado.",
      503,
    )
  }

  if (
    text.includes("NOT_APPROVABLE") ||
    text.includes("INVALID_STATUS") ||
    text.includes("CANCELLED") ||
    text.includes("INVALID_APPROVAL_NONCE") ||
    text.includes("CHALLENGE_INVALID") ||
    text.includes("CHALLENGE_REPLAYED")
  ) {
    return new McpWebError(
      "NOT_APPROVABLE",
      "El estado actual no permite aprobar la operación.",
      409,
    )
  }

  return new McpWebError(
    "INTERNAL_ERROR",
    "No se pudo completar la operación.",
    500,
  )
}
