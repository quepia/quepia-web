import { NextResponse } from "next/server"
import { fetchDriveFile, extractGoogleDriveFileId } from "@/lib/sistema/google-drive-backup"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import {
  apiErrorResponse,
  assertProjectAccess,
  getQuepiaSession,
  ZernioRouteError,
} from "@/lib/zernio/server"

const MAX_PREVIEW_BYTES = 100 * 1024 * 1024

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type AssetRelation = {
  project_id: string
  access_revoked: boolean | null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params
    const session = await getQuepiaSession()
    const admin = createAdminClient()
    const { data: version, error } = await admin
      .from("sistema_asset_versions")
      .select(`
        id,
        file_url,
        file_type,
        file_size,
        drive_file_id,
        asset:sistema_assets!inner(project_id, access_revoked)
      `)
      .eq("id", versionId)
      .maybeSingle()

    if (error) throw new ZernioRouteError(500, error.message)
    if (!version) throw new ZernioRouteError(404, "Versión de asset no encontrada")

    const asset = (Array.isArray(version.asset) ? version.asset[0] : version.asset) as AssetRelation | null
    if (!asset || asset.access_revoked) throw new ZernioRouteError(404, "Asset no disponible")
    await assertProjectAccess(session, asset.project_id)

    const driveFileId = version.drive_file_id || extractGoogleDriveFileId(version.file_url)
    if (!driveFileId) throw new ZernioRouteError(404, "El asset no contiene un archivo de Google Drive")
    if (version.file_size && version.file_size > MAX_PREVIEW_BYTES) {
      throw new ZernioRouteError(413, "El video supera el límite de previsualización de 100 MB")
    }

    const driveResponse = await fetchDriveFile(driveFileId, {
      maxBytes: MAX_PREVIEW_BYTES,
      range: request.headers.get("range"),
    })
    const headers = new Headers({
      "Accept-Ranges": driveResponse.headers.get("accept-ranges") || "bytes",
      "Cache-Control": "private, no-store",
      "Content-Type": version.file_type || driveResponse.headers.get("content-type") || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    })
    for (const name of ["content-length", "content-range"]) {
      const value = driveResponse.headers.get(name)
      if (value) headers.set(name, value)
    }

    return new Response(driveResponse.body, {
      status: driveResponse.status,
      headers,
    })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message }, { status: normalized.status })
  }
}
