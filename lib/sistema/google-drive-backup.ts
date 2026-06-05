import { createSign } from "crypto"
import { readFileSync } from "fs"
import { createSignedUrl, isStoragePath, sanitizeFilename } from "@/lib/sistema/assets-storage"

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

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  token_uri?: string
}

export interface DriveBackupAsset {
  assetId: string
  assetVersionId: string
  assetName: string
  assetType?: string | null
  groupId?: string | null
  versionNumber: number
  fileUrl: string
  storagePath: string | null
  fileType: string | null
  originalFilename: string | null
}

interface BackupNotifiedAssetsParams {
  projectName: string
  notifiedAt: string
  assets: DriveBackupAsset[]
}

export interface DriveFile {
  id: string
  name?: string
  webViewLink?: string
  webContentLink?: string
}

export interface DriveBackupResult {
  enabled: boolean
  created: number
  failed: number
  monthFolderId: string | null
  monthFolderLink: string | null
  files: Array<{
    assetVersionId: string
    fileId: string
    webViewLink: string | null
  }>
  errors: string[]
}

let accessTokenCache: { token: string; expiresAt: number } | null = null

function isBackupEnabled() {
  return process.env.GOOGLE_DRIVE_BACKUP_ENABLED === "true"
}

function getClientesFolderId() {
  return process.env.GOOGLE_DRIVE_CLIENTES_FOLDER_ID?.trim() || ""
}

function getTimeZone() {
  return process.env.GOOGLE_DRIVE_BACKUP_TIME_ZONE || "America/Argentina/Cordoba"
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function getCredentials(): ServiceAccountCredentials {
  const base64Json = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64?.trim()
  const jsonPath = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH?.trim()

  let raw: string
  if (base64Json) {
    raw = Buffer.from(base64Json, "base64").toString("utf8")
  } else if (jsonPath) {
    raw = readFileSync(jsonPath, "utf8")
  } else {
    throw new Error("Google Drive credentials are not configured.")
  }

  const credentials = JSON.parse(raw) as ServiceAccountCredentials
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Google Drive service account JSON is missing client_email or private_key.")
  }

  return credentials
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  if (accessTokenCache && accessTokenCache.expiresAt - 60 > now) {
    return accessTokenCache.token
  }

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
  if (!response.ok) {
    throw new Error(`Google OAuth error: ${payload.error_description || payload.error || response.statusText}`)
  }

  accessTokenCache = {
    token: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 3600),
  }

  return accessTokenCache.token
}

async function driveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const response = await fetch(path.startsWith("http") ? path : `${DRIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = payload?.error?.message || payload?.error_description || response.statusText
    throw new Error(`Google Drive API error: ${message}`)
  }

  return payload as T
}

async function findFolder(parentId: string, name: string) {
  const params = new URLSearchParams({
    q: `'${escapeDriveQueryValue(parentId)}' in parents and name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name,webViewLink)",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  })

  const result = await driveFetch<{ files?: DriveFile[] }>(`/files?${params.toString()}`)
  return result.files?.[0] || null
}

async function createFolder(parentId: string, name: string) {
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "id,name,webViewLink",
  })

  return driveFetch<DriveFile>(`/files?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  })
}

export async function ensureFolder(parentId: string, name: string) {
  const existing = await findFolder(parentId, name)
  if (existing) return existing
  return createFolder(parentId, name)
}

async function ensureAnyoneReader(folderId: string) {
  try {
    const params = new URLSearchParams({
      supportsAllDrives: "true",
      sendNotificationEmail: "false",
    })

    await driveFetch(`/files/${folderId}/permissions?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "anyone",
        role: "reader",
        allowFileDiscovery: false,
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exists|duplicate/i.test(message)) {
      throw error
    }
  }
}

function getClientName(rawName: string) {
  return rawName.trim() || "Cliente"
}

async function ensureClientFolder(clientName: string) {
  const clientesFolderId = getClientesFolderId()
  if (!clientesFolderId) {
    throw new Error("GOOGLE_DRIVE_CLIENTES_FOLDER_ID is not configured.")
  }

  return ensureFolder(clientesFolderId, getClientName(clientName))
}

async function ensureMonthlyFolder(clientName: string, dateIso: string) {
  const resolvedClientName = getClientName(clientName)
  const { year, monthName } = getMonthParts(dateIso)
  const clientFolder = await ensureClientFolder(resolvedClientName)
  const yearFolder = await ensureFolder(clientFolder.id, `${resolvedClientName}_${year}`)
  const monthFolder = await ensureFolder(yearFolder.id, `${resolvedClientName}_${year}_${monthName}`)

  return {
    folder: monthFolder,
    link: monthFolder.webViewLink || `https://drive.google.com/drive/folders/${monthFolder.id}`,
  }
}

