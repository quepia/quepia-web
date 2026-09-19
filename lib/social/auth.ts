import "server-only"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { isAuthorizedSistemaUser, type SistemaAccessProfile } from "@/lib/sistema/auth/authorization"
import { isDirectFirstPartySessionClaims } from "@/lib/mcp/session-boundary"
import { SocialError } from "./errors"
import { isGlobalAdminProfile, isSameOriginMutation } from "./policy"

export type SocialAdmin = {
  userId: string
  email: string
  name: string
}

/**
 * Exige un administrador GLOBAL de Quepia: sesión web directa (no token OAuth
 * de MCP), role = 'admin', is_authorized, is_active y sin deleted_at. Ser
 * admin de un proyecto no concede acceso. Se consulta en cada solicitud, así
 * que una revocación surte efecto en la siguiente.
 */
export async function requireSocialAdmin(request?: Request): Promise<SocialAdmin> {
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || null
    if (!isSameOriginMutation(request, allowedOrigin)) {
      throw new SocialError(403, "invalid_origin", "Origen no permitido para esta acción")
    }
  }

  const server = await createClient()
  const [{ data: userData, error: userError }, { data: claimsData }] = await Promise.all([
    server.auth.getUser(),
    server.auth.getClaims(),
  ])
  if (userError || !userData.user) throw new SocialError(401, "unauthenticated", "No autorizado")
  if (!isDirectFirstPartySessionClaims(claimsData?.claims)) {
    throw new SocialError(403, "oauth_session", "Los tokens de clientes OAuth no son sesiones web")
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from("sistema_users")
    .select("id, email, nombre, role, is_authorized, is_active, deleted_at")
    .eq("id", userData.user.id)
    .maybeSingle()
  if (profileError) throw new SocialError(503, "profile_unavailable", "No se pudo verificar el acceso")

  const accessProfile = profile as (SistemaAccessProfile & { role: string | null; nombre: string }) | null
  if (!isAuthorizedSistemaUser(userData.user, accessProfile) || !isGlobalAdminProfile(accessProfile)) {
    throw new SocialError(403, "forbidden", "Solo administradores globales de Quepia")
  }

  return { userId: userData.user.id, email: accessProfile!.email, name: accessProfile!.nombre }
}

/** Para Server Components: devuelve null en vez de lanzar. */
export async function getSocialAdminOrNull(): Promise<SocialAdmin | null> {
  try {
    return await requireSocialAdmin()
  } catch {
    return null
  }
}
