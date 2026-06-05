import { NextResponse } from "next/server"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const server = await createClient()
    const { data: userData } = await server.auth.getUser()
    const authUserId = userData.user?.id

    if (!authUserId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const taskId = String(body?.taskId || "")
    const projectId = String(body?.projectId || "")
    const userId = String(body?.userId || "")
    const assetId = String(body?.assetId || "")
    const assetName = String(body?.assetName || "")
    const assetType = String(body?.assetType || "single")
    const groupId = body?.groupId ? String(body.groupId) : null
    const groupOrder = Number.isFinite(Number(body?.groupOrder)) ? Number(body.groupOrder) : 0
    const currentVersion = Number.isFinite(Number(body?.currentVersion)) ? Number(body.currentVersion) : null
    const notes = body?.notes ? String(body.notes) : "Subido directamente a Google Drive"
    const driveFileId = String(body?.driveFileId || "")
    const driveWebViewLink = body?.driveWebViewLink ? String(body.driveWebViewLink) : null
    const originalFilename = body?.originalFilename ? String(body.originalFilename) : null
    const fileType = body?.fileType ? String(body.fileType) : null
    const fileSize = Number.isFinite(Number(body?.fileSize)) ? Number(body.fileSize) : null

    if (!taskId || !projectId || !userId || !driveFileId) {
      return NextResponse.json({ error: "Datos de versión incompletos" }, { status: 400 })
    }

    if (userId !== authUserId) {
      return NextResponse.json({ error: "Usuario no autorizado" }, { status: 403 })
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
    let finalAssetId = assetId || null
    let versionNumber = currentVersion ? currentVersion + 1 : 1

    if (!finalAssetId) {
      const { data: createdAsset, error: assetError } = await admin
        .from("sistema_assets")
        .insert({
          task_id: taskId,
          project_id: projectId,
          nombre: assetName || (originalFilename || "Asset").replace(/\.[^/.]+$/, ""),
          asset_type: assetType,
          group_id: groupId,
          group_order: groupOrder,
          created_by: userId,
        })
        .select("id")
        .single()

      if (assetError || !createdAsset?.id) {
        return NextResponse.json(
          { error: assetError?.message || "Error creando asset" },
          { status: 500 }
        )
      }

      finalAssetId = createdAsset.id
      versionNumber = 1
    }

    const { data: version, error: versionError } = await admin
      .from("sistema_asset_versions")
      .insert({
        asset_id: finalAssetId,
        version_number: versionNumber,
        file_url: driveWebViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
        storage_path: null,
        thumbnail_path: null,
        preview_path: null,
        original_filename: originalFilename,
        file_type: fileType,
        file_size: fileSize,
        notes,
        uploaded_by: userId,
        drive_file_id: driveFileId,
        drive_web_view_link: driveWebViewLink,
        drive_backup_at: new Date().toISOString(),
        drive_backup_error: null,
      })
      .select("id")
      .single()

    if (versionError || !version?.id) {
      return NextResponse.json(
        { error: versionError?.message || "Error creando versión" },
        { status: 500 }
      )
    }

    await admin
      .from("sistema_assets")
      .update({ current_version: versionNumber })
      .eq("id", finalAssetId)

    return NextResponse.json({
      assetId: finalAssetId,
      versionId: version.id,
    })
  } catch (error) {
    console.error("[DriveUploadComplete] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error registrando archivo de Drive" },
      { status: 500 }
    )
  }
}