function getMonthParts(dateIso: string) {
  const date = new Date(dateIso)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: getTimeZone(),
    year: "numeric",
    month: "numeric",
  })

  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === "year")?.value || date.getUTCFullYear())
  const month = Number(parts.find((part) => part.type === "month")?.value || date.getUTCMonth() + 1)

  return { year, monthName: SPANISH_MONTHS[Math.max(0, month - 1)] || "Mes" }
}

function getExtension(originalFilename?: string | null, fallback?: string | null) {
  const candidate = originalFilename || fallback || ""
  const match = candidate.match(/\.([a-zA-Z0-9]{1,12})(?:\?.*)?$/)
  return match ? `.${match[1].toLowerCase()}` : ""
}

function buildDriveFilename(asset: DriveBackupAsset) {
  const ext = getExtension(asset.originalFilename, asset.storagePath || asset.fileUrl)
  const rawBase = asset.assetName || asset.originalFilename || `asset-${asset.assetVersionId}`
  const safeBase = sanitizeFilename(rawBase.replace(/\.[^/.]+$/, "")) || `asset-${asset.assetVersionId}`
  const version = String(asset.versionNumber || 1).padStart(2, "0")
  return `FINAL-v${version}-${safeBase}${ext}`
}

function buildCarouselFolderName(asset: DriveBackupAsset) {
  const rawBase = asset.assetName
    .replace(/\s*\(\d+\/\d+\)\s*$/g, "")
    .replace(/\.[^/.]+$/, "")
    .trim() || "carousel"
  const safeBase = sanitizeFilename(rawBase) || "carousel"
  return `FINAL-carousel-${safeBase}`
}

async function getSourceUrl(asset: DriveBackupAsset) {
  const source = asset.storagePath || asset.fileUrl
  if (!source) throw new Error("Asset has no storage path or URL.")

  if (isStoragePath(source)) {
    const signedUrl = await createSignedUrl(source, 60 * 60)
    if (!signedUrl) throw new Error("Could not create signed Supabase URL.")
    return signedUrl
  }

  return source
}

async function uploadDriveFile(params: {
  parentId: string
  name: string
  mimeType: string
  sourceUrl: string
}) {
  const sourceDriveFileId = extractGoogleDriveFileId(params.sourceUrl)
  if (sourceDriveFileId) {
    return copyDriveFile({
      sourceFileId: sourceDriveFileId,
      parentId: params.parentId,
      name: params.name,
    })
  }

  const sourceResponse = await fetch(params.sourceUrl)
  if (!sourceResponse.ok) {
    throw new Error(`Could not download source asset (${sourceResponse.status}).`)
  }

  const buffer = await sourceResponse.arrayBuffer()
  const form = new FormData()
  form.append(
    "metadata",
    new Blob([JSON.stringify({ name: params.name, parents: [params.parentId] })], {
      type: "application/json",
    })
  )
  form.append("file", new Blob([buffer], { type: params.mimeType || "application/octet-stream" }), params.name)

  const query = new URLSearchParams({
    uploadType: "multipart",
    supportsAllDrives: "true",
    fields: "id,name,webViewLink,webContentLink",
  })

  return driveFetch<DriveFile>(`${DRIVE_UPLOAD_BASE}/files?${query.toString()}`, {
    method: "POST",
    body: form,
  })
}

function extractGoogleDriveFileId(url: string) {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return null

    const filePathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/)
    if (filePathMatch?.[1]) return filePathMatch[1]

    const queryId = parsed.searchParams.get("id")
    return queryId || null
  } catch {
    return null
  }
}

