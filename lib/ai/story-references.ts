import "server-only"
import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ClientBrief } from "@/types/sistema"
import { ASSET_BUCKET } from "@/lib/sistema/assets-storage"
import { downloadDriveFile, listDriveImageBank } from "@/lib/sistema/google-drive-backup"
import { ZernioRouteError } from "@/lib/zernio/server"

export interface StoryReference {
  id: string; name: string; fileType: string; source: "asset" | "drive"; previewUrl: string | null
}
export async function storyReferenceCatalog(server: SupabaseClient, projectId: string, brief: ClientBrief | null) {
  const { data, error } = await server.from("sistema_assets")
    .select("id,nombre,current_version,versions:sistema_asset_versions(version_number,file_type,storage_path,thumbnail_path,drive_file_id)")
    .eq("project_id",projectId).eq("access_revoked",false).order("created_at",{ascending:false}).limit(300)
  if (error) throw error
  const assets = (data || []).flatMap(asset => {
    const v = asset.versions.find(v => v.version_number === asset.current_version)
    return v?.file_type?.startsWith("image/") && (v.storage_path || v.drive_file_id)
      ? [{ id: asset.id, name: asset.nombre, fileType: v.file_type, source: "asset" as const, previewUrl: null as string | null, thumbnail: v.thumbnail_path }] : []
  })
  const paths = assets.map(a=>a.thumbnail).filter((p): p is string=> Boolean(p && p.startsWith(`${projectId}/`)))
  if (paths.length) {
    const signed = await server.storage.from(ASSET_BUCKET).createSignedUrls(paths,3600)
    const urls = new Map(signed.data?.map(v=>[v.path,v.signedUrl]) || [])
    for (const a of assets) a.previewUrl = a.thumbnail ? urls.get(a.thumbnail) || null : null
  }
  const drive: StoryReference[] = []
  for (const ref of brief?.reference_links || []) {
    if (!/^Banco de imágenes$/i.test(ref.note?.trim() || "")) continue
    let url: URL
    try { url = new URL(ref.url) } catch { continue }
    const folder = url.hostname === "drive.google.com" ? url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] : null
    if (!folder) continue
    for (const file of await listDriveImageBank(folder)) {
      if (Number(file.size || 0) <= 100 * 1024 * 1024) drive.push({ id:file.id,name:file.name || "Foto",fileType:file.mimeType,source:"drive",previewUrl:null })
    }
  }
  return [...assets.map(asset=>({id:asset.id,name:asset.name,fileType:asset.fileType,source:asset.source,previewUrl:asset.previewUrl})),...drive]
}

export async function referencePaths(server: SupabaseClient, _taskId: string, projectId: string, ids: string[], driveIds: string[] = [], brief: ClientBrief | null = null) {
  if (ids.length + driveIds.length > 4) throw new ZernioRouteError(422,"Elegí hasta cuatro referencias")
  const paths: string[] = []
  if (ids.length) {
    const { data,error } = await server.from("sistema_assets")
      .select("id,task_id,current_version,access_revoked,versions:sistema_asset_versions(version_number,storage_path,drive_file_id,file_type,file_size)")
      .eq("project_id",projectId).in("id",ids)
    if (error) throw error
    for (const id of ids) {
      const asset = data?.find(a=>a.id===id), v=asset?.versions.find(v=>v.version_number===asset.current_version)
      if (!asset || asset.access_revoked || !v?.file_type?.startsWith("image/") || (v.file_size || 0)>100*1024*1024)
        throw new ZernioRouteError(422,"Una referencia no está disponible en este proyecto")
      if (v.drive_file_id) paths.push(`drive:${v.drive_file_id}`)
      else if (v.storage_path?.startsWith(`${projectId}/${asset.task_id}/`)) paths.push(v.storage_path)
      else throw new ZernioRouteError(422,"La referencia no tiene una ruta válida")
    }
  }
  if (driveIds.length) {
    const catalog = await storyReferenceCatalog(server,projectId,brief)
    for (const id of driveIds) {
      if (!catalog.some(r=>r.source==="drive" && r.id===id)) throw new ZernioRouteError(422,"La foto no pertenece al banco del brief")
      paths.push(`drive:${id}`)
    }
  }
  return paths
}
export async function readStoryReference(server: SupabaseClient, path: string) {
  let bytes: Uint8Array
  if (path.startsWith("drive:")) bytes=(await downloadDriveFile(path.slice(6),100*1024*1024)).data
  else {
    const {data,error}=await server.storage.from(ASSET_BUCKET).download(path)
    if (error || !data || data.size>100*1024*1024) throw new Error("No se pudo leer la referencia")
    bytes=new Uint8Array(await data.arrayBuffer())
  }
  return sharp(bytes,{limitInputPixels:100_000_000}).rotate().resize(2560,2560,{fit:"inside",withoutEnlargement:true}).png().toBuffer()
}

/** Design examples are read only from the authorized project brief, never the photo catalog. */
export async function storyDesignReferences(server: SupabaseClient, brief: ClientBrief | null) {
  const examples: { image: Buffer; note: string }[] = []
  for (const ref of brief?.reference_links || []) {
    if (!ref.url?.trim() || !/^Referencia de diseño(?:\s*:|$)/i.test(ref.note?.trim() || "")) continue
    let url: URL
    try { url = new URL(ref.url) } catch { throw new Error("La referencia de diseño debe ser un enlace de Google Drive") }
    if (url.hostname !== "drive.google.com") throw new Error("Usá un archivo o carpeta de Google Drive para las referencias de diseño")
    const folder = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]
    const file = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.searchParams.get("id")
    const ids = folder ? (await listDriveImageBank(folder)).filter(item => Number(item.size || 0) <= 100 * 1024 * 1024).map(item => item.id) : file && /^[a-zA-Z0-9_-]+$/.test(file) ? [file] : []
    if (!ids.length) throw new Error("La referencia de diseño no contiene imágenes accesibles en Drive")
    for (const id of ids.slice(0, 4 - examples.length)) {
      examples.push({image: await sharp(await readStoryReference(server, `drive:${id}`)).resize(1024,1024,{fit:"inside",withoutEnlargement:true}).webp({quality:80}).toBuffer(), note: ref.note})
    }
    if (examples.length === 4) break
  }
  return examples
}
