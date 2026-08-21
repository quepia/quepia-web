import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFile, stat, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"

const MAX_REEL_BYTES = 100 * 1024 * 1024
const MIN_REEL_SECONDS = 3
const MAX_REEL_SECONDS = 90
const ffmpegPath = join(process.cwd(), "vendor", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")

type ReelProbe = {
  duration: number
  codec: string | null
  audioCodec: string | null
  width: number | null
  height: number | null
  frameRate: number | null
}

function removeFile(filePath: string) {
  return unlink(filePath).catch(() => undefined)
}

function runFfmpeg(args: string[], acceptNonZero = false) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${String(chunk)}`.slice(-16_000)
    })
    child.once("error", reject)
    child.once("close", (code: number | null) => {
      if (code === 0 || acceptNonZero) resolve(stderr)
      else reject(new Error(`FFmpeg terminó con código ${code}: ${stderr}`))
    })
  })
}

async function probeReel(inputPath: string): Promise<ReelProbe> {
  const output = await runFfmpeg([
    "-nostdin",
    "-hide_banner",
    "-i", inputPath,
  ], true)
  const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i)
  const videoMatch = output.match(/Video:\s*([^,\s]+)[^\n]*?(\d{2,5})x(\d{2,5})/i)
  const audioMatch = output.match(/Audio:\s*([^,\s]+)/i)
  const frameRateMatch = output.match(/Video:[^\n]*?([\d.]+)\s*fps/i)
  if (!durationMatch || !videoMatch) throw new Error("No se pudieron leer la duración o las dimensiones del Reel")

  const duration = (Number(durationMatch[1]) * 3600) + (Number(durationMatch[2]) * 60) + Number(durationMatch[3])
  if (!Number.isFinite(duration) || duration < MIN_REEL_SECONDS || duration > MAX_REEL_SECONDS) {
    throw new Error(`El Reel debe durar entre ${MIN_REEL_SECONDS} y ${MAX_REEL_SECONDS} segundos`)
  }

  return {
    duration,
    codec: videoMatch[1]?.toLowerCase() || null,
    audioCodec: audioMatch?.[1]?.toLowerCase() || null,
    width: Number(videoMatch[2]) || null,
    height: Number(videoMatch[3]) || null,
    frameRate: Number(frameRateMatch?.[1]) || null,
  }
}

export async function prepareReelForZernio(bytes: ArrayBuffer) {
  if (bytes.byteLength > MAX_REEL_BYTES) {
    throw new Error("El Reel supera el límite de 100 MB del sistema de publicación")
  }

  const basePath = join("/tmp", `zernio-reel-${randomUUID()}`)
  const inputPath = `${basePath}.input`
  const outputPath = `${basePath}.mp4`

  try {
    await writeFile(inputPath, Buffer.from(bytes))
    const source = await probeReel(inputPath)
    await runFfmpeg([
      "-nostdin",
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-maxrate", "8M",
      "-bufsize", "16M",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "48000",
      "-movflags", "+faststart",
      outputPath,
    ])

    const outputStat = await stat(outputPath)
    if (outputStat.size > MAX_REEL_BYTES) {
      throw new Error("El Reel preparado supera el límite de 100 MB del sistema de publicación")
    }
    const normalized = await probeReel(outputPath)
    if (
      normalized.codec !== "h264"
      || normalized.width !== 1080
      || normalized.height !== 1920
      || normalized.frameRate === null
      || Math.abs(normalized.frameRate - 30) > 0.1
    ) {
      throw new Error("No se pudo normalizar el Reel a H.264, 1080 × 1920 y 30 fps")
    }
    const output = await readFile(outputPath)
    return {
      bytes: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer,
      contentType: "video/mp4",
      suffix: "reel-h264-1080x1920.mp4",
      source,
      normalized,
    }
  } finally {
    await Promise.all([removeFile(inputPath), removeFile(outputPath)])
  }
}
