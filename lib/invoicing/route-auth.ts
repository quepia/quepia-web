import "server-only"

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import type { NextResponse } from "next/server"
import { isDirectFirstPartySessionClaims } from "@/lib/mcp/session-boundary"
import { parseAllowedOrigins, validateSameOriginRequest } from "@/lib/mcp/security"
import { createClient } from "@/lib/sistema/supabase/server"
import { errorResponse } from "./http"

const MCP_DATABASE_ROLE = "mcp_authenticated"

/**
 * Sesión web directa de primera parte. Con `mutation` exige además que el
 * pedido venga del propio panel (Origin), para las rutas que emiten.
 */
export async function firstPartyInvoicingSession(
  request: Request,
  { mutation }: { mutation: boolean },
): Promise<SupabaseClient | NextResponse> {
  if (
    mutation &&
    !validateSameOriginRequest({
      requestUrl: request.url,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      additionalAllowedOrigins: parseAllowedOrigins(process.env.MCP_WEB_ALLOWED_ORIGINS),
    })
  ) {
    return errorResponse("FORBIDDEN", "La solicitud no proviene del panel web autorizado.", 403)
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims || !isDirectFirstPartySessionClaims(data.claims)) {
    return errorResponse("UNAUTHENTICATED", "Iniciá sesión en el sistema.", 401)
  }
  return supabase
}

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
 * Cliente de Postgres con el token OAuth del MCP. Es la única entrada web que
 * acepta ese token y solo lo usa para hablar con Postgres como ese usuario:
 * cada RPC vuelve a exigir el grant con accounting.invoice.write y rol admin.
 */
export async function mcpInvoicingClient(request: Request): Promise<SupabaseClient | NextResponse> {
  const resourceUri = process.env.MCP_RESOURCE_URI
  if (!resourceUri) {
    return errorResponse(
      "NOT_CONFIGURED",
      "La emisión desde el MCP no está habilitada en la web (falta MCP_RESOURCE_URI).",
      503,
    )
  }

  // Una cookie de sesión no autoriza nada acá: solo el token explícito.
  const token = bearerToken(request)
  if (!token) {
    return errorResponse("UNAUTHENTICATED", "Falta el token MCP.", 401)
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )

  const { data, error } = await supabase.auth.getClaims(token)
  const claims = data?.claims as Record<string, unknown> | undefined
  if (
    error ||
    !claims ||
    claims.role !== MCP_DATABASE_ROLE ||
    typeof claims.client_id !== "string" ||
    !claims.client_id ||
    !audienceMatches(claims.aud, resourceUri)
  ) {
    return errorResponse("FORBIDDEN", "El token no es un token MCP válido.", 403)
  }
  return supabase
}
