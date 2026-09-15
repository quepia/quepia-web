import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { prepareTaskThumbnails } from '../task-thumbnails.ts'

const compiled = ts.transpileModule(readFileSync(new URL('./useTasks.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function harness(signing) {
  const states = []
  const effects = []
  const requests = []
  const react = {
    useState(initial) { const index = states.length; states.push(initial); return [initial, (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
    useRef: (current) => ({ current }), useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
  }
  const client = { from(table) {
    requests.push(table)
    const result = table === 'sistema_columns' ? [{ id: 'column' }] : table === 'sistema_subtasks' ? [] : [{
      id: 'task', column_id: 'column', titulo: 'Example', completed: false,
      assets: [{ id: 'asset', current_version: 1, versions: [{ version_number: 1, storage_path: 'project/file.png' }] }],
    }]
    const builder = { select() { return this }, eq() { return this }, order() { return this }, in() { return this }, abortSignal() { return this },
      then(resolve, reject) { return Promise.resolve({ data: result, error: null }).then(resolve, reject) } }
    return builder
  } }
  const exports = {}
  const require = (name) => name === 'react' ? react : name.endsWith('/supabase/client') ? { createClient: () => client } : name.endsWith('/task-thumbnails') ? { prepareTaskThumbnails } : {}
  new Function('require', 'exports', 'fetch', 'window', compiled)(require, exports, signing, { setTimeout() {} })
  const hook = exports.useTasks('project')
  return { hook, states, effects, requests }
}

test('the actual hook publishes tasks while signing is still pending', async () => {
  let finishSigning
  const signing = new Promise((resolve) => { finishSigning = resolve })
  const h = harness(() => signing)
  await h.hook.silentRefresh()
  assert.equal(h.states[1], false)
  assert.equal(h.states[0][0].tasks[0].titulo, 'Example')
  assert.equal(h.states[0][0].tasks[0].assets[0].thumbnail_url, null)
  finishSigning({ ok: true, json: async () => ({ urls: { 'project/file.png': 'https://signed.example/preview' } }) })
  await new Promise(setImmediate)
  assert.equal(h.states[0][0].tasks[0].assets[0].thumbnail_url, 'https://signed.example/preview')
  assert.deepEqual(h.requests, ['sistema_columns', 'sistema_tasks', 'sistema_subtasks'])
})

test('signing failure does not turn usable tasks into a board error', async () => {
  const h = harness(async () => { throw new Error('Gateway Timeout') })
  await h.hook.silentRefresh()
  await new Promise(setImmediate)
  assert.equal(h.states[1], false)
  assert.equal(h.states[2], null)
  assert.equal(h.states[0][0].tasks.length, 1)
})

test('an immediate post-mutation refresh reads fresh data instead of a completed snapshot', async () => {
  const h = harness(async () => ({ ok: true, json: async () => ({ urls: {} }) }))
  await h.hook.silentRefresh()
  await h.hook.silentRefresh()
  assert.equal(h.requests.filter(table => table === 'sistema_tasks').length, 2)
})

test('unmount invalidates a late preview response', async () => {
  let finishSigning
  const signing = new Promise((resolve) => { finishSigning = resolve })
  const h = harness(() => signing)
  const cleanup = h.effects[0]()
  await new Promise(setImmediate)
  cleanup()
  const before = h.states[0]
  finishSigning({ ok: true, json: async () => ({ urls: { 'project/file.png': 'https://signed.example/preview' } }) })
  await new Promise(setImmediate)
  assert.equal(h.states[0], before)
})
