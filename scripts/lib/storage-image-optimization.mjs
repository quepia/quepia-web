import sharp from 'sharp'

export async function optimizeStorageImage(input, { bucket, path }) {
  const meta = await sharp(input).metadata()
  if ((meta.pages || 1) > 1 || !['png', 'jpeg', 'webp'].includes(meta.format)) return null
  if (meta.depth !== 'uchar') return null // Preserve high bit depth originals.
  const derived = bucket === 'sistema-assets' && /\/(thumbs|preview)\//.test(path) && path.endsWith('.webp')
  let output
  let mime
  if (derived) {
    const size = path.includes('/thumbs/') ? 200 : 800
    output = await sharp(input).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 }).toBuffer()
    mime = 'image/webp'
  } else if (meta.format === 'png') {
    // Keep original dimensions and alpha. Palette compression is accepted only
    // when decoded RGB error is tiny and the alpha channel is unchanged.
    output = await sharp(input).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
    try {
      const palette = await sharp(input).png({ palette: true, colours: 256, quality: 100, dither: 1, compressionLevel: 9 }).toBuffer()
      if (palette.length < output.length && await nearLosslessPng(input, palette)) output = palette
    } catch {
      // Some PNGs cannot meet the quantizer's quality constraints. The lossless
      // candidate remains usable; the original must not be compromised.
    }
    mime = 'image/png'
  } else if (meta.format === 'jpeg' && bucket === 'project-images') {
    output = await sharp(input).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true }).toBuffer()
    mime = 'image/jpeg'
  } else {
    // Original creative JPEG/WebP deliverables stay untouched; only their
    // previews and the public website's JPEG images use lossy compression.
    return null
  }
  if (output.length > input.length * 0.95 || input.length - output.length < 1024) return null
  await sharp(output).stats() // Fully decode the candidate before replacing anything.
  return { buffer: output, mime }
}

export async function nearLosslessPng(input, output) {
  const [a, b] = await Promise.all([input, output].map(buffer => sharp(buffer).toColourspace('srgb').ensureAlpha().raw().toBuffer()))
  if (a.length !== b.length) return false
  let squared = 0
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3]) return false
    // Invisible pixels do not affect the displayed image.
    const alpha = a[i + 3] / 255
    for (let c = 0; c < 3; c++) squared += ((a[i + c] - b[i + c]) * alpha) ** 2
  }
  return Math.sqrt(squared / (a.length / 4 * 3)) <= 2
}
