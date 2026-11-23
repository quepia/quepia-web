import "server-only"

import crypto from "node:crypto"
import { lookup } from "node:dns/promises"
import net from "node:net"
import path from "node:path"
import { ASSET_BUCKET, sanitizeFilename } from "@/lib/sistema/assets-storage"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ZERNIO_REEL_MAX_SOURCE_BYTES } from "@/lib/zernio/publishing-rules"
import { ZernioRouteError } from "@/lib/zernio/server"
import type { PublishTaskRow } from "@/lib/zernio/publish-task"

// Medios que llegan desde el MCP: archivos locales subidos con una URL firmada
// (Claude Code) o videos/imágenes generados por IA en una URL pública.

export const MCP_MEDIA_MAX_BYTES = ZERNIO_REEL_MAX_SOURCE_BYTES
export const MCP_UPLOAD_URL_TTL_SECONDS = 60 * 60 * 2
// Marca de las versiones creadas por el MCP: solo esas se pueden quitar desde él.
export const MCP_VERSION_NOTE = "Subido desde el MCP de Quepia"

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
}

const EXTENSION_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
}

export type AttachMediaItem = {
  source_url?: string
  upload_path?: string
  name?: string
}

function assertAllowedType(contentType: string) {
  const normalized = contentType.split(";", 1)[0].trim().toLowerCase()
  if (!ALLOWED_TYPES[normalized]) {
    throw new ZernioRouteError(415, `Formato no compatible: ${normalized || "desconocido"}. Usá MP4, MOV, WEBM, M4V, JPG, PNG o WEBP.`)
  }
  return normalized
}

function mcpPrefix(task: PublishTaskRow) {
  return `${task.project_id}/${task.id}/mcp/`
}

function storagePathFor(task: PublishTaskRow, filename: string, contentType: string) {
  const parsed = path.parse(filename || "")
  const base = sanitizeFilename(parsed.name).slice(0, 80) || "pieza"
  return `${mcpPrefix(task)}${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}${ALLOWED_TYPES[contentType]}`
}

export async function createMcpMediaUpload(task: PublishTaskRow, input: {
  filename: string
  content_type: string
  size_bytes: number
}) {
  const contentType = assertAllowedType(input.content_type)
  if (!Number.isInteger(input.size_bytes) || input.size_bytes <= 0 || input.size_bytes > MCP_MEDIA_MAX_BYTES) {
    throw new ZernioRouteError(413, "El archivo debe pesar menos de 250 MB")
  }
  const storagePath = storagePathFor(task, input.filename, contentType)
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(ASSET_BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data?.signedUrl) {
    throw new ZernioRouteError(500, error?.message || "No se pudo preparar la subida")
  }
  return {
    upload_url: data.signedUrl,
    upload_path: storagePath,
    method: "PUT",
    headers: { "Content-Type": contentType, "x-upsert": "false" },
    expires_in_seconds: MCP_UPLOAD_URL_TTL_SECONDS,
    curl: `curl -sS -X PUT -H "Content-Type: ${contentType}" --data-binary @<archivo-local> "<upload_url>"`,
    next_step: "After the PUT succeeds, call social_attach_media with this upload_path.",
  }
}

// --- Importación desde URL pública (con defensa SSRF) ----------------------

const BLOCKED = new net.BlockList()
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(address, prefix, "ipv4")
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["::ffff:0:0", 96], ["64:ff9b::", 96],
] as const) BLOCKED.addSubnet(address, prefix, "ipv6")

async function assertPublicHttpsUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ZernioRouteError(400, "La URL del archivo no es válida")
  }
  if (url.protocol !== "https:") throw new ZernioRouteError(400, "La URL del archivo debe ser https")
  if (url.username || url.password) throw new ZernioRouteError(400, "La URL no puede incluir credenciales")
  if (url.port && url.port !== "443") throw new ZernioRouteError(400, "La URL debe usar el puerto 443")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new ZernioRouteError(400, "No se pudo resolver el servidor del archivo")
  for (const entry of addresses) {
    if (BLOCKED.check(entry.address, entry.family === 6 ? "ipv6" : "ipv4")) {
      throw new ZernioRouteError(400, "La URL apunta a una red privada")
    }
  }
  return url
}

