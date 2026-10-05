import sharp from "sharp"
import { randomUUID } from "crypto"
import { fetchDriveFile } from "@/lib/sistema/google-drive-backup"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ASSET_BUCKET } from "@/lib/sistema/assets-storage"

// Drive keeps the full original. Storage contains only small display images.
export async function createDriveImagePreviews(params: {
  driveFileId: string
  projectId: string
  taskId: string
  fileType: string | null
}) {
  const paths = { thumbnail_path: null as string | null, preview_path: null as string | null }
  if (!/^image\/(jpeg|png|webp)$/.test(params.fileType || "")) return paths
  try {
    const response = await fetchDriveFile(params.driveFileId)
    const original = Buffer.from(await response.arrayBuffer())
    const image = sharp(original).rotate()
    const admin = createAdminClient()
    const id = randomUUID()
    for (const [field, folder, size] of [
      ["thumbnail_path", "thumbs", 200],
      ["preview_path", "preview", 800],
    ] as const) {
      const buffer = await image.clone().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 }).toBuffer()
      const path = `${params.projectId}/${params.taskId}/${folder}/drive-${id}-${size}.webp`
      const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, buffer, {
        contentType: "image/webp", upsert: false, cacheControl: "86400",
      })
      if (error) console.error("[DrivePreview] Upload failed:", error.message)
      else paths[field] = path
    }
  } catch (error) {
    // A preview failure must never discard or replace the original in Drive.
    console.error("[DrivePreview] Original kept in Drive; preview failed:", error)
  }
  return paths
}
