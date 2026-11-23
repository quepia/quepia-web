import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import crypto from "node:crypto"
import path from "node:path"
import { ASSET_BUCKET, createSignedUrl, isStoragePath, sanitizeFilename } from "@/lib/sistema/assets-storage"
import { downloadDriveFile, extractGoogleDriveFileId } from "@/lib/sistema/google-drive-backup"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { uploadMediaToZernio, ZernioApiError, zernioRequest, toZernioMediaType } from "@/lib/zernio/client"
import { type ZernioMediaEdit } from "@/lib/zernio/media-formats"
import { normalizeZernioMediaEdit, prepareImageForZernio, prepareReelCoverForZernio } from "@/lib/zernio/media-preparation"
import { prepareReelForZernio } from "@/lib/zernio/reel-preparation"
import {
  buildZernioPlatformTargets,
  buildZernioTimingFields,
  scheduledForDatabaseValue as resolveScheduledForDatabaseValue,
  validateMediaScheduleWindow,
  validateReelAssets,
  type InstagramPublishingOptions,
  ZERNIO_REEL_MAX_SOURCE_BYTES,
  ZERNIO_TIME_ZONE,
} from "@/lib/zernio/publishing-rules"
import {
  apiErrorResponse,
  getProjectIntegration,
  syncProjectAccounts,
  ZernioRouteError,
} from "@/lib/zernio/server"

export const ACTIVE_PUBLICATION_STATUSES = new Set(["preparing", "scheduled", "publishing"])
const MAX_ZERNIO_MEDIA_BYTES = ZERNIO_REEL_MAX_SOURCE_BYTES

export type AssetVersionRow = {
  id: string
  version_number: number
  file_url: string
  file_type: string | null
  file_size: number | null
  storage_path: string | null
  thumbnail_url: string | null
  thumbnail_path: string | null
  preview_path: string | null
  original_filename: string | null
  drive_file_id: string | null
}

export type AssetRow = {
  id: string
  nombre: string
  asset_type: string
  current_version: number
  approval_status: string
  group_id: string | null
  group_order: number
  access_revoked?: boolean | null
  versions: AssetVersionRow[] | null
}

export type PublicationRow = {
  id: string
  zernio_post_id: string | null
  status: string
}

export function currentVersion(asset: AssetRow) {
  const versions = Array.isArray(asset.versions) ? asset.versions : []
  return versions.find((version) => version.version_number === asset.current_version) || versions[0] || null
}

export function scheduledForDatabaseValue(value: string | null) {
  try {
    return resolveScheduledForDatabaseValue(value)
  } catch (error) {
    throw new ZernioRouteError(400, error instanceof Error ? error.message : "La fecha programada no es válida")
  }
}

function instagramUsername(value: unknown) {
  const username = String(value || "").trim().replace(/^@+/, "")
  if (!username) return ""
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    throw new ZernioRouteError(400, `El usuario de Instagram “${username}” no es válido`)
  }
  return username
}

function uniqueUsernames(value: unknown, maximum: number, label: string) {
  const usernames = Array.from(new Set(
    (Array.isArray(value) ? value : []).map(instagramUsername).filter(Boolean),
  ))
  if (usernames.length > maximum) {
    throw new ZernioRouteError(400, `${label} admite hasta ${maximum} cuenta(s)`)
  }
  return usernames
}

function volume(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, Math.round(parsed)))
}