async function downloadPublicMedia(raw: string) {
  let url = await assertPublicHttpsUrl(raw)
  let response: Response | null = null
  for (let hop = 0; hop < 4; hop += 1) {
    response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    })
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = await assertPublicHttpsUrl(new URL(response.headers.get("location")!, url).toString())
      continue
    }
    break
  }
  if (!response || !response.ok || !response.body) {
    throw new ZernioRouteError(502, `No se pudo descargar el archivo (estado ${response?.status ?? "sin respuesta"})`)
  }
  const declared = Number(response.headers.get("content-length") || 0)
  if (declared > MCP_MEDIA_MAX_BYTES) throw new ZernioRouteError(413, "El archivo supera 250 MB")

  let contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase()
  if (!ALLOWED_TYPES[contentType]) {
    // Algunos CDNs devuelven application/octet-stream: se acepta la extensión.
    contentType = EXTENSION_TYPES[path.extname(url.pathname).toLowerCase()] || contentType
  }
  contentType = assertAllowedType(contentType)

  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MCP_MEDIA_MAX_BYTES) {
      await reader.cancel()
      throw new ZernioRouteError(413, "El archivo supera 250 MB")
    }
    chunks.push(value)
  }
  if (!total) throw new ZernioRouteError(400, "El archivo descargado está vacío")
  return { bytes: Buffer.concat(chunks), contentType, filename: path.basename(url.pathname) || "pieza" }
}

// --- Alta del asset en la tarjeta ------------------------------------------

async function verifyUploadedObject(task: PublishTaskRow, uploadPath: string) {
  if (!uploadPath.startsWith(mcpPrefix(task)) || uploadPath.includes("..")) {
    throw new ZernioRouteError(403, "La subida no pertenece a esta tarjeta")
  }
  const admin = createAdminClient()
  const directory = path.posix.dirname(uploadPath)
  const name = path.posix.basename(uploadPath)
  const { data, error } = await admin.storage.from(ASSET_BUCKET).list(directory, { search: name, limit: 5 })
  if (error) throw new ZernioRouteError(500, error.message)
  const object = (data || []).find((entry) => entry.name === name)
  if (!object) throw new ZernioRouteError(404, "Todavía no se subió el archivo a esa ruta. Hacé el PUT primero.")
  const metadata = (object.metadata || {}) as Record<string, unknown>
  const size = Number(metadata.size || 0)
  const declaredType = String(metadata.mimetype || "")
  const contentType = assertAllowedType(
    ALLOWED_TYPES[declaredType] ? declaredType : EXTENSION_TYPES[path.extname(name).toLowerCase()] || declaredType,
  )
  if (size > MCP_MEDIA_MAX_BYTES) throw new ZernioRouteError(413, "El archivo supera 250 MB")
  return { storagePath: uploadPath, contentType, size, filename: name }
}

