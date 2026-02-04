import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { createClient } from "@/lib/sistema/supabase/server"
import { createSignedUrl, isStoragePath } from "@/lib/sistema/assets-storage"
import { logAssetAccess } from "@/lib/sistema/actions/assets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function resolveClientAccess(token: string) {
  const supabase = createAdminClient()
  // V1 token
  const { data: v1 } = await supabase
    .from("sistema_client_access")
    .select("id, project_id")
    .eq("access_token", token)
    .single()

  if (v1) return { client_access_id: v1.id as string, project_id: v1.project_id as string }

  // V2 session token
  if (token.length === 36) {
    const { data: session } = await supabase
      .from("sistema_client_sessions")
      .select("client_access_id")
      .eq("id", token)
      .single()

    if (session?.client_access_id) {
      const { data: v2 } = await supabase
        .from("sistema_client_access")
        .select("id, project_id")
        .eq("id", session.client_access_id)
        .single()

      if (v2) return { client_access_id: v2.id as string, project_id: v2.project_id as string }
    }
  }

  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const versionId = body?.versionId as string | undefined
    const token = body?.token as string | undefined

    if (!versionId) {
      return NextResponse.json({ error: "versionId requerido" }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: version, error: versionError } = await admin
      .from("sistema_asset_versions")
      .select(`
        id,
        storage_path,
        file_url,
        asset:sistema_assets(id, task_id, project_id, access_revoked)
      `)
      .eq("id", versionId)
      .single()

    const assetData = Array.isArray(version?.asset) ? version.asset[0] : version?.asset

    if (versionError || !version || !assetData) {
      return NextResponse.json({ error: "Asset no encontrado" }, { status: 404 })
    }

    if (assetData.access_revoked) {
      return NextResponse.json({ error: "Acceso revocado" }, { status: 403 })
    }

    let clientAccessId: string | null = null
    let actorUserId: string | null = null
    let source: "admin" | "client" = "client"

    if (token) {
      const access = await resolveClientAccess(token)
      if (!access || access.project_id !== assetData.project_id) {
        return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })
      }
      clientAccessId = access.client_access_id
      source = "client"
    } else {
      const server = await createClient()
      const { data: userData } = await server.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

      // RLS check: project must be visible to this user
      const { data: project } = await server
        .from("sistema_projects")
        .select("id")
        .eq("id", assetData.project_id)
        .single()

      if (!project) {
        return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })
      }

      actorUserId = userId
      source = "admin"
    }

    const storagePath = version.storage_path || version.file_url
    if (!storagePath) {
      return NextResponse.json({ error: "Archivo sin ruta" }, { status: 400 })
    }

    const signedUrl = isStoragePath(storagePath)
      ? await createSignedUrl(storagePath, 60 * 60)
      : storagePath
    if (!signedUrl) {
      return NextResponse.json({ error: "No se pudo generar URL" }, { status: 500 })
    }

    await logAssetAccess({
      asset_id: assetData.id,
      asset_version_id: version.id,
      project_id: assetData.project_id,
      task_id: assetData.task_id,
      actor_user_id: actorUserId,
      client_access_id: clientAccessId,
      event_type: "download",
      source,
      ip: request.headers.get("x-forwarded-for"),
      user_agent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ url: signedUrl })
  } catch (err) {
    console.error("[AssetDownload] Error:", err)
    return NextResponse.json({ error: "Error descargando asset" }, { status: 500 })
  }
}
