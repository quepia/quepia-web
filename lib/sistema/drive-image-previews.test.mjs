import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { projectModule } from '../../scripts/lib/load-project-module.mjs'

test('Drive originals produce only bounded WebP display copies in Supabase', async () => {
  const original = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: '#3577aabb' } }).png({ compressionLevel: 0 }).toBuffer()
  const uploads = []
  const { createDriveImagePreviews } = projectModule('lib/sistema/drive-image-previews.ts', {
    '@/lib/sistema/google-drive-backup': { fetchDriveFile: async id => {
      assert.equal(id, 'drive-file')
      return new Response(original)
    } },
    '@/lib/sistema/supabase/admin': { createAdminClient: () => ({ storage: { from: bucket => ({ upload: async (path, buffer, options) => {
      uploads.push({ bucket, path, buffer, options })
      return { error: null }
    } }) } }) },
    '@/lib/sistema/assets-storage': { ASSET_BUCKET: 'sistema-assets' },
  })
  const result = await createDriveImagePreviews({ driveFileId: 'drive-file', projectId: 'project', taskId: 'task', fileType: 'image/png' })
  assert.equal(uploads.length, 2)
  assert.equal(result.thumbnail_path, uploads[0].path)
  assert.equal(result.preview_path, uploads[1].path)
  for (const [i, upload] of uploads.entries()) {
    assert.equal(upload.bucket, 'sistema-assets')
    assert.equal(upload.options.upsert, false)
    assert.equal(upload.options.contentType, 'image/webp')
    const meta = await sharp(upload.buffer).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.hasAlpha, true)
    assert.equal(meta.height, i ? 800 : 200)
    assert.ok(upload.buffer.length < original.length / 10)
  }
})

test('videos are kept in Drive without attempting image processing', async () => {
  const fail = () => { throw new Error('Unexpected read or write') }
  const { createDriveImagePreviews } = projectModule('lib/sistema/drive-image-previews.ts', {
    '@/lib/sistema/google-drive-backup': { fetchDriveFile: fail },
    '@/lib/sistema/supabase/admin': { createAdminClient: fail },
    '@/lib/sistema/assets-storage': { ASSET_BUCKET: 'sistema-assets' },
  })
  assert.deepEqual(await createDriveImagePreviews({ driveFileId: 'drive-file', projectId: 'project', taskId: 'task', fileType: 'video/mp4' }), {
    thumbnail_path: null, preview_path: null,
  })
})
