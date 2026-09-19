import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createSocialDb, IDS, rpc as rawRpc } from "./harness.mjs"
import { createRpcBridge } from "./rpc-bridge.mjs"
import { createZernioAdapter } from "../../../lib/social/zernio-adapter.ts"
import { createSocialWorker } from "../../../lib/social/worker.ts"

const DAY = 86_400_000
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()

// Zernio simulado con las formas documentadas/observadas.
function createFakeZernio() {
  const state = {
    calls: [],
    profiles: [{ _id: "zp_camping", name: "quepia_camping" }, { _id: "zp_default", name: "Default", isDefault: true }],
    accounts: [{ _id: "za_camping", platform: "instagram", username: "camping", isActive: true, enabled: true, profileId: { _id: "zp_camping" },
      permissions: ["instagram_business_basic", "instagram_business_manage_comments", "instagram_business_manage_messages"], platformUserId: "ig_1" }],
    deltaPages: [],
    deltaCursorCounter: 0,
    sendBehavior: "ok",
    sentMessages: [],
  }
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "50", ...headers } })
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    const path = url.pathname.replace("/api/v1", "")
    const method = init.method || "GET"
    state.calls.push(`${method} ${path}${url.search}`)
    if (path === "/profiles") return json({ profiles: state.profiles })
    if (path === "/accounts") return json({ accounts: state.accounts })
    if (path === "/accounts/health") return json({ accounts: [{ accountId: "za_camping", status: "healthy", canPost: true, canFetchAnalytics: true, needsReconnect: false, issues: [] }] })
    if (path === "/analytics/delta") {
      const cursor = url.searchParams.get("cursor")
      if (cursor === "v1.expired") return json({ error: "cursor too old", code: "invalid_field_value" }, 400)
      if (!cursor) return json({ data: [], nextCursor: `v1.c${state.deltaCursorCounter++}`, hasMore: false })
      const page = state.deltaPages.shift() ?? []
      return json({ data: page, nextCursor: `v1.c${state.deltaCursorCounter++}`, hasMore: false })
    }
    if (path === "/analytics") {
      return json({ posts: [{
        _id: "ext_1", latePostId: null, content: "Reel", publishedAt: iso(10 * DAY), mediaType: "video", mediaProductType: "REELS",
        analytics: { views: 2000, reach: 1300, likes: 49, comments: 3, shares: 5, saves: 4, lastUpdated: iso(0) },
        platforms: [{ platform: "instagram", accountId: "za_camping", platformPostId: "ig_post_1", syncStatus: "synced" }],
      }], pagination: { page: 1, pages: 1, total: 1 } })
    }
    if (path === "/analytics/post-timeline") {
      return json({ postId: url.searchParams.get("postId"), timeline: [
        { date: iso(10 * DAY).slice(0, 10), platform: "instagram", platformPostId: "ig_post_1", views: 1000, likes: 30 },
        { date: iso(9 * DAY).slice(0, 10), platform: "instagram", platformPostId: "ig_post_1", views: 1500, likes: 40 },
      ] })
    }
    if (path === "/accounts/follower-stats") return json({ stats: { za_camping: [{ date: iso(DAY).slice(0, 10), followers: 1000 }, { date: iso(0).slice(0, 10), followers: 1010 }] } })
    if (path === "/analytics/instagram/account-insights") return json({ metrics: { reach: { total: 4000 } }, unavailableMetrics: [{ metric: "views", reason: "no_data" }] })
    if (path === "/inbox/conversations") return json({ data: [{ id: "conv_1", platform: "instagram", accountId: "za_camping", participantId: "u1", participantName: "Ana", updatedTime: iso(3600_000), status: "active" }] })
    if (path === "/inbox/conversations/conv_1/messages" && method === "GET") {
      return json({ messages: [
        { id: "mid_old", direction: "incoming", message: "¿Precio?", senderId: "u1", createdAt: iso(3600_000) },
        ...state.sentMessages,
      ] })
    }
    if (path === "/inbox/conversations/conv_1/messages" && method === "POST") {
      const body = JSON.parse(init.body)
      if (state.sendBehavior === "timeout_after_accept") {
        state.sentMessages.push({ id: "mid_sent_1", direction: "outgoing", message: body.message, createdAt: new Date().toISOString(), sentVia: "api" })
        const error = new Error("timeout"); error.name = "TimeoutError"; throw error
      }
      state.sentMessages.push({ id: `mid_sent_${state.sentMessages.length + 1}`, direction: "outgoing", message: body.message, createdAt: new Date().toISOString() })
      return json({ success: true, data: { messageId: state.sentMessages.at(-1).id } })
    }
    if (path === "/inbox/comments") return json({ data: [] })
    if (path === "/comment-automations") return json({ automations: [] })
    return json({ error: `ruta no simulada ${path}` }, 404)
  }
  return { state, fetchImpl }
}

