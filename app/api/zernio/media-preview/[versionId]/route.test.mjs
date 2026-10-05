import test from 'node:test'
import assert from 'node:assert/strict'
import { projectModule } from '../../../../../scripts/lib/load-project-module.mjs'

function preview({ denied = false, revoked = false } = {}) {
  let reads = 0
  const version = { id: 'version', drive_file_id: 'drive-id', file_type: 'video/mp4', file_size: 10,
    asset: { project_id: 'project', access_revoked: revoked } }
  const query = { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: version }) }
  const { GET } = projectModule('app/api/zernio/media-preview/[versionId]/route.ts', {
    '@/lib/sistema/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    '@/lib/sistema/google-drive-backup': {
      extractGoogleDriveFileId: () => null,
      fetchDriveFile: async (_id, { range }) => {
        reads++
        return new Response('original', { status: range ? 206 : 200,
          headers: { 'content-type': 'video/mp4', ...(range ? { 'content-range': 'bytes 0-7/10' } : {}) } })
      },
    },
    '@/lib/zernio/publishing-rules': { ZERNIO_REEL_MAX_SOURCE_BYTES: 250 * 1024 * 1024 },
    '@/lib/zernio/server': {
      getQuepiaSession: async () => ({}),
      assertProjectAccess: async () => { if (denied) throw Object.assign(new Error('Forbidden'), { status: 403 }) },
      ZernioRouteError: class extends Error { constructor(status, message) { super(message); this.status = status } },
      apiErrorResponse: error => ({ status: error.status || 500, message: error.message }),
    },
  })
  return { get: headers => GET(new Request('https://quepia.com/api/zernio/media-preview/version', { headers }), { params: Promise.resolve({ versionId: 'version' }) }), reads: () => reads }
}

test('unchanged video returns 304 after authorization without fetching original bytes', async () => {
  const route = preview()
  const initial = await route.get({})
  assert.equal(initial.status, 200)
  assert.equal(initial.headers.get('cache-control'), 'private, no-cache')
  assert.equal(await initial.text(), 'original')
  const cached = await route.get({ 'if-none-match': initial.headers.get('etag') })
  assert.equal(cached.status, 304)
  assert.equal(route.reads(), 1)
})

test('cached video still rejects denied and revoked access', async () => {
  for (const options of [{ denied: true }, { revoked: true }]) {
    const route = preview(options)
    const response = await route.get({ 'if-none-match': '"drive-version-drive-id"' })
    assert.ok([403, 404].includes(response.status))
    assert.equal(route.reads(), 0)
  }
})

test('range requests retain partial delivery even when ETag matches', async () => {
  const route = preview()
  const response = await route.get({ range: 'bytes=0-7', 'if-none-match': '"drive-version-drive-id"' })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 0-7/10')
  assert.equal(route.reads(), 1)
})
