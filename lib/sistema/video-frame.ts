import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * Frame extraction for reel covers. Runs the bundled ffmpeg so the cover comes
 * from the exact video that will be published, without asking the browser to
 * decode (and taint a canvas with) a cross-origin signed URL.
 */

const ffmpegPath = join(process.cwd(), "vendor", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")

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

function removeFile(filePath: string) {
    return unlink(filePath).catch(() => undefined)
}

function parseDuration(output: string): number | null {
    const match = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i)
    if (!match) return null
    const seconds = (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3])
    return Number.isFinite(seconds) ? seconds : null
}

export type ExtractedFrame = {
    bytes: Buffer
    contentType: "image/jpeg"
    /** Duration of the source video, so the caller can bound the time slider. */
    durationSeconds: number | null
}

/**
 * Grabs a single JPEG frame at `timeSeconds`, scaled to at most 1080px wide.
 */
export async function extractVideoFrame(source: ArrayBuffer, timeSeconds: number): Promise<ExtractedFrame> {
    const basePath = join("/tmp", `reel-cover-${randomUUID()}`)
    const inputPath = `${basePath}.input`
    const outputPath = `${basePath}.jpg`

    try {
        await writeFile(inputPath, Buffer.from(source))
        const probe = await runFfmpeg(["-nostdin", "-hide_banner", "-i", inputPath], true)
        const durationSeconds = parseDuration(probe)

        const safeTime = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0)
        const clampedTime = durationSeconds ? Math.min(safeTime, Math.max(0, durationSeconds - 0.05)) : safeTime

        await runFfmpeg([
            "-nostdin",
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            // Seeking before -i keeps this fast even on long files.
            "-ss", clampedTime.toFixed(3),
            "-i", inputPath,
            "-frames:v", "1",
            "-vf", "scale='min(1080,iw)':-2",
            "-q:v", "3",
            outputPath,
        ])

        const bytes = await readFile(outputPath)
        if (bytes.byteLength === 0) throw new Error("El frame extraído quedó vacío")

        return { bytes, contentType: "image/jpeg", durationSeconds }
    } finally {
        await Promise.all([removeFile(inputPath), removeFile(outputPath)])
    }
}
