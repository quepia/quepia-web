import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function loadRoute({ sessionError = false, lifecycleError = false } = {}) {
  const calls = []
  const session = { user: { id: 'test' } }
  const exports = {}
  const compiled = ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    '@/lib/mcp/server': { async getMcpWebSession() { calls.push('session'); if (sessionError) throw Error('unauthorized'); return session } },
    '@/lib/mcp/oauth-server': { async getMcpOAuthLifecycle(received) { assert.equal(received, session); calls.push('lifecycle'); if (lifecycleError) throw Error('forbidden'); return { checked: true } } },
    '@/lib/mcp/oauth': { shouldShowMcpSetupPrompt(lifecycle) { assert.equal(lifecycle.checked, true); return true } },
  }
  new Function('require', 'exports', compiled)((name) => modules[name], exports)
  return { ...exports, calls }
}

test('optional notice retains session and lifecycle validation and is never publicly cached', async () => {
  const route = loadRoute()
  const result = await route.GET()
  assert.deepEqual(route.calls, ['session', 'lifecycle'])
  assert.deepEqual(result.body, { showMcpSetup: true })
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
})

test('missing session never reaches the lifecycle query', async () => {
  const route = loadRoute({ sessionError: true })
  assert.deepEqual((await route.GET()).body, { showMcpSetup: false })
  assert.deepEqual(route.calls, ['session'])
})

test('a rejected admin check or upstream failure hides the optional notice', async () => {
  const route = loadRoute({ lifecycleError: true })
  assert.deepEqual((await route.GET()).body, { showMcpSetup: false })
})
