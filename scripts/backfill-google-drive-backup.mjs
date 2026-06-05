import { createSign } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const args = new Set(process.argv.slice(2))
const execute = args.has("--execute")
const retryErrors = args.has("--retry-errors")
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))
const limit = limitArg ? Number(limitArg.split("=")[1]) : 25

loadEnv(".env.local")

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
const GOOGLE_DRIVE_CLIENTES_FOLDER_ID = requireEnv("GOOGLE_DRIVE_CLIENTES_FOLDER_ID")
const GOOGLE_DRIVE_BACKUP_ENABLED = process.env.GOOGLE_DRIVE_BACKUP_ENABLED === "true"
const GOOGLE_DRIVE_BACKUP_TIME_ZONE = process.env.GOOGLE_DRIVE_BACKUP_TIME_ZONE || "America/Argentina/Cordoba"

const ASSET_BUCKET = "sistema-assets"
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

let accessTokenCache = null
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

if (!GOOGLE_DRIVE_BACKUP_ENABLED) {
  console.error("GOOGLE_DRIVE_BACKUP_ENABLED is not true.")
  process.exit(1)
}

const candidates = await fetchCandidates()
console.log(`Modo: ${execute ? "EJECUCION" : "SIMULACION"}`)
console.log(`Pendientes encontrados: ${candidates.length}`)

if (!execute) {
  for (const item of candidates.slice(0, Math.min(10, candidates.length))) {
    const folder = getFolderParts(item)
    console.log(`- ${folder.clientName}/${folder.yearFolder}/${folder.monthFolder} -> ${buildDriveFilename(item)}`)
  }
  console.log("\nPara ejecutar de verdad: npm run drive:backfill -- --execute")
  process.exit(0)
}

let created = 0
let failed = 0

for (const item of candidates) {
  try {
    const folder = getFolderParts(item)
    const clientFolder = await ensureFolder(GOOGLE_DRIVE_CLIENTES_FOLDER_ID, folder.clientName)
    const yearFolder = await ensureFolder(clientFolder.id, folder.yearFolder)
    const monthFolder = await ensureFolder(yearFolder.id, folder.monthFolder)
    await ensureAnyoneReader(monthFolder.id)

    const sourceUrl = await getSourceUrl(item)
    const driveFile = await uploadDriveFile({
      parentId: monthFolder.id,
      name: buildDriveFilename(item),
      mimeType: item.file_type || "application/octet-stream",
      sourceUrl,
    })

    const { error } = await supabase
      .from("sistema_asset_versions")
      .update({
        drive_file_id: driveFile.id,
        drive_web_view_link: driveFile.webViewLink || null,
        drive_month_folder_id: monthFolder.id,
        drive_month_folder_link: monthFolder.webViewLink || `https://drive.google.com/drive/folders/${monthFolder.id}`,
        drive_backup_at: new Date().toISOString(),
        drive_backup_error: null,
      })
      .eq("id", item.id)

    if (error) throw new Error(`No se pudo guardar metadata en Supabase: ${error.message}`)

    created += 1
    console.log(`OK ${created}/${candidates.length}: ${folder.monthFolder}/${buildDriveFilename(item)}`)
  } catch (error) {
    failed += 1
    const message = error instanceof Error ? error.message : String(error)
    console.error(`FAIL ${item.id}: ${message}`)
    await supabase
      .from("sistema_asset_versions")
      .update({ drive_backup_error: message.slice(0, 1000) })
      .eq("id", item.id)
  }
}

console.log(`\nListo. Creados: ${created}. Fallidos: ${failed}.`)
if (failed > 0) process.exit(1)

async function fetchCandidates() {
  const { data, error } = await supabase
    .from("sistema_asset_versions")
    .select(`
      id,
      asset_id,
      version_number,
      file_url,
      storage_path,
      file_type,
      original_filename,
      notified_at,
      drive_file_id,
      asset:sistema_assets(
        id,
        nombre,
        access_revoked,
        project:sistema_projects(nombre)
      )
    `)
    .not("notified_at", "is", null)
    .is("drive_file_id", null)
    .filter("drive_backup_error", retryErrors ? "not.is" : "is", null)
    .order("notified_at", { ascending: true })
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 25)

  if (error) throw error

  return (data || [])
    .map((row) => {
      const asset = Array.isArray(row.asset) ? row.asset[0] : row.asset
      const project = Array.isArray(asset?.project) ? asset.project[0] : asset?.project
      return {
        ...row,
        asset_name: asset?.nombre || row.original_filename || row.id,
        project_name: project?.nombre || "Cliente",
        access_revoked: Boolean(asset?.access_revoked),
      }
    })
    .filter((row) => !row.access_revoked)
}

function loadEnv(path) {
  const raw = readFileSync(path, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const index = trimmed.indexOf("=")
    if (index === -1) continue
    const key = trimmed.slice(0, index)
    const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "")
    if (!process.env[key]) process.env[key] = value
  }
}

