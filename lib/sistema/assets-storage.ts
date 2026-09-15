import { createAdminClient } from "@/lib/sistema/supabase/admin"

export const ASSET_BUCKET = "sistema-assets"
export const ASSET_SIGNED_URL_TTL = 60 * 60 * 48 // 48 hours
export const ZIP_SIGNED_URL_TTL = 60 * 60 // 1 hour

export async function createSignedUrl(path: string, expiresIn = ASSET_SIGNED_URL_TTL) {
  if (!path) return null
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, expiresIn)
  if (error) {
    console.error("[Assets] Error creating signed URL:", error)
    return null
  }
  return data?.signedUrl || null
}

export async function createSignedUrls(paths: string[], expiresIn = ASSET_SIGNED_URL_TTL) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (uniquePaths.length === 0) return paths.map((path) => ({ path, url: null as string | null }))

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrls(uniquePaths, expiresIn)
  if (error) {
    console.error("[Assets] Error creating signed URLs:", error)
    return paths.map((path) => ({ path, url: null as string | null }))
  }

  // Match by path: Storage can fail individual files within a successful batch.
  const urlsByPath = new Map<string, string | null>()
  for (const result of data || []) {
    if (result.error) console.error("[Assets] Error creating signed URL:", result.error)
    if (result.path) urlsByPath.set(result.path, result.error ? null : result.signedUrl || null)
  }
  // Preserve the callers' order and duplicates, including empty or missing paths.
  return paths.map((path) => ({ path, url: urlsByPath.get(path) || null }))
}

export function isStoragePath(value?: string | null) {
  if (!value) return false
  return !/^https?:\/\//i.test(value)
}

export function sanitizeFilename(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase()
}
