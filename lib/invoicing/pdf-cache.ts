/** Private, bounded process-local cache. Authorization happens before lookup.
 * Instances do not share this cache; a cold start simply renders again.
 */
export function createPdfCache(maxBytes = 16 * 1024 * 1024, ttlMs = 60 * 60 * 1000) {
  const entries = new Map<string, { bytes: Buffer; expires: number }>()
  const pending = new Map<string, Promise<Buffer>>()
  let size = 0
  const remove = (key: string) => {
    const entry = entries.get(key)
    if (entry) { size -= entry.bytes.length; entries.delete(key) }
  }
  return async (key: string, render: () => Promise<Buffer>): Promise<Buffer> => {
    const now = Date.now()
    for (const [id, entry] of entries) if (entry.expires <= now) remove(id)
    const hit = entries.get(key)
    if (hit) {
      entries.delete(key)
      entries.set(key, hit)
      return hit.bytes
    }
    const inFlight = pending.get(key)
    if (inFlight) return inFlight
    // Bound retained work as well as retained buffers.
    if (pending.size >= 32) return render()
    const work = Promise.resolve().then(render).then(bytes => {
      if (bytes.length <= maxBytes) {
        while (entries.size && (size + bytes.length > maxBytes || entries.size >= 32)) {
          remove(entries.keys().next().value!)
        }
        entries.set(key, { bytes, expires: Date.now() + ttlMs })
        size += bytes.length
      }
      return bytes
    }).finally(() => { pending.delete(key) })
    pending.set(key, work)
    return work
  }
}
