import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ASSET_SIGNED_URL_TTL, createSignedUrl, isStoragePath } from "@/lib/sistema/assets-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function signAssetUrls(asset: any) {
  if (asset.access_revoked) return null

  const storagePath = asset.storage_path || asset.file_url
  const thumbnailPath = asset.thumbnail_path || asset.thumbnail_url
  const previewPath = asset.preview_path || asset.preview_url

  const fileUrl = isStoragePath(storagePath)
    ? await createSignedUrl(storagePath, ASSET_SIGNED_URL_TTL)
    : storagePath

  const thumbnailUrl = isStoragePath(thumbnailPath)
    ? await createSignedUrl(thumbnailPath, ASSET_SIGNED_URL_TTL)
    : thumbnailPath

  const previewUrl = isStoragePath(previewPath)
    ? await createSignedUrl(previewPath, ASSET_SIGNED_URL_TTL)
    : previewPath

  return {
    ...asset,
    file_url: fileUrl || asset.file_url,
    thumbnail_url: thumbnailUrl || asset.thumbnail_url,
    preview_url: previewUrl || asset.preview_url,
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 })
    }

    const supabase = createAdminClient()
    const isV2 = token.length === 36

    const { data, error } = await supabase.rpc(
      isV2 ? "get_client_project_data_v2" : "get_client_project_data",
      isV2 ? { p_session_token: token } : { token }
    )

    if (error) {
      console.error("[ClientData] RPC error:", error)
      return NextResponse.json({ error: "Error fetching data" }, { status: 500 })
    }

    if (data && typeof data === "object" && "error" in data) {
      return NextResponse.json({ error: (data as any).error }, { status: 401 })
    }

    // Sign asset URLs
    if (data?.tasks) {
      const tasksWithAssets = await Promise.all(
        data.tasks.map(async (task: any) => {
          if (!task.assets) return task
          const signedAssets = await Promise.all(task.assets.map(signAssetUrls))
          return {
            ...task,
            assets: signedAssets.filter(Boolean),
          }
        })
      )

      return NextResponse.json({
        ...data,
        tasks: tasksWithAssets,
      })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error("[ClientData] Unexpected error:", err)
    return NextResponse.json({ error: "Error fetching data" }, { status: 500 })
  }
}
