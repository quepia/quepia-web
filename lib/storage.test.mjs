import test from 'node:test'
import assert from 'node:assert/strict'
import { projectModule } from '../scripts/lib/load-project-module.mjs'

test('image uploads retry directly to Storage without sending bytes to a Vercel API', async t => {
  const attempts = []
  const requests = []
  t.mock.method(globalThis, 'setTimeout', fn => { fn(); return 0 })
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push(url)
    assert.equal(url, '/api/storage/upload-url')
    assert.equal(JSON.parse(init.body).filename, 'photo.webp')
    return Response.json({ bucket: 'images', path: 'image.webp', token: 'signed', publicUrl: 'https://storage.example/image.webp' })
  })
  const { uploadImage } = projectModule('lib/storage.ts', {
    '@/lib/supabase/client': { createClient: () => ({ storage: { from: () => ({
      uploadToSignedUrl: async (path, token, file) => {
        attempts.push({ path, token, file })
        return { error: attempts.length < 2 ? new Error('Temporary network error') : null }
      },
    }) } }) },
  })
  const file = new File(['original'], 'photo.webp', { type: 'image/webp' })
  assert.equal(await uploadImage(file), 'https://storage.example/image.webp')
  assert.equal(attempts.length, 2)
  assert.ok(attempts.every(attempt => attempt.file === file))
  assert.equal(requests.length, 2)
})
