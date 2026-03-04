const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "ogg", "m4v"]

function parseUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function isHttpUrl(value?: string | null): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value)
}

export function isExternalAssetSource(value?: string | null) {
  if (!isHttpUrl(value)) return false

  const assetUrl = parseUrl(value)
  const supabaseUrl = parseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "")

  if (
    assetUrl &&
    supabaseUrl &&
    assetUrl.hostname === supabaseUrl.hostname &&
    assetUrl.pathname.includes("/storage/v1/object/")
  ) {
    return false
  }

  return true
}

export function getFileExtension(value?: string | null) {
  if (!value) return ""
  const withoutQuery = value.split("#")[0]?.split("?")[0] || ""
  const lastSegment = withoutQuery.split("/").pop() || ""
  const dotIndex = lastSegment.lastIndexOf(".")
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return ""
  return lastSegment.slice(dotIndex + 1).toLowerCase()
}

export function isLikelyImageAsset(fileType?: string | null, fileNameOrUrl?: string | null) {
  if ((fileType || "").startsWith("image/")) return true
  return IMAGE_EXTENSIONS.includes(getFileExtension(fileNameOrUrl))
}

export function isLikelyVideoAsset(fileType?: string | null, fileNameOrUrl?: string | null) {
  if ((fileType || "").startsWith("video/")) return true
  return VIDEO_EXTENSIONS.includes(getFileExtension(fileNameOrUrl))
}

export function isGoogleDriveUrl(value?: string | null) {
  if (!isHttpUrl(value)) return false
  const parsed = parseUrl(value)
  if (!parsed) return false
  const host = parsed.hostname.toLowerCase()
  return host.includes("drive.google.com") || host.includes("docs.google.com")
}

export function getGoogleDriveFileId(value?: string | null) {
  if (!isHttpUrl(value)) return null
  const parsed = parseUrl(value)
  if (!parsed) return null

  const path = parsed.pathname
  const pathMatch = path.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (pathMatch?.[1]) return pathMatch[1]

  const filePathMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (filePathMatch?.[1]) return filePathMatch[1]

  const queryId = parsed.searchParams.get("id")
  if (queryId) return queryId

  return null
}

export function toGoogleDrivePreviewUrl(value?: string | null) {
  if (!value) return value || null
  const id = getGoogleDriveFileId(value)
  if (id) return `https://drive.google.com/file/d/${id}/preview`

  if (/\/view(?:\?|$)/i.test(value)) {
    return value.replace(/\/view(?:\?[^#]*)?/i, "/preview")
  }

  return value
}
