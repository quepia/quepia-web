import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateRawSync } from 'node:zlib'
import { projectModule } from '../../../../scripts/lib/load-project-module.mjs'

function loadRoute({ project = 'project', missing = false } = {}) {
  const fetched = []
  const logged = []
  const versions = [
    { id: 'storage-version', version_number: 1, storage_path: 'project/task/photo.png', file_url: 'project/task/photo.png', original_filename: 'photo.png',
      asset: { id: 'storage-asset', nombre: 'photo', task_id: 'task', project_id: project, access_revoked: false } },
    { id: 'drive-version', version_number: 2, storage_path: null, file_url: 'https://drive.google.com/file/d/drive-id/view', drive_file_id: 'drive-id', original_filename: 'design.webp',
      asset: { id: 'drive-asset', nombre: 'design', task_id: 'task', project_id: project, access_revoked: false } },
  ]
  const admin = { from(table) {
    assert.notEqual(table, 'sistema_asset_zip_cache', 'ZIP caching must not write or read permanent archives')
    const query = {
      select() { return query }, eq() { return query },
      async single() { return { data: { id: 'client', project_id: 'project' }, error: null } },
      async in() { return { data: table === 'sistema_asset_versions' ? versions : [{ id: 'task', titulo: 'task', social_copy: 'caption' }], error: null } },
    }
    return query
  } }
  const route = projectModule('app/api/assets/zip/route.ts', {
    '@/lib/sistema/supabase/admin': { createAdminClient: () => admin },
    '@/lib/sistema/supabase/server': { createClient: () => { throw new Error('Unexpected admin request') } },
    '@/lib/sistema/assets-storage': {
      createSignedUrl: async path => { fetched.push(path); return missing ? null : 'https://storage.example/original' },
      isStoragePath: path => Boolean(path) && !/^https?:/.test(path),
      sanitizeFilename: name => name.toLowerCase().replace(/[^a-z0-9._-]/g, '-'),
    },
    '@/lib/sistema/google-drive-backup': {
      extractGoogleDriveFileId: () => 'drive-id',
      fetchDriveFile: async id => { fetched.push(id); return new Response('drive-original') },
    },
    '@/lib/sistema/actions/assets': { logAssetAccess: async params => logged.push(params) },
  })
  return { ...route, fetched, logged }
}

function unzip(buffer) {
  const end = buffer.length - 22
  assert.equal(buffer.readUInt32LE(end), 0x06054b50)
  let cursor = buffer.readUInt32LE(end + 16)
  const entries = {}
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString()
    const local = buffer.readUInt32LE(cursor + 42)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const compressed = buffer.subarray(start, start + buffer.readUInt32LE(cursor + 20))
    entries[name] = (buffer.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(compressed) : compressed).toString()
    cursor += 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32)
  }
  return entries
}

const request = () => new Request('https://quepia.test/api/assets/zip', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'client-token', versionIds: ['storage-version', 'drive-version'] }) })

test('ZIP contains original bytes from both Storage and Drive plus caption without storing the archive', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('storage-original'))
  const route = loadRoute()
  const response = await route.POST(request())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/zip')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(unzip(Buffer.from(await response.arrayBuffer())), {
    'photo-v1.png': 'storage-original', 'design-v2.webp': 'drive-original', 'copy-task.txt': 'caption',
  })
  assert.deepEqual(route.fetched, ['project/task/photo.png', 'drive-id'])
  assert.equal(route.logged.length, 1)
})

test('cross-project requests cannot fetch any originals', async () => {
  const route = loadRoute({ project: 'other-project' })
  assert.equal((await route.POST(request())).status, 403)
  assert.deepEqual(route.fetched, [])
})

test('a missing original produces an error instead of a partial ZIP', async () => {
  const route = loadRoute({ missing: true })
  assert.equal((await route.POST(request())).status, 502)
  assert.equal(route.logged.length, 0)
})