const db = await createSocialDb()
const { rpc } = createRpcBridge(db)
const fake = createFakeZernio()
const zernio = createZernioAdapter({ apiKey: "test", fetchImpl: fake.fetchImpl, sleep: async () => {} })
let clock = new Date()
const worker = createSocialWorker({ rpc, zernio, sleep: async () => {}, now: () => clock, log: () => {} })

async function run(kinds) {
  return worker.runOnce({ workerId: "w1", budgetMs: 20_000, kinds, schedule: false })
}
async function enqueue(kind) {
  return rpc("social_enqueue_job", { p_kind: kind, p_dedupe_key: `${kind}:${randomUUID()}` })
}

test("inventario: registra perfiles del proveedor sin cliente y cuentas en cuarentena", async () => {
  await enqueue("inventory.reconcile")
  const result = await run(["inventory.reconcile"])
  assert.equal(result.summary[0].status, "succeeded", JSON.stringify(result))
  const { rows } = await db.query("SELECT a.zernio_account_id, a.client_id, p.zernio_profile_id FROM public.sistema_zernio_accounts a JOIN public.sistema_zernio_profiles p ON p.id = a.integration_id")
  assert.deepEqual(rows, [{ zernio_account_id: "za_camping", client_id: null, zernio_profile_id: "zp_camping" }])
  // Asignación explícita del admin (sin inferir por nombre).
  const client = await rawRpc(db, "social_admin_create_client", [IDS.admin, "Camping La Ribera"])
  const profile = await db.query("SELECT id FROM public.sistema_zernio_profiles WHERE zernio_profile_id = 'zp_camping'")
  const assigned = await rawRpc(db, "social_admin_assign_profile_client", [IDS.admin, profile.rows[0].id, client.data.id])
  assert.equal(assigned.ok, true)
  const account = await db.query("SELECT client_id FROM public.sistema_zernio_accounts WHERE zernio_account_id = 'za_camping'")
  assert.equal(account.rows[0].client_id, client.data.id)
})

test("bootstrap: toma el cursor ANTES del baseline y lo persiste al final", async () => {
  await enqueue("analytics.bootstrap")
  const result = await run(["analytics.bootstrap"])
  assert.equal(result.summary[0].status, "succeeded", JSON.stringify(result))
  const deltaCall = fake.state.calls.findIndex((call) => call.startsWith("GET /analytics/delta"))
  const baselineCall = fake.state.calls.findIndex((call) => call.startsWith("GET /analytics?"))
  assert.ok(deltaCall >= 0 && deltaCall < baselineCall)
  const state = await rpc("social_get_sync_state", { p_stream: "analytics_delta", p_scope_key: "global" })
  assert.equal(state.cursor, "v1.c0")
  assert.equal(state.status, "ok")
  const posts = await db.query("SELECT count(*)::int AS n FROM public.sistema_social_posts")
  assert.equal(posts.rows[0].n, 1)
})

test("delta: una página vacía reciente no avanza el cursor; con datos avanza junto con las filas", async () => {
  await enqueue("analytics.delta")
  await run(["analytics.delta"])
  let state = await rpc("social_get_sync_state", { p_stream: "analytics_delta", p_scope_key: "global" })
  assert.equal(state.cursor, "v1.c0")
  fake.state.deltaPages.push([{ postId: "ext_1", accountId: "za_camping", platform: "instagram", platformPostId: "ig_post_1",
    publishedAt: iso(10 * DAY), syncedAt: new Date(Date.now() + 1000).toISOString(), isDeleted: false, metrics: { views: 2300, likes: 60 } }])
  await enqueue("analytics.delta")
  await run(["analytics.delta"])
  state = await rpc("social_get_sync_state", { p_stream: "analytics_delta", p_scope_key: "global" })
  assert.notEqual(state.cursor, "v1.c0")
  const views = await db.query("SELECT value FROM public.sistema_social_post_metrics_latest WHERE metric_key = 'views'")
  assert.equal(Number(views.rows[0].value), 2300)
})

