export const MCP_REQUESTED_CAPABILITIES = [
  {
    id: "accounting.read",
    label: "Consultar contabilidad",
    description:
      "Leer cuentas, categorías, movimientos y resúmenes autorizados.",
  },
  {
    id: "accounting.expense.write",
    label: "Preparar gastos",
    description:
      "Preparar gastos para revisión. El registro final sigue requiriendo una aprobación humana separada.",
  },
] as const

export type McpRequestedCapability =
  (typeof MCP_REQUESTED_CAPABILITIES)[number]["id"]

export type OAuthConsentDecision = "approve" | "deny"

export interface OAuthAuthorizationDetails {
  authorizationId: string
  redirectUri: string
  scope: string
  scopes: string[]
  client: {
    id: string
    name: string
    uri: string | null
  }
  user: {
    id: string
    email: string
  }
}

export type OAuthAuthorizationResult =
  | {
      kind: "consent"
      details: OAuthAuthorizationDetails
    }
  | {
      kind: "redirect"
      redirectUrl: string
    }

export interface OAuthDecisionRequest {
  authorizationId: string
  decision: OAuthConsentDecision
  csrfToken: string
}

export interface McpOAuthAccessGrant {
  id: string
  expiresAt: string | null
  active: boolean
  lifetime: "oauth_grant" | "database_expiry"
}

export interface McpOAuthServerGrant {
  scopes: string[]
  grantedAt: string
}

export interface McpOAuthClientLifecycle {
  id: string
  name: string | null
  uri: string | null
  type: string | null
  registrationType: string | null
  enabled: boolean
  minAal: "aal1" | "aal2"
  grant: McpOAuthAccessGrant | null
  oauthGrant: McpOAuthServerGrant | null
}

export interface McpOAuthLifecycleSnapshot {
  resourceUri: string
  clients: McpOAuthClientLifecycle[]
  oauthGrantStateAvailable: boolean
}

export interface McpOAuthRevokeResult {
  clientId: string
  grantId: string | null
  revoked: boolean
  revokedConnectionCount: number
  idempotentReplay: boolean
}

export type IndependentAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown }

export interface IndependentRevocationOutcome<AuthResult, DatabaseResult> {
  auth: IndependentAttempt<AuthResult>
  database: IndependentAttempt<DatabaseResult>
}

export type McpOAuthRevocationPanelStatus =
  | "revoked"
  | "already_revoked"
  | "revoked_db_only"
  | "revoked_auth_only"
  | "revocation_failed"

const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/
const OAUTH_CSRF_TOKEN_PATTERN =
  /^v1\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCOPE_PATTERN = /^[A-Za-z0-9:._/-]{1,128}$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const INTERNAL_URL_BASE = "https://internal.quepia.invalid"
const MAX_REDIRECT_LENGTH = 8_192
const MAX_LIFECYCLE_CLIENTS = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readBoundedString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null {
  const value = record[key]
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return null
  }

  return value
}

export function isOAuthAuthorizationId(value: unknown): value is string {
  return (
    typeof value === "string" && AUTHORIZATION_ID_PATTERN.test(value)
  )
}

export function isOAuthCsrfToken(value: unknown): value is string {
  return (
    typeof value === "string" && OAUTH_CSRF_TOKEN_PATTERN.test(value)
  )
}

export function isOAuthClientId(value: unknown): value is string {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value)
}

export function normalizeInternalRedirect(
  value: string | null | undefined,
  fallback = "/sistema",
): string {
  const safeFallback =
    fallback.startsWith("/") &&
    !fallback.startsWith("//") &&
    !fallback.includes("\\") &&
    !CONTROL_CHARACTER_PATTERN.test(fallback)
      ? fallback
      : "/sistema"

  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return safeFallback
  }

  try {
    const url = new URL(value, INTERNAL_URL_BASE)
    if (url.origin !== INTERNAL_URL_BASE || !url.pathname.startsWith("/")) {
      return safeFallback
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return safeFallback
  }
}

export function buildOAuthConsentPath(
  authorizationId: string,
  errorCode?: string,
): string {
  const params = new URLSearchParams({ authorization_id: authorizationId })
  if (errorCode) {
    params.set("error", errorCode)
  }

  return `/oauth/consent?${params.toString()}`
}

export function parseOAuthScopes(scope: string): string[] {
  const scopes = [...new Set(scope.split(/\s+/).filter(Boolean))]
  if (
    scopes.length === 0 ||
    scopes.length > 32 ||
    scopes.some((candidate) => !SCOPE_PATTERN.test(candidate))
  ) {
    throw new Error("INVALID_OAUTH_SCOPES")
  }

  return scopes
}

