import "server-only"

import type { McpWebSession } from "@/lib/mcp/server"
import {
  isOAuthGrantAbsentError,
  mergeMcpOAuthServerGrants,
  parseMcpOAuthLifecycle,
  parseMcpOAuthRevokeResult,
  parseOAuthAuthorizationResult,
  runIndependentOAuthRevocations,
  type McpOAuthLifecycleSnapshot,
  type McpOAuthRevokeResult,
  type OAuthAuthorizationResult,
} from "@/lib/mcp/oauth"
import { parseMcpRpcEnvelope } from "@/lib/mcp/contracts"
import { mapSupabaseMcpError, McpWebError } from "@/lib/mcp/errors"

export async function getOAuthAuthorization(
  session: McpWebSession,
  authorizationId: string,
): Promise<OAuthAuthorizationResult> {
  const { data, error } =
    await session.supabase.auth.oauth.getAuthorizationDetails(
      authorizationId,
    )

  if (error || !data) {
    const status =
      typeof (error as { status?: unknown } | null)?.status === "number"
        ? (error as { status: number }).status
        : undefined
    console.error(
      "[OAuth authorization] Lookup failed",
      JSON.stringify({
        status: status ?? null,
        code:
          typeof (error as { code?: unknown } | null)?.code === "string"
            ? (error as { code: string }).code
            : null,
      }),
    )

    if (status === 401) {
      throw new McpWebError(
        "UNAUTHENTICATED",
        "La sesión web no es válida para el servidor OAuth.",
        401,
      )
    }

    // Una autorización vencida, ya consumida o desconocida no siempre vuelve
    // como 404: el servidor OAuth también responde 400/403/410 según el estado.
    // Todas describen la misma situación operativa, así que se tratan igual y
    // el usuario recibe la única acción útil: reiniciar la conexión.
    if (typeof status === "number" && status >= 400 && status < 500) {
      throw new McpWebError(
        "NOT_FOUND",
        "La solicitud OAuth no existe, venció o ya fue utilizada.",
        404,
      )
    }

    throw new McpWebError(
      "CONTROL_PLANE_UNAVAILABLE",
      "No se pudo consultar la solicitud OAuth.",
      503,
    )
  }

  try {
    return parseOAuthAuthorizationResult(
      data,
      authorizationId,
      session.user.id,
    )
  } catch {
    console.error(
      "[OAuth authorization] Unexpected authorization payload",
    )
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El servidor OAuth devolvió una autorización inválida.",
      502,
    )
  }
}

export async function provisionMcpOAuthClient(
  session: McpWebSession,
  clientId: string,
): Promise<void> {
  const { data, error } = await session.supabase.rpc(
    "mcp_provision_oauth_client",
    {
      p_request: { client_id: clientId },
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
  } catch (error) {
    if (error instanceof McpWebError) {
      throw error
    }

    throw new McpWebError(
      "INVALID_RESPONSE",
      "El control plane devolvió una provisión OAuth inválida.",
      502,
    )
  }
}

async function getMcpOAuthDatabaseLifecycle(
  session: McpWebSession,
): Promise<
  Omit<McpOAuthLifecycleSnapshot, "oauthGrantStateAvailable">
> {
  const { data, error } = await session.supabase.rpc(
    "mcp_list_oauth_clients",
    { p_request: {} },
  )

  if (error) {
    throw mapSupabaseMcpError(error)
  }

  let lifecycle: ReturnType<typeof parseMcpOAuthLifecycle>
  try {
    const envelope = parseMcpRpcEnvelope(data)
    if (!envelope.ok) {
      throw mapSupabaseMcpError(envelope.error)
    }
    lifecycle = parseMcpOAuthLifecycle(envelope.data)
  } catch (error) {
    if (error instanceof McpWebError) {
      throw error
    }
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El control plane devolvió un lifecycle OAuth inválido.",
      502,
    )
  }

  return lifecycle
}

export async function requireMcpOAuthAdmin(
  session: McpWebSession,
): Promise<void> {
  await getMcpOAuthDatabaseLifecycle(session)
}

export async function getMcpOAuthLifecycle(
  session: McpWebSession,
): Promise<McpOAuthLifecycleSnapshot> {
  const lifecycle = await getMcpOAuthDatabaseLifecycle(session)

  try {
    const oauthGrants = await session.supabase.auth.oauth.listGrants()
    if (oauthGrants.error || !oauthGrants.data) {
      return {
        ...lifecycle,
        oauthGrantStateAvailable: false,
      }
    }

    return mergeMcpOAuthServerGrants(lifecycle, oauthGrants.data)
  } catch {
    return {
      ...lifecycle,
      oauthGrantStateAvailable: false,
    }
  }
}

