import { NextResponse } from "next/server"
import archiver from "archiver"
import { Readable, PassThrough } from "stream"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { createClient } from "@/lib/sistema/supabase/server"
import { createSignedUrl, isStoragePath, sanitizeFilename } from "@/lib/sistema/assets-storage"
import { logAssetAccess } from "@/lib/sistema/actions/assets"
import { extractGoogleDriveFileId, fetchDriveFile } from "@/lib/sistema/google-drive-backup"

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

    // Collect versions
    let files: Array<{
      version_id: string
      asset_id: string
      task_id: string
      project_id: string
      asset_name: string
      version_number: number
      storage_path: string
      drive_file_id: string | null
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
          drive_file_id,
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
          drive_file_id: v.drive_file_id || null,
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
          versions:sistema_asset_versions(id, version_number, storage_path, file_url, drive_file_id, original_filename)
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
            drive_file_id: version.drive_file_id || null,
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

    // Authorize every project before fetching originals from either provider.
    if (actorUserId && serverClient) {
      for (const id of new Set(files.map(file => file.project_id))) {
        const { data: project } = await serverClient.from("sistema_projects").select("id").eq("id", id).single()
        if (!project) return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 })
      }
    }

    // Return only authorized, short-lived download targets when every original
    // can be fetched directly by the browser. Drive originals remain private.
    if (body?.delivery === "manifest" && files.every(file => isStoragePath(file.storage_path))) {
      const downloads = await Promise.all(files.map(async file => {
        const url = await createSignedUrl(file.storage_path, 15 * 60)
        if (!url) throw new Error("No se pudo autorizar uno de los originales")
        return {
          name: `${file.version_id}-${buildZipEntryName(file.asset_name, file.original_filename ?? undefined, file.version_number)}`,
          url,
        }
      }))
      const texts = taskIds.flatMap(id => {
        const task = taskMap.get(id)
        return task?.social_copy ? [{ name: `copy-${id}-${sanitizeFilename(task.titulo || "tarea")}.txt`, text: task.social_copy }] : []
      })
      await logAssetAccess({
        asset_id: files[0].asset_id, asset_version_id: files[0].version_id,
        project_id: projectId || files[0].project_id, task_id: files[0].task_id,
        actor_user_id: actorUserId, client_access_id: clientAccessId,
        event_type: "zip", source, ip: request.headers.get("x-forwarded-for"),
        user_agent: request.headers.get("user-agent"),
      })
      return NextResponse.json({ downloads, texts }, { headers: { "Cache-Control": "private, no-store" } })
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
    // Source stream errors can arrive while later files are still being fetched.
    void finished.catch(() => {})

    archive.pipe(stream)

    for (const file of files) {
      let body: Readable | null = null
      if (isStoragePath(file.storage_path)) {
        const signed = await createSignedUrl(file.storage_path, 60 * 60)
        if (signed) body = await fetchAssetStream(signed)
      } else {
        const driveFileId = file.drive_file_id || extractGoogleDriveFileId(file.storage_path)
        if (driveFileId) {
          const response = await fetchDriveFile(driveFileId)
          if (response.body) body = Readable.fromWeb(response.body as any)
        }
      }
      if (!body) {
        archive.abort()
        return NextResponse.json({ error: "No se pudo obtener uno de los originales; intentá nuevamente" }, { status: 502 })
      }
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

    const name = sanitizeFilename(String(body?.zipName || "quepia-assets")) || "quepia-assets"
    // Deliver the archive directly; downloads must not accumulate in Storage.
    return new Response(new Uint8Array(zipBuffer), { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "private, no-store",
    } })
  } catch (err) {
    console.error("[ZIP] Unexpected error:", err)
    return NextResponse.json({ error: "Error generando ZIP" }, { status: 500 })
  }
}
