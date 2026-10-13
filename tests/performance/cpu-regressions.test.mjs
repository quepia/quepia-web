import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function loadTs(path, globals = {}, require = () => { throw new Error('Unexpected import') }) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(source, { exports, require, Buffer, console, Date, ...globals })
  return exports
}

test('PDF cache coalesces renders, separates versions, evicts and retries failures', async () => {
  const { createPdfCache } = loadTs('lib/invoicing/pdf-cache.ts')
  const cache = createPdfCache(4)
  let renders = 0
  const render = async () => { renders++; return Buffer.from('abc') }
  await Promise.all([cache('a', render), cache('a', render)])
  assert.equal(renders, 1)
  await cache('a', render)
  assert.equal(renders, 1)
  await cache('b', render)
  await cache('a', render)
  assert.equal(renders, 3)
  await assert.rejects(cache('error', async () => { throw new Error('render failed') }))
  assert.equal((await cache('error', render)).toString(), 'abc')
})

test('PDF expiry renders again and oversized files are not retained', async () => {
  let now = 0
  class Clock extends Date { static now() { return now } }
  const { createPdfCache } = loadTs('lib/invoicing/pdf-cache.ts', { Date: Clock })
  const cache = createPdfCache(3, 10)
  let renders = 0
  const render = async () => { renders++; return Buffer.from('abc') }
  await cache('a', render)
  now = 11
  await cache('a', render)
  assert.equal(renders, 2)
  const large = async () => { renders++; return Buffer.from('large') }
  await cache('large', large)
  await cache('large', large)
  assert.equal(renders, 4)
})

test('Polling pauses hidden tabs, resumes once, avoids overlap and cleans up', async () => {
  const effects = [], timers = new Map(), listeners = new Map()
  let id = 0, calls = 0, release
  const document = { visibilityState: 'visible',
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name) }
  const react = { useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) }
  const { useVisiblePolling } = loadTs('lib/hooks/use-visible-polling.ts', {
    document, setTimeout: fn => { timers.set(++id, fn); return id },
    clearTimeout: id => timers.delete(id),
  }, name => { assert.equal(name, 'react'); return react })
  useVisiblePolling(() => { calls++; return new Promise(resolve => { release = resolve }) }, 15000)
  const cleanup = effects.map(fn => fn()).filter(Boolean)[0]
  document.visibilityState = 'hidden'
  listeners.get('visibilitychange')()
  assert.equal(timers.size, 0)
  assert.equal(calls, 0)
  document.visibilityState = 'visible'
  listeners.get('visibilitychange')()
  listeners.get('visibilitychange')()
  assert.equal(calls, 1)
  release()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(timers.size, 1)
  cleanup()
  assert.equal(timers.size, 0)
  assert.equal(listeners.size, 0)
})

test('Matcher exempts only independently authenticated service endpoints', async () => {
  const { projectModule } = await import('../../scripts/lib/load-project-module.mjs')
  const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server.js')
  const { config } = projectModule('middleware.ts', {
    '@/lib/supabase/middleware': {}, '@/lib/security/csp': {},
  })
  const match = path => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: `https://quepia.com${path}` })
  for (const path of ['/api/internal/social/process', '/api/internal/monthly-backups']) assert.equal(match(path), false, path)
  for (const path of ['/api', '/api/ai/stories', '/api/internal/stories/process',
    '/api/internal/social/process/child', '/api/internal/social/process-other',
    '/api/internal/monthly-backups-other', '/api/invoicing/id/pdf', '/api/assets/file.mp4',
    '/sistema', '/admin', '/auth/mfa', '/oauth/consent']) assert.equal(match(path), true, path)
})

