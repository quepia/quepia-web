// Reglas puras de acceso (sin dependencias de servidor) para poder probarlas.

export type GlobalAdminCandidate = {
  role?: string | null
  is_authorized?: boolean | null
  is_active?: boolean | null
  deleted_at?: string | null
} | null | undefined

export function isGlobalAdminProfile(profile: GlobalAdminCandidate): boolean {
  return Boolean(
    profile &&
      profile.role === "admin" &&
      profile.is_authorized === true &&
      profile.is_active === true &&
      profile.deleted_at === null,
  )
}

/** Longitud real del cuerpo HTTP; String.length cuenta unidades UTF-16. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/**
 * Mitigación CSRF para mutaciones con cookies: exige Origin del mismo sitio
 * (o el configurado) y descarta Sec-Fetch-Site cross-site.
 */
export function isSameOriginMutation(request: Request, allowedOrigin: string | null): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false
  const origin = request.headers.get("origin")
  if (!origin) return fetchSite === "same-origin"
  let requestOrigin: string
  try {
    requestOrigin = new URL(request.url).origin
  } catch {
    return false
  }
  if (origin === requestOrigin) return true
  if (allowedOrigin) {
    try {
      return new URL(allowedOrigin).origin === origin
    } catch {
      return false
    }
  }
  return false
}
