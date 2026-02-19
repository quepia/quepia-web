import crypto from "node:crypto"
import path from "node:path"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"

const BUCKET_NAME = "project-images"
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
}

function sanitizeFolder(input: string) {
  return input
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim().replace(/[^a-zA-Z0-9_-]/g, "-"))
    .filter(Boolean)
    .join("/")
}

function sanitizeFileName(input: string) {
  const normalized = input
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120)

  return normalized && normalized.length > 0 ? normalized : `upload-${Date.now()}`
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const server = await createClient()
    const {
      data: { user },
      error: authError,
    } = await server.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const rawFolder = String(body?.folder || "proyectos")
    const rawFilename = String(body?.filename || `upload-${Date.now()}`)
    const rawContentType = String(body?.contentType || "application/octet-stream")

    const folder = sanitizeFolder(rawFolder) || "proyectos"
    const safeName = sanitizeFileName(rawFilename)
    const extFromName = path.extname(safeName).toLowerCase()
    const ext = extFromName || MIME_TO_EXT[rawContentType] || ".jpg"
    const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID()}${ext}`

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(BUCKET_NAME).createSignedUploadUrl(storagePath)
    if (error || !data?.token || !data?.path) {
      return NextResponse.json({ error: error?.message || "No se pudo crear URL de subida" }, { status: 500 })
    }

    const { data: publicData } = admin.storage.from(BUCKET_NAME).getPublicUrl(storagePath)
    return NextResponse.json({
      bucket: BUCKET_NAME,
      path: data.path,
      token: data.token,
      publicUrl: publicData.publicUrl,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al preparar subida"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
