import { createAdminClient } from "@/lib/sistema/supabase/admin"

const DEFAULT_CLIENT_SESSION_DAYS = 30

function normalizeBaseUrl(url?: string | null) {
  if (!url) return null
  return url.trim().replace(/\/$/, "")
}

export function getClientBaseUrl() {
  return (
    normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    "https://quepia.com"
  )
}

export async function createClientSessionForAccess(params: {
  clientAccessId: string
  ttlDays?: number
}) {
  const { clientAccessId, ttlDays = DEFAULT_CLIENT_SESSION_DAYS } = params
  const supabase = createAdminClient()

  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("sistema_client_sessions")
    .insert({
      client_access_id: clientAccessId,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single()

  if (error || !data) {
    throw new Error(error?.message || "Error creating client session")
  }

  return {
    sessionId: data.id as string,
    expiresAt: data.expires_at as string,
  }
}

export async function createClientDirectLink(params: {
  clientAccessId: string
  ttlDays?: number
  baseUrl?: string
}) {
  const { clientAccessId, ttlDays, baseUrl = getClientBaseUrl() } = params
  const session = await createClientSessionForAccess({ clientAccessId, ttlDays })

  return {
    ...session,
    link: `${baseUrl}/cliente/${session.sessionId}`,
  }
}
