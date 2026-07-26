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

  if (secFetchSite && secFetchSite !== "same-origin") {
    return false
  }

  const allowedOrigins = new Set<string>([requestOrigin])
  for (const candidate of additionalAllowedOrigins) {
    const normalized = normalizeOrigin(candidate.trim())
    if (normalized) {
      allowedOrigins.add(normalized)
    }
  }

  return allowedOrigins.has(suppliedOrigin)
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}