export function isAllowedOAuthRedirect(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_REDIRECT_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return false
  }

  try {
    const url = new URL(value)
    if (url.username || url.password) {
      return false
    }

    if (url.protocol === "https:") {
      return true
    }

    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1" ||
        url.hostname === "[::1]")
    )
  } catch {
    return false
  }
}

export function parseOAuthAuthorizationResult(
  value: unknown,
  expectedAuthorizationId: string,
  expectedUserId: string,
): OAuthAuthorizationResult {
  if (!isRecord(value)) {
    throw new Error("INVALID_OAUTH_AUTHORIZATION")
  }

  if ("redirect_url" in value) {
    if (!isAllowedOAuthRedirect(value.redirect_url)) {
      throw new Error("INVALID_OAUTH_REDIRECT")
    }

    return {
      kind: "redirect",
      redirectUrl: value.redirect_url,
    }
  }

  const authorizationId = readBoundedString(
    value,
    "authorization_id",
    256,
  )
  const redirectUri = readBoundedString(value, "redirect_uri", 2_048)
  const scope = readBoundedString(value, "scope", 4_096)
  const client = isRecord(value.client) ? value.client : null
  const user = isRecord(value.user) ? value.user : null
  const clientId = client
    ? readBoundedString(client, "id", 128)
    : null
  const clientName = client
    ? readBoundedString(client, "name", 256)
    : null
  const clientUriValue =
    client && typeof client.uri === "string" && client.uri.length <= 2_048
      ? client.uri
      : null
  const userId = user ? readBoundedString(user, "id", 128) : null
  const userEmail = user
    ? readBoundedString(user, "email", 320)
    : null

  if (
    !authorizationId ||
    !isOAuthAuthorizationId(authorizationId) ||
    authorizationId !== expectedAuthorizationId ||
    !redirectUri ||
    !scope ||
    !clientId ||
    !isOAuthClientId(clientId) ||
    !clientName ||
    !userId ||
    userId !== expectedUserId ||
    !userEmail
  ) {
    throw new Error("INVALID_OAUTH_AUTHORIZATION")
  }

  return {
    kind: "consent",
    details: {
      authorizationId,
      redirectUri,
      scope,
      scopes: parseOAuthScopes(scope),
      client: {
        id: clientId,
        name: clientName,
        uri: clientUriValue,
      },
      user: {
        id: userId,
        email: userEmail,
      },
    },
  }
}

export function parseOAuthDecisionRequest(
  rawBody: string,
): OAuthDecisionRequest | null {
  const params = new URLSearchParams(rawBody)
  const keys = [...params.keys()]
  if (
    keys.length !== 3 ||
    params.getAll("authorization_id").length !== 1 ||
    params.getAll("decision").length !== 1 ||
    params.getAll("csrf_token").length !== 1 ||
    keys.some(
      (key) =>
        key !== "authorization_id" &&
        key !== "decision" &&
        key !== "csrf_token",
    )
  ) {
    return null
  }

  const authorizationId = params.get("authorization_id")
  const decision = params.get("decision")
  const csrfToken = params.get("csrf_token")
  if (
    !isOAuthAuthorizationId(authorizationId) ||
    !isOAuthCsrfToken(csrfToken) ||
    (decision !== "approve" && decision !== "deny")
  ) {
    return null
  }

  return { authorizationId, decision, csrfToken }
}

export function parseMcpOAuthRevokeRequest(rawBody: string): string | null {
  const params = new URLSearchParams(rawBody)
  const keys = [...params.keys()]
  if (
    keys.length !== 1 ||
    keys[0] !== "client_id" ||
    params.getAll("client_id").length !== 1
  ) {
    return null
  }

  const clientId = params.get("client_id")
  return isOAuthClientId(clientId) ? clientId : null
}