test('Service endpoints reject missing/invalid secrets before any work', async () => {
  const { projectModule } = await import('../../scripts/lib/load-project-module.mjs')
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'cpu-test-secret'
  let work = 0
  try {
    const socialServer = projectModule('lib/social/server.ts', {
      'server-only': {}, './auth': {}, './errors': {}, './policy': {}, './rpc': {},
      './zernio-adapter': {}, './worker': {},
    })
    const social = projectModule('app/api/internal/social/process/route.ts', {
      '@/lib/zernio/publication-telegram': { processPublicationTelegramNotifications: () => { work++; return {} } },
      '@/lib/social/server': { ...socialServer, createServerWorker: () => { work++; throw new Error('Must not execute') } },
      '@/lib/social/errors': {},
    })
    const monthly = projectModule('app/api/internal/monthly-backups/route.ts', {
      '@/lib/sistema/monthly-backups': { processMonthlyBackups: () => { work++; return {} } },
    })
    for (const authorization of ['', 'Bearer wrong', 'Bearer cpu-test-secreu']) {
      const request = new Request('https://quepia.com/api/internal/social/process', { headers: { authorization } })
      assert.equal((await social.POST(request)).status, 401)
      assert.equal((await monthly.GET(request)).status, 401)
    }
    assert.equal(work, 0)
    const valid = new Request('https://quepia.com/api/internal/monthly-backups', { headers: { authorization: 'Bearer cpu-test-secret' } })
    assert.equal((await monthly.GET(valid)).status, 200)
    assert.equal(work, 1)
    delete process.env.CRON_SECRET
    assert.equal((await monthly.GET(valid)).status, 401)
    assert.equal((await social.POST(valid)).status, 503)
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})

test('PDF route authorizes every request before reusing cached render bytes', async () => {
  const { projectModule } = await import('../../scripts/lib/load-project-module.mjs')
  let authorized = true, renders = 0, checks = 0
  const route = projectModule('lib/invoicing/pdf-route.ts', {
    'server-only': {},
    './invoice-pdf': { renderInvoicePdf: async doc => { renders++; return Buffer.from(doc.amount) } },
    './route-auth': { firstPartyInvoicingSession: async () => { checks++; return authorized ? {} : new Response(null, { status: 401 }) } },
  })
  const id = '11111111-1111-4111-8111-111111111111'
  const request = new Request('https://quepia.com/api/invoicing/id/pdf')
  let amount = '100'
  const load = async () => ({ fileName: 'invoice.pdf', amount })
  assert.equal((await route.comprobantePdfResponse(request, id, load)).status, 200)
  assert.equal((await route.comprobantePdfResponse(request, id, load)).status, 200)
  assert.equal(renders, 1)
  authorized = false
  assert.equal((await route.comprobantePdfResponse(request, id, load)).status, 401)
  assert.equal(renders, 1)
  authorized = true
  assert.equal((await route.comprobantePdfResponse(request, id, async () => null)).status, 404)
  amount = '200'
  const changed = await route.comprobantePdfResponse(request, id, load)
  assert.equal(await changed.text(), '200')
  assert.equal(changed.headers.get('cache-control'), 'private, no-store')
  assert.equal(renders, 2)
  assert.equal(checks, 5)
})

test('Ignored build uses deployed baseline, builds code and fails open on missing refs', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, resolve } = await import('node:path')
  const { execFileSync, spawnSync } = await import('node:child_process')
  const folder = mkdtempSync(join(tmpdir(), 'quepia-ignore-'))
  const script = resolve('scripts/ignore-docs-build.mjs')
  const git = (...args) => execFileSync('git', args, { cwd: folder, encoding: 'utf8' }).trim()
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'CPU test')
    writeFileSync(join(folder, 'app.ts'), 'original'); git('add', '.'); git('commit', '-qm', 'base')
    const baseline = git('rev-parse', 'HEAD')
    writeFileSync(join(folder, 'README.md'), 'docs'); git('add', '.'); git('commit', '-qm', 'docs')
    const docs = git('rev-parse', 'HEAD')
    const run = (previous, current) => spawnSync(process.execPath, [script], { cwd: folder,
      env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: current } }).status
    assert.equal(run(baseline, docs), 0)
    writeFileSync(join(folder, 'app.ts'), 'changed'); git('add', '.'); git('commit', '-qm', 'code')
    writeFileSync(join(folder, 'README.md'), 'more docs'); git('add', '.'); git('commit', '-qm', 'docs after code')
    assert.equal(run(docs, git('rev-parse', 'HEAD')), 1)
    assert.equal(run('', docs), 1)
    assert.equal(run('missing-ref', docs), 1)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})

test('Public revalidation checks admin access before invalidating caches', async () => {
  const { projectModule } = await import('../../scripts/lib/load-project-module.mjs')
  let allowed = false
  const paths = [], tags = []
  const action = projectModule('lib/actions/revalidate-public-site.ts', {
    'next/cache': { revalidatePath: (...args) => paths.push(args), revalidateTag: tag => tags.push(tag) },
    '@/lib/social/auth': { requireSocialAdmin: async () => { if (!allowed) throw new Error('Forbidden') } },
  })
  await assert.rejects(action.revalidatePublicSite(), /Forbidden/)
  assert.equal(paths.length, 0)
  assert.equal(tags.length, 0)
  allowed = true
  await action.revalidatePublicSite()
  assert.ok(tags.includes('public-portfolio-projects'))
  assert.ok(paths.some(([path]) => path === '/sobre-nosotros'))
  assert.ok(paths.some(([path, type]) => path === '/trabajos/[slug]' && type === 'page'))
  assert.ok(!paths.some(([path, type]) => path === '/' && type === 'layout'))
})