function requireEnv(key) {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

function getCredentials() {
  if (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64?.trim()) {
    return JSON.parse(Buffer.from(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8"))
  }

  if (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH?.trim()) {
    return JSON.parse(readFileSync(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH.trim(), "utf8"))
  }

  throw new Error("Google Drive credentials are not configured.")
}

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  if (accessTokenCache && accessTokenCache.expiresAt - 60 > now) return accessTokenCache.token

  const credentials = getCredentials()
  const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token"
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claim = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: DRIVE_SCOPE,
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  }))
  const unsignedJwt = `${header}.${claim}`
  const signature = createSign("RSA-SHA256").update(unsignedJwt).sign(credentials.private_key)
  const jwt = `${unsignedJwt}.${base64Url(signature)}`

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  const payload = await response.json()
  if (!response.ok) throw new Error(`Google OAuth error: ${payload.error_description || payload.error || response.statusText}`)

  accessTokenCache = { token: payload.access_token, expiresAt: now + Number(payload.expires_in || 3600) }
  return accessTokenCache.token
}

async function driveFetch(path, init = {}) {
  const token = await getAccessToken()
  const response = await fetch(path.startsWith("http") ? path : `${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`Google Drive API error: ${payload?.error?.message || response.statusText}`)
  return payload
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

async function findFolder(parentId, name) {
  const params = new URLSearchParams({
    q: `'${escapeDriveQueryValue(parentId)}' in parents and name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name,webViewLink)",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  })
  const result = await driveFetch(`/files?${params.toString()}`)
  return result.files?.[0] || null
}

async function createFolder(parentId, name) {
  const params = new URLSearchParams({ supportsAllDrives: "true", fields: "id,name,webViewLink" })
  return driveFetch(`/files?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  })
}

async function ensureFolder(parentId, name) {
  return (await findFolder(parentId, name)) || createFolder(parentId, name)
}

async function ensureAnyoneReader(folderId) {
  try {
    const params = new URLSearchParams({ supportsAllDrives: "true", sendNotificationEmail: "false" })
    await driveFetch(`/files/${folderId}/permissions?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    })
  } catch (error) {
    if (!/already exists|duplicate/i.test(error instanceof Error ? error.message : String(error))) throw error
  }
}

function sanitizeFilename(name) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase()
}

function getMonthParts(dateIso) {
  const date = new Date(dateIso)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: GOOGLE_DRIVE_BACKUP_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  })
  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === "year")?.value || date.getUTCFullYear())
  const month = Number(parts.find((part) => part.type === "month")?.value || date.getUTCMonth() + 1)
  return { year, monthName: SPANISH_MONTHS[Math.max(0, month - 1)] || "Mes" }
}

function getFolderParts(item) {
  const clientName = item.project_name.trim() || "Cliente"
  const { year, monthName } = getMonthParts(item.notified_at)
  return {
    clientName,
    yearFolder: `${clientName}_${year}`,
    monthFolder: `${clientName}_${year}_${monthName}`,
  }
}

function getExtension(originalFilename, fallback) {
  const candidate = originalFilename || fallback || ""
  const match = candidate.match(/\.([a-zA-Z0-9]{1,12})(?:\?.*)?$/)
  return match ? `.${match[1].toLowerCase()}` : ""
}

function buildDriveFilename(item) {
  const ext = getExtension(item.original_filename, item.storage_path || item.file_url)
  const safeBase = sanitizeFilename((item.asset_name || item.original_filename || item.id).replace(/\.[^/.]+$/, "")) || item.id
  const version = String(item.version_number || 1).padStart(2, "0")
  return `FINAL-v${version}-${safeBase}${ext}`
}

function isStoragePath(value) {
  return Boolean(value) && !/^https?:\/\//i.test(value)
}

async function getSourceUrl(item) {
  const source = item.storage_path || item.file_url
  if (!source) throw new Error("Asset has no storage path or URL.")
  if (!isStoragePath(source)) return source

  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(source, 60 * 60)
  if (error || !data?.signedUrl) throw new Error(`Could not create signed Supabase URL: ${error?.message || "unknown error"}`)
  return data.signedUrl
}

async function uploadDriveFile({ parentId, name, mimeType, sourceUrl }) {
  const sourceDriveFileId = extractGoogleDriveFileId(sourceUrl)
  if (sourceDriveFileId) {
    return copyDriveFile({ sourceFileId: sourceDriveFileId, parentId, name })
  }

  const sourceResponse = await fetch(sourceUrl)
  if (!sourceResponse.ok) throw new Error(`Could not download source asset (${sourceResponse.status}).`)

  const buffer = await sourceResponse.arrayBuffer()
  const form = new FormData()
  form.append("metadata", new Blob([JSON.stringify({ name, parents: [parentId] })], { type: "application/json" }))
  form.append("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), name)

  const query = new URLSearchParams({
    uploadType: "multipart",
    supportsAllDrives: "true",
    fields: "id,name,webViewLink,webContentLink",
  })

  return driveFetch(`${DRIVE_UPLOAD_BASE}/files?${query.toString()}`, { method: "POST", body: form })
}

function extractGoogleDriveFileId(url) {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return null

    const filePathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/)
    if (filePathMatch?.[1]) return filePathMatch[1]

    return parsed.searchParams.get("id")
  } catch {
    return null
  }
}

async function copyDriveFile({ sourceFileId, parentId, name }) {
  const query = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "id,name,webViewLink,webContentLink",
  })

  return driveFetch(`/files/${sourceFileId}/copy?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [parentId] }),
  })
}