export function parseMcpOAuthLifecycle(
  value: unknown,
): Omit<McpOAuthLifecycleSnapshot, "oauthGrantStateAvailable"> {
  if (!isRecord(value)) {
    throw new Error("INVALID_MCP_OAUTH_LIFECYCLE")
  }

  const resourceUri = readBoundedString(value, "resource_uri", 2_048)
  if (!resourceUri) {
    throw new Error("INVALID_MCP_RESOURCE_URI")
  }

  try {
    if (new URL(resourceUri).protocol !== "https:") {
      throw new Error("INVALID_MCP_RESOURCE_URI")
    }
  } catch {
    throw new Error("INVALID_MCP_RESOURCE_URI")
  }

  if (
    !Array.isArray(value.clients) ||
    value.clients.length > MAX_LIFECYCLE_CLIENTS
  ) {
    throw new Error("INVALID_MCP_OAUTH_CLIENTS")
  }

  const seenClientIds = new Set<string>()
  const clients = value.clients.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new Error("INVALID_MCP_OAUTH_CLIENT")
    }

    const id = readBoundedString(candidate, "id", 128)
    if (!id || !isOAuthClientId(id) || seenClientIds.has(id)) {
      throw new Error("INVALID_MCP_OAUTH_CLIENT_ID")
    }
    seenClientIds.add(id)

    const enabled = candidate.enabled
    const minAal = candidate.min_aal
    if (
      typeof enabled !== "boolean" ||
      (minAal !== "aal1" && minAal !== "aal2")
    ) {
      throw new Error("INVALID_MCP_OAUTH_POLICY")
    }

    let grant: McpOAuthAccessGrant | null = null
    if (candidate.grant !== undefined && candidate.grant !== null) {
      if (!isRecord(candidate.grant)) {
        throw new Error("INVALID_MCP_OAUTH_GRANT")
      }

      const grantId = readBoundedString(candidate.grant, "id", 128)
      const expiresAtValue = candidate.grant.expires_at
      const expiresAt =
        expiresAtValue === null
          ? null
          : readBoundedString(candidate.grant, "expires_at", 128)
      const lifetime = candidate.grant.lifetime
      if (
        !grantId ||
        !isOAuthClientId(grantId) ||
        !("expires_at" in candidate.grant) ||
        (expiresAt !== null &&
          (!expiresAt || !Number.isFinite(Date.parse(expiresAt)))) ||
        typeof candidate.grant.active !== "boolean" ||
        (lifetime !== "oauth_grant" && lifetime !== "database_expiry") ||
        (lifetime === "oauth_grant" && expiresAt !== null)
      ) {
        throw new Error("INVALID_MCP_OAUTH_GRANT")
      }

      grant = {
        id: grantId,
        expiresAt,
        active: candidate.grant.active,
        lifetime,
      }
    }

    return {
      id,
      name:
        typeof candidate.name === "string" &&
        candidate.name.length > 0 &&
        candidate.name.length <= 256
          ? candidate.name
          : null,
      uri:
        typeof candidate.uri === "string" &&
        candidate.uri.length > 0 &&
        candidate.uri.length <= 2_048
          ? candidate.uri
          : null,
      type:
        typeof candidate.type === "string" &&
        candidate.type.length <= 64
          ? candidate.type
          : null,
      registrationType:
        typeof candidate.registration_type === "string" &&
        candidate.registration_type.length <= 64
          ? candidate.registration_type
          : null,
      enabled,
      minAal,
      grant,
      oauthGrant: null,
    } satisfies McpOAuthClientLifecycle
  })

  return { resourceUri, clients }
}

export function mergeMcpOAuthServerGrants(
  lifecycle: Omit<McpOAuthLifecycleSnapshot, "oauthGrantStateAvailable">,
  value: unknown,
): McpOAuthLifecycleSnapshot {
  if (!Array.isArray(value) || value.length > MAX_LIFECYCLE_CLIENTS) {
    throw new Error("INVALID_OAUTH_SERVER_GRANTS")
  }

  const grantsByClientId = new Map<string, McpOAuthServerGrant>()
  for (const candidate of value) {
    if (!isRecord(candidate) || !isRecord(candidate.client)) {
      throw new Error("INVALID_OAUTH_SERVER_GRANT")
    }

    const clientId = readBoundedString(candidate.client, "id", 128)
    const grantedAt = readBoundedString(candidate, "granted_at", 128)
    if (
      !clientId ||
      !isOAuthClientId(clientId) ||
      grantsByClientId.has(clientId) ||
      !grantedAt ||
      !Number.isFinite(Date.parse(grantedAt)) ||
      !Array.isArray(candidate.scopes) ||
      candidate.scopes.some((scope) => typeof scope !== "string")
    ) {
      throw new Error("INVALID_OAUTH_SERVER_GRANT")
    }

    const scopes = parseOAuthScopes(candidate.scopes.join(" "))
    grantsByClientId.set(clientId, { scopes, grantedAt })
  }

  return {
    ...lifecycle,
    oauthGrantStateAvailable: true,
    clients: lifecycle.clients.map((client) => ({
      ...client,
      oauthGrant: grantsByClientId.get(client.id) ?? null,
    })),
  }
}

