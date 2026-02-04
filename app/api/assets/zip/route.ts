import { NextResponse } from "next/server"
import archiver from "archiver"
import { Readable, PassThrough } from "stream"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { createClient } from "@/lib/sistema/supabase/server"
import { ASSET_BUCKET, ZIP_SIGNED_URL_TTL, createSignedUrl, sanitizeFilename } from "@/lib/sistema/assets-storage"
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

function buildZipEntryName(assetName?: string, originalFilename?: string, versionNumber?: number) {
  const extMatch = originalFilename?.split(".").pop()
  const ext = extMatch ? `.${extMatch}` : ""
  const base = sanitizeFilename(assetName || originalFilename || `asset-${versionNumber || 1}`)
  const versionSuffix = versionNumber ? `-v${versionNumber}` : ""
  return `${base}${versionSuffix}${ext}`
}

async function fetchAssetStream(url: string) {
  const res = await fetch(url)
  if (!res.ok || !res.body) return null
  return Readable.fromWeb(res.body as any)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const token = body?.token as string | undefined
    const taskId = body?.taskId as string | undefined
    const versionIds = body?.versionIds as string[] | undefined
    const scope = body?.scope as "all" | "selected" | undefined

    if (!taskId && (!versionIds || versionIds.length === 0)) {
      return NextResponse.json({ error: "taskId o versionIds requeridos" }, { status: 400 })
    }

    const admin = createAdminClient()

    let clientAccessId: string | null = null
    let actorUserId: string | null = null
    let projectId: string | null = null
    let source: "admin" | "client" = "client"
    let serverClient: Awaited<ReturnType<typeof createClient>> | null = null

    if (token) {
      const access = await resolveClientAccess(token)
      if (!access) return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })
      clientAccessId = access.client_access_id
      projectId = access.project_id
      source = "client"
    } else {
      const server = await createClient()
      serverClient = server
      const { data: userData } = await server.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
      actorUserId = userId
      source = "admin"
    }

    // Cache for full task download
    if (taskId && scope === "all") {
      const { data: cache } = await admin
        .from("sistema_asset_zip_cache")
        .select("zip_path, expires_at, project_id")
        .eq("task_id", taskId)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cache && (!projectId || cache.project_id === projectId)) {
        const signed = await createSignedUrl(cache.zip_path, ZIP_SIGNED_URL_TTL)
        if (signed) {
          return NextResponse.json({ url: signed, cached: true })
        }
      }
    }

    // Collect versions
    let files: Array<{
      version_id: string
      asset_id: string
      task_id: string
      project_id: string
      asset_name: string
      version_number: number
      storage_path: string
      original_filename: string | null
    }> = []

    if (versionIds && versionIds.length > 0) {
      const { data: versions } = await admin
        .from("sistema_asset_versions")
        .select(`
          id,
          version_number,
          storage_path,
          file_url,
          original_filename,
          asset:sistema_assets(id, nombre, task_id, project_id, access_revoked)
        `)
        .in("id", versionIds)

      files = (versions || [])
        .map((v: any) => {
          const a = Array.isArray(v.asset) ? v.asset[0] : v.asset
          return { ...v, asset: a }
        })
        .filter((v: any) => v.asset && !v.asset.access_revoked)
        .map((v: any) => ({
          version_id: v.id,
          asset_id: v.asset.id,
          task_id: v.asset.task_id,
          project_id: v.asset.project_id,
          asset_name: v.asset.nombre,
          version_number: v.version_number,
          storage_path: v.storage_path || v.file_url,
          original_filename: v.original_filename || null,
        }))
    } else if (taskId) {
      const { data: assets } = await admin
        .from("sistema_assets")
        .select(`
          id,
          nombre,
          task_id,
          project_id,
          current_version,
          access_revoked,
          versions:sistema_asset_versions(id, version_number, storage_path, file_url, original_filename)
        `)
        .eq("task_id", taskId)

      files = (assets || [])
        .filter((a: any) => !a.access_revoked)
        .map((a: any) => {
          const version = (a.versions || []).find((v: any) => v.version_number === a.current_version) || a.versions?.[0]
          if (!version) return null
          return {
            version_id: version.id,
            asset_id: a.id,
            task_id: a.task_id,
            project_id: a.project_id,
            asset_name: a.nombre,
            version_number: version.version_number,
            storage_path: version.storage_path || version.file_url,
            original_filename: version.original_filename || null,
          }
        })
        .filter(Boolean) as any
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No hay archivos para comprimir" }, { status: 400 })
    }

    const taskIds = Array.from(new Set(files.map(f => f.task_id)))
    const { data: taskRows } = await admin
      .from("sistema_tasks")
      .select("id, titulo, social_copy")
      .in("id", taskIds)

    const taskMap = new Map((taskRows || []).map((t: any) => [t.id, t]))

    // Authorization check for client
    if (projectId) {
      const mismatch = files.some(f => f.project_id !== projectId)
      if (mismatch) return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })
    }

    const archive = archiver("zip", { zlib: { level: 9 } })
    const stream = new PassThrough()
    const chunks: Buffer[] = []

    stream.on("data", (chunk) => chunks.push(chunk))

    const finished = new Promise<Buffer>((resolve, reject) => {
      stream.on("end", () => resolve(Buffer.concat(chunks)))
      stream.on("error", reject)
      archive.on("error", reject)
    })

    archive.pipe(stream)

    for (const file of files) {
      if (!file.storage_path) continue
      const signed = await createSignedUrl(file.storage_path, 60 * 60)
      if (!signed) continue
      const body = await fetchAssetStream(signed)
      if (!body) continue
      const name = buildZipEntryName(file.asset_name, file.original_filename ?? undefined, file.version_number)
      archive.append(body, { name })
    }

    // Add copy files (one per task) if available
    taskIds.forEach((id) => {
      const task = taskMap.get(id)
      if (task?.social_copy) {
        const name = `copy-${sanitizeFilename(task.titulo || "tarea")}.txt`
        archive.append(task.social_copy, { name })
      }
    })

    await archive.finalize()
    const zipBuffer = await finished

    const resolvedProjectId = projectId || files[0].project_id

    if (actorUserId && serverClient) {
      const { data: project } = await serverClient
        .from("sistema_projects")
        .select("id")
        .eq("id", resolvedProjectId)
        .single()

      if (!project) {
        return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })
      }
    }
    const zipPath = `zips/${resolvedProjectId}/${files[0].task_id}/${Date.now()}-assets.zip`

    const { error: uploadError } = await admin.storage
      .from(ASSET_BUCKET)
      .upload(zipPath, zipBuffer, { contentType: "application/zip", upsert: true })

    if (uploadError) {
      console.error("[ZIP] Upload error:", uploadError)
      return NextResponse.json({ error: "No se pudo generar ZIP" }, { status: 500 })
    }

    // Cache only for full-task zip
    if (taskId && scope === "all") {
      await admin.from("sistema_asset_zip_cache").insert({
        task_id: taskId,
        project_id: resolvedProjectId,
        zip_path: zipPath,
        expires_at: new Date(Date.now() + ZIP_SIGNED_URL_TTL * 1000).toISOString(),
        created_by: actorUserId,
        client_access_id: clientAccessId,
      })
    }

    const signedUrl = await createSignedUrl(zipPath, ZIP_SIGNED_URL_TTL)
    if (!signedUrl) {
      return NextResponse.json({ error: "No se pudo firmar ZIP" }, { status: 500 })
    }

    await logAssetAccess({
      asset_id: files[0].asset_id,
      asset_version_id: files[0].version_id,
      project_id: resolvedProjectId,
      task_id: files[0].task_id,
      actor_user_id: actorUserId,
      client_access_id: clientAccessId,
      event_type: "zip",
      source,
      ip: request.headers.get("x-forwarded-for"),
      user_agent: request.headers.get("user-agent"),
    })

    return NextResponse.json({ url: signedUrl, cached: false })
  } catch (err) {
    console.error("[ZIP] Unexpected error:", err)
    return NextResponse.json({ error: "Error generando ZIP" }, { status: 500 })
  }
}
