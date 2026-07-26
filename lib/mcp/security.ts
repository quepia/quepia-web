export interface OriginValidationInput {
  requestUrl: string
  origin: string | null
  secFetchSite: string | null
  additionalAllowedOrigins?: readonly string[]
}
function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

export function validateSameOriginRequest({
  requestUrl,
  origin,
  secFetchSite,
  additionalAllowedOrigins = [],
}: OriginValidationInput): boolean {
  const requestOrigin = normalizeOrigin(requestUrl)
  const suppliedOrigin = origin ? normalizeOrigin(origin) : null

  if (!requestOrigin || !suppliedOrigin) {
    return false
  }

  const allowedOrigins = new Set<string>([requestOrigin])
  for (const candidate of additionalAllowedOrigins) {
    const normalized = normalizeOrigin(candidate.trim())
    if (normalized) {
      allowedOrigins.add(normalized)
    }
  }

  if (!allowedOrigins.has(suppliedOrigin)) {
    return false
  }

  // Fetch Metadata can remain tainted as "cross-site" after an OAuth
  // navigation/redirect chain. An exact Origin match is still a strong CSRF
  // signal and must not be rejected solely because of that browser metadata.
  // Cross-site requests from a different (even explicitly allowlisted) origin
  // remain blocked.
  if (secFetchSite === "cross-site" && suppliedOrigin !== requestOrigin) {
    return false
  }

  return true
}

export function isOpaqueSameOriginOAuthRequest({
  origin,
  secFetchSite,
}: Pick<
  OriginValidationInput,
  "origin" | "secFetchSite"
>): boolean {
  return origin === "null" && secFetchSite === "same-origin"
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}