function normalizeInstagramOptions(value: unknown, isReel: boolean, mediaCount: number): InstagramPublishingOptions {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const isStory = raw.publicationType === "story" || raw.contentType === "story"
  const locationId = String(raw.locationId || "").trim()
  if (locationId && !/^\d+$/.test(locationId)) {
    throw new ZernioRouteError(400, "La ubicación debe ser el ID numérico de una página de Facebook con dirección")
  }

  const collaborators = uniqueUsernames(raw.collaborators, 3, "Instagram")
  const brandedContentSponsors = uniqueUsernames(raw.brandedContentSponsors, 2, "La colaboración pagada")
  const userTags = (Array.isArray(raw.userTags) ? raw.userTags : []).map((value, index) => {
    const tag = value && typeof value === "object" ? value as Record<string, unknown> : {}
    const username = instagramUsername(tag.username)
    if (!username) throw new ZernioRouteError(400, `Falta el usuario en la etiqueta ${index + 1}`)
    if (isReel) return { username }

    const x = Number(tag.x)
    const y = Number(tag.y)
    const mediaIndex = Number(tag.mediaIndex ?? 0)
    if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
      throw new ZernioRouteError(400, `La posición de @${username} debe estar entre 0 y 100%`)
    }
    if (!Number.isInteger(mediaIndex) || mediaIndex < 0 || mediaIndex >= Math.max(1, mediaCount)) {
      throw new ZernioRouteError(400, `El asset elegido para @${username} no es válido`)
    }
    return { username, x, y, mediaIndex }
  })
  if (userTags.length > 20) throw new ZernioRouteError(400, "Instagram admite hasta 20 etiquetas de personas")

  const audio = raw.audioConfiguration && typeof raw.audioConfiguration === "object"
    ? raw.audioConfiguration as Record<string, unknown>
    : null
  const audioId = String(audio?.audioId || "").trim()
  const trialStrategy = raw.trialGraduationStrategy === "SS_PERFORMANCE" ? "SS_PERFORMANCE" : "MANUAL"

  return {
    ...(isStory ? { contentType: "story" as const } : {}),
    shareToFeed: raw.shareToFeed !== false,
    commentsEnabled: raw.commentsEnabled !== false,
    isAiGenerated: raw.isAiGenerated === true,
    ...(locationId ? { locationId } : {}),
    ...(collaborators.length ? { collaborators } : {}),
    ...(userTags.length ? { userTags } : {}),
    ...(isReel && !isStory && String(raw.audioName || "").trim() ? { audioName: String(raw.audioName).trim().slice(0, 100) } : {}),
    ...((isReel || isStory) && raw.muteAudio === true ? { muteAudio: true } : {}),
    ...(isReel && !isStory && audioId ? {
      audioConfiguration: {
        audioId,
        audioVolume: volume(audio?.audioVolume, 100),
        videoVolume: volume(audio?.videoVolume, 100),
      },
    } : {}),
    ...(isReel && !isStory && raw.trialReel === true ? { trialParams: { graduationStrategy: trialStrategy } } : {}),
    ...(raw.isPaidPartnership === true || brandedContentSponsors.length ? { isPaidPartnership: true } : {}),
    ...(brandedContentSponsors.length ? { brandedContentSponsors } : {}),
    ...(!isStory && !isReel && String(raw.firstComment || "").trim()
      ? { firstComment: String(raw.firstComment).trim().slice(0, 2200) }
      : {}),
  }
}

export function extensionForContentType(contentType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/mpeg": ".mpeg",
    "video/quicktime": ".mov",
    "video/avi": ".avi",
    "video/x-msvideo": ".avi",
    "video/webm": ".webm",
    "video/x-m4v": ".m4v",
    "application/pdf": ".pdf",
  }
  return extensions[contentType] || ""
}

function safeFilename(asset: AssetRow, version: AssetVersionRow, contentType: string) {
  const original = sanitizeFilename(version.original_filename || path.basename(version.storage_path || version.file_url || ""))
  if (original && path.extname(original)) return original
  return `${sanitizeFilename(asset.nombre) || `asset-${asset.id}`}${extensionForContentType(contentType)}`
}

function versionStorageReference(version: AssetVersionRow) {
  return version.storage_path || (isStoragePath(version.file_url) ? version.file_url : null)
}

function versionPreviewReference(version: AssetVersionRow) {
  return version.preview_path
    || version.thumbnail_path
    || version.storage_path
    || version.thumbnail_url
    || version.file_url
}

