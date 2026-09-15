import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareTaskThumbnails } from './task-thumbnails.ts'

const fixture = () => [{ id: 'task', titulo: 'Original', assets: [
  { id: 'private', thumbnail_url: 'project/preview.png' },
  { id: 'public', thumbnail_url: 'https://example.com/public.png' },
], type_metadata: { youtube: { thumbnail_path: 'project/youtube.png', title: 'Video' } } }]
const columns = (tasks) => [{ id: 'column', tasks }]

test('private previews are placeholders while public previews remain usable', () => {
  const original = fixture()
  const prepared = prepareTaskThumbnails(original)
  assert.equal(prepared.tasks[0].assets[0].thumbnail_url, null)
  assert.equal(prepared.tasks[0].assets[1].thumbnail_url, 'https://example.com/public.png')
  assert.equal(prepared.tasks[0].type_metadata.youtube.thumbnail_url, null)
  assert.equal(original[0].assets[0].thumbnail_url, 'project/preview.png')
})

test('late previews preserve edits and do not restore deleted tasks', () => {
  const prepared = prepareTaskThumbnails(fixture())
  const current = columns([{ ...prepared.tasks[0], titulo: 'Edited' }])
  const urls = { 'project/preview.png': 'https://signed.example/a', 'project/youtube.png': 'https://signed.example/b' }
  const result = prepared.hydrate(current, urls)
  assert.equal(result[0].tasks[0].titulo, 'Edited')
  assert.equal(result[0].tasks[0].assets[0].thumbnail_url, urls['project/preview.png'])
  assert.equal(result[0].tasks[0].type_metadata.youtube.thumbnail_url, urls['project/youtube.png'])
  assert.deepEqual(prepared.hydrate(columns([]), urls), columns([]))
})

test('a replaced preview is not overwritten by an older signing response', () => {
  const prepared = prepareTaskThumbnails(fixture())
  const task = prepared.tasks[0]
  const current = columns([{ ...task, assets: [{ ...task.assets[0], thumbnail_url: 'https://example.com/new.png' }],
    type_metadata: { youtube: { thumbnail_url: 'https://example.com/new-video.png' } } }])
  const result = prepared.hydrate(current, { 'project/preview.png': 'https://signed.example/old', 'project/youtube.png': 'https://signed.example/old-video' })
  assert.equal(result[0].tasks[0].assets[0].thumbnail_url, 'https://example.com/new.png')
  assert.equal(result[0].tasks[0].type_metadata.youtube.thumbnail_url, 'https://example.com/new-video.png')
})

test('failed or invalid signatures keep placeholders instead of broken relative image requests', () => {
  const prepared = prepareTaskThumbnails(fixture())
  const result = prepared.hydrate(columns(prepared.tasks), { 'project/preview.png': null, 'project/youtube.png': 'project/raw.png' })
  assert.equal(result[0].tasks[0].assets[0].thumbnail_url, null)
  assert.equal(result[0].tasks[0].type_metadata.youtube.thumbnail_url, null)
})
