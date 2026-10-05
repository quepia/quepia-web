import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { optimizeStorageImage, nearLosslessPng } from './storage-image-optimization.mjs'

test('a PNG masquerading as a preview becomes a real bounded WebP', async () => {
  const input = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: '#235b80aa' } }).png({ compressionLevel: 0 }).toBuffer()
  const result = await optimizeStorageImage(input, { bucket: 'sistema-assets', path: 'project/task/preview/image-800.webp' })
  assert.equal(result.mime, 'image/webp')
  const meta = await sharp(result.buffer).metadata()
  assert.equal(meta.format, 'webp')
  assert.equal(meta.height, 800)
  assert.equal(meta.hasAlpha, true)
  assert.ok(result.buffer.length < input.length / 10)
})

test('original PNG keeps resolution, PNG format and exactly the same alpha channel', async () => {
  const input = await sharp({ create: { width: 720, height: 1080, channels: 4, background: '#358077aa' } }).png({ compressionLevel: 0 }).toBuffer()
  const result = await optimizeStorageImage(input, { bucket: 'sistema-assets', path: 'project/task/original.png' })
  const meta = await sharp(result.buffer).metadata()
  assert.equal(result.mime, 'image/png')
  assert.equal(meta.format, 'png')
  assert.equal(meta.width, 720)
  assert.equal(meta.height, 1080)
  assert.ok(await nearLosslessPng(input, result.buffer))
  const [a, b] = await Promise.all([input, result.buffer].map(x => sharp(x).ensureAlpha().extractChannel(3).raw().toBuffer()))
  assert.deepEqual(a, b)
})

test('fidelity gate rejects color or alpha changes', async () => {
  const image = background => sharp({ create: { width: 8, height: 8, channels: 4, background } }).png().toBuffer()
  const original = await image('#112233aa')
  assert.equal(await nearLosslessPng(original, await image('#ff0033aa')), false)
  assert.equal(await nearLosslessPng(original, await image('#112233bb')), false)
})

test('original creative JPEG deliverables are not recompressed', async () => {
  const input = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#123456' } }).jpeg().toBuffer()
  assert.equal(await optimizeStorageImage(input, { bucket: 'sistema-assets', path: 'project/task/original.jpg' }), null)
})

test('public website JPEG retains its format and does not enlarge a small image', async () => {
  const input = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#123456' } }).jpeg({ quality: 100 }).toBuffer()
  const result = await optimizeStorageImage(input, { bucket: 'project-images', path: 'portfolio/image.jpg' })
  if (result) {
    const meta = await sharp(result.buffer).metadata()
    assert.equal(meta.width, 640)
    assert.equal(meta.height, 480)
    assert.equal(meta.format, 'jpeg')
  }
})