export interface RevokeMcpOAuthClientOutcome {
  auth:
    | { succeeded: true; state: "revoked" | "absent" }
    | { succeeded: false; state: "failed" }
  database:
    | { succeeded: true; result: McpOAuthRevokeResult }
    | { succeeded: false; error: McpWebError }
}

export async function revokeMcpOAuthClient(
  session: McpWebSession,
  clientId: string,
): Promise<RevokeMcpOAuthClientOutcome> {
  const attempts = await runIndependentOAuthRevocations(
    async () => {
      const result =
        await session.supabase.auth.oauth.revokeGrant({ clientId })
      if (result.error) {
        if (isOAuthGrantAbsentError(result.error)) {
          return "absent" as const
        }
        throw result.error
      }
      return "revoked" as const
    },
    async () => {
      const { data, error } = await session.supabase.rpc(
        "mcp_revoke_oauth_client_grant",
        {
          p_request: { client_id: clientId },
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
        return parseMcpOAuthRevokeResult(envelope.data, clientId)
      } catch (error) {
        if (error instanceof McpWebError) {
          throw error
        }
        throw new McpWebError(
          "INVALID_RESPONSE",
          "El control plane devolvió una revocación OAuth inválida.",
          502,
        )
      }
    },
  )

  const auth: RevokeMcpOAuthClientOutcome["auth"] = attempts.auth.ok
    ? { succeeded: true, state: attempts.auth.value }
    : { succeeded: false, state: "failed" }

  if (attempts.database.ok) {
    return {
      auth,
      database: {
        succeeded: true,
        result: attempts.database.value,
      },
    }
  }

  return {
    auth,
    database: {
      succeeded: false,
      error:
        attempts.database.error instanceof McpWebError
          ? attempts.database.error
          : new McpWebError(
              "INTERNAL_ERROR",
              "No se pudo confirmar la revocación MCP.",
              500,
            ),
    },
  }
}

export async function resolveOAuthDecisionRedirect(
  session: McpWebSession,
  authorizationId: string,
  decision: "approve" | "deny",
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new McpWebError(
      "CONTROL_PLANE_UNAVAILABLE",
      "La configuración del servidor OAuth no está disponible.",
      503,
    )
  }

  const {
    data: { session: authSession },
    error: sessionError,
  } = await session.supabase.auth.getSession()
  if (sessionError || !authSession?.access_token) {
    throw new McpWebError(
      "UNAUTHENTICATED",
      "La sesión web venció antes de registrar la decisión.",
      401,
    )
  }

  let endpoint: URL
  try {
    endpoint = new URL(
      `/auth/v1/oauth/authorizations/${encodeURIComponent(
        authorizationId,
      )}/consent`,
      supabaseUrl,
    )
  } catch {
    throw new McpWebError(
      "CONTROL_PLANE_UNAVAILABLE",
      "La configuración del servidor OAuth no es válida.",
      503,
    )
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${authSession.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: decision }),
      cache: "no-store",
    })
  } catch {
    throw new McpWebError(
      "CONTROL_PLANE_UNAVAILABLE",
      "El servidor OAuth no respondió al registrar la decisión.",
      503,
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El servidor OAuth devolvió una decisión ilegible.",
      502,
    )
  }

  if (!response.ok) {
    console.error(
      "[OAuth decision] Consent endpoint rejected the decision",
      JSON.stringify({
        status: response.status,
        errorCode:
          typeof payload === "object" &&
          payload !== null &&
          "error_code" in payload &&
          typeof (payload as { error_code?: unknown }).error_code ===
            "string"
            ? (payload as { error_code: string }).error_code
            : null,
      }),
    )

    if (response.status === 401) {
      throw new McpWebError(
        "UNAUTHENTICATED",
        "La sesión web venció antes de registrar la decisión.",
        401,
      )
    }
    if (response.status === 403) {
      throw new McpWebError(
        "FORBIDDEN",
        "El servidor OAuth rechazó esta sesión web.",
        403,
      )
    }
    // 400/404/410 describen una autorización vencida, ya consumida o
    // desconocida. La acción útil es siempre reiniciar la conexión.
    if (response.status >= 400 && response.status < 500) {
      throw new McpWebError(
        "NOT_FOUND",
        "La solicitud OAuth ya no está disponible.",
        404,
      )
    }

    throw new McpWebError(
      "CONTROL_PLANE_UNAVAILABLE",
      "El servidor OAuth no pudo registrar la decisión.",
      503,
    )
  }

  let result: OAuthAuthorizationResult
  try {
    result = parseOAuthAuthorizationResult(
      payload,
      authorizationId,
      session.user.id,
    )
  } catch {
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El servidor OAuth no devolvió un redirect válido.",
      502,
    )
  }

  if (result.kind !== "redirect") {
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El servidor OAuth no devolvió un redirect válido.",
      502,
    )
  }

  return result.redirectUrl
}
