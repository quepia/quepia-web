import crypto from "node:crypto"
import path from "node:path"
import { NextResponse } from "next/server"
import { ASSET_BUCKET, createSignedUrl, isStoragePath, sanitizeFilename } from "@/lib/sistema/assets-storage"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { uploadMediaToZernio, ZernioApiError, zernioRequest, toZernioMediaType } from "@/lib/zernio/client"
import { type ZernioMediaEdit } from "@/lib/zernio/media-formats"
import { normalizeZernioMediaEdit, prepareImageForZernio } from "@/lib/zernio/media-preparation"
import {
  apiErrorResponse,
  assertAdmin,
  assertProjectAccess,
  getProjectIntegration,
  getQuepiaSession,
  syncProjectAccounts,
  ZernioRouteError,
} from "@/lib/zernio/server"

const TIME_ZONE = "America/Argentina/Cordoba"
const ACTIVE_PUBLICATION_STATUSES = new Set(["preparing", "scheduled", "publishing"])

type AssetVersionRow = {
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
}

type AssetRow = {
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

type PublicationRow = {
  id: string
  zernio_post_id: string | null
  status: string
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function currentVersion(asset: AssetRow) {
  const versions = Array.isArray(asset.versions) ? asset.versions : []
  return versions.find((version) => version.version_number === asset.current_version) || versions[0] || null
}

function scheduledForDatabaseValue(value: string | null) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    throw new ZernioRouteError(400, "La fecha programada no tiene un formato válido")
  }

  // Zernio receives the local wall-clock value plus TIME_ZONE. Postgres receives
  // the equivalent instant so the publication history remains unambiguous.
  const argentinaOffsetValue = `${value.length === 16 ? `${value}:00` : value}-03:00`
  const scheduledDate = new Date(argentinaOffsetValue)
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new ZernioRouteError(400, "La fecha programada no es válida")
  }
  if (scheduledDate.getTime() <= Date.now()) {
    throw new ZernioRouteError(400, "La fecha programada debe estar en el futuro")
  }
  return scheduledDate.toISOString()
}

