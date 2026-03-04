"use client"

import { createClient } from "@/lib/sistema/supabase/client"
import { serverCreateAsset, serverAddVersion } from "@/lib/sistema/actions/assets"
import { ASSET_BUCKET, sanitizeFilename } from "@/lib/sistema/assets-storage"

const MAX_FILE_SIZE = 100 * 1024 * 1024
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"]

export interface UploadProgressUpdate {
  id: string
  fileName?: string
  percent: number
  stage: "validating" | "uploading" | "thumbnails" | "saving" | "done" | "error"
  message?: string
}

export function isSupportedFile(file: File) {
  return IMAGE_TYPES.includes(file.type) || VIDEO_TYPES.includes(file.type)
}

export function getFileCategory(file: File) {
  if (IMAGE_TYPES.includes(file.type)) return "image"
  if (VIDEO_TYPES.includes(file.type)) return "video"
  return "other"
}

function normalizeExternalUrl(rawUrl: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) throw new Error("Ingresá un link válido")

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error("El link no es válido")
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("El link debe comenzar con http:// o https://")
  }

  return parsed.toString()
}

function buildPath(projectId: string, taskId: string, filename: string) {
  const safe = sanitizeFilename(filename) || `asset-${Date.now()}`
  return `${projectId}/${taskId}/${Date.now()}-${safe}`
}

function buildDerivedPath(originalPath: string, folder: "thumbs" | "preview", suffix: string) {
  const parts = originalPath.split("/")
  const file = parts.pop() || "file"
  const base = file.replace(/\.[^/.]+$/, "")
  const dir = parts.join("/")
  return `${dir}/${folder}/${base}-${suffix}.webp`
}

async function uploadBlobWithProgress(blob: Blob, path: string, onProgress?: (p: number) => void) {
  const supabase = createClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error("Sesión no válida")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new Error("Supabase config missing")

  const encodedPath = path
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/")

  const url = `${supabaseUrl}/storage/v1/object/${ASSET_BUCKET}/${encodedPath}`

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url, true)
    xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    xhr.setRequestHeader("apikey", anonKey)
    xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream")

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return
      const percent = Math.round((evt.loaded / evt.total) * 100)
      onProgress?.(percent)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }

    xhr.onerror = () => reject(new Error("Upload failed"))

    xhr.send(blob)
  })
}

async function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Error loading image"))
    }
    img.src = url
  })
}

async function generateImageVariant(file: File, targetWidth: number) {
  const img = await loadImageFromFile(file)
  const scale = targetWidth / img.width
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No canvas context")
  ctx.drawImage(img, 0, 0, width, height)

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82)
  )

  if (!blob) throw new Error("Error generating thumbnail")
  return blob
}

async function generateVideoThumbnail(file: File, targetWidth: number, atPercent = 0.25) {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.src = url

    const cleanup = () => {
      URL.revokeObjectURL(url)
    }

    video.onloadedmetadata = () => {
      const seekTime = Math.min(video.duration * atPercent, Math.max(0, video.duration - 0.1))
      video.currentTime = seekTime
    }

    video.onseeked = () => {
      const scale = targetWidth / video.videoWidth
      const width = Math.round(video.videoWidth * scale)
      const height = Math.round(video.videoHeight * scale)
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        cleanup()
        return reject(new Error("No canvas context"))
      }
      ctx.drawImage(video, 0, 0, width, height)
      canvas.toBlob((blob) => {
        cleanup()
        if (!blob) return reject(new Error("Error generating video thumbnail"))
        resolve(blob)
      }, "image/webp", 0.82)
    }

    video.onerror = () => {
      cleanup()
      reject(new Error("Error loading video"))
    }
  })
}

export async function uploadAssetFile(params: {
  file: File
  taskId: string
  projectId: string
  userId: string
  assetId?: string
  assetName?: string
  currentVersion?: number
  notes?: string | null
  assetType?: 'single' | 'carousel' | 'reel'
  groupId?: string | null
  groupOrder?: number
  onProgress?: (update: UploadProgressUpdate) => void
}) {
  const { file, taskId, projectId, userId, assetId, assetName, currentVersion, notes, assetType, groupId, groupOrder, onProgress } = params
  const uploadId = `${file.name}-${Date.now()}`

  if (file.size > MAX_FILE_SIZE) {
    onProgress?.({ id: uploadId, fileName: file.name, percent: 0, stage: "error", message: "Archivo supera 100MB" })
    throw new Error("Archivo supera 100MB")
  }

  if (!isSupportedFile(file)) {
    onProgress?.({ id: uploadId, fileName: file.name, percent: 0, stage: "error", message: "Formato no soportado" })
    throw new Error("Formato no soportado")
  }

  onProgress?.({ id: uploadId, fileName: file.name, percent: 5, stage: "validating" })

  const storagePath = buildPath(projectId, taskId, file.name)
  await uploadBlobWithProgress(file, storagePath, (p) => {
    const percent = Math.min(70, Math.max(10, Math.round(p * 0.7)))
    onProgress?.({ id: uploadId, fileName: file.name, percent, stage: "uploading" })
  })

  let thumbnailPath: string | null = null
  let previewPath: string | null = null

  const category = getFileCategory(file)
  if (category === "image") {
    onProgress?.({ id: uploadId, fileName: file.name, percent: 75, stage: "thumbnails" })
    const thumbBlob = await generateImageVariant(file, 200)
    const previewBlob = await generateImageVariant(file, 800)

    thumbnailPath = buildDerivedPath(storagePath, "thumbs", "200")
    previewPath = buildDerivedPath(storagePath, "preview", "800")

    await uploadBlobWithProgress(thumbBlob, thumbnailPath)
    await uploadBlobWithProgress(previewBlob, previewPath)
  }

  if (category === "video") {
    onProgress?.({ id: uploadId, fileName: file.name, percent: 75, stage: "thumbnails" })
    const thumbBlob = await generateVideoThumbnail(file, 320)
    thumbnailPath = buildDerivedPath(storagePath, "thumbs", "video")
    await uploadBlobWithProgress(thumbBlob, thumbnailPath)
  }

  onProgress?.({ id: uploadId, fileName: file.name, percent: 90, stage: "saving" })

  let finalAssetId = assetId
  let versionNumber = currentVersion ? currentVersion + 1 : 1

  if (!finalAssetId) {
    const created = await serverCreateAsset({
      task_id: taskId,
      project_id: projectId,
      nombre: assetName || file.name.replace(/\.[^/.]+$/, ""),
      asset_type: assetType || 'single',
      group_id: groupId || null,
      group_order: groupOrder ?? 0,
      created_by: userId,
    })

    if (!created.success || !created.data) {
      throw new Error("Error creando asset")
    }

    finalAssetId = created.data.id
    versionNumber = 1
  }

  const versionResult = await serverAddVersion({
    asset_id: finalAssetId,
    version_number: versionNumber,
    file_url: storagePath,
    storage_path: storagePath,
    thumbnail_path: thumbnailPath,
    preview_path: previewPath,
    original_filename: file.name,
    file_type: file.type,
    file_size: file.size,
    notes: notes || null,
    uploaded_by: userId,
  })

  if (!versionResult.success) {
    throw new Error(versionResult.error || "Error creando versión")
  }

  onProgress?.({ id: uploadId, fileName: file.name, percent: 100, stage: "done" })

  return {
    assetId: finalAssetId,
    versionId: versionResult.data?.id,
    storagePath,
    thumbnailPath,
    previewPath,
  }
}

