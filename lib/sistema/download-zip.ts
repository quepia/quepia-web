/** Assemble directly downloadable originals locally; private Drive ZIPs retain the authenticated server path. */
export async function fetchAssetZip(body: Record<string, unknown>): Promise<Blob> {
  const response = await fetch('/api/assets/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, delivery: 'manifest' }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error?.error || 'No se pudo preparar la descarga')
  }
  if (response.headers.get('content-type')?.includes('application/zip')) return response.blob()

  const { downloads, texts } = await response.json() as {
    downloads: Array<{ name: string; url: string }>
    texts: Array<{ name: string; text: string }>
  }
  // Keep memory bounded on mobile devices. Never retry through Vercel on failure.
  const maxBytes = 100 * 1024 * 1024
  let totalBytes = 0
  const entries: Record<string, Uint8Array> = Object.create(null)
  for (const file of downloads) {
    const original = await fetch(file.url, { credentials: 'omit' })
    if (!original.ok || !original.body) throw new Error('No se pudo descargar uno de los archivos')
    const reader = original.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > maxBytes) {
          throw new Error('La selección supera 100 MB. Descargá menos archivos por vez.')
        }
        size += value.byteLength
        chunks.push(value)
      }
    } catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    entries[file.name] = bytes
  }
  for (const file of texts) {
    const bytes = new TextEncoder().encode(file.text)
    totalBytes += bytes.byteLength
    if (totalBytes > maxBytes) throw new Error('La selección supera 100 MB. Descargá menos archivos por vez.')
    entries[file.name] = bytes
  }
  // Images/videos are already compressed; storing them avoids expensive recompression.
  const { zipSync } = await import('fflate')
  return new Blob([new Uint8Array(zipSync(entries, { level: 0 }))], { type: 'application/zip' })
}
