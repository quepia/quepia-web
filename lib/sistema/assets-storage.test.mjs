import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Load the actual server helper with an isolated Storage client; no credentials.
const compiled = ts.transpileModule(readFileSync(new URL('./assets-storage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function loadStorage(response) {
  const calls = []
  const errors = []
  const exports = {}
  const client = { storage: { from(bucket) {
    return { async createSignedUrls(paths, expiresIn) {
      calls.push({ bucket, paths, expiresIn })
      return response
    } }
  } } }
  new Function('require', 'exports', 'console', compiled)(() => ({ createAdminClient: () => client }), exports, { error: (...args) => errors.push(args) })
  return { ...exports, calls, errors }
}

test('batch preserves input order and duplicates while retaining successful files on partial errors', async () => {
  const storage = loadStorage({ error: null, data: [
    { path: 'b.png', signedUrl: null, error: 'Object not found' },
    { path: 'a.png', signedUrl: 'https://signed.example/a', error: null },
  ] })
  assert.deepEqual(await storage.createSignedUrls(['a.png', '', 'b.png', 'a.png', 'missing.png'], 90), [
    { path: 'a.png', url: 'https://signed.example/a' },
    { path: '', url: null },
    { path: 'b.png', url: null },
    { path: 'a.png', url: 'https://signed.example/a' },
    { path: 'missing.png', url: null },
  ])
  assert.deepEqual(storage.calls, [{ bucket: 'sistema-assets', paths: ['a.png', 'b.png', 'missing.png'], expiresIn: 90 }])
  assert.equal(storage.errors.length, 1)
})

test('batch-level failure returns null for every requested file', async () => {
  const storage = loadStorage({ error: { message: 'Gateway Timeout' }, data: null })
  assert.deepEqual(await storage.createSignedUrls(['a.png', 'b.png']), [{ path: 'a.png', url: null }, { path: 'b.png', url: null }])
  assert.equal(storage.calls[0].expiresIn, 172800)
  assert.equal(storage.errors.length, 1)
})

test('empty inputs make no Storage request', async () => {
  const storage = loadStorage({ error: null, data: [] })
  assert.deepEqual(await storage.createSignedUrls([]), [])
  assert.deepEqual(await storage.createSignedUrls(['', '']), [{ path: '', url: null }, { path: '', url: null }])
  assert.equal(storage.calls.length, 0)
})
