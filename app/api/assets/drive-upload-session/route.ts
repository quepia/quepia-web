import { NextResponse } from "next/server"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { sanitizeFilename } from "@/lib/sistema/assets-storage"
import { createDriveResumableUploadSession, ensureDriveSourceFolder, ensureFolder } from "@/lib/sistema/google-drive-backup"

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
    const taskId = String(body?.taskId || "")
    const projectId = String(body?.projectId || "")
    const fileName = String(body?.fileName || "")
    const mimeType = String(body?.mimeType || "application/octet-stream")
    const fileSize = Number(body?.fileSize || 0)
    const subfolderName = body?.subfolderName ? sanitizeFilename(String(body.subfolderName)) : ""

    if (!taskId || !projectId || !fileName || !fileSize) {
      return NextResponse.json({ error: "Datos de archivo incompletos" }, { status: 400 })
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
    const [projectResult, taskResult] = await Promise.all([
      admin.from("sistema_projects").select("nombre").eq("id", projectId).single(),
      admin.from("sistema_tasks").select("titulo").eq("id", taskId).single(),
    ])

    const projectName = projectResult.data?.nombre || "Cliente"
    const taskTitle = taskResult.data?.titulo || taskId
    const taskSourceFolder = await ensureDriveSourceFolder({ projectName, taskId, taskTitle })
    const sourceFolder = subfolderName
      ? await ensureFolder(taskSourceFolder.id, subfolderName)
      : taskSourceFolder
    const safeFileName = sanitizeFilename(fileName) || `asset-${Date.now()}`
    const driveName = `${Date.now()}-${safeFileName}`
    const uploadUrl = await createDriveResumableUploadSession({
      parentId: sourceFolder.id,
      name: driveName,
      mimeType,
      fileSize,
    })

    return NextResponse.json({
      uploadUrl,
      driveName,
      sourceFolderId: sourceFolder.id,
    })
  } catch (error) {
    console.error("[DriveUploadSession] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error creando sesión de Drive" },
      { status: 500 }
    )
  }
}
