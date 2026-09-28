import test from 'node:test'
import assert from 'node:assert/strict'
import { projectModule } from '../../scripts/lib/load-project-module.mjs'
import { readFileSync } from 'node:fs'

const { backupMonth, summarizeBackups } = projectModule(
  'lib/sistema/monthly-backup-summary.ts',
)
const entry = (changes = {}) => ({
  version_id: 'v1',
  project_id: 'p1',
  project_name: 'Cliente',
  asset_name: 'Diseño',
  source_created_at: '2026-07-01T01:00:00Z',
  month_key: '2026-06',
  status: 'pending',
  drive_folder_id: null,
  backed_up_at: null,
  verified_at: null,
  error: null,
  ...changes,
})

test('month uses Argentina midnight, including the year boundary', () => {
  assert.equal(backupMonth('2026-07-01T02:59:59Z'), '2026-06')
  assert.equal(backupMonth('2026-07-01T03:00:00Z'), '2026-07')
  assert.equal(backupMonth('2026-01-01T02:00:00Z'), '2025-12')
})
test('summary retains archived clients, distinguishes failed/pending, and does not invent empty months', () => {
  const clients = summarizeBackups(
    [
      entry(),
      entry({ version_id: 'v2', status: 'error', error: 'Original ausente' }),
      entry({
        version_id: 'v3',
        status: 'backed_up',
        drive_folder_id: 'drive',
        verified_at: '2026-07-02T00:00:00Z',
      }),
      entry({
        version_id: 'v4',
        status: 'backed_up',
        drive_folder_id: 'drive',
        verified_at: '2026-07-01T00:00:00Z',
      }),
    ],
    [{ id: 'p2', nombre: 'Sin archivos' }],
    new Date('2026-07-20'),
  )
  const client = clients.find((c) => c.id === 'p1'),
    month = client.months[0]
  assert.equal(client.months.length, 1)
  assert.deepEqual(
    [month.total, month.pending, month.failed, month.backedUp],
    [4, 1, 1, 2],
  )
  assert.deepEqual(month.folders, ['drive'])
  assert.equal(month.lastVerified, '2026-07-01T00:00:00Z')
  assert.equal(month.open, false)
  assert.equal(clients.find((c) => c.id === 'p2').months.length, 0)
})

function database(resolve) {
  const calls = []
  return {
    calls,
    from(table) {
      const q = { table, operation: 'read', filters: [] }
      const b = {
        select(columns) {
          q.columns = columns
          return b
        },
        update(values) {
          q.operation = 'update'
          q.values = values
          return b
        },
        upsert(values, options) {
          q.operation = 'upsert'
          q.values = values
          q.options = options
          return b
        },
        eq(...a) {
          q.filters.push(['eq', ...a])
          return b
        },
        lt(...a) {
          q.filters.push(['lt', ...a])
          return b
        },
        lte(...a) {
          q.filters.push(['lte', ...a])
          return b
        },
        neq(...a) {
          q.filters.push(['neq', ...a])
          return b
        },
        order() {
          return b
        },
        limit(n) {
          q.limit = n
          return b
        },
        range(from, to) {
          q.range = [from, to]
          return b
        },
        then(yes, no) {
          calls.push(q)
          return Promise.resolve(resolve(q) ?? { data: [], error: null }).then(
            yes,
            no,
          )
        },
      }
      return b
    },
  }
}
const original = (id) => ({
  id,
  asset_id: 'asset',
  version_number: 1,
  file_url: 'source',
  storage_path: null,
  file_type: 'image/png',
  file_size: 100,
  original_filename: 'x.png',
  created_at: '2026-07-01T01:00:00Z',
  asset: {
    nombre: 'Diseño',
    asset_type: 'single',
    group_id: null,
    project_id: 'p1',
    project: { nombre: 'Cliente' },
  },
})
function worker(db, drive = {}) {
  return projectModule('lib/sistema/monthly-backups.ts', {
    '@/lib/sistema/supabase/admin': { createAdminClient: () => db },
    '@/lib/sistema/google-drive-backup': {
      ArchiveCopyError: class extends Error {},
      archiveMonthlyVersion: async () => ({
        fileId: 'file',
        folderId: 'folder',
      }),
      verifyMonthlyDriveFile: async () => {},
      ...drive,
    },
  })
}
test('historical discovery paginates every version and includes linked folders', async () => {
  const db = database((q) =>
    q.table === 'sistema_asset_versions'
      ? {
          data:
            q.range[0] === 0
              ? Array.from({ length: 500 }, (_, i) => original(String(i)))
              : [
                  {
                    ...original('folder'),
                    asset: { ...original('x').asset, asset_type: 'folder' },
                  },
                  original('last'),
                ],
          error: null,
        }
      : undefined,
  )
  assert.equal(await worker(db).discoverMonthlyBackups(), 502)
  const writes = db.calls.filter((q) => q.operation === 'upsert')
  assert.equal(writes.length, 2)
  assert.equal(writes[1].values[0].version_id, 'folder')
  assert.equal(writes[1].values[1].version_id, 'last')
  assert.equal(writes[0].values[0].month_key, '2026-06')
  assert.equal(writes[0].options.ignoreDuplicates, true)
})

