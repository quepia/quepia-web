import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('./useAuth.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const profile = { id: 'test-user', is_authorized: true, is_active: true, deleted_at: null }
const session = { user: { id: 'test-user' } }
const tick = () => new Promise(setImmediate)
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function harness({ fetchProfile = async () => ({ ok: true, json: async () => ({ exists: true, user: profile }) }), getSession = async () => ({ data: { session }, error: null }) } = {}) {
  let subscriber
  const effects = [], requests = [], states = [], timers = new Map()
  let timerId = 0
  const client = { auth: {
    getSession,
    onAuthStateChange(fn) { subscriber = fn; return { data: { subscription: { unsubscribe() {} } } } },
  } }
  const react = {
    useState(initial) { const i = states.length; states.push(initial); return [initial, v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
    useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => effects.push(fn),
  }
  const exports = {}
  new Function('require', 'exports', 'fetch', 'setTimeout', 'clearTimeout', compiled)(
    name => name === 'react' ? react : { createClient: () => client }, exports,
    (url, options) => { requests.push({ url, options }); return fetchProfile(url, options) },
    fn => { timers.set(++timerId, fn); return timerId }, id => timers.delete(id),
  )
  const hook = exports.useAuth()
  const cleanup = effects[0]()
  return { hook, cleanup, states, requests, timers, event: (...args) => subscriber(...args) }
}

test('startup loads one profile, never check-tables, and ignores duplicate INITIAL_SESSION', async () => {
  const h = harness()
  h.event('INITIAL_SESSION', session)
  await tick()
  assert.equal(h.requests.length, 1)
  assert.ok(h.requests[0].url.endsWith('type=user'))
  assert.equal(h.requests[0].options.cache, 'no-store')
  assert.ok(h.requests[0].options.signal)
  assert.deepEqual(h.states[1], profile)
  assert.equal(h.states[2], false)
  h.cleanup()
})

test('auth subscriber returns immediately while the profile endpoint is pending', async () => {
  const pending = deferred()
  const h = harness({ fetchProfile: () => pending.promise })
  await tick()
  assert.equal(h.event('TOKEN_REFRESHED', session), undefined)
  assert.equal(h.requests.length, 1, 'concurrent profile reads share one request')
  pending.resolve({ ok: true, json: async () => ({ user: profile }) })
  await tick()
  h.cleanup()
})

test('HTTP 502 is a recoverable access error, not missing database tables', async () => {
  const h = harness({ fetchProfile: async () => ({ ok: false, json: async () => ({ error: 'Bad Gateway' }) }) })
  await tick()
  assert.equal(h.states[3], true)
  assert.equal(h.states[1], null)
  assert.match(h.states[4], /Volvé a intentarlo/)
  assert.equal(h.states[2], false)
  h.cleanup()
})

test('only an explicit successful exists:false response marks tables as missing', async () => {
  const h = harness({ fetchProfile: async () => ({ ok: true, json: async () => ({ exists: false, user: null }) }) })
  await tick()
  assert.equal(h.states[3], false)
  assert.equal(h.states[4], null)
  h.cleanup()
})

test('sign out rejects a late profile response', async () => {
  const pending = deferred()
  const h = harness({ fetchProfile: () => pending.promise })
  await tick()
  h.event('SIGNED_OUT', null)
  pending.resolve({ ok: true, json: async () => ({ user: profile }) })
  await tick()
  assert.equal(h.states[0], null)
  assert.equal(h.states[1], null)
  h.cleanup()
})

test('retry after transient failure performs a fresh request and restores access', async () => {
  let count = 0
  const h = harness({ fetchProfile: async () => { if (++count === 1) throw Error('network'); return { ok: true, json: async () => ({ user: profile }) } } })
  await tick()
  assert.ok(h.states[4])
  await h.hook.retryAuth()
  assert.equal(h.requests.length, 2)
  assert.deepEqual(h.states[1], profile)
  assert.equal(h.states[4], null)
  h.cleanup()
})

test('session timeout releases loading and offers recovery without querying tables', async () => {
  const pending = deferred()
  const h = harness({ getSession: () => pending.promise })
  for (const fire of h.timers.values()) fire()
  await tick()
  assert.equal(h.states[2], false)
  assert.match(h.states[4], /sesión/)
  assert.equal(h.requests.length, 0)
  h.cleanup()
})

test('an old initial session cannot overwrite a newer auth event', async () => {
  const pending = deferred()
  const h = harness({ getSession: () => pending.promise })
  h.event('SIGNED_OUT', null)
  pending.resolve({ data: { session }, error: null })
  await tick()
  assert.equal(h.states[0], null)
  assert.equal(h.requests.length, 0)
  h.cleanup()
})
