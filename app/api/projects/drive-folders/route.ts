import { NextResponse } from "next/server"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ensureDriveProjectFolders } from "@/lib/sistema/google-drive-backup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const server = await createClient()
    const { data: userData } = await server.auth.getUser()
    const userId = userData.user?.id

    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const projectId = String(body?.projectId || "")

    if (!projectId) {
      return NextResponse.json({ error: "Falta projectId" }, { status: 400 })
    }

    const { data: projectAccess } = await server
      .from("sistema_projects")
      .select("id")
      .eq("id", projectId)
      .single()

    if (!projectAccess) {
      return NextResponse.json({ error: "Proyecto no autorizado" }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: project, error } = await admin
      .from("sistema_projects")
      .select("nombre")
      .eq("id", projectId)
      .single()

    if (error || !project?.nombre) {
      return NextResponse.json(
        { error: error?.message || "Proyecto no encontrado" },
        { status: 404 }
      )
    }

    const result = await ensureDriveProjectFolders({ projectName: project.nombre })

    return NextResponse.json({
      enabled: result.enabled,
      clientFolderId: result.clientFolder?.id || null,
      clientFolderLink: result.clientFolder?.webViewLink || null,
      yearFolderId: result.yearFolder?.id || null,
      yearFolderLink: result.yearFolder?.webViewLink || null,
      systemFolderId: result.systemFolder?.id || null,
      systemFolderLink: result.systemFolder?.webViewLink || null,
    })
  } catch (error) {
    console.error("[ProjectDriveFolders] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error creando carpetas de Drive" },
      { status: 500 }
    )
  }
}