test('busy lease does not copy or scan anything', async () => {
  process.env.GOOGLE_DRIVE_BACKUP_ENABLED = 'true'
  process.env.GOOGLE_DRIVE_CLIENTES_FOLDER_ID = 'root'
  const db = database(() => ({ data: [], error: null }))
  const result = await worker(db).processMonthlyBackups()
  assert.equal(result.busy, true)
  assert.equal(db.calls.length, 1)
})
test('failed file gets a retry and does not prevent the next file; lease is released', async () => {
  let next = 0
  const jobs = [
    entry({
      version_id: 'bad',
      source_snapshot: { fileSize: 100 },
      attempts: 0,
    }),
    entry({
      version_id: 'good',
      source_snapshot: { fileSize: 100 },
      attempts: 0,
    }),
  ]
  const db = database((q) => {
    if (q.table === 'sistema_monthly_backup_worker' && q.values?.owner)
      return { data: [{ id: true }], error: null }
    if (
      q.table === 'sistema_monthly_backups' &&
      q.operation === 'read' &&
      q.filters.some((f) => f[0] === 'neq')
    )
      return { data: jobs[next] ? [jobs[next++]] : [], error: null }
    return { data: [], error: null }
  })
  let attempts = 0
  const result = await worker(db, {
    archiveMonthlyVersion: async () => {
      if (!attempts++) throw new Error('Original ausente')
      return { fileId: 'file', folderId: 'folder' }
    },
  }).processMonthlyBackups()
  assert.equal(result.failed, 1)
  assert.equal(result.created, 1)
  const writes = db.calls.filter(
    (q) => q.table === 'sistema_monthly_backups' && q.operation === 'update',
  )
  assert.equal(writes[0].values.status, 'error')
  assert.ok(Date.parse(writes[0].values.next_attempt_at) > Date.now())
  assert.equal(writes[1].values.status, 'backed_up')
  assert.equal(db.calls.at(-1).values.owner, null)
})
test('admin endpoints reject access before reading or writing any archive data', async () => {
  let touched = false
  const { SocialError } = projectModule('lib/social/errors.ts')
  const routes = projectModule('app/api/admin/monthly-backups/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/social/errors': { SocialError },
    '@/lib/social/auth': {
      requireSocialAdmin: async () => {
        throw new SocialError(403, 'forbidden', 'Solo administradores')
      },
    },
    '@/lib/sistema/monthly-backups': {
      discoverMonthlyBackups: () => {
        touched = true
      },
      processMonthlyBackups: () => {
        touched = true
      },
    },
  })
  assert.equal(
    (
      await routes.GET(
        new Request('https://quepia.com/api/admin/monthly-backups'),
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await routes.POST(
        new Request('https://quepia.com/api/admin/monthly-backups', {
          method: 'POST',
        }),
      )
    ).status,
    403,
  )
  assert.equal(touched, false)
})
test('cron fails closed when the secret is missing or wrong', async () => {
  const route = projectModule('app/api/internal/monthly-backups/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/sistema/monthly-backups': {
      processMonthlyBackups: () => {
        throw new Error('must not run')
      },
    },
  })
  delete process.env.CRON_SECRET
  assert.equal(
    (
      await route.GET(
        new Request('https://quepia.com/api/internal/monthly-backups'),
      )
    ).status,
    401,
  )
  process.env.CRON_SECRET = 'secret'
  assert.equal(
    (
      await route.GET(
        new Request('https://quepia.com/api/internal/monthly-backups', {
          headers: { authorization: 'Bearer wrong' },
        }),
      )
    ).status,
    401,
  )
})
test('archive tables enable RLS and grant access only to service_role', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  try {
    await db.exec(
      'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;',
    )
    await db.exec(
      readFileSync(
        'supabase/migrations/20260925150358_monthly_backups.sql',
        'utf8',
      ),
    )
    const { rows } = await db.query(
      "SELECT relrowsecurity FROM pg_class WHERE relname IN ('sistema_monthly_backups','sistema_monthly_backup_worker')",
    )
    assert.equal(rows.length, 2)
    assert.ok(rows.every((r) => r.relrowsecurity))
    const rights = await db.query(
      "SELECT has_table_privilege('anon','sistema_monthly_backups','SELECT') AS anon, has_table_privilege('authenticated','sistema_monthly_backups','SELECT') AS authenticated, has_table_privilege('service_role','sistema_monthly_backups','SELECT') AS service",
    )
    assert.deepEqual(rights.rows[0], {
      anon: false,
      authenticated: false,
      service: true,
    })
  } finally {
    await db.close()
  }
})

