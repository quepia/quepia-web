import { NextResponse } from "next/server"
import { createSignedUrls, ASSET_SIGNED_URL_TTL, isStoragePath } from "@/lib/sistema/assets-storage"
import { createClient } from "@/lib/sistema/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const server = await createClient()
    const { data: userData } = await server.auth.getUser()
    if (!userData.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const paths = (body?.paths as string[]) || []

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ urls: {} })
    }

    const storagePaths = paths.filter(p => p && isStoragePath(p))
    const signed = await createSignedUrls(storagePaths, ASSET_SIGNED_URL_TTL)

    const urlMap: Record<string, string | null> = {}
    signed.forEach(({ path, url }) => {
      if (path) urlMap[path] = url
    })

    // For already-public URLs, just echo
    paths.filter(p => p && !isStoragePath(p)).forEach(p => { urlMap[p] = p })

    return NextResponse.json({ urls: urlMap })
  } catch (err) {
    console.error("[AssetSign] Error:", err)
    return NextResponse.json({ error: "Error signing URLs" }, { status: 500 })
  }
}
