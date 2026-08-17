import crypto from "node:crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ZernioApiError, zernioRequest } from "@/lib/zernio/client"

export type ZernioAccount = {
  _id: string
  platform: string
  username?: string | null
  displayName?: string | null
  profilePicture?: string | null
  profileUrl?: string | null
  isActive?: boolean
  needsReconnection?: boolean
  enabled?: boolean
  metadata?: Record<string, unknown> | null
}

export type QuepiaSession = {
  server: SupabaseClient
  user: User
  isAdmin: boolean
}

export class ZernioRouteError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ZernioRouteError"
    this.status = status
  }
}

export async function getQuepiaSession(): Promise<QuepiaSession> {
  const server = await createClient()
  const { data, error } = await server.auth.getUser()
  if (error || !data.user) throw new ZernioRouteError(401, "No autorizado")

  const admin = createAdminClient()
  const { data: sistemaUser } = await admin
    .from("sistema_users")
    .select("role, is_active, deleted_at")
    .eq("id", data.user.id)
    .maybeSingle()

  const active = sistemaUser && sistemaUser.is_active !== false && !sistemaUser.deleted_at
  return {
    server,
    user: data.user,
    isAdmin: Boolean(active && sistemaUser.role === "admin"),
  }
}

export async function assertProjectAccess(session: QuepiaSession, projectId: string) {
  const { data } = await session.server
    .from("sistema_projects")
    .select("id, nombre")
    .eq("id", projectId)
    .maybeSingle()

  if (!data) throw new ZernioRouteError(403, "Proyecto no autorizado")
  return data as { id: string; nombre: string }
}

export function assertAdmin(session: QuepiaSession) {
  if (!session.isAdmin) {
    throw new ZernioRouteError(403, "Solo un administrador puede gestionar Zernio o publicar")
  }
}

export async function getProjectIntegration(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("sistema_zernio_profiles")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle()

  if (error) throw new ZernioRouteError(500, error.message)
  return data
}

export async function ensureProjectIntegration(input: {
  projectId: string
  projectName: string
  userId: string
}) {
  const existing = await getProjectIntegration(input.projectId)
  if (existing) return existing

  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`quepia-zernio-profile:${input.projectId}`)
    .digest("hex")

  let zernioProfileId: string | null = null
  try {
    const created = await zernioRequest<{
      profile: { _id: string; name?: string }
    }>("/profiles", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        name: `quepia_${input.projectId}`,
        description: input.projectName,
        color: "#2ae7e4",
      },
    })
    zernioProfileId = created.profile?._id || null
  } catch (error) {
    if (error instanceof ZernioApiError && error.status === 409) {
      const details = error.payload?.details
      if (details && typeof details === "object") {
        const candidate = (details as Record<string, unknown>).existingProfileId
        if (typeof candidate === "string") zernioProfileId = candidate
      }
    }
    if (!zernioProfileId) throw error
  }

  if (!zernioProfileId) throw new ZernioRouteError(502, "Zernio no devolvió el identificador del perfil")

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("sistema_zernio_profiles")
    .upsert({
      project_id: input.projectId,
      zernio_profile_id: zernioProfileId,
      name: input.projectName,
      status: "active",
      created_by: input.userId,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" })
    .select("*")
    .single()

  if (error || !data) throw new ZernioRouteError(500, error?.message || "No se pudo guardar el perfil Zernio")
  return data
}

export async function syncProjectAccounts(integration: Record<string, unknown>) {
  const zernioProfileId = String(integration.zernio_profile_id || "")
  const integrationId = String(integration.id || "")
  if (!zernioProfileId || !integrationId) return []

  const response = await zernioRequest<{ accounts: ZernioAccount[] }>(
    `/accounts?profileId=${encodeURIComponent(zernioProfileId)}`,
  )
  const accounts = Array.isArray(response.accounts) ? response.accounts : []
  const admin = createAdminClient()

  // Start from a disabled snapshot so accounts removed from the Zernio profile
  // cannot remain selectable in this project after a sync.
  const { error: disableError } = await admin
    .from("sistema_zernio_accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("integration_id", integrationId)
  if (disableError) throw new ZernioRouteError(500, disableError.message)

  if (accounts.length > 0) {
    const now = new Date().toISOString()
    const rows = accounts.map((account) => ({
      integration_id: integrationId,
      zernio_account_id: account._id,
      platform: account.platform,
      username: account.username || null,
      display_name: account.displayName || null,
      profile_picture: account.profilePicture || null,
      profile_url: account.profileUrl || null,
      is_active: account.isActive !== false && account.enabled !== false,
      needs_reconnection: Boolean(account.needsReconnection),
      metadata: account.metadata || {},
      updated_at: now,
    }))
    const { error } = await admin
      .from("sistema_zernio_accounts")
      .upsert(rows, { onConflict: "zernio_account_id" })
    if (error) throw new ZernioRouteError(500, error.message)
  }

  const { error: profileError } = await admin
    .from("sistema_zernio_profiles")
    .update({ last_synced_at: new Date().toISOString(), status: "active" })
    .eq("id", integrationId)
  if (profileError) throw new ZernioRouteError(500, profileError.message)

  const { data, error } = await admin
    .from("sistema_zernio_accounts")
    .select("id, zernio_account_id, platform, username, display_name, profile_picture, profile_url, is_active, needs_reconnection")
    .eq("integration_id", integrationId)
    .order("platform")

  if (error) throw new ZernioRouteError(500, error.message)
  return data || []
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZernioRouteError) {
    return { status: error.status, message: error.message }
  }
  if (error instanceof ZernioApiError) {
    return {
      status: error.status >= 400 && error.status < 600 ? error.status : 502,
      message: error.message,
      details: error.payload,
    }
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "Error inesperado en la integración con Zernio",
  }
}