export function shouldShowMcpSetupPrompt(
  lifecycle: McpOAuthLifecycleSnapshot,
): boolean {
  if (!lifecycle.oauthGrantStateAvailable) {
    return false
  }

  return !lifecycle.clients.some(
    (client) =>
      client.enabled &&
      client.grant?.active === true &&
      client.oauthGrant !== null,
  )
}

export function parseMcpOAuthRevokeResult(
  value: unknown,
  expectedClientId: string,
): McpOAuthRevokeResult {
  if (!isRecord(value)) {
    throw new Error("INVALID_MCP_OAUTH_REVOKE_RESULT")
  }

  const clientId = readBoundedString(value, "client_id", 128)
  const grantIdValue = value.grant_id
  const grantId =
    grantIdValue === null
      ? null
      : typeof grantIdValue === "string" &&
          isOAuthClientId(grantIdValue)
        ? grantIdValue
        : undefined
  const revokedConnectionCount = value.revoked_connection_count

  if (
    clientId !== expectedClientId ||
    !isOAuthClientId(clientId) ||
    grantId === undefined ||
    typeof value.revoked !== "boolean" ||
    typeof value.idempotent_replay !== "boolean" ||
    !Number.isInteger(revokedConnectionCount) ||
    (revokedConnectionCount as number) < 0
  ) {
    throw new Error("INVALID_MCP_OAUTH_REVOKE_RESULT")
  }

  return {
    clientId,
    grantId,
    revoked: value.revoked,
    revokedConnectionCount: revokedConnectionCount as number,
    idempotentReplay: value.idempotent_replay,
  }
}

export async function runIndependentOAuthRevocations<
  AuthResult,
  DatabaseResult,
>(
  revokeAuth: () => Promise<AuthResult>,
  revokeDatabase: () => Promise<DatabaseResult>,
): Promise<IndependentRevocationOutcome<AuthResult, DatabaseResult>> {
  let authPromise: Promise<AuthResult>
  try {
    authPromise = Promise.resolve(revokeAuth())
  } catch (error) {
    authPromise = Promise.reject(error)
  }

  // Se invoca sin esperar Auth: el kill switch DB comienza aunque la red de
  // Supabase Auth quede pendiente hasta el timeout del runtime.
  let databasePromise: Promise<DatabaseResult>
  try {
    databasePromise = Promise.resolve(revokeDatabase())
  } catch (error) {
    databasePromise = Promise.reject(error)
  }

  const [authSettled, databaseSettled] = await Promise.allSettled([
    authPromise,
    databasePromise,
  ])
  const auth: IndependentAttempt<AuthResult> =
    authSettled.status === "fulfilled"
      ? { ok: true, value: authSettled.value }
      : { ok: false, error: authSettled.reason }
  const database: IndependentAttempt<DatabaseResult> =
    databaseSettled.status === "fulfilled"
      ? { ok: true, value: databaseSettled.value }
      : { ok: false, error: databaseSettled.reason }

  return { auth, database }
}

export function isOAuthGrantAbsentError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false
  }

  const code =
    typeof error.code === "string" ? error.code.toLowerCase() : ""
  if (code === "feature_disabled") {
    return false
  }

  return (
    error.status === 404 ||
    code === "oauth_grant_not_found" ||
    code === "grant_not_found" ||
    code === "not_found"
  )
}

export function classifyMcpOAuthRevocation(
  input: {
    authSucceeded: boolean
    databaseSucceeded: boolean
    databaseRevoked: boolean
  },
): McpOAuthRevocationPanelStatus {
  if (input.authSucceeded && input.databaseSucceeded) {
    return input.databaseRevoked ? "revoked" : "already_revoked"
  }

  if (input.databaseSucceeded) {
    return "revoked_db_only"
  }

  if (input.authSucceeded) {
    return "revoked_auth_only"
  }

  return "revocation_failed"
}

export function oauthConsentErrorMessage(
  code: string | string[] | undefined,
): string | null {
  const normalized = Array.isArray(code) ? code[0] : code
  switch (normalized) {
    case "session_expired":
      return "Tu sesión venció. Volvé a iniciar sesión para continuar."
    case "admin_required":
      return "Tu cuenta no está habilitada como administradora global del MCP."
    case "authorization_expired":
      return "La solicitud de autorización venció o ya fue utilizada."
    case "oauth_unavailable":
      return "El servidor de autorización no está disponible en este entorno."
    case "request_failed":
      return "No se pudo completar la decisión. No se concedió acceso."
    default:
      return null
  }
}