function extensionForContentType(contentType: string) {
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

async function assetPreview(asset: AssetRow) {
  const version = currentVersion(asset)
  if (!version) return { previewUrl: null, fileType: null, editable: false }
  const reference = versionPreviewReference(version)
  const previewUrl = isStoragePath(reference)
    ? await createSignedUrl(reference, 60 * 60)
    : (/^https:\/\//i.test(reference || "") ? reference : null)
  const fileType = version.file_type || "application/octet-stream"

  return {
    previewUrl,
    fileType,
    editable: fileType.startsWith("image/") && Boolean(versionStorageReference(version)),
  }
}

async function toMediaItem(asset: AssetRow, edit?: ZernioMediaEdit | null) {
  const version = currentVersion(asset)
  if (!version) throw new ZernioRouteError(400, `El asset “${asset.nombre}” no tiene una versión disponible`)

  const contentType = version.file_type || "application/octet-stream"
  const mediaType = toZernioMediaType(contentType)
  const storageReference = versionStorageReference(version)

  if (edit && edit.format !== "original" && !contentType.startsWith("image/")) {
    throw new ZernioRouteError(400, `El recorte solo está disponible para imágenes: “${asset.nombre}”`)
  }

  if (!storageReference) {
    if (edit && edit.format !== "original") {
      throw new ZernioRouteError(400, `“${asset.nombre}” no se puede recortar porque no está en el almacenamiento del sistema`)
    }
    if (/^https:\/\//i.test(version.file_url)) {
      return { type: mediaType, url: version.file_url }
    }
    throw new ZernioRouteError(400, `No se pudo localizar el archivo de “${asset.nombre}”`)
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(ASSET_BUCKET).download(storageReference)
  if (error || !data) {
    throw new ZernioRouteError(500, error?.message || `No se pudo descargar “${asset.nombre}”`)
  }

  const sourceBytes = await data.arrayBuffer()
  let prepared: Awaited<ReturnType<typeof prepareImageForZernio>> = null
  try {
    prepared = edit && edit.format !== "original"
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

  return { type: mediaType, url: publicUrl }
}

async function loadTaskContext(taskId: string) {
  const session = await getQuepiaSession()
  const { data: task } = await session.server
    .from("sistema_tasks")
    .select("id, project_id, titulo, social_copy, type_metadata")
    .eq("id", taskId)
    .maybeSingle()

  if (!task) throw new ZernioRouteError(404, "Tarea no encontrada o no autorizada")
  await assertProjectAccess(session, task.project_id)
  return { session, task }
}

async function loadAssets(taskId: string): Promise<AssetRow[]> {
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
        original_filename
      )
    `)
    .eq("task_id", taskId)
    .order("group_order", { ascending: true })
    .order("created_at", { ascending: false })

  if (error) throw new ZernioRouteError(500, error.message)
  return ((data || []) as AssetRow[]).filter((asset) => !asset.access_revoked && Boolean(currentVersion(asset)))
}

async function syncPublicationStatuses(publications: PublicationRow[]) {
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

export async function GET(request: Request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || ""
    if (!taskId) return NextResponse.json({ error: "Falta taskId" }, { status: 400 })

    const { session, task } = await loadTaskContext(taskId)
    const integration = await getProjectIntegration(task.project_id)
    const admin = createAdminClient()
    const { data: pendingPublications } = await admin
      .from("sistema_zernio_publications")
      .select("id, zernio_post_id, status")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(8)

    await syncPublicationStatuses((pendingPublications || []) as PublicationRow[])

    const [{ data: publications }, assets] = await Promise.all([
      admin
        .from("sistema_zernio_publications")
        .select("id, zernio_post_id, content, scheduled_for, timezone, status, account_ids, asset_ids, platform_results, error_message, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(8),
      loadAssets(taskId),
    ])

    let accounts: unknown[] = []
    let syncError: string | null = null
    if (integration) {
      try {
        accounts = await syncProjectAccounts(integration)
      } catch (error) {
        syncError = apiErrorResponse(error).message
      }
    }

    const assetsForPublishing = await Promise.all(assets.map(async (asset) => ({
      id: asset.id,
      name: asset.nombre,
      assetType: asset.asset_type,
      approvalStatus: asset.approval_status,
      currentVersion: asset.current_version,
      groupId: asset.group_id,
      groupOrder: asset.group_order,
      ...await assetPreview(asset),
    })))

    return NextResponse.json({
      configured: Boolean(integration),
      canPublish: session.isAdmin,
      task: {
        id: task.id,
        projectId: task.project_id,
        title: task.titulo,
        socialCopy: task.social_copy || "",
      },
      accounts,
      assets: assetsForPublishing,
      publications: publications || [],
      syncError,
    })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}

export async function POST(request: Request) {
  let localPublicationId: string | null = null
  try {
    const body = await request.json()
    const taskId = String(body?.taskId || "").trim()
    const content = String(body?.content || "").trim()
    const scheduledFor = typeof body?.scheduledFor === "string" && body.scheduledFor.trim()
      ? body.scheduledFor.trim()
      : null
    const accountIds = Array.from(new Set<string>(
      (Array.isArray(body?.accountIds) ? body.accountIds : []).map((value: unknown) => String(value)).filter(Boolean),
    ))
    const assetIds = Array.from(new Set<string>(
      (Array.isArray(body?.assetIds) ? body.assetIds : []).map((value: unknown) => String(value)).filter(Boolean),
    ))
    const rawMediaEdits = Array.isArray(body?.mediaEdits) ? body.mediaEdits : []

    if (!taskId) return NextResponse.json({ error: "Falta taskId" }, { status: 400 })
    if (!content && assetIds.length === 0) {
      return NextResponse.json({ error: "La publicación necesita copy o al menos un asset" }, { status: 400 })
    }
    if (accountIds.length === 0) {
      return NextResponse.json({ error: "Seleccioná al menos una cuenta social" }, { status: 400 })
    }
    const scheduledForDatabase = scheduledForDatabaseValue(scheduledFor)
    if (
      scheduledForDatabase
      && assetIds.length > 0
      && new Date(scheduledForDatabase).getTime() - Date.now() > 7 * 24 * 60 * 60 * 1000
    ) {
      throw new ZernioRouteError(
        400,
        "Las publicaciones con assets deben programarse dentro de los próximos 7 días por la vigencia temporal del archivo en Zernio",
      )
    }

    const { session, task } = await loadTaskContext(taskId)
    assertAdmin(session)
    const integration = await getProjectIntegration(task.project_id)
    if (!integration) throw new ZernioRouteError(409, "Este proyecto todavía no tiene un perfil Zernio")

    await syncProjectAccounts(integration)
    const admin = createAdminClient()
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
    const mediaEdits = new Map<string, ZernioMediaEdit>()
    for (const assetId of assetIds) {
      const rawEdit = rawMediaEdits.find((value: unknown) => (
        value && typeof value === "object" && String((value as Record<string, unknown>).assetId || "") === assetId
      ))
      const normalized = normalizeZernioMediaEdit(rawEdit, assetId)
      if (rawEdit && !normalized) {
        throw new ZernioRouteError(400, "Uno de los ajustes de imagen no es válido")
      }
      if (normalized) mediaEdits.set(assetId, normalized)
    }

    const requestId = crypto.randomUUID()
    const { data: localPublication, error: insertError } = await admin
      .from("sistema_zernio_publications")
      .insert({
        project_id: task.project_id,
        task_id: taskId,
        request_id: requestId,
        content,
        scheduled_for: scheduledForDatabase,
        timezone: TIME_ZONE,
        status: "preparing",
        account_ids: accountIds,
        asset_ids: assetIds,
        created_by: session.user.id,
      })
      .select("id")
      .single()

    if (insertError || !localPublication) {
      throw new ZernioRouteError(500, insertError?.message || "No se pudo registrar la publicación")
    }
    localPublicationId = localPublication.id

    const mediaItems = await Promise.all(selectedAssets.map((asset) => toMediaItem(asset, mediaEdits.get(asset.id))))
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
      platforms: accounts.map((account) => ({
        platform: account.platform,
        accountId: account.zernio_account_id,
      })),
      timezone: TIME_ZONE,
      metadata: {
        source: "quepia",
        projectId: task.project_id,
        taskId,
        localPublicationId,
        mediaEdits: Array.from(mediaEdits.values()),
      },
    }
    if (scheduledFor) postBody.scheduledFor = scheduledFor
    else postBody.publishNow = true

    const response = await zernioRequest<{
      post?: Record<string, unknown>
      existingPost?: Record<string, unknown>
    }>("/posts", {
      method: "POST",
      headers: { "x-request-id": requestId },
      body: postBody,
    })
    const post = response.post || response.existingPost || {}
    const zernioPostId = typeof post._id === "string" ? post._id : null
    const status = typeof post.status === "string" ? post.status : (scheduledFor ? "scheduled" : "publishing")
    const platformResults = Array.isArray(post.platforms) ? post.platforms : []

    const { error: updateError } = await admin
      .from("sistema_zernio_publications")
      .update({
        zernio_post_id: zernioPostId,
        status,
        platform_results: platformResults,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", localPublicationId)
    if (updateError) throw new ZernioRouteError(500, updateError.message)

    if (status === "published" && assetIds.length > 0) {
      await session.server
        .from("sistema_assets")
        .update({ approval_status: "published" })
        .in("id", assetIds)
    }

    return NextResponse.json({
      publication: {
        id: localPublicationId,
        zernioPostId,
        status,
        platformResults,
      },
    })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    if (localPublicationId) {
      const admin = createAdminClient()
      await admin
        .from("sistema_zernio_publications")
        .update({
          status: "failed",
          error_message: normalized.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localPublicationId)
    }
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}
