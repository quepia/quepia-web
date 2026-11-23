import "server-only"

import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { zernioRequest } from "@/lib/zernio/client"
import { ZernioRouteError } from "@/lib/zernio/server"

// Acciones sobre una publicación ya creada, compartidas por el panel web y
// el MCP. La autorización (admin) la resuelve quien llama.

export const PUBLICATION_COLUMNS =
  "id, project_id, task_id, zernio_post_id, content, scheduled_for, timezone, status, account_ids, asset_ids, platform_results, error_message, created_at, updated_at"

export type PublicationRecord = {
  id: string
  project_id: string
  task_id: string
  zernio_post_id: string | null
  content: string | null
  scheduled_for: string | null
  timezone: string | null
  status: string
  account_ids: string[]
  asset_ids: string[]
  platform_results: unknown
  error_message: string | null
  created_at: string
  updated_at?: string | null
}

export function postState(post: Record<string, unknown>, fallback: string) {
  const status = typeof post.status === "string" ? post.status : fallback
  const platforms = Array.isArray(post.platforms) ? post.platforms : []
  const errorMessage = platforms
    .map((platform) => platform && typeof platform === "object" ? (platform as Record<string, unknown>).errorMessage : null)
    .find((value): value is string => typeof value === "string" && Boolean(value)) || null
  return { status, platforms, errorMessage }
}

export async function loadPublicationRecord(publicationId: string, options: { requireZernioPost?: boolean } = {}) {
  const admin = createAdminClient()
  const { data: publication, error } = await admin
    .from("sistema_zernio_publications")
    .select(PUBLICATION_COLUMNS)
    .eq("id", publicationId)
    .maybeSingle()
  if (error) throw new ZernioRouteError(500, error.message)
  if (!publication) throw new ZernioRouteError(404, "Publicación no encontrada")
  const record = publication as PublicationRecord
  if (options.requireZernioPost !== false && !record.zernio_post_id) {
    throw new ZernioRouteError(409, "La publicación todavía no tiene un identificador de Zernio")
  }
  return record
}

export async function cancelPublication(publication: PublicationRecord) {
  if (!["draft", "scheduled"].includes(publication.status)) {
    throw new ZernioRouteError(409, "Solo se pueden cancelar borradores o publicaciones programadas")
  }
  if (!publication.zernio_post_id) {
    throw new ZernioRouteError(409, "La publicación todavía no tiene un identificador de Zernio")
  }
  await zernioRequest(`/posts/${encodeURIComponent(publication.zernio_post_id)}`, { method: "DELETE" })
  const admin = createAdminClient()
  const { error } = await admin
    .from("sistema_zernio_publications")
    .update({ status: "cancelled", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", publication.id)
  if (error) throw new ZernioRouteError(500, error.message)
  return { ...publication, status: "cancelled", error_message: null }
}

export async function retryPublication(publication: PublicationRecord) {
  if (!["failed", "partial"].includes(publication.status)) {
    throw new ZernioRouteError(409, "Solo se pueden reintentar publicaciones fallidas o parciales")
  }
  if (!publication.zernio_post_id) {
    throw new ZernioRouteError(409, "La publicación nunca llegó a Zernio: creala de nuevo")
  }
  const response = await zernioRequest<{ post?: Record<string, unknown> }>(
    `/posts/${encodeURIComponent(publication.zernio_post_id)}/retry`,
    { method: "POST" },
  )
  const state = postState(response.post || {}, publication.status)
  const admin = createAdminClient()
  const { error } = await admin
    .from("sistema_zernio_publications")
    .update({
      status: state.status,
      platform_results: state.platforms,
      error_message: state.errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", publication.id)
  if (error) throw new ZernioRouteError(500, error.message)
  if (state.status === "published" && publication.asset_ids.length > 0) {
    await admin
      .from("sistema_assets")
      .update({ approval_status: "published" })
      .in("id", publication.asset_ids)
  }
  return { id: publication.id, ...state }
}