export async function assetPreview(asset: AssetRow) {
  const version = currentVersion(asset)
  if (!version) return { previewUrl: null, coverUrl: null, fileType: null, editable: false }
  const reference = version.file_type?.startsWith("video/")
    ? version.storage_path || version.file_url
    : versionPreviewReference(version)
  const driveFileId = version.drive_file_id || extractGoogleDriveFileId(version.file_url)
  const previewUrl = driveFileId
    ? `/api/zernio/media-preview/${encodeURIComponent(version.id)}`
    : isStoragePath(reference)
      ? await createSignedUrl(reference, 60 * 60)
      : (/^https:\/\//i.test(reference || "") ? reference : null)
  const fileType = version.file_type || "application/octet-stream"
  const coverReference = version.thumbnail_path || version.thumbnail_url
  const coverUrl = coverReference && isStoragePath(coverReference)
    ? await createSignedUrl(coverReference, 60 * 60)
    : (/^https:\/\//i.test(coverReference || "") ? coverReference : null)

  return {
    previewUrl,
    coverUrl,
    fileType,
    editable: fileType.startsWith("image/") && Boolean(versionStorageReference(version)),
  }
}

async function reelCoverUrl(asset: AssetRow) {
  const version = currentVersion(asset)
  const reference = version?.thumbnail_path || version?.thumbnail_url
  if (!reference) return null

  let bytes: ArrayBuffer
  if (isStoragePath(reference)) {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(ASSET_BUCKET).download(reference)
    if (error || !data) throw new ZernioRouteError(500, error?.message || "No se pudo descargar la portada del Reel")
    bytes = await data.arrayBuffer()
  } else if (/^https:\/\//i.test(reference)) {
    const response = await fetch(reference, { cache: "no-store" })
    if (!response.ok) throw new ZernioRouteError(500, "No se pudo descargar la portada del Reel")
    bytes = await response.arrayBuffer()
  } else {
    return null
  }
  if (bytes.byteLength > 20 * 1024 * 1024) {
    throw new ZernioRouteError(400, "La portada del Reel supera el límite de 20 MB")
  }

  const prepared = await prepareReelCoverForZernio(bytes)
  return uploadMediaToZernio({
    bytes: prepared,
    filename: `reel-cover-${asset.id}.jpg`,
    contentType: "image/jpeg",
  })
}

async function toMediaItem(asset: AssetRow, edit?: ZernioMediaEdit | null) {
  const version = currentVersion(asset)
  if (!version) throw new ZernioRouteError(400, `El asset “${asset.nombre}” no tiene una versión disponible`)

  let contentType = version.file_type || "application/octet-stream"
  const storageReference = versionStorageReference(version)
  const driveFileId = version.drive_file_id || extractGoogleDriveFileId(version.file_url)

  if (edit && edit.format !== "original" && !contentType.startsWith("image/")) {
    throw new ZernioRouteError(400, `El recorte solo está disponible para imágenes: “${asset.nombre}”`)
  }

  if (!storageReference && !driveFileId) {
    if (edit && edit.format !== "original") {
      throw new ZernioRouteError(400, `“${asset.nombre}” no se puede recortar porque no está en el almacenamiento del sistema`)
    }
    if (/^https:\/\//i.test(version.file_url)) {
      const mediaType = toZernioMediaType(contentType)
      return { type: mediaType, url: version.file_url }
    }
    throw new ZernioRouteError(400, `No se pudo localizar el archivo de “${asset.nombre}”`)
  }

  if (version.file_size && version.file_size > MAX_ZERNIO_MEDIA_BYTES) {
    throw new ZernioRouteError(400, `“${asset.nombre}” supera el límite de 250 MB del sistema de publicación`)
  }

  let sourceBytes: ArrayBuffer
  if (storageReference) {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(ASSET_BUCKET).download(storageReference)
    if (error || !data) {
      throw new ZernioRouteError(500, error?.message || `No se pudo descargar “${asset.nombre}”`)
    }
    sourceBytes = await data.arrayBuffer()
  } else {
    try {
      const driveFile = await downloadDriveFile(driveFileId!, MAX_ZERNIO_MEDIA_BYTES)
      sourceBytes = driveFile.data.buffer.slice(
        driveFile.data.byteOffset,
        driveFile.data.byteOffset + driveFile.data.byteLength,
      ) as ArrayBuffer
      contentType = version.file_type || driveFile.mediaType || "application/octet-stream"
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : ""
      throw new ZernioRouteError(400, `No se pudo descargar “${asset.nombre}” desde Google Drive${detail}`)
    }
  }

  let prepared: Awaited<ReturnType<typeof prepareImageForZernio>> | Awaited<ReturnType<typeof prepareReelForZernio>> = null
  try {
    prepared = asset.asset_type === "reel"
      ? await prepareReelForZernio(sourceBytes)
      : edit && edit.format !== "original"
        ? await prepareImageForZernio({ bytes: sourceBytes, edit })
        : null
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : ""
    throw new ZernioRouteError(400, `No se pudo preparar “${asset.nombre}”${detail}`)
  }
  const publicUrl = await uploadMediaToZernio(prepared
    ? {
        bytes: prepared.bytes,
        filename: `${sanitizeFilename(path.parse(safeFilename(asset, version, contentType)).name)}-${prepared.suffix}`,
        contentType: prepared.contentType,
      }
    : {
        bytes: sourceBytes,
        filename: safeFilename(asset, version, contentType),
        contentType,
      })

  return { type: toZernioMediaType(prepared?.contentType || contentType), url: publicUrl }
}

export async function loadAssets(taskId: string): Promise<AssetRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("sistema_assets")
    .select(`
      id,
      nombre,
      asset_type,
      current_version,
      approval_status,
      group_id,
      group_order,
      access_revoked,
      versions:sistema_asset_versions(
        id,
        version_number,
        file_url,
        file_type,
        file_size,
        storage_path,
        thumbnail_url,
        thumbnail_path,
        preview_path,
        original_filename,
        drive_file_id
      )
    `)
    .eq("task_id", taskId)
    .order("group_order", { ascending: true })
    .order("created_at", { ascending: false })

  if (error) throw new ZernioRouteError(500, error.message)
  return ((data || []) as AssetRow[]).filter((asset) => !asset.access_revoked && Boolean(currentVersion(asset)))
}

export async function syncPublicationStatuses(publications: PublicationRow[]) {
  const admin = createAdminClient()
  await Promise.all(publications.map(async (publication) => {
    if (!publication.zernio_post_id || !ACTIVE_PUBLICATION_STATUSES.has(publication.status)) return
    try {
      const response = await zernioRequest<{ post: Record<string, unknown> }>(
        `/posts/${encodeURIComponent(publication.zernio_post_id)}`,
      )
      const post = response.post || {}
      const status = typeof post.status === "string" ? post.status : publication.status
      await admin
        .from("sistema_zernio_publications")
        .update({
          status,
          platform_results: Array.isArray(post.platforms) ? post.platforms : [],
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", publication.id)
    } catch (error) {
      if (error instanceof ZernioApiError && error.status === 404) return
      console.warn("[Zernio] No se pudo sincronizar la publicación", publication.id, error)
    }
  }))
}

export type PublishingMode = "draft" | "schedule" | "now"

export type PublishTaskInput = {
  taskId: string
  publicationId: string
  publishingMode: PublishingMode
  content: string
  scheduledFor: string | null
  accountIds: string[]
  assetIds: string[]
  rawMediaEdits: unknown[]
  rawInstagramOptions: unknown
  // Clave idempotente opcional (UUID). Repetir el pedido con la misma clave
  // devuelve la publicación ya registrada en vez de crear otra en Zernio.
  requestId?: string
}

export type PublishTaskRow = {
  id: string
  project_id: string
  titulo: string
  social_copy: string | null
  type_metadata: unknown
  task_type: string | null
}

export type PublishTaskResult = {
  publication: {
    id: string
    zernioPostId: string | null
    status: string
    platformResults: unknown[]
    replayed?: boolean
  }
}

function uniqueStrings(value: unknown) {
  return Array.from(new Set<string>(
    (Array.isArray(value) ? value : []).map((item: unknown) => String(item)).filter(Boolean),
  ))
}

/** Normaliza el cuerpo que comparten el panel web y el MCP. */
export function parsePublishInput(body: Record<string, unknown> | null | undefined): PublishTaskInput {
  const publishingMode: PublishingMode = body?.publishingMode === "draft" || body?.publishingMode === "schedule"
    ? body.publishingMode
    : "now"
  return {
    taskId: String(body?.taskId || "").trim(),
    publicationId: typeof body?.publicationId === "string" ? body.publicationId.trim() : "",
    publishingMode,
    content: String(body?.content || "").trim(),
    scheduledFor: publishingMode === "schedule" && typeof body?.scheduledFor === "string" && body.scheduledFor.trim()
      ? body.scheduledFor.trim()
      : null,
    accountIds: uniqueStrings(body?.accountIds),
    assetIds: uniqueStrings(body?.assetIds),
    rawMediaEdits: Array.isArray(body?.mediaEdits) ? body.mediaEdits : [],
    rawInstagramOptions: body?.instagramOptions,
    ...(typeof body?.requestId === "string" && body.requestId ? { requestId: body.requestId } : {}),
  }
}

export async function loadPublishTask(client: SupabaseClient, taskId: string): Promise<PublishTaskRow | null> {
  const { data, error } = await client
    .from("sistema_tasks")
    .select("id, project_id, titulo, social_copy, type_metadata, task_type")
    .eq("id", taskId)
    .maybeSingle()
  if (error) throw new ZernioRouteError(500, error.message)
  return (data as PublishTaskRow | null) || null
}

/**
 * Crea o actualiza la publicación de una tarjeta en Zernio. La autorización
 * (sesión web admin o grant MCP admin) la resuelve quien llama; acá se valida
 * todo lo demás: que las cuentas pertenezcan al perfil Zernio del proyecto,
 * que los assets sean de la tarjeta, la aprobación de historias y los reels.
 */
export async function publishTaskToZernio(params: {
  input: PublishTaskInput
  task: PublishTaskRow
  actorUserId: string
  // Cliente con el que se marca el asset como publicado (RLS de la sesión
  // web, o el cliente admin cuando la autorización ya pasó por el MCP).
  assetStatusClient: SupabaseClient
}): Promise<PublishTaskResult> {
  const { input, task, actorUserId, assetStatusClient } = params
  const { taskId, publicationId, publishingMode, content, scheduledFor, accountIds, assetIds } = input
  const isDraft = publishingMode === "draft"
  let localPublicationId: string | null = null
  let createdLocalPublication = false

  if (!content && assetIds.length === 0) {
    throw new ZernioRouteError(400, "La publicación necesita copy o al menos un asset")
  }
  if (accountIds.length === 0) {
    throw new ZernioRouteError(400, "Seleccioná al menos una cuenta social")
  }
  if (publishingMode === "schedule" && !scheduledFor) {
    throw new ZernioRouteError(400, "Falta la fecha programada")
  }
  const scheduledForDatabase = scheduledForDatabaseValue(scheduledFor)
  try {
    validateMediaScheduleWindow(scheduledForDatabase, assetIds.length > 0)
  } catch (error) {
    throw new ZernioRouteError(400, error instanceof Error ? error.message : "La fecha programada excede el límite permitido")
  }

  const admin = createAdminClient()
  const requestId = input.requestId || crypto.randomUUID()
  if (input.requestId && !publicationId) {
    const { data: replay, error: replayError } = await admin
      .from("sistema_zernio_publications")
      .select("id, task_id, zernio_post_id, status, platform_results")
      .eq("request_id", requestId)
      .maybeSingle()
    if (replayError) throw new ZernioRouteError(500, replayError.message)
    if (replay) {
      if (replay.task_id !== taskId) {
        throw new ZernioRouteError(409, "La clave idempotente ya se usó para otra tarjeta")
      }
      return {
        publication: {
          id: replay.id,
          zernioPostId: replay.zernio_post_id,
          status: replay.status,
          platformResults: Array.isArray(replay.platform_results) ? replay.platform_results : [],
          replayed: true,
        },
      }
    }
  }

  const integration = await getProjectIntegration(task.project_id)
  if (!integration) throw new ZernioRouteError(409, "Este proyecto todavía no tiene un perfil Zernio")

  await syncProjectAccounts(integration)
  const { data: accounts, error: accountsError } = await admin
    .from("sistema_zernio_accounts")
    .select("zernio_account_id, platform, is_active, needs_reconnection")
    .eq("integration_id", integration.id)
    .in("zernio_account_id", accountIds)

  if (accountsError) throw new ZernioRouteError(500, accountsError.message)
  if (!accounts || accounts.length !== accountIds.length) {
    throw new ZernioRouteError(403, "Una de las cuentas seleccionadas no pertenece a este proyecto")
  }
  if (accounts.some((account) => !account.is_active || account.needs_reconnection)) {
    throw new ZernioRouteError(409, "Una de las cuentas necesita reconexión antes de publicar")
  }

  const allAssets = await loadAssets(taskId)
  const selectedAssets = assetIds.map((assetId) => allAssets.find((asset) => asset.id === assetId)).filter(Boolean) as AssetRow[]
  if (selectedAssets.length !== assetIds.length) {
    throw new ZernioRouteError(400, "Uno de los assets seleccionados ya no está disponible")
  }
  if (task.task_type === "story" && !isDraft && selectedAssets.some(asset => !["approved_final", "published"].includes(asset.approval_status))) {
    throw new ZernioRouteError(422, "Aprobá la versión de la historia antes de publicar o programar")
  }
  if (task.task_type === "story" && !isDraft && assetIds.length) {
    const { data: generations, error: generationsError } = await admin.from("sistema_story_generations").select("asset_id,output_path,status").eq("task_id",taskId).in("asset_id",assetIds)
    if (generationsError) throw new ZernioRouteError(503,"No se pudo verificar la versión generada")
    if (generations?.some(job => {
      const asset = selectedAssets.find(item=>item.id===job.asset_id)
      return !asset || job.status !== "succeeded" || asset.current_version !== 1 || currentVersion(asset)?.storage_path !== job.output_path
    })) throw new ZernioRouteError(409,"La imagen generada cambió. Revisá y aprobá una nueva historia antes de publicar.")
  }
  let isReel = false
  try {
    isReel = validateReelAssets(selectedAssets.map((asset) => ({
      assetType: asset.asset_type,
      fileType: currentVersion(asset)?.file_type || null,
    })))
  } catch (error) {
    throw new ZernioRouteError(400, error instanceof Error ? error.message : "La selección del Reel no es válida")
  }
  const instagramOptions = normalizeInstagramOptions(input.rawInstagramOptions, isReel, selectedAssets.length)
  const isInstagramStory = instagramOptions.contentType === "story"
    && accounts.some((account) => account.platform.toLowerCase() === "instagram")
  if (isInstagramStory) {
    if (selectedAssets.length !== 1) {
      throw new ZernioRouteError(400, "Para publicar una Story seleccioná exactamente un asset")
    }
    const storyType = currentVersion(selectedAssets[0])?.file_type || ""
    if (!storyType.startsWith("image/") && !storyType.startsWith("video/")) {
      throw new ZernioRouteError(400, "La Story debe usar una imagen o un video")
    }
  }
  const mediaEdits = new Map<string, ZernioMediaEdit>()
  for (const assetId of assetIds) {
    const rawEdit = input.rawMediaEdits.find((value: unknown) => (
      value && typeof value === "object" && String((value as Record<string, unknown>).assetId || "") === assetId
    ))
    const normalized = normalizeZernioMediaEdit(rawEdit, assetId)
    if (rawEdit && !normalized) {
      throw new ZernioRouteError(400, "Uno de los ajustes de imagen no es válido")
    }
    if (normalized) mediaEdits.set(assetId, normalized)
  }

  try {
    let zernioPostIdForUpdate: string | null = null
    if (publicationId) {
      const { data: existing, error: existingError } = await admin
        .from("sistema_zernio_publications")
        .select("id, zernio_post_id, status")
        .eq("id", publicationId)
        .eq("task_id", taskId)
        .maybeSingle()
      if (existingError) throw new ZernioRouteError(500, existingError.message)
      if (!existing) throw new ZernioRouteError(404, "Publicación no encontrada")
      if (!["draft", "scheduled", "cancelled"].includes(existing.status) || !existing.zernio_post_id) {
        throw new ZernioRouteError(409, "Solo se pueden editar borradores, publicaciones programadas o canceladas")
      }
      localPublicationId = existing.id
      zernioPostIdForUpdate = existing.zernio_post_id
    } else {
      const { data: localPublication, error: insertError } = await admin
        .from("sistema_zernio_publications")
        .insert({
          project_id: task.project_id,
          task_id: taskId,
          request_id: requestId,
          content,
          scheduled_for: scheduledForDatabase,
          timezone: ZERNIO_TIME_ZONE,
          status: "preparing",
          account_ids: accountIds,
          asset_ids: assetIds,
          created_by: actorUserId,
        })
        .select("id")
        .single()

      if (insertError || !localPublication) {
        throw new ZernioRouteError(500, insertError?.message || "No se pudo registrar la publicación")
      }
      localPublicationId = localPublication.id
      createdLocalPublication = true
    }

    const isInstagramReel = isReel && !isInstagramStory
      && accounts.some((account) => account.platform.toLowerCase() === "instagram")
    const [mediaItems, instagramThumbnail] = await Promise.all([
      Promise.all(selectedAssets.map((asset) => toMediaItem(asset, mediaEdits.get(asset.id)))),
      isInstagramReel ? reelCoverUrl(selectedAssets[0]) : Promise.resolve(null),
    ])
    const youtubeMetadata = task.type_metadata && typeof task.type_metadata === "object"
      ? (task.type_metadata as Record<string, unknown>).youtube
      : null
    const youtubeTitle = youtubeMetadata && typeof youtubeMetadata === "object"
      && typeof (youtubeMetadata as Record<string, unknown>).title === "string"
      ? String((youtubeMetadata as Record<string, unknown>).title)
      : task.titulo

    const postBody: Record<string, unknown> = {
      title: youtubeTitle.slice(0, 100),
      content,
      mediaItems,
      platforms: buildZernioPlatformTargets(accounts, {
        isInstagramReel,
        instagram: instagramOptions,
        instagramThumbnail,
      }),
      timezone: ZERNIO_TIME_ZONE,
      metadata: {
        source: "quepia",
        projectId: task.project_id,
        taskId,
        localPublicationId,
        publicationKind: isInstagramStory ? "story" : isReel ? "reel" : "post",
        mediaEdits: Array.from(mediaEdits.values()),
        instagramOptions,
      },
      ...buildZernioTimingFields(scheduledFor, isDraft),
      ...(publicationId && !isDraft ? { isDraft: false } : {}),
    }

    const validation = await zernioRequest<{
      valid?: boolean
      errors?: Array<{ error?: string; message?: string }>
    }>("/tools/validate/post", {
      method: "POST",
      body: postBody,
    })
    if (validation.valid === false) {
      const firstError = validation.errors?.[0]
      throw new ZernioRouteError(400, firstError?.error || firstError?.message || "Zernio rechazó la validación de la publicación")
    }

    const response = await zernioRequest<{
      post?: Record<string, unknown>
      existingPost?: Record<string, unknown>
    }>(zernioPostIdForUpdate ? `/posts/${encodeURIComponent(zernioPostIdForUpdate)}` : "/posts", {
      method: zernioPostIdForUpdate ? "PUT" : "POST",
      headers: zernioPostIdForUpdate ? undefined : { "x-request-id": requestId },
      body: postBody,
    })
    const post = response.post || response.existingPost || {}
    const zernioPostId = typeof post._id === "string" ? post._id : zernioPostIdForUpdate
    const status = typeof post.status === "string"
      ? post.status
      : isDraft ? "draft" : scheduledFor ? "scheduled" : "publishing"
    const platformResults = Array.isArray(post.platforms) ? post.platforms : []

    const { error: updateError } = await admin
      .from("sistema_zernio_publications")
      .update({
        zernio_post_id: zernioPostId,
        content,
        scheduled_for: scheduledForDatabase,
        account_ids: accountIds,
        asset_ids: assetIds,
        status,
        platform_results: platformResults,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", localPublicationId)
    if (updateError) throw new ZernioRouteError(500, updateError.message)

    if (status === "published" && assetIds.length > 0) {
      await assetStatusClient
        .from("sistema_assets")
        .update({ approval_status: "published" })
        .in("id", assetIds)
    }

    return {
      publication: {
        id: localPublicationId!,
        zernioPostId,
        status,
        platformResults,
      },
    }
  } catch (error) {
    if (localPublicationId && createdLocalPublication) {
      await admin
        .from("sistema_zernio_publications")
        .update({
          status: "failed",
          error_message: apiErrorResponse(error).message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localPublicationId)
    }
    throw error
  }
}
