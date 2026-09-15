import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const activeProfile = { id: 'requester', nombre: 'Tester', role: 'user', is_active: true, is_authorized: true, deleted_at: null }

function loadRoute({ profile = activeProfile, authUser = { id: 'requester' }, authError = null, resolve } = {}) {
  const calls = []
  let authCalls = 0
  const client = {
    from(table) {
      const query = { table, filters: [] }
      const builder = {
        select(columns) { query.columns = columns; return builder },
        eq(key, value) { query.filters.push([key, value]); return builder },
        in(key, value) { query.filters.push([key, value]); return builder },
        order() { return builder },
        limit() { return builder },
        single() { return builder },
        then(accept, reject) {
          calls.push(query)
          const response = resolve?.(query) ?? { data: table === 'sistema_users' ? profile : [], error: null }
          return Promise.resolve(response).then(accept, reject)
        },
      }
      return builder
    },
  }
  const exports = {}
  const modules = {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@supabase/supabase-js': { createClient: () => client },
    'resend': { Resend: class {} },
    'next/cache': { unstable_cache: (callback) => callback },
    '@/lib/sistema/email-config': { getEmailFromAddress: () => '' },
    '@/lib/sistema/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => { authCalls++; return { data: { user: authUser }, error: authError } } },
    }) },
  }
  new Function('require', 'exports', 'console', compiled)((name) => {
    assert.ok(name in modules, name)
    return modules[name]
  }, exports, { error() {} })
  return { calls, authCalls: () => authCalls, get: (query) => exports.GET(new Request('https://example.test/api/sistema-data?' + query)) }
}

test('own full profile uses a single query and remains private', async () => {
  for (const query of ['type=user', 'type=user&userId=requester']) {
    const route = loadRoute()
    const response = await route.get(query)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { exists: true, user: activeProfile })
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(route.authCalls(), 1)
    assert.equal(route.calls.length, 1)
    assert.equal(route.calls[0].columns, '*')
  }
})

test('own project lookup reuses authenticated role', async () => {
  const route = loadRoute()
  assert.equal((await route.get('type=tasks&force=true')).status, 200)
  assert.equal(route.calls.filter(q => q.table === 'sistema_users').length, 1)
  assert.deepEqual(route.calls.filter(q => q.table !== 'sistema_users').map(q => q.filters), [
    [['owner_id', 'requester']], [['user_id', 'requester']],
  ])
})

test('admin querying another user resolves target role and restricts tasks to target projects', async () => {
  const route = loadRoute({
    profile: { ...activeProfile, role: 'admin' },
    resolve(query) {
      if (query.table === 'sistema_users' && query.filters[0]?.[1] === 'target') return { data: { role: 'user' }, error: null }
      if (query.table === 'sistema_projects') {
        assert.deepEqual(query.filters, [['owner_id', 'target']])
        return { data: [{ id: 'target-project' }], error: null }
      }
    },
  })
  assert.equal((await route.get('type=tasks&userId=target&force=true')).status, 200)
  assert.equal(route.calls.filter(q => q.table === 'sistema_users').length, 2)
  assert.deepEqual(route.calls.find(q => q.table === 'sistema_tasks').filters, [['project_id', ['target-project']]])
})

test('admin requesting a different profile returns target instead of requester', async () => {
  const target = { ...activeProfile, id: 'target', nombre: 'Target' }
  const route = loadRoute({
    profile: { ...activeProfile, role: 'admin' },
    resolve: q => q.table === 'sistema_users' && q.filters[0]?.[1] === 'target' ? { data: target, error: null } : undefined,
  })
  const response = await route.get('type=user&userId=target')
  assert.deepEqual(await response.json(), { exists: true, user: target })
  assert.equal(route.calls.length, 2)
})

test('unauthenticated, inactive, revoked and cross-user non-admin requests are denied before data queries', async () => {
  for (const [options, query, status, count] of [
    [{ authUser: null }, 'type=user', 401, 0],
    [{ authError: { message: 'expired' } }, 'type=user', 401, 0],
    [{ profile: { ...activeProfile, is_active: false } }, 'type=user', 403, 1],
    [{ profile: { ...activeProfile, is_authorized: false } }, 'type=tasks', 403, 1],
    [{ profile: { ...activeProfile, deleted_at: '2026-01-01' } }, 'type=user', 403, 1],
    [{}, 'type=user&userId=target', 403, 1],
  ]) {
    const route = loadRoute(options)
    assert.equal((await route.get(query)).status, status)
    assert.equal(route.calls.length, count)
  }
})

test('profile failures distinguish missing tables from temporary database errors', async () => {
  for (const [code, status, exists] of [['42P01', 200, false], ['57014', 500, undefined], ['PGRST116', 403, undefined]]) {
    const route = loadRoute({ resolve: () => ({ data: null, error: { code, message: 'database failure' } }) })
    const response = await route.get('type=user')
    assert.equal(response.status, status)
    assert.equal((await response.json()).exists, exists)
  }
})

test('check-tables never reports exists true on an operational failure', async () => {
  for (const [error, status, body] of [
    [null, 200, { exists: true }],
    [{ code: '42P01' }, 200, { exists: false }],
    [{ code: '57014' }, 500, { error: 'Unable to check system tables' }],
  ]) {
    const route = loadRoute({ resolve: () => ({ data: null, error }) })
    const response = await route.get('type=check-tables')
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), body)
  }
})