async function copyDriveFile(params: {
  sourceFileId: string
  parentId: string
  name: string
}) {
  const query = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "id,name,webViewLink,webContentLink",
  })

  return driveFetch<DriveFile>(`/files/${params.sourceFileId}/copy?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      parents: [params.parentId],
    }),
  })
}

export async function uploadBufferToDrive(params: {
  parentId: string
  name: string
  mimeType: string
  buffer: ArrayBuffer
}) {
  const form = new FormData()
  form.append(
    "metadata",
    new Blob([JSON.stringify({ name: params.name, parents: [params.parentId] })], {
      type: "application/json",
    })
  )
  form.append(
    "file",
    new Blob([params.buffer], { type: params.mimeType || "application/octet-stream" }),
    params.name
  )

  const query = new URLSearchParams({
    uploadType: "multipart",
    supportsAllDrives: "true",
    fields: "id,name,webViewLink,webContentLink",
  })

  return driveFetch<DriveFile>(`${DRIVE_UPLOAD_BASE}/files?${query.toString()}`, {
    method: "POST",
    body: form,
  })
}

export async function createDriveResumableUploadSession(params: {
  parentId: string
  name: string
  mimeType: string
  fileSize: number
}) {
  const token = await getAccessToken()
  const query = new URLSearchParams({
    uploadType: "resumable",
    supportsAllDrives: "true",
    fields: "id,name,webViewLink,webContentLink",
  })

  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?${query.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": params.mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(params.fileSize),
    },
    body: JSON.stringify({
      name: params.name,
      parents: [params.parentId],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    let message = response.statusText
    try {
      message = JSON.parse(text)?.error?.message || message
    } catch {}
    throw new Error(`Google Drive API error: ${message}`)
  }

  const uploadUrl = response.headers.get("location")
  if (!uploadUrl) {
    throw new Error("Google Drive did not return a resumable upload URL.")
  }

  return uploadUrl
}

export async function ensureDriveSourceFolder(params: {
  projectName: string
  taskId: string
  taskTitle?: string | null
}) {
  const clientName = getClientName(params.projectName)
  const clientFolder = await ensureClientFolder(clientName)
  const systemFolder = await ensureFolder(clientFolder.id, `${clientName}_Sistema`)
  const safeTask = sanitizeFilename(params.taskTitle || params.taskId) || params.taskId
  return ensureFolder(systemFolder.id, safeTask)
}

export async function ensureDriveProjectFolders(params: {
  projectName: string
  year?: number
}) {
  if (!isBackupEnabled()) {
    return { enabled: false, clientFolder: null, yearFolder: null, systemFolder: null }
  }

  const clientName = getClientName(params.projectName)
  const year = params.year || Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: getTimeZone(),
    year: "numeric",
  }).format(new Date()))

  const clientFolder = await ensureClientFolder(clientName)
  const yearFolder = await ensureFolder(clientFolder.id, `${clientName}_${year}`)
  const systemFolder = await ensureFolder(clientFolder.id, `${clientName}_Sistema`)

  return {
    enabled: true,
    clientFolder,
    yearFolder,
    systemFolder,
  }
}

export async function backupNotifiedAssetsToDrive(
  params: BackupNotifiedAssetsParams
): Promise<DriveBackupResult> {
  const result: DriveBackupResult = {
    enabled: isBackupEnabled(),
    created: 0,
    failed: 0,
    monthFolderId: null,
    monthFolderLink: null,
    files: [],
    errors: [],
  }

  if (!result.enabled) return result

  const clientesFolderId = getClientesFolderId()
  if (!clientesFolderId) {
    return {
      ...result,
      failed: params.assets.length,
      errors: ["GOOGLE_DRIVE_CLIENTES_FOLDER_ID is not configured."],
    }
  }

  if (params.assets.length === 0) return result

  try {
    const monthly = await ensureMonthlyFolder(params.projectName, params.notifiedAt)
    const monthFolder = monthly.folder

    result.monthFolderId = monthFolder.id
    result.monthFolderLink = monthly.link

    await ensureAnyoneReader(monthFolder.id)

    const carouselFolderByGroupId = new Map<string, DriveFile>()

    for (const asset of params.assets) {
      try {
        if (asset.assetType === "folder") {
          continue
        }

        let parentId = monthFolder.id
        if (asset.assetType === "carousel" && asset.groupId) {
          const existingFolder = carouselFolderByGroupId.get(asset.groupId)
          const carouselFolder = existingFolder || await ensureFolder(monthFolder.id, buildCarouselFolderName(asset))
          carouselFolderByGroupId.set(asset.groupId, carouselFolder)
          parentId = carouselFolder.id
        }

        const sourceUrl = await getSourceUrl(asset)
        const driveFile = await uploadDriveFile({
          parentId,
          name: buildDriveFilename(asset),
          mimeType: asset.fileType || "application/octet-stream",
          sourceUrl,
        })

        result.created += 1
        result.files.push({
          assetVersionId: asset.assetVersionId,
          fileId: driveFile.id,
          webViewLink: driveFile.webViewLink || null,
        })
      } catch (error) {
        result.failed += 1
        result.errors.push(
          `${asset.assetName}: ${error instanceof Error ? error.message : "unknown Drive backup error"}`
        )
      }
    }
  } catch (error) {
    return {
      ...result,
      failed: params.assets.length,
      errors: [
        ...result.errors,
        error instanceof Error ? error.message : "Unknown Google Drive backup error.",
      ],
    }
  }

  return result
}
