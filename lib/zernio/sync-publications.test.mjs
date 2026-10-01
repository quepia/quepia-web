import assert from 'node:assert/strict'
import test from 'node:test'
import { projectModule } from '../../scripts/lib/load-project-module.mjs'

function fixture(posts, provider) {
  const updates = []
  const filters = []
  const db = { from(table) {
    let update, id
    const query = {
      select() { if (update) return Promise.resolve({ data: [{ id }], error: null }); return query },
      in(field, values) { filters.push([field, values]); return query },
      not() { return query }, order() { return query },
      limit() { return Promise.resolve({ data: posts, count: posts.length, error: null }) },
      update(value) { update = value; return query },
      eq(field, value) { if (field === 'id') { id = value; updates.push({ id, table, ...update }) }; return query },
      then(resolve) { resolve({ data: [], error: null }) },
    }
    return query
  } }
  const syncModule = projectModule('lib/zernio/sync-publications.ts', {
    '@/lib/sistema/supabase/admin': { createAdminClient: () => db },
    './client': { zernioRequest: provider },
  })
  return { syncModule, updates, filters }
}
const row = (id) => ({ id, zernio_post_id: id, status: 'scheduled', updated_at: 'old', asset_ids: [], task: { titulo: id } })

test('Provider-confirmed publication replaces stale scheduled state and timing', async () => {
  const { syncModule, updates, filters } = fixture([row('old'), row('brandalise')], async (path) => ({ post: path.endsWith('/old')
    ? { status: 'published', scheduledFor: '2026-08-21T13:00:00Z', content: 'Published copy' }
    : { status: 'scheduled', scheduledFor: '2026-10-02T22:30:00Z', content: 'Reel copy' } }))
  const result = await syncModule.syncPendingPublications()
  assert.equal(result.failed, 0)
  assert.equal(updates.find(item => item.id === 'old').status, 'published')
  assert.equal(updates.find(item => item.id === 'brandalise').scheduled_for, '2026-10-02T22:30:00.000Z')
  assert.deepEqual(result.changes.map(item => item.id), ['old'])
  assert.deepEqual(filters[0], ['status', ['preparing', 'scheduled', 'publishing', 'partial']])
})

test('Provider failure never certifies a local scheduled record', async () => {
  const { syncModule, updates } = fixture([row('unreachable')], async () => { throw new Error('timeout') })
  const result = await syncModule.syncPendingPublications()
  assert.equal(result.failed, 1)
  assert.deepEqual(result.verifiedIds, [])
  assert.deepEqual(updates, [])
})
