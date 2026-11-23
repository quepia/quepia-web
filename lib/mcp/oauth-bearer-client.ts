import "server-only"

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"

const MCP_DATABASE_ROLE = "mcp_authenticated"

export type McpBearerResult =
  | { client: SupabaseClient; token: string }
  | { status: number; error: { code: string; message: string } }

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(header.trim())
  return match?.[1] ?? null
}

function audienceMatches(aud: unknown, expected: string): boolean {
  const values = Array.isArray(aud) ? aud : [aud]
  return values.some(
    (value) =>
      typeof value === "string" &&
      value.replace(/\/+$/, "") === expected.replace(/\/+$/, ""),
  )
}

/**
 * Entradas web que acepta el servicio MCP (facturación, publicación social).
 * Una cookie de sesión no autoriza nada: solo el token OAuth explícito, con el
 * rol aislado y la audiencia del MCP. El cliente que devuelve habla con
 * Postgres como ese usuario, y cada RPC vuelve a exigir grant y capacidad.
 */
export async function mcpOAuthBearerClient(request: Request): Promise<McpBearerResult> {
  const resourceUri = process.env.MCP_RESOURCE_URI
  if (!resourceUri) {
    return {
      status: 503,
      error: { code: "NOT_CONFIGURED", message: "El acceso desde el MCP no está habilitado en la web (falta MCP_RESOURCE_URI)." },
    }
  }

  const token = bearerToken(request)
  if (!token) return { status: 401, error: { code: "UNAUTHENTICATED", message: "Falta el token MCP." } }

  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )

  // getClaims lanza (en vez de devolver error) si el token no tiene forma de
  // JWT; eso también es un token inválido, no una falla del servidor.
  let claims: Record<string, unknown> | undefined
  let failed = false
  try {
    const { data, error } = await client.auth.getClaims(token)
    claims = data?.claims as Record<string, unknown> | undefined
    failed = Boolean(error)
  } catch {
    failed = true
  }
  if (
    failed ||
    !claims ||
    claims.role !== MCP_DATABASE_ROLE ||
    typeof claims.client_id !== "string" ||
    !claims.client_id ||
    !audienceMatches(claims.aud, resourceUri)
  ) {
    return { status: 403, error: { code: "FORBIDDEN", message: "El token no es un token MCP válido." } }
  }
  return { client, token }
}