/**
 * Upload multiple files as a carousel group.
 * Each file becomes its own asset with asset_type='carousel' and the same group_id.
 */
export async function uploadCarouselFiles(params: {
  files: File[]
  taskId: string
  projectId: string
  userId: string
  carouselName?: string
  onProgress?: (update: UploadProgressUpdate) => void
}) {
  const { files, taskId, projectId, userId, carouselName, onProgress } = params
  const groupId = crypto.randomUUID()
  const results: Awaited<ReturnType<typeof uploadAssetFile>>[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const name = carouselName
      ? `${carouselName} (${i + 1}/${files.length})`
      : file.name.replace(/\.[^/.]+$/, "")

    const result = await uploadAssetFile({
      file,
      taskId,
      projectId,
      userId,
      assetName: name,
      assetType: "carousel",
      groupId,
      groupOrder: i,
      onProgress,
    })
    results.push(result)
  }

  return { groupId, results }
}

/**
 * Upload a single video file as a reel.
 */
export async function uploadReelFile(params: {
  file: File
  taskId: string
  projectId: string
  userId: string
  reelName?: string
  onProgress?: (update: UploadProgressUpdate) => void
}) {
  const { file, taskId, projectId, userId, reelName, onProgress } = params

  return uploadAssetFile({
    file,
    taskId,
    projectId,
    userId,
    assetName: reelName || file.name.replace(/\.[^/.]+$/, ""),
    assetType: "reel",
    onProgress,
  })
}

/**
 * Create a reel using an external URL (Drive or any public/private URL).
 * The URL is stored as the current asset version file_url without uploading a file.
 */
export async function createReelFromLink(params: {
  reelUrl: string
  taskId: string
  projectId: string
  userId: string
  reelName?: string
  onProgress?: (update: UploadProgressUpdate) => void
}) {
  const { reelUrl, taskId, projectId, userId, reelName, onProgress } = params
  const uploadId = `reel-link-${Date.now()}`
  let normalizedUrl: string
  try {
    normalizedUrl = normalizeExternalUrl(reelUrl)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "El link no es válido"
    onProgress?.({
      id: uploadId,
      fileName: reelName || reelUrl || "Reel por link",
      percent: 0,
      stage: "error",
      message,
    })
    throw error instanceof Error ? error : new Error(message)
  }

  onProgress?.({
    id: uploadId,
    fileName: reelName || normalizedUrl,
    percent: 10,
    stage: "validating",
  })

  const created = await serverCreateAsset({
    task_id: taskId,
    project_id: projectId,
    nombre: reelName?.trim() || "Reel (link externo)",
    asset_type: "reel",
    created_by: userId,
  })

  if (!created.success || !created.data) {
    onProgress?.({
      id: uploadId,
      fileName: reelName || normalizedUrl,
      percent: 0,
      stage: "error",
      message: created.error || "Error creando asset",
    })
    throw new Error(created.error || "Error creando asset")
  }

  onProgress?.({
    id: uploadId,
    fileName: reelName || normalizedUrl,
    percent: 80,
    stage: "saving",
  })

  const versionResult = await serverAddVersion({
    asset_id: created.data.id,
    version_number: 1,
    file_url: normalizedUrl,
    storage_path: null,
    thumbnail_path: null,
    preview_path: null,
    original_filename: null,
    file_type: null,
    file_size: null,
    notes: "Reel enlazado desde URL externa",
    uploaded_by: userId,
  })

  if (!versionResult.success) {
    onProgress?.({
      id: uploadId,
      fileName: reelName || normalizedUrl,
      percent: 0,
      stage: "error",
      message: versionResult.error || "Error creando versión",
    })
    throw new Error(versionResult.error || "Error creando versión")
  }

  onProgress?.({
    id: uploadId,
    fileName: reelName || normalizedUrl,
    percent: 100,
    stage: "done",
  })

  return {
    assetId: created.data.id,
    versionId: versionResult.data?.id,
    storagePath: null,
    thumbnailPath: null,
    previewPath: null,
  }
}
