import { NextResponse } from "next/server"
import { createClient } from "@/lib/sistema/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_CHUNK_BYTES = 4 * 1024 * 1024

function parseHeaderNumber(headers: Headers, name: string) {
  const value = headers.get(name)
  const parsed = value ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(request: Request) {
  try {
    const server = await createClient()
    const { data: userData } = await server.auth.getUser()

    if (!userData.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const uploadUrl = request.headers.get("x-drive-upload-url") || ""
    const mimeType = request.headers.get("x-file-type") || "application/octet-stream"
    const start = parseHeaderNumber(request.headers, "x-chunk-start")
    const end = parseHeaderNumber(request.headers, "x-chunk-end")
    const total = parseHeaderNumber(request.headers, "x-file-size")

    if (!uploadUrl || start === null || end === null || total === null || start < 0 || end < start || total <= 0) {
      return NextResponse.json({ error: "Datos de chunk incompletos" }, { status: 400 })
    }

    let parsedUploadUrl: URL
    try {
      parsedUploadUrl = new URL(uploadUrl)
    } catch {
      return NextResponse.json({ error: "URL de carga inválida" }, { status: 400 })
    }

    if (parsedUploadUrl.hostname !== "www.googleapis.com") {
      return NextResponse.json({ error: "URL de carga no permitida" }, { status: 400 })
    }

    const buffer = Buffer.from(await request.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Tamaño de chunk inválido" }, { status: 400 })
    }

    const expectedSize = end - start + 1
    if (buffer.byteLength !== expectedSize) {
      return NextResponse.json({ error: "El chunk no coincide con el rango enviado" }, { status: 400 })
    }

    const driveResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(buffer.byteLength),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
      body: buffer,
    })

    if (driveResponse.status === 308) {
      return NextResponse.json({
        done: false,
        range: driveResponse.headers.get("range"),
      })
    }

    if (driveResponse.ok) {
      return NextResponse.json({
        done: true,
        file: await driveResponse.json(),
      })
    }

    const text = await driveResponse.text()
    let message = driveResponse.statusText
    try {
      message = JSON.parse(text)?.error?.message || message
    } catch {}

    return NextResponse.json(
      { error: `Google Drive API error: ${message}` },
      { status: driveResponse.status }
    )
  } catch (error) {
    console.error("[DriveUploadChunk] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error subiendo chunk a Drive" },
      { status: 500 }
    )
  }
}
