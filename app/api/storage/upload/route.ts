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

    const { searchParams } = new URL(request.url)
    const rawFolder = String(searchParams.get("folder") || "proyectos")
    const rawFilename = String(searchParams.get("filename") || `upload-${Date.now()}`)
    const contentTypeHeader = request.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream"
    const fileBuffer = Buffer.from(await request.arrayBuffer())
    if (fileBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Archivo vacío" }, { status: 400 })
    }

    const folder = sanitizeFolder(rawFolder) || "proyectos"
    const safeName = sanitizeFileName(rawFilename)
    const extFromName = path.extname(safeName).toLowerCase()
    const ext = extFromName || MIME_TO_EXT[contentTypeHeader] || ".jpg"
    const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID()}${ext}`

    const admin = createAdminClient()
    const { error: uploadError } = await admin.storage.from(BUCKET_NAME).upload(storagePath, fileBuffer, {
      contentType: contentTypeHeader,
      cacheControl: "3600",
      upsert: false,
    })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data } = admin.storage.from(BUCKET_NAME).getPublicUrl(storagePath)
    return NextResponse.json({ url: data.publicUrl, path: storagePath })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al subir imagen"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
