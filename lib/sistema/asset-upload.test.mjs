import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('./asset-upload.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function loadUploads({ sessionError, chunkError, completeError, replies = [], sessionUrl } = {}) {
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
        ? { uploadUrl: sessionUrl || 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' }
        : { assetId: 'asset-id', versionId: 'version-id' },
    }
  }
  class XMLHttpRequest {
    upload = {}
    headers = {}
    open(method, url) {
      assert.equal(method, 'PUT')
      assert.equal(url, 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test')
    }
    setRequestHeader(name, value) { this.headers[name] = value }
    getResponseHeader(name) {
      return name === 'Range' ? this.range : null
    }
    send(blob) {
      chunks.push({ blob, headers: this.headers })
      const reply = replies.shift()
      if (reply) {
        if (reply.networkError) { this.onerror(); return }
        this.status = reply.status
        this.range = reply.range
        this.responseText = JSON.stringify(reply.file || {})
        this.onload()
        return
      }
      const match = this.headers['Content-Range'].match(/^bytes (\d+)-(\d+)\/(\d+)$/)
      assert.ok(match)
      const done = Number(match[2]) + 1 === Number(match[3])
      this.range = `bytes=0-${match[2]}`
      this.status = chunkError ? 400 : done ? 200 : 308
      this.responseText = JSON.stringify(chunkError ? { error: { message: chunkError } } : done ? {
        id: 'drive-id', webViewLink: 'https://drive.google.com/file/d/drive-id/view',
      } : {})
      this.onload()
    }
  }
  new Function('require', 'exports', 'fetch', 'XMLHttpRequest', 'setTimeout', compiled)(require, exports, fetch, XMLHttpRequest, callback => callback())
  return { ...exports, requests, chunks }
}

test('default upload preserves all original bytes in Drive, including across chunk boundaries', async () => {
  const uploads = loadUploads()
  const bytes = new Uint8Array(8 * 1024 * 1024 + 37).map((_, index) => index % 251)
  const file = new File([bytes], 'original.png', { type: 'image/png' })
  const result = await uploads.uploadAssetFile({ file, taskId: 'task', projectId: 'project', userId: 'user' })
  assert.equal(result.driveFileId, 'drive-id')
  assert.equal(uploads.chunks.length, 2)
  assert.deepEqual(new Uint8Array(await new Blob(uploads.chunks.map(c => c.blob)).arrayBuffer()), bytes)
  assert.deepEqual(uploads.chunks.map(c => c.headers['Content-Range']), [
    `bytes 0-${8 * 1024 * 1024 - 1}/${bytes.length}`,
    `bytes ${8 * 1024 * 1024}-${bytes.length - 1}/${bytes.length}`,
  ])
  assert.equal(uploads.requests.length, 2, 'Vercel receives only session and completion metadata')
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


test('an interrupted upload queries Drive and resumes from its confirmed offset', async () => {
  const uploads = loadUploads({ replies: [
    { networkError: true },
    { status: 308, range: 'bytes=0-262143' },
    { status: 200, file: { id: 'drive-id' } },
  ] })
  const file = new File([new Uint8Array(524288)], 'video.mp4', { type: 'video/mp4' })
  await uploads.uploadAssetFile({ file, taskId: 'task', projectId: 'project', userId: 'user' })
  assert.equal(uploads.chunks[1].blob, null)
  assert.equal(uploads.chunks[1].headers['Content-Range'], 'bytes */524288')
  assert.equal(uploads.chunks[2].headers['Content-Range'], 'bytes 262144-524287/524288')
  assert.equal(uploads.chunks[2].blob.size, 262144)
})

test('network recovery is bounded and never falls back to a Vercel binary upload', async () => {
  const uploads = loadUploads({ replies: Array.from({ length: 4 }, () => ({ networkError: true })) })
  await assert.rejects(uploads.uploadAssetFile({
    file: new File(['original'], 'image.png', { type: 'image/png' }),
    taskId: 'task', projectId: 'project', userId: 'user',
  }), /No se pudo subir/)
  assert.equal(uploads.chunks.length, 4)
  assert.equal(uploads.requests.length, 1)
})

test('a foreign upload URL is rejected before sending original bytes', async () => {
  const uploads = loadUploads({ sessionUrl: 'https://example.com/upload/drive/v3/files' })
  await assert.rejects(uploads.uploadAssetFile({
    file: new File(['original'], 'image.png', { type: 'image/png' }),
    taskId: 'task', projectId: 'project', userId: 'user',
  }), /URL de subida inválida/)
  assert.equal(uploads.chunks.length, 0)
})
