import { NextResponse } from "next/server"
import { verifyContentCopilotMediaToken } from "@/lib/ai/content-copilot-media"
import { extractGoogleDriveFileId, fetchDriveFile } from "@/lib/sistema/google-drive-backup"
import { createAdminClient } from "@/lib/sistema/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface RouteContext {
  params: Promise<{ versionId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { versionId } = await context.params
    const url = new URL(request.url)
    const expires = url.searchParams.get("expires") || ""
    const signature = url.searchParams.get("signature") || ""

    if (!verifyContentCopilotMediaToken(versionId, expires, signature)) {
      return NextResponse.json({ error: "Acceso inválido o vencido" }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: version, error } = await admin
      .from("sistema_asset_versions")
      .select("drive_file_id, file_url, file_type, original_filename")
      .eq("id", versionId)
      .single()

    if (error || !version) {
      return NextResponse.json({ error: "Asset no encontrado" }, { status: 404 })
    }

    const driveFileId = version.drive_file_id || extractGoogleDriveFileId(version.file_url || "")
    if (!driveFileId) {
      return NextResponse.json({ error: "El asset no es un archivo de Google Drive" }, { status: 422 })
    }

    const driveResponse = await fetchDriveFile(driveFileId, {
      range: request.headers.get("range"),
    })
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": driveResponse.headers.get("content-type") || version.file_type || "application/octet-stream",
      "Accept-Ranges": driveResponse.headers.get("accept-ranges") || "bytes",
    })

    for (const header of ["content-length", "content-range"]) {
      const value = driveResponse.headers.get(header)
      if (value) headers.set(header, value)
    }

    return new Response(driveResponse.body, {
      status: driveResponse.status,
      headers,
    })
  } catch (error) {
    console.error("[ContentCopilotMedia] Error:", error)
    return NextResponse.json({ error: "No se pudo cargar el media" }, { status: 500 })
  }
}
