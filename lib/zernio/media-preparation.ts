import "server-only"

import sharp from "sharp"
import {
  isZernioMediaFormat,
  ZERNIO_MEDIA_FORMATS,
  type ZernioMediaEdit,
} from "@/lib/zernio/media-formats"

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function normalizeZernioMediaEdit(value: unknown, assetId: string): ZernioMediaEdit | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (String(raw.assetId || "") !== assetId || !isZernioMediaFormat(raw.format)) return null

  return {
    assetId,
    format: raw.format,
    zoom: clamp(finiteNumber(raw.zoom, 1), 1, 3),
    positionX: clamp(finiteNumber(raw.positionX, 50), 0, 100),
    positionY: clamp(finiteNumber(raw.positionY, 50), 0, 100),
  }
}

export async function prepareImageForZernio(input: {
  bytes: ArrayBuffer
  edit: ZernioMediaEdit
}) {
  const preset = ZERNIO_MEDIA_FORMATS[input.edit.format]
  if (!preset.width || !preset.height) return null

  const source = Buffer.from(input.bytes)
  const metadata = await sharp(source, { failOn: "error" }).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error("No se pudieron determinar las dimensiones de la imagen")
  }

  const orientationSwapsAxes = [5, 6, 7, 8].includes(metadata.orientation || 1)
  const sourceWidth = orientationSwapsAxes ? metadata.height : metadata.width
  const sourceHeight = orientationSwapsAxes ? metadata.width : metadata.height
  const targetRatio = preset.width / preset.height
  const sourceRatio = sourceWidth / sourceHeight

  let cropWidth = sourceWidth
  let cropHeight = sourceHeight
  if (sourceRatio > targetRatio) cropWidth = sourceHeight * targetRatio
  else cropHeight = sourceWidth / targetRatio

  cropWidth = clamp(cropWidth / input.edit.zoom, 1, sourceWidth)
  cropHeight = clamp(cropHeight / input.edit.zoom, 1, sourceHeight)

  const width = Math.max(1, Math.min(sourceWidth, Math.round(cropWidth)))
  const height = Math.max(1, Math.min(sourceHeight, Math.round(cropHeight)))
  const left = Math.round((sourceWidth - width) * (input.edit.positionX / 100))
  const top = Math.round((sourceHeight - height) * (input.edit.positionY / 100))

  const output = await sharp(source, { failOn: "error" })
    .rotate()
    .extract({ left, top, width, height })
    .resize(preset.width, preset.height, { fit: "fill" })
    .toColorspace("srgb")
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer()

  const bytes = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer
  return {
    bytes,
    contentType: "image/jpeg",
    suffix: `${input.edit.format}-${preset.width}x${preset.height}.jpg`,
  }
}
