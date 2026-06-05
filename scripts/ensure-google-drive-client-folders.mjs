import { createSign } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

loadEnv(".env.local")

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
const GOOGLE_DRIVE_CLIENTES_FOLDER_ID = requireEnv("GOOGLE_DRIVE_CLIENTES_FOLDER_ID")
const GOOGLE_DRIVE_BACKUP_ENABLED = process.env.GOOGLE_DRIVE_BACKUP_ENABLED === "true"
const GOOGLE_DRIVE_BACKUP_TIME_ZONE = process.env.GOOGLE_DRIVE_BACKUP_TIME_ZONE || "America/Argentina/Cordoba"
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"

const execute = new Set(process.argv.slice(2)).has("--execute")
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
let accessTokenCache = null

if (!GOOGLE_DRIVE_BACKUP_ENABLED) {
  console.error("GOOGLE_DRIVE_BACKUP_ENABLED is not true.")
  process.exit(1)
}

const projects = await fetchProjects()
const year = Number(new Intl.DateTimeFormat("en-CA", {
  timeZone: GOOGLE_DRIVE_BACKUP_TIME_ZONE,
  year: "numeric",
}).format(new Date()))

console.log(`Modo: ${execute ? "EJECUCION" : "SIMULACION"}`)
console.log(`Clientes encontrados: ${projects.length}`)

let created = 0
let failed = 0

for (const project of projects) {
  const clientName = getClientName(project.nombre)
  const yearFolderName = `${clientName}_${year}`
  const systemFolderName = `${clientName}_Sistema`

  if (!execute) {
    console.log(`- ${clientName}/${yearFolderName} + ${systemFolderName}`)
    continue
  }

  try {
    const clientFolder = await ensureFolder(GOOGLE_DRIVE_CLIENTES_FOLDER_ID, clientName)
    await ensureFolder(clientFolder.id, yearFolderName)
    await ensureFolder(clientFolder.id, systemFolderName)
    created += 1
    console.log(`OK ${created}/${projects.length}: ${clientName}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${clientName}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (!execute) {
  console.log("\nPara ejecutar de verdad: npm run drive:ensure-folders -- --execute")
} else {
  console.log(`\nListo. Clientes preparados: ${created}. Fallidos: ${failed}.`)
}

if (failed > 0) process.exit(1)

async function fetchProjects() {
  const { data, error } = await supabase
    .from("sistema_projects")
    .select("id,nombre")
    .is("parent_id", null)
    .order("nombre", { ascending: true })

  if (error) throw error
  return data || []
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
  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
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
  const existing = await findFolder(parentId, name)
  return existing || createFolder(parentId, name)
}

function sanitizeFilename(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

function getClientName(projectName) {
  return sanitizeFilename(projectName.split("/")[0]?.trim() || projectName || "Cliente")
}
