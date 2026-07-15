import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { stat, unlink } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"
import { verifyContentCopilotMediaToken } from "@/lib/ai/content-copilot-media"
import { extractGoogleDriveFileId, fetchDriveFile } from "@/lib/sistema/google-drive-backup"
import { createAdminClient } from "@/lib/sistema/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface RouteContext {
  params: Promise<{ versionId: string }>
}

const MODEL_VIDEO_MAX_BYTES = 15 * 1024 * 1024
const ffmpegPath = join(process.cwd(), "vendor", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")

async function removeFile(path: string) {
  await unlink(path).catch(() => undefined)
}

async function runFfmpeg(inputPath: string, outputPath: string) {
  const executable = ffmpegPath
  if (!executable) throw new Error("FFmpeg is not available")

  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [
      "-nostdin",
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-t", "60",
      "-map", "0:v:0?",
      "-map", "0:a:0?",
      "-vf", "scale=720:-2:force_original_aspect_ratio=decrease",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", "1200k",
      "-maxrate", "1400k",
      "-bufsize", "2400k",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "64k",
      "-movflags", "+faststart",
      outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${String(chunk)}`.slice(-8_000)
    })
    child.once("error", reject)
    child.once("close", (code: number | null) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
    })
  })
}

async function createModelVideoResponse(driveFileId: string) {
  const basePath = `/tmp/content-copilot-${randomUUID()}`
  const inputPath = `${basePath}.input`
  const outputPath = `${basePath}.mp4`

  try {
    const driveResponse = await fetchDriveFile(driveFileId)
    if (!driveResponse.body) throw new Error("Google Drive returned an empty video")

    await pipeline(
      Readable.fromWeb(driveResponse.body as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(inputPath),
    )
    await runFfmpeg(inputPath, outputPath)
    await removeFile(inputPath)

    const outputStat = await stat(outputPath)
    if (outputStat.size > MODEL_VIDEO_MAX_BYTES) {
      throw new Error("The model-ready video exceeds Vertex's 15 MB fetch limit")
    }

    const fileStream = createReadStream(outputPath)
    fileStream.once("close", () => void removeFile(outputPath))
    return new Response(Readable.toWeb(fileStream) as ReadableStream<Uint8Array>, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "video/mp4",
        "Content-Length": String(outputStat.size),
      },
    })
  } catch (error) {
    await Promise.all([removeFile(inputPath), removeFile(outputPath)])
    throw error
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { versionId } = await context.params
    const url = new URL(request.url)
    const expires = url.searchParams.get("expires") || ""
    const signature = url.searchParams.get("signature") || ""

    if (!verifyContentCopilotMediaToken(versionId, expires, signature)) {
      return NextResponse.json({ error: "Acceso inválido o vencido" }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: version, error } = await admin
      .from("sistema_asset_versions")
      .select("drive_file_id, file_url, file_type, original_filename")
      .eq("id", versionId)
      .single()

    if (error || !version) {
      return NextResponse.json({ error: "Asset no encontrado" }, { status: 404 })
    }

    const driveFileId = version.drive_file_id || extractGoogleDriveFileId(version.file_url || "")
    if (!driveFileId) {
      return NextResponse.json({ error: "El asset no es un archivo de Google Drive" }, { status: 422 })
    }

    if (url.searchParams.get("analysis") === "1" && version.file_type?.startsWith("video/")) {
      return createModelVideoResponse(driveFileId)
    }

    const driveResponse = await fetchDriveFile(driveFileId, {
      range: request.headers.get("range"),
    })
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": driveResponse.headers.get("content-type") || version.file_type || "application/octet-stream",
      "Accept-Ranges": driveResponse.headers.get("accept-ranges") || "bytes",
    })

    for (const header of ["content-length", "content-range"]) {
      const value = driveResponse.headers.get(header)
      if (value) headers.set(header, value)
    }

    return new Response(driveResponse.body, {
      status: driveResponse.status,
      headers,
    })
  } catch (error) {
    console.error("[ContentCopilotMedia] Error:", error)
    return NextResponse.json({ error: "No se pudo cargar el media" }, { status: 500 })
  }
}
