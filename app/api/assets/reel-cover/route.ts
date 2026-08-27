import { NextResponse } from "next/server"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ASSET_BUCKET, createSignedUrl, isStoragePath } from "@/lib/sistema/assets-storage"
import { extractVideoFrame } from "@/lib/sistema/video-frame"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_SOURCE_BYTES = 200 * 1024 * 1024

type VersionRow = {
    id: string
    version_number: number
    file_url: string | null
    file_type: string | null
    storage_path: string | null
    thumbnail_path: string | null
}

type AssetRow = {
    id: string
    task_id: string
    project_id: string
    asset_type: string | null
    current_version: number
    versions: VersionRow[]
}

function currentVersion(asset: AssetRow): VersionRow | null {
    if (!Array.isArray(asset.versions) || asset.versions.length === 0) return null
    return asset.versions.find((v) => v.version_number === asset.current_version)
        || [...asset.versions].sort((a, b) => b.version_number - a.version_number)[0]
        || null
}

export async function POST(request: Request) {
    try {
        const server = await createClient()
        const { data: userData } = await server.auth.getUser()
        if (!userData.user) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json().catch(() => null)
        const assetId = typeof body?.assetId === "string" ? body.assetId.trim() : ""
        const timeSeconds = Number(body?.timeSeconds)
        if (!assetId) {
            return NextResponse.json({ error: "Falta assetId" }, { status: 400 })
        }

        // Read through the caller's session so row level security decides access.
        const { data: asset } = await server
            .from("sistema_assets")
            .select(`
                id,
                task_id,
                project_id,
                asset_type,
                current_version,
                versions:sistema_asset_versions(id, version_number, file_url, file_type, storage_path, thumbnail_path)
            `)
            .eq("id", assetId)
            .maybeSingle<AssetRow>()

        if (!asset) {
            return NextResponse.json({ error: "Asset no encontrado o sin acceso" }, { status: 404 })
        }

        const version = currentVersion(asset)
        if (!version) {
            return NextResponse.json({ error: "El asset no tiene una versión disponible" }, { status: 400 })
        }

        const admin = createAdminClient()

        // Path B: the client already uploaded an image; just attach it as the cover.
        const providedCoverPath = typeof body?.coverPath === "string" ? body.coverPath.trim() : ""
        if (providedCoverPath) {
            if (!providedCoverPath.startsWith(`${asset.project_id}/${asset.task_id}/`)) {
                return NextResponse.json({ error: "La portada no pertenece a esta tarea" }, { status: 400 })
            }
            const { error: attachError } = await admin
                .from("sistema_asset_versions")
                .update({ thumbnail_path: providedCoverPath, thumbnail_url: providedCoverPath })
                .eq("id", version.id)
            if (attachError) {
                return NextResponse.json({ error: attachError.message }, { status: 500 })
            }
            return NextResponse.json({
                coverPath: providedCoverPath,
                coverUrl: await createSignedUrl(providedCoverPath),
                durationSeconds: null,
            })
        }

        const storageReference = version.storage_path
            || (isStoragePath(version.file_url) ? version.file_url : null)
        if (!storageReference) {
            return NextResponse.json(
                { error: "La portada solo se puede extraer de videos alojados en el sistema" },
                { status: 400 },
            )
        }

        const { data: file, error: downloadError } = await admin.storage
            .from(ASSET_BUCKET)
            .download(storageReference)
        if (downloadError || !file) {
            return NextResponse.json(
                { error: downloadError?.message || "No se pudo descargar el video" },
                { status: 500 },
            )
        }
        if (file.size > MAX_SOURCE_BYTES) {
            return NextResponse.json({ error: "El video supera el límite de 200 MB" }, { status: 400 })
        }

        const frame = await extractVideoFrame(await file.arrayBuffer(), timeSeconds)

        const coverPath = `${asset.project_id}/${asset.task_id}/covers/reel-cover-${Date.now()}.jpg`
        const { error: uploadError } = await admin.storage
            .from(ASSET_BUCKET)
            .upload(coverPath, frame.bytes, { contentType: frame.contentType, upsert: true })
        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 500 })
        }

        const { error: updateError } = await admin
            .from("sistema_asset_versions")
            .update({ thumbnail_path: coverPath, thumbnail_url: coverPath })
            .eq("id", version.id)
        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        return NextResponse.json({
            coverPath,
            coverUrl: await createSignedUrl(coverPath),
            durationSeconds: frame.durationSeconds,
        })
    } catch (error) {
        console.error("[ReelCover] Error:", error)
        const message = error instanceof Error ? error.message : "Error extrayendo la portada"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
