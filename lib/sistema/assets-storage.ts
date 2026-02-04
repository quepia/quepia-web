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
  const supabase = createAdminClient()
  const results = await Promise.all(
    paths.map(async (path) => {
      if (!path) return { path, url: null as string | null }
      const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, expiresIn)
      if (error) {
        console.error("[Assets] Error creating signed URL:", error)
        return { path, url: null as string | null }
      }
      return { path, url: data?.signedUrl || null }
    })
  )
  return results
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