test("delta: un cursor vencido marca el estado y reprograma bootstrap", async () => {
  await rpc("social_set_sync_state", { p_stream: "analytics_delta", p_scope_key: "global", p_status: "ok", p_cursor: "v1.expired", p_cursor_obtained_at: iso(7 * DAY), p_success: true })
  await enqueue("analytics.delta")
  await run(["analytics.delta"])
  const state = await rpc("social_get_sync_state", { p_stream: "analytics_delta", p_scope_key: "global" })
  assert.equal(state.status, "expired")
  const jobs = await db.query("SELECT count(*)::int AS n FROM public.sistema_social_jobs WHERE kind = 'analytics.bootstrap' AND status = 'queued'")
  assert.equal(jobs.rows[0].n, 1)
})

test("seguidores, timeline e insights de cuenta se sincronizan sin abrir pantallas", async () => {
  for (const kind of ["followers.daily", "timeline.backfill", "ig_insights.refresh"]) await enqueue(kind)
  const result = await run(["followers.daily", "timeline.backfill", "ig_insights.refresh"])
  assert.ok(result.summary.every((item) => item.status === "succeeded"), JSON.stringify(result.summary))
  const followers = await db.query("SELECT count(*)::int AS n FROM public.sistema_social_account_daily")
  assert.equal(followers.rows[0].n, 2)
  const snapshots = await db.query("SELECT count(*)::int AS n FROM public.sistema_social_post_metric_snapshots WHERE source = 'timeline'")
  assert.equal(snapshots.rows[0].n, 4)
  const insights = await db.query("SELECT metric_key, value, unavailable_reason FROM public.sistema_social_account_period_metrics WHERE metric_key IN ('ig_account_reach','ig_account_views') ORDER BY metric_key, period_start")
  assert.ok(insights.rows.some((row) => row.metric_key === "ig_account_views" && row.value === null && row.unavailable_reason === "no_data"))
})

test("webhooks: procesamiento idempotente, cuarentena de cuentas desconocidas y señal analítica", async () => {
  const payload = (id, accountId, text) => ({ id, event: "message.received", timestamp: iso(0),
    message: { conversationId: "conv_1", platformMessageId: `mid_${id}`, direction: "incoming", text, sender: { id: "u1" }, sentAt: iso(0) },
    conversation: { participantId: "u1", participantName: "Ana" }, account: { id: accountId, accountId } })
  for (const [id, account] of [["e1", "za_camping"], ["e2", "desconocida"]]) {
    const body = payload(id, account, "hola")
    await rpc("social_record_webhook", { p_environment: "test", p_channel: "operations", p_external_event_id: id, p_event_type: "message.received",
      p_event_timestamp: iso(0), p_zernio_account_id: account, p_zernio_profile_id: null, p_payload: body, p_payload_hash: id, p_contains_private: true, p_retention_days: 30 })
  }
  await rpc("social_record_webhook", { p_environment: "test", p_channel: "analytics", p_external_event_id: "e3", p_event_type: "analytics.synced",
    p_event_timestamp: iso(0), p_zernio_account_id: "za_camping", p_zernio_profile_id: null, p_payload: { id: "e3", event: "analytics.synced", account: { accountId: "za_camping" } },
    p_payload_hash: "e3", p_contains_private: false, p_retention_days: 30 })
  await enqueue("webhook.process")
  await run(["webhook.process"])
  const events = await db.query("SELECT external_event_id, status FROM public.sistema_social_webhook_events ORDER BY external_event_id")
  assert.deepEqual(events.rows, [
    { external_event_id: "e1", status: "processed" }, { external_event_id: "e2", status: "quarantined" }, { external_event_id: "e3", status: "processed" },
  ])
  const signal = await db.query("SELECT run_after > now() AS delayed FROM public.sistema_social_jobs WHERE dedupe_key LIKE 'delta:signal:%'")
  assert.equal(signal.rows[0].delayed, true)
})

