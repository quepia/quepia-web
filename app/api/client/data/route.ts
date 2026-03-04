import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ASSET_SIGNED_URL_TTL, createSignedUrl, isStoragePath } from "@/lib/sistema/assets-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ClientAssetLike = {
  id?: string
  current_version_id?: string
  asset_created_at?: string | null
  version_created_at?: string | null
  version_number?: number
  access_revoked?: boolean
  storage_path?: string | null
  file_url?: string | null
  thumbnail_path?: string | null
  thumbnail_url?: string | null
  preview_path?: string | null
  preview_url?: string | null
  [key: string]: unknown
}

type ClientTaskLike = {
  assets?: ClientAssetLike[]
  [key: string]: unknown
}

function toTimestamp(value?: string | null) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function getAssetSortTimestamp(asset?: ClientAssetLike | null) {
  if (!asset) return 0
  return toTimestamp(asset.version_created_at) || toTimestamp(asset.asset_created_at)
}

function compareAssetsNewestFirst(a: ClientAssetLike, b: ClientAssetLike) {
  const tsDiff = getAssetSortTimestamp(b) - getAssetSortTimestamp(a)
  if (tsDiff !== 0) return tsDiff

  const versionA = typeof a.version_number === "number" ? a.version_number : 0
  const versionB = typeof b.version_number === "number" ? b.version_number : 0
  return versionB - versionA
}

async function signAssetUrls(asset: ClientAssetLike) {
  if (asset.access_revoked) return null

  const storagePath = asset.storage_path || asset.file_url
  const thumbnailPath = asset.thumbnail_path || asset.thumbnail_url
  const previewPath = asset.preview_path || asset.preview_url

  const fileUrl = storagePath && isStoragePath(storagePath)
    ? await createSignedUrl(storagePath, ASSET_SIGNED_URL_TTL)
    : storagePath

  const thumbnailUrl = thumbnailPath && isStoragePath(thumbnailPath)
    ? await createSignedUrl(thumbnailPath, ASSET_SIGNED_URL_TTL)
    : thumbnailPath

  const previewUrl = previewPath && isStoragePath(previewPath)
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
      const rpcError = (data as { error?: unknown }).error
      return NextResponse.json(
        { error: typeof rpcError === "string" ? rpcError : "Error fetching data" },
        { status: 401 }
      )
    }

    // Sign asset URLs and enforce newest-first ordering per task.
    // If RPC payload is from an older function version (without timestamp fields),
    // we enrich missing timestamps from DB to keep ordering deterministic.
    if (Array.isArray(data?.tasks)) {
      const tasks = data.tasks as ClientTaskLike[]
      const missingAssetIds = new Set<string>()
      const missingVersionIds = new Set<string>()

      for (const task of tasks) {
        if (!Array.isArray(task.assets)) continue
        for (const asset of task.assets) {
          if (!asset?.asset_created_at && asset?.id) missingAssetIds.add(asset.id)
          if (!asset?.version_created_at && asset?.current_version_id) {
            missingVersionIds.add(asset.current_version_id)
          }
        }
      }

      const assetCreatedAtById = new Map<string, string>()
      const versionCreatedAtById = new Map<string, string>()

      if (missingAssetIds.size > 0) {
        const { data: assetRows, error: assetRowsError } = await supabase
          .from("sistema_assets")
          .select("id, created_at")
          .in("id", Array.from(missingAssetIds))

        if (assetRowsError) {
          console.error("[ClientData] Failed to fetch missing asset timestamps:", assetRowsError)
        } else {
          for (const row of assetRows || []) {
            if (row?.id && row?.created_at) assetCreatedAtById.set(row.id, row.created_at)
          }
        }
      }

      if (missingVersionIds.size > 0) {
        const { data: versionRows, error: versionRowsError } = await supabase
          .from("sistema_asset_versions")
          .select("id, created_at")
          .in("id", Array.from(missingVersionIds))

        if (versionRowsError) {
          console.error("[ClientData] Failed to fetch missing version timestamps:", versionRowsError)
        } else {
          for (const row of versionRows || []) {
            if (row?.id && row?.created_at) versionCreatedAtById.set(row.id, row.created_at)
          }
        }
      }

      const tasksWithAssets = await Promise.all(
        tasks.map(async (task) => {
          if (!Array.isArray(task.assets)) return task

          const signedAssets = await Promise.all(
            task.assets.map(async (asset) => {
              const signedAsset = await signAssetUrls(asset)
              if (!signedAsset) return null

              return {
                ...signedAsset,
                asset_created_at: signedAsset.asset_created_at || (signedAsset.id ? assetCreatedAtById.get(signedAsset.id) : null) || null,
                version_created_at:
                  signedAsset.version_created_at ||
                  (signedAsset.current_version_id ? versionCreatedAtById.get(signedAsset.current_version_id) : null) ||
                  null,
              }
            })
          )

          const orderedAssets = (signedAssets.filter(Boolean) as ClientAssetLike[]).sort(compareAssetsNewestFirst)

          return {
            ...task,
            assets: orderedAssets,
          }
        })
      )

      const orderedTasks = tasksWithAssets.sort((a, b) => {
        const newestA = Math.max(...((a.assets || []).map(getAssetSortTimestamp)), 0)
        const newestB = Math.max(...((b.assets || []).map(getAssetSortTimestamp)), 0)
        return newestB - newestA
      })

      return NextResponse.json({
        ...data,
        tasks: orderedTasks,
      })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error("[ClientData] Unexpected error:", err)
    return NextResponse.json({ error: "Error fetching data" }, { status: 500 })
  }
}