test('linked folder backup resumes partial copies and never archives its HTML page', async () => {
  const previousFetch = globalThis.fetch
  const previousCredentials =
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(
    JSON.stringify({ client_email: 'test@example.test', private_key: 'test' }),
  ).toString('base64')
  const folderMime = 'application/vnd.google-apps.folder'
  const files = new Map([
    ['root', { id: 'root', mimeType: folderMime }],
    [
      'original-folder',
      { id: 'original-folder', name: 'Cliente',
        parents: ['root'], mimeType: folderMime },
    ],
    [
      'a',
      {
        id: 'a',
        name: 'Diseño.pdf',
        mimeType: 'application/pdf',
        size: '100',
        parents: ['original-folder'],
      },
    ],
    [
      'b',
      {
        id: 'b',
        name: 'Foto.png',
        mimeType: 'image/png',
        size: '200',
        parents: ['original-folder'],
      },
    ],
  ])
  let sequence = 0,
    fail = true,
    copiesA = 0
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url)
    if (u.hostname === 'oauth2.googleapis.com')
      return Response.json({ access_token: 'fake', expires_in: 3600 })
    const parts = u.pathname.split('/')
    if (u.pathname.endsWith('/copy')) {
      const source = parts.at(-2)
      if (source === 'b' && fail) {
        fail = false
        return Response.json(
          { error: { message: 'Temporary failure' } },
          { status: 503 },
        )
      }
      if (source === 'a') copiesA++
      const item = {
        ...files.get(source),
        ...JSON.parse(init.body),
        id: `new-${++sequence}`,
      }
      files.set(item.id, item)
      return Response.json(item)
    }
    if (u.pathname.endsWith('/files') && init.method === 'POST') {
      const item = { ...JSON.parse(init.body), id: `new-${++sequence}` }
      files.set(item.id, item)
      return Response.json(item)
    }
    if (u.pathname.endsWith('/files')) {
      const q = u.searchParams.get('q'),
        parent = q.match(/'([^']+)' in parents/)[1],
        name = q.match(/name = '([^']+)'/)?.[1]
      return Response.json({
        files: [...files.values()].filter(
          (f) => f.parents?.includes(parent) && (!name || f.name === name),
        ),
      })
    }
    const item = files.get(parts.at(-1))
    return item
      ? Response.json(item)
      : Response.json({ error: { message: 'File not found' } }, { status: 404 })
  }
  try {
    const drive = projectModule('lib/sistema/google-drive-backup.ts', {
      crypto: {
        createSign: () => ({
          update() {
            return this
          },
          sign() {
            return Buffer.from('signature')
          },
        }),
      },
      '@/lib/sistema/assets-storage': {
        sanitizeFilename: (s) => s.replace(/\W/g, '-'),
        isStoragePath: () => false,
        createSignedUrl: async () => null,
      },
    })
    const params = {
      projectId: 'project-id',
      projectName: 'Cliente',
      month: '2026-06',
      asset: {
        assetVersionId: 'version',
        assetName: 'Carpeta',
        versionNumber: 1,
        fileUrl: 'https://drive.google.com/drive/u/5/folders/original-folder',
        storagePath: null,
      },
    }
    await assert.rejects(
      () => drive.archiveMonthlyVersion(params),
      /Temporary failure/,
    )
    const recovered = await drive.archiveMonthlyVersion(params)
    assert.equal(recovered.members.length, 2)
    assert.equal(copiesA, 1)
    assert.equal(files.get(recovered.fileId).mimeType, folderMime)
    assert.ok(recovered.members.every((member) => files.has(member.id)))
  } finally {
    globalThis.fetch = previousFetch
    if (previousCredentials === undefined)
      delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64
    else
      process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 = previousCredentials
  }
})

test('large folders persist their checkpoint and remain pending until complete', async () => {
  class ArchiveCopyError extends Error {
    constructor() {
      super('Carpeta parcialmente copiada.')
      this.members = [
        { id: 'copy-a', parentId: 'folder', sourceId: 'a', size: 10 },
      ]
    }
  }
  const job = entry({ source_snapshot: { fileSize: null }, attempts: 0 })
  const db = database((q) => {
    if (q.table === 'sistema_monthly_backup_worker' && q.values?.owner)
      return { data: [{ id: true }], error: null }
    if (
      q.table === 'sistema_monthly_backups' &&
      q.operation === 'read' &&
      q.filters.some((f) => f[0] === 'neq')
    )
      return { data: [job], error: null }
    return { data: [], error: null }
  })
  const result = await worker(db, {
    ArchiveCopyError,
    archiveMonthlyVersion: async () => {
      throw new ArchiveCopyError()
    },
  }).processMonthlyBackups({ maxFiles: 1 })
  assert.equal(result.continued, 1)
  assert.equal(result.created, 0)
  assert.equal(result.failed, 0)
  const saved = db.calls.find(
    (q) => q.table === 'sistema_monthly_backups' && q.operation === 'update',
  )
  assert.equal(saved.values.status, 'pending')
  assert.equal(saved.values.error, null)
  assert.equal(saved.values.source_snapshot.archiveMembers.length, 1)
})
