import test from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync, strFromU8 } from 'fflate'
import { projectModule } from '../../scripts/lib/load-project-module.mjs'

const { fetchAssetZip } = projectModule('lib/sistema/download-zip.ts')

test('browser ZIP downloads originals directly and includes caption with unchanged bytes', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push(url)
    if (url === '/api/assets/zip') {
      assert.equal(JSON.parse(init.body).delivery, 'manifest')
      return Response.json({ downloads: [{ name: 'photo.png', url: 'https://storage.example/photo' }], texts: [{ name: 'copy.txt', text: 'caption' }] })
    }
    assert.equal(init.credentials, 'omit')
    return new Response('original')
  })
  const result = unzipSync(new Uint8Array(await (await fetchAssetZip({ token: 'client' })).arrayBuffer()))
  assert.equal(strFromU8(result['photo.png']), 'original')
  assert.equal(strFromU8(result['copy.txt']), 'caption')
  assert.deepEqual(requests, ['/api/assets/zip', 'https://storage.example/photo'])
})

test('Drive archives still accept the authenticated binary response', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('drive-zip', { headers: { 'Content-Type': 'application/zip' } }))
  assert.equal(await (await fetchAssetZip({})).text(), 'drive-zip')
})

test('direct download failures surface without falling back to Vercel binary traffic', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url)
    return url === '/api/assets/zip'
      ? Response.json({ downloads: [{ name: 'photo.png', url: 'https://storage.example/photo' }], texts: [] })
      : new Response('unavailable', { status: 503 })
  })
  await assert.rejects(fetchAssetZip({}), /No se pudo descargar/)
  assert.deepEqual(requests, ['/api/assets/zip', 'https://storage.example/photo'])
})
