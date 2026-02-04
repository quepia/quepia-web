import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { logAssetAccess } from "@/lib/sistema/actions/assets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function resolveClientAccess(token: string) {
  const supabase = createAdminClient()
  const { data: v1 } = await supabase
    .from("sistema_client_access")
    .select("id, project_id")
    .eq("access_token", token)
    .single()

  if (v1) return { client_access_id: v1.id as string, project_id: v1.project_id as string }

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
    const token = body?.token as string | undefined
    const versionId = body?.versionId as string | undefined

    if (!token || !versionId) {
      return NextResponse.json({ error: "token y versionId requeridos" }, { status: 400 })
    }

    const access = await resolveClientAccess(token)
    if (!access) return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })

    const admin = createAdminClient()
    const { data: version } = await admin
      .from("sistema_asset_versions")
      .select(`
        id,
        asset:sistema_assets(id, task_id, project_id)
      `)
      .eq("id", versionId)
      .single()

    const assetData = Array.isArray(version?.asset) ? version.asset[0] : version?.asset

    if (!assetData || assetData.project_id !== access.project_id) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })
    }

    await logAssetAccess({
      asset_id: assetData.id,
      asset_version_id: version!.id,
      project_id: assetData.project_id,
      task_id: assetData.task_id,
      client_access_id: access.client_access_id,
      event_type: "view",
      source: "client",
      ip: request.headers.get("x-forwarded-for"),
      user_agent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[AssetLog] Error:", err)
    return NextResponse.json({ error: "Error registrando acceso" }, { status: 500 })
  }
}
