const MCP_DATABASE_ROLE = "mcp_authenticated"
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isDirectFirstPartySessionClaims(value: unknown): boolean {
  if (!isRecord(value)) return false

  const clientId = value.client_id
  if (typeof clientId === "string" && clientId.trim().length > 0) {
    return false
  }

  if (value.role === MCP_DATABASE_ROLE) return false
  return value.role === "authenticated"
}

export function getDirectFirstPartySessionId(
  value: unknown,
): string | null {
  if (!isDirectFirstPartySessionClaims(value) || !isRecord(value)) {
    return null
  }

  const sessionId = value.session_id
  return typeof sessionId === "string" && UUID_PATTERN.test(sessionId)
    ? sessionId
    : null
}

export function isFirstPartyProtectedPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/sistema" ||
    pathname.startsWith("/sistema/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/oauth" ||
    pathname.startsWith("/oauth/") ||
    pathname === "/auth/mfa" ||
    pathname.startsWith("/auth/mfa/")
  )
}