test("envío con timeout tras aceptación: queda ambiguo, no se duplica y se concilia", async () => {
  const thread = await db.query("SELECT id, version FROM public.sistema_social_threads WHERE external_thread_id = 'conv_1'")
  const requestId = randomUUID()
  const enqueued = await rawRpc(db, "social_admin_enqueue_reply", [IDS.admin, thread.rows[0].id, thread.rows[0].version, "send_dm", "Sí, hay lugar", null, requestId])
  assert.equal(enqueued.ok, true, JSON.stringify(enqueued))
  fake.state.sendBehavior = "timeout_after_accept"
  await enqueue("outbox.dispatch")
  await run(["outbox.dispatch"])
  let outbox = await db.query("SELECT status FROM public.sistema_social_outbox WHERE id = $1", [requestId])
  assert.equal(outbox.rows[0].status, "ambiguous")
  // Un segundo despacho no reenvía lo ambiguo.
  await enqueue("outbox.dispatch")
  await run(["outbox.dispatch"])
  const posts = fake.state.calls.filter((call) => call.startsWith("POST /inbox/conversations/conv_1/messages"))
  assert.equal(posts.length, 1)
  await enqueue("outbox.reconcile")
  await run(["outbox.reconcile"])
  outbox = await db.query("SELECT status, provider_reference FROM public.sistema_social_outbox WHERE id = $1", [requestId])
  assert.deepEqual(outbox.rows[0], { status: "sent", provider_reference: "mid_sent_1" })
  const interaction = await db.query("SELECT origin, sent_by FROM public.sistema_social_interactions WHERE external_id = 'mid_sent_1'")
  assert.deepEqual(interaction.rows[0], { origin: "quepia_admin", sent_by: IDS.admin })
})

test("un worker caído a mitad de envío no provoca doble efecto al recuperarse", async () => {
  fake.state.sendBehavior = "ok"
  const thread = await db.query("SELECT id, version FROM public.sistema_social_threads WHERE external_thread_id = 'conv_1'")
  await db.query("UPDATE public.sistema_social_threads SET claimed_by = NULL, claimed_until = NULL WHERE id = $1", [thread.rows[0].id])
  const requestId = randomUUID()
  await rawRpc(db, "social_admin_enqueue_reply", [IDS.admin, thread.rows[0].id, thread.rows[0].version, "send_dm", "Segundo mensaje", null, requestId])
  // El worker A marca "sending" y cae antes de llamar al proveedor.
  const begun = await rpc("social_outbox_begin", { p_outbox_id: requestId })
  assert.equal(begun.status, "sending")
  await enqueue("outbox.dispatch")
  await run(["outbox.dispatch"])
  const sends = fake.state.calls.filter((call) => call.startsWith("POST /inbox/conversations/conv_1/messages"))
  assert.equal(sends.length, 1, "no se reenvía una acción que otro worker dejó en curso")
  const outbox = await db.query("SELECT status FROM public.sistema_social_outbox WHERE id = $1", [requestId])
  assert.equal(outbox.rows[0].status, "sending")
})

test("programación periódica: buckets no se duplican aunque el trabajo ya terminó", async () => {
  const first = await worker.scheduleRecurring()
  const second = await worker.scheduleRecurring()
  assert.ok(first.created >= 10)
  assert.equal(second.created, 0)
})

test("reserva de cuota: con pocas solicitudes restantes el worker se detiene y reprograma", async () => {
  const tight = createZernioAdapter({ apiKey: "test", sleep: async () => {}, fetchImpl: async (input, init) => {
    const response = await fake.fetchImpl(input, init)
    return new Response(await response.text(), { status: response.status, headers: { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "3" } })
  } })
  const constrained = createSocialWorker({ rpc, zernio: tight, sleep: async () => {}, log: () => {} })
  await enqueue("health.check")
  await enqueue("followers.daily")
  const result = await constrained.runOnce({ workerId: "w2", budgetMs: 10_000, kinds: ["health.check", "followers.daily"], schedule: false })
  assert.equal(result.stoppedFor, "quota_reserve")
  // El primero se ejecutó y reveló cuota baja; el siguiente vuelve a la cola.
  assert.deepEqual(result.summary.map((item) => item.status), ["succeeded", "retry"])
  assert.match(result.summary[1].error, /Cuota reservada/)
})
