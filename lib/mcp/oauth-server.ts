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
    const status = "status" in (error ?? {}) ? error?.status : undefined
    if (status === 404) {
      throw new McpWebError(
        "NOT_FOUND",
        "La solicitud OAuth no existe, venció o el servidor OAuth está deshabilitado.",
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
  const response =
    decision === "approve"
      ? await session.supabase.auth.oauth.approveAuthorization(
          authorizationId,
          { skipBrowserRedirect: true },
        )
      : await session.supabase.auth.oauth.denyAuthorization(
          authorizationId,
          { skipBrowserRedirect: true },
        )

  if (response.error || !response.data) {
    throw new McpWebError(
      "CONTROL_PLANE_UNAVAILABLE",
      "El servidor OAuth no pudo registrar la decisión.",
      503,
    )
  }

  const result = parseOAuthAuthorizationResult(
    response.data,
    authorizationId,
    session.user.id,
  )
  if (result.kind !== "redirect") {
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El servidor OAuth no devolvió un redirect válido.",
      502,
    )
  }

  return result.redirectUrl
}
