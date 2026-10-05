import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('./asset-upload.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function loadUploads({ sessionError, chunkError, completeError } = {}) {
  const requests = []
  const chunks = []
  const exports = {}
  const unexpected = () => { throw new Error('Unexpected Supabase write') }
  const require = (name) => {
    if (name.endsWith('/assets-storage')) return { ASSET_BUCKET: 'sistema-assets', sanitizeFilename: x => x }
    if (name.endsWith('/actions/assets')) return { serverCreateAsset: unexpected, serverAddVersion: unexpected }
    return { createClient: unexpected }
  }
  const fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) })
    const session = url.endsWith('drive-upload-session')
    const error = session ? sessionError : completeError
    return {
      ok: !error,
      json: async () => error ? { error } : session
        ? { uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' }
        : { assetId: 'asset-id', versionId: 'version-id' },
    }
  }
  class XMLHttpRequest {
    upload = {}
    headers = {}
    open(method, url) {
      assert.equal(method, 'POST')
      assert.equal(url, '/api/assets/drive-upload-chunk')
    }
    setRequestHeader(name, value) { this.headers[name] = value }
    send(blob) {
      chunks.push({ blob, headers: this.headers })
      this.status = chunkError ? 500 : 200
      this.responseText = JSON.stringify(chunkError ? { error: chunkError } : {
        done: Number(this.headers['X-Chunk-End']) + 1 === Number(this.headers['X-File-Size']),
        file: { id: 'drive-id', webViewLink: 'https://drive.google.com/file/d/drive-id/view' },
      })
      this.onload()
    }
  }
  new Function('require', 'exports', 'fetch', 'XMLHttpRequest', compiled)(require, exports, fetch, XMLHttpRequest)
  return { ...exports, requests, chunks }
}

test('default upload preserves all original bytes in Drive, including across chunk boundaries', async () => {
  const uploads = loadUploads()
  const bytes = new Uint8Array(3 * 1024 * 1024 + 37).map((_, index) => index % 251)
  const file = new File([bytes], 'original.png', { type: 'image/png' })
  const result = await uploads.uploadAssetFile({ file, taskId: 'task', projectId: 'project', userId: 'user' })
  assert.equal(result.driveFileId, 'drive-id')
  assert.equal(uploads.chunks.length, 2)
  assert.deepEqual(new Uint8Array(await new Blob(uploads.chunks.map(c => c.blob)).arrayBuffer()), bytes)
  assert.deepEqual(uploads.chunks.map(c => [c.headers['X-Chunk-Start'], c.headers['X-Chunk-End']]), [
    ['0', String(3 * 1024 * 1024 - 1)], [String(3 * 1024 * 1024), String(bytes.length - 1)],
  ])
  const saved = uploads.requests[1].body
  assert.equal(saved.originalFilename, file.name)
  assert.equal(saved.fileSize, bytes.length)
  assert.equal(saved.fileType, 'image/png')
})

test('new versions keep their asset, version and notes when sent to Drive', async () => {
  const uploads = loadUploads()
  await uploads.uploadAssetFile({
    file: new File(['original'], 'image.webp', { type: 'image/webp' }),
    taskId: 'task', projectId: 'project', userId: 'user', assetId: 'existing-asset',
    currentVersion: 4, notes: 'Corrección', assetType: 'carousel', groupId: 'group', groupOrder: 3,
  })
  const saved = uploads.requests[1].body
  assert.equal(saved.assetId, 'existing-asset')
  assert.equal(saved.currentVersion, 4)
  assert.equal(saved.notes, 'Corrección')
  assert.equal(saved.assetType, 'carousel')
  assert.equal(saved.groupId, 'group')
  assert.equal(saved.groupOrder, 3)
})

for (const errorStage of ['sessionError', 'chunkError', 'completeError']) {
  test(`Drive ${errorStage} is surfaced without falling back to Supabase`, async () => {
    const uploads = loadUploads({ [errorStage]: 'Drive unavailable' })
    await assert.rejects(uploads.uploadAssetFile({
      file: new File(['original'], 'image.png', { type: 'image/png' }),
      taskId: 'task', projectId: 'project', userId: 'user',
    }), /Drive unavailable/)
    if (errorStage !== 'completeError') assert.equal(uploads.requests.length, 1)
  })
}
