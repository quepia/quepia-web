import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextResponse } from "next/server"
import { isDirectFirstPartySessionClaims } from "@/lib/mcp/session-boundary"
import { parseAllowedOrigins, validateSameOriginRequest } from "@/lib/mcp/security"
import { createClient } from "@/lib/sistema/supabase/server"
import { mcpOAuthBearerClient } from "@/lib/mcp/oauth-bearer-client"
import { errorResponse } from "./http"

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

/**
 * Cliente de Postgres con el token OAuth del MCP. Solo lo usa para hablar con
 * Postgres como ese usuario: cada RPC vuelve a exigir el grant con
 * accounting.invoice.write y rol admin.
 */
export async function mcpInvoicingClient(request: Request): Promise<SupabaseClient | NextResponse> {
  const result = await mcpOAuthBearerClient(request)
  if ("error" in result) return errorResponse(result.error.code, result.error.message, result.status)
  return result.client
}
