import { chmod, copyFile, mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const source = require("ffmpeg-static")
if (!source) throw new Error("ffmpeg-static did not provide an executable")

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const destination = join(projectRoot, "vendor", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")

await mkdir(dirname(destination), { recursive: true })
await copyFile(source, destination)
if (process.platform !== "win32") await chmod(destination, 0o755)

console.log(`Prepared FFmpeg for ${process.platform}-${process.arch}`)