export async function attachMcpMedia(params: {
  task: PublishTaskRow
  actorUserId: string
  items: AttachMediaItem[]
  assetType?: "single" | "reel" | "carousel"
  name?: string
}) {
  const { task, actorUserId, items } = params
  if (!items.length || items.length > 10) throw new ZernioRouteError(400, "Enviá entre 1 y 10 archivos")
  const admin = createAdminClient()

  const stored: Array<{ storagePath: string; contentType: string; size: number; filename: string; name?: string }> = []
  const createdPaths: string[] = []
  try {
    for (const item of items) {
      if (Boolean(item.source_url) === Boolean(item.upload_path)) {
        throw new ZernioRouteError(400, "Cada archivo necesita source_url o upload_path, no ambos")
      }
      if (item.upload_path) {
        stored.push({ ...await verifyUploadedObject(task, item.upload_path), name: item.name })
        continue
      }
      const downloaded = await downloadPublicMedia(item.source_url!)
      const storagePath = storagePathFor(task, downloaded.filename, downloaded.contentType)
      const { error } = await admin.storage.from(ASSET_BUCKET).upload(storagePath, downloaded.bytes, {
        contentType: downloaded.contentType,
        upsert: false,
      })
      if (error) throw new ZernioRouteError(500, `No se pudo guardar el archivo: ${error.message}`)
      createdPaths.push(storagePath)
      stored.push({
        storagePath,
        contentType: downloaded.contentType,
        size: downloaded.bytes.byteLength,
        filename: downloaded.filename,
        name: item.name,
      })
    }

    const videos = stored.filter((file) => file.contentType.startsWith("video/")).length
    const assetType = params.assetType
      || (stored.length > 1 ? "carousel" : videos === 1 ? "reel" : "single")
    if (assetType === "reel" && (stored.length !== 1 || videos !== 1)) {
      throw new ZernioRouteError(400, "Un Reel lleva exactamente un video")
    }
    if (assetType === "single" && stored.length !== 1) {
      throw new ZernioRouteError(400, "Para varios archivos usá asset_type carousel")
    }
    const groupId = assetType === "carousel" ? crypto.randomUUID() : null

    const assets = []
    for (const [index, file] of stored.entries()) {
      const baseName = (file.name || params.name || path.parse(file.filename).name || task.titulo).slice(0, 120)
      const nombre = stored.length > 1 && !file.name ? `${baseName} ${index + 1}` : baseName
      const { data: asset, error: assetError } = await admin
        .from("sistema_assets")
        .insert({
          task_id: task.id,
          project_id: task.project_id,
          nombre,
          descripcion: MCP_VERSION_NOTE,
          asset_type: assetType,
          group_id: groupId,
          group_order: index,
          current_version: 1,
          created_by: actorUserId,
        })
        .select("id, nombre, asset_type, approval_status, group_id, group_order")
        .single()
      if (assetError || !asset) throw new ZernioRouteError(500, assetError?.message || "No se pudo crear el asset")

      const { error: versionError } = await admin.from("sistema_asset_versions").insert({
        asset_id: asset.id,
        version_number: 1,
        file_url: file.storagePath,
        storage_path: file.storagePath,
        file_type: file.contentType,
        file_size: file.size || null,
        original_filename: file.filename,
        notes: MCP_VERSION_NOTE,
        uploaded_by: actorUserId,
      })
      if (versionError) {
        await admin.from("sistema_assets").delete().eq("id", asset.id)
        throw new ZernioRouteError(500, versionError.message)
      }
      assets.push({ ...asset, file_type: file.contentType, file_size: file.size })
    }
    return { assets, asset_type: assetType, group_id: groupId }
  } catch (error) {
    if (createdPaths.length) await admin.storage.from(ASSET_BUCKET).remove(createdPaths)
    throw error
  }
}

/**
 * Quita un asset que subió el MCP y todavía no se usó: sin publicaciones
 * activas ni publicadas que lo incluyan. Nunca toca piezas cargadas por una
 * persona.
 */
export async function removeMcpMedia(task: PublishTaskRow, assetId: string) {
  const admin = createAdminClient()
  const { data: asset, error } = await admin
    .from("sistema_assets")
    .select("id, task_id, approval_status, versions:sistema_asset_versions(id, notes, storage_path)")
    .eq("id", assetId)
    .maybeSingle()
  if (error) throw new ZernioRouteError(500, error.message)
  if (!asset || asset.task_id !== task.id) throw new ZernioRouteError(404, "Asset no encontrado en esta tarjeta")
  const versions = (asset.versions || []) as Array<{ id: string; notes: string | null; storage_path: string | null }>
  if (!versions.length || versions.some((version) => version.notes !== MCP_VERSION_NOTE)) {
    throw new ZernioRouteError(403, "Solo se pueden quitar desde el MCP las piezas que subió el MCP")
  }
  if (asset.approval_status === "published") {
    throw new ZernioRouteError(409, "La pieza ya se publicó y no se puede quitar")
  }
  const { data: publications, error: publicationsError } = await admin
    .from("sistema_zernio_publications")
    .select("id, status")
    .eq("task_id", task.id)
    .contains("asset_ids", [assetId])
    .in("status", ["preparing", "draft", "scheduled", "publishing", "published", "partial"])
  if (publicationsError) throw new ZernioRouteError(500, publicationsError.message)
  if (publications?.length) {
    throw new ZernioRouteError(409, "La pieza está en una publicación vigente. Cancelala o editala antes de quitarla.")
  }
  const paths = versions.map((version) => version.storage_path).filter((value): value is string => Boolean(value))
  const { error: deleteError } = await admin.from("sistema_assets").delete().eq("id", assetId)
  if (deleteError) throw new ZernioRouteError(500, deleteError.message)
  if (paths.length) await admin.storage.from(ASSET_BUCKET).remove(paths)
  return { removed_asset_id: assetId }
}
