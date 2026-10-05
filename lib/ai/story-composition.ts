import sharp, { type OverlayOptions } from "sharp"
import { STORY_FORMATS, type StorySettings } from "./stories"

export function escapeSvg(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!)
}
export function wrapStoryText(text: string, maxChars = 25) {
  const lines: string[] = []
  for (const paragraph of text.split(/\n/)) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = "" }
      // Break unusually long words instead of overflowing the safe zone.
      let rest = word
      while (rest.length > maxChars) {
        if (line) { lines.push(line); line = "" }
        lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars)
      }
      line = line ? `${line} ${rest}` : rest
    }
    if (line) lines.push(line)
  }
  return lines
}

export async function composeStory(base: Buffer, settings: StorySettings, logo?: Buffer | null) {
  const { width, height } = STORY_FORMATS[settings.format]
  const image = await sharp(base, { limitInputPixels: 40_000_000 }).rotate()
    .resize(width, height, { fit: settings.mode === "faithful" ? "contain" : "cover", background: settings.backgroundColor })
    .png().toBuffer()
  const layers: OverlayOptions[] = []
  const lines = wrapStoryText(settings.headline)
  const fontSize = settings.format === "square" ? 54 : 64
  const lineHeight = fontSize * 1.15
  const safeY = settings.format === "story" ? 260 : 100
  const textHeight = lines.length * lineHeight + (settings.cta ? 75 : 0)
  const y = settings.headlinePosition === "top" ? safeY + fontSize : height - safeY - textHeight + fontSize
  if (lines.length || settings.cta) {
    const text = lines.map((line, i) => `<text x="80" y="${y + i * lineHeight}" font-size="${fontSize}" font-weight="700">${escapeSvg(line)}</text>`).join("")
    const cta = settings.cta ? `<text x="80" y="${y + lines.length * lineHeight + 30}" font-size="38" font-weight="500">${escapeSvg(settings.cta)}</text>` : ""
    layers.push({ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${Math.max(0,y-fontSize-45)}" width="${width}" height="${textHeight+100}" fill="#000000" opacity="0.58"/><g font-family="sans-serif" fill="${settings.textColor}">${text}${cta}</g></svg>`), top: 0, left: 0 })
  }
  if (logo && settings.includeLogo) {
    const resized = await sharp(logo, { limitInputPixels: 20_000_000 }).rotate().resize(230, 130, { fit: "inside", withoutEnlargement: true }).png().toBuffer()
    const dimensions = await sharp(resized).metadata()
    layers.push({ input: resized, top: safeY - 100, left: width - (dimensions.width || 230) - 80 })
  }
  return sharp(image).composite(layers).png().toBuffer()
}
