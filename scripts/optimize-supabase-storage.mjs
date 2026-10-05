import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, fsyncSync, closeSync, appendFileSync } from 'node:fs'
import { resolve, dirname, sep } from 'node:path'
import { optimizeStorageImage } from './lib/storage-image-optimization.mjs'

config({ path: '.env.local', quiet: true })
const args = process.argv.slice(2)
const value = name => args.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1)
const backupDir = value('--backup-dir')
if (!backupDir) throw new Error('--backup-dir is required; originals must be backed up outside Supabase')
const root = resolve(backupDir)
const inventory = JSON.parse(readFileSync(resolve(root, 'inventory.json'), 'utf8'))
const execute = args.includes('--execute')
const limit = Number(value('--limit') || inventory.length)
const workers = Math.min(8, Math.max(1, Number(value('--workers') || 8)))
if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(workers)) throw new Error('Invalid limit or worker count')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase configuration')
if (new URL(supabaseUrl).hostname !== 'luhbezpflvmevorbayai.supabase.co') throw new Error('Inventory belongs to a different project')
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
const queue = inventory.filter(o => ['sistema-assets', 'project-images'].includes(o.bucket) && /^image\/(png|jpeg|webp)$/.test(o.mime || ''))
  .sort((a, b) => Number(b.path.includes('/preview/')) - Number(a.path.includes('/preview/')) || b.bytes - a.bytes).slice(0, limit)
const totals = { execute, inspected: 0, replaced: 0, candidates: 0, savedBytes: 0, failures: 0, resumed: 0 }

async function download(bucket, path) {
  // The SDK download URL can return a cached pre-update object. A unique query
  // verifies the actual replacement rather than an old CDN copy.
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = new URL(`/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`, supabaseUrl)
  url.searchParams.set('verification', randomUUID())
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60000), headers: {
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Cache-Control': 'no-cache',
  } })
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function durableWrite(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data, { flag: 'wx', mode: 0o600 })
  const fd = openSync(path, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}

async function processObject(o) {
  if (typeof o.path !== 'string' || !o.path || o.path.split('/').some(p => p === '..' || p === '.')) throw new Error('Unsafe storage path')
  const originalFile = resolve(root, 'originals', o.bucket, o.path)
  if (!originalFile.startsWith(resolve(root, 'originals') + sep)) throw new Error('Unsafe backup path')
  const recordFile = resolve(root, 'records', `${hash(Buffer.from(`${o.bucket}/${o.path}`))}.json`)
  const store = supabase.storage.from(o.bucket)
  const current = await download(o.bucket, o.path)
  const currentHash = hash(current)
  let pendingRecord = null
  if (existsSync(recordFile)) {
    const record = JSON.parse(readFileSync(recordFile, 'utf8'))
    if (record.optimizedSha256 === currentHash) {
      if (hash(readFileSync(originalFile)) !== record.originalSha256) throw new Error('Original backup checksum mismatch')
      totals.resumed++
      return
    }
    if (record.originalSha256 !== currentHash) throw new Error('Object changed since previous replacement; review before running again')
    pendingRecord = record
  }
  const result = await optimizeStorageImage(current, o)
  if (!result) return
  if (existsSync(originalFile)) {
    if (hash(readFileSync(originalFile)) !== currentHash) throw new Error('Existing backup differs from current file')
  } else durableWrite(originalFile, current)
  if (hash(readFileSync(originalFile)) !== currentHash) throw new Error('Backup verification failed')
  totals.candidates++
  const saved = current.length - result.buffer.length
  if (!execute) { totals.savedBytes += saved; return }
  // Re-read before the write to avoid replacing a changed object.
  if (hash(await download(o.bucket, o.path)) !== currentHash) throw new Error('Concurrent modification detected')
  const record = { bucket: o.bucket, path: o.path, originalMime: o.mime, originalBytes: current.length, originalSha256: currentHash,
    optimizedMime: result.mime, optimizedBytes: result.buffer.length, optimizedSha256: hash(result.buffer), replacedAt: new Date().toISOString() }
  // Persist recovery information before the remote write, even if interrupted.
  if (pendingRecord) {
    if (pendingRecord.optimizedSha256 !== record.optimizedSha256) throw new Error('Optimization changed since interrupted run; review recovery record')
  } else durableWrite(recordFile, JSON.stringify(record, null, 2))
  const { error } = await store.update(o.path, result.buffer, { contentType: result.mime, cacheControl: '0', upsert: false })
  if (error) throw new Error(error.message)
  if (hash(await download(o.bucket, o.path)) !== record.optimizedSha256) {
    const rollback = await store.update(o.path, current, { contentType: o.mime, cacheControl: '0', upsert: false })
    if (rollback.error || hash(await download(o.bucket, o.path)) !== currentHash) throw new Error('Verification AND rollback failed; original is backed up locally')
    throw new Error('Verification failed; original restored')
  }
  totals.replaced++
  totals.savedBytes += saved
  appendFileSync(resolve(root, 'verified-replacements.jsonl'), JSON.stringify(record) + '\n', { mode: 0o600 })
}

let index = 0
let interrupted = false
process.on('SIGINT', () => { interrupted = true })
process.on('SIGTERM', () => { interrupted = true })
await Promise.all(Array.from({ length: workers }, async () => {
  while (index < queue.length && totals.failures < 3 && !interrupted) {
    const object = queue[index++]
    try { await processObject(object) } catch (error) {
      totals.failures++
      console.error(JSON.stringify({ bucket: object.bucket, path: object.path, error: error.message }))
    }
    totals.inspected++
    if (totals.inspected % 25 === 0) console.log(JSON.stringify({ ...totals, savedMB: +(totals.savedBytes / 1e6).toFixed(2) }))
  }
}))
const summary = { ...totals, interrupted, savedMB: +(totals.savedBytes / 1e6).toFixed(2), backupDir: root }
writeFileSync(resolve(root, execute ? 'execution-summary.json' : 'estimate-summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary))
if (totals.failures) process.exitCode = 1
