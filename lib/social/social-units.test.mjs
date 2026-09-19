import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import {
  normalizeAnalyticsPost,
  normalizeDeltaEntry,
  normalizeFollowerStats,
  normalizeInstagramInsights,
  normalizeMetrics,
  normalizeRestComments,
  normalizeTimeline,
  normalizeWebhookEvent,
  sanitizePayload,
} from "./normalize.ts"
import { createZernioAdapter, ZernioAdapterError } from "./zernio-adapter.ts"
import { verifyZernioSignature } from "./webhook-signature.ts"
import { keywordMatches, simulateRule, toZernioAutomationBody } from "./automation-simulator.ts"
import { isGlobalAdminProfile, isSameOriginMutation, utf8ByteLength } from "./policy.ts"

// Forma real de GET /analytics (2026-09-18), con valores sintéticos.
const analyticsPost = {
  _id: "ext_abc",
  latePostId: "late_1",
  content: "Caption público",
  publishedAt: "2026-09-11T15:00:00.000Z",
  status: "published",
  analytics: { impressions: 2027, reach: 1294, likes: 49, comments: 3, shares: 5, saves: 4, clicks: 0, views: 2027, follows: null,
    igReelsAvgWatchTime: 5400, completionRate: 0, engagementRate: 4.7, lastUpdated: "2026-09-18T12:22:33.894Z" },
  platforms: [{ platform: "instagram", status: "published", platformPostId: "1789", accountId: "acc_1", accountUsername: "camping",
    analytics: {}, syncStatus: "synced", platformPostUrl: "https://instagram.com/p/x" }],
  platform: "instagram",
  isExternal: true,
  isAd: false,
  mediaType: "video",
  mediaProductType: "REELS",
}

test("normaliza métricas: nulo no es cero y se mapean nombres del proveedor", () => {
  const metrics = normalizeMetrics(analyticsPost.analytics)
  assert.equal(metrics.views, 2027)
  assert.equal("follows" in metrics, false)
  assert.equal(metrics.ig_reels_avg_watch_time, 5400)
  assert.equal(metrics.provider_engagement_rate, 4.7)
  assert.equal("lastUpdated" in metrics, false)
})

test("una publicación de /analytics produce una fila por cuenta con origen y formato", () => {
  const [item] = normalizeAnalyticsPost(analyticsPost)
  assert.equal(item.zernio_account_id, "acc_1")
  assert.equal(item.platform_post_id, "1789")
  assert.equal(item.zernio_external_post_id, "ext_abc")
  assert.equal(item.zernio_post_id, "late_1")
  assert.equal(item.provider_synced_at, "2026-09-18T12:22:33.894Z")
  assert.equal(item.metrics.likes, 49)
  const multi = normalizeAnalyticsPost({ ...analyticsPost, platforms: [analyticsPost.platforms[0], { ...analyticsPost.platforms[0], accountId: "acc_2", platformPostId: "fb_1", platform: "facebook" }] })
  assert.equal(multi.length, 2)
  assert.ok(multi.every((row) => row.zernio_external_post_id === null))
})

test("delta y timeline conservan semántica absoluta/acumulada", () => {
  const delta = normalizeDeltaEntry({ postId: "ext_abc", accountId: "acc_1", platform: "instagram", platformPostId: "1789",
    publishedAt: "2026-09-11T15:00:00Z", syncedAt: "2026-09-18T10:00:00Z", isDeleted: false, metrics: { views: 2100, completionRate: 0 } })
  assert.equal(delta.media_type, null)
  assert.equal(delta.metrics.views, 2100)
  const timeline = normalizeTimeline([
    { date: "2026-09-11", platformPostId: "1789", views: 1078, likes: 34 },
    { date: "2026-09-12", platformPostId: "1789", views: 1727, likes: 44 },
    { date: "2026-09-12", platformPostId: "otro", views: 1 },
  ], "1789")
  assert.deepEqual(timeline.map((row) => row.metrics.views), [1078, 1727])
})

test("seguidores e insights: ausencia se registra con motivo, nunca como cero", () => {
  const followers = normalizeFollowerStats({ stats: { acc_1: [{ date: "2026-09-17T00:00:00.000Z", followers: 1000 }, { date: "2026-09-18", followers: 1004 }] } })
  assert.deepEqual(followers.map((row) => [row.day, row.value]), [["2026-09-17", 1000], ["2026-09-18", 1004]])
  const insights = normalizeInstagramInsights("acc_1", "2026-08-19", "2026-09-17", {
    metrics: { reach: { total: 5000 } }, unavailableMetrics: [{ metric: "views", reason: "permission_missing" }],
  })
  assert.equal(insights.find((row) => row.metric_key === "ig_account_reach").value, 5000)
  const views = insights.find((row) => row.metric_key === "ig_account_views")
  assert.equal(views.value, null)
  assert.equal(views.unavailable_reason, "permission_missing")
})

test("webhooks de bandeja: ids estables, autoría y adjuntos sin URLs firmadas", () => {
  const received = normalizeWebhookEvent({
    id: "evt", event: "message.received", timestamp: "2026-09-18T10:00:00Z",
    message: { id: "internal", conversationId: "conv", platform: "instagram", platformMessageId: "mid_1", direction: "incoming",
      text: "Hola", attachments: [{ type: "share", originalType: "story_mention", url: "https://cdn.meta/firmada" }],
      sender: { id: "u1", name: "Ana", username: "ana" }, sentAt: "2026-09-18T09:59:59Z" },
    conversation: { participantId: "u1", participantName: "Ana" }, account: { id: "acc_1", accountId: "acc_1", platform: "instagram" },
  })
  const item = received.items[0]
  assert.equal(item.interaction.external_id, "mid_1")
  assert.deepEqual(item.interaction.attachments, [{ type: "share", original_type: "story_mention" }])
  const sent = normalizeWebhookEvent({ event: "message.sent", message: { conversationId: "conv", platformMessageId: "mid_2",
    direction: "outgoing", text: "Ok", sentVia: null, sender: { id: "acc_1", name: "Camping" } }, account: { accountId: "acc_1" } })
  assert.equal(sent.items[0].interaction.direction, "outgoing")
  assert.equal(sent.items[0].interaction.author_name, null) // el eco no renombra al contacto
  assert.equal(sent.items[0].interaction.sent_via, null)
  const reply = normalizeWebhookEvent({ event: "comment.received", comment: { id: "c2", isReply: true, parentCommentId: "c1",
    platformPostId: "1789", platform: "instagram", text: "gracias", author: { id: "acc_ig", isOwnAccount: true }, createdAt: "2026-09-18T10:00:00Z" },
  account: { id: "acc_1" } })
  assert.equal(reply.items[0].thread_external_id, "c1")
  assert.equal(reply.items[0].interaction.direction, "outgoing")
  assert.equal(normalizeWebhookEvent({ event: "analytics.synced", account: { accountId: "acc_1" } }).kind, "analytics_signal")
  assert.equal(normalizeWebhookEvent({ event: "reaction.received" }).kind, "ignored")
})

test("comentarios REST: respuestas agrupadas bajo su comentario raíz", () => {
  const items = normalizeRestComments([{ id: "c1", message: "precio?", from: { id: "u1" }, replies: [{ id: "c2", message: "te escribimos", from: { id: "own", isOwner: true } }] }],
    "acc_1", "instagram", "1789")
  assert.deepEqual(items.map((item) => [item.interaction.external_id, item.thread_external_id, item.interaction.direction]), [
    ["c1", "c1", "incoming"], ["c2", "c1", "outgoing"],
  ])
})

test("saneamiento elimina secretos y URLs que vencen", () => {
  const clean = sanitizePayload({ accessToken: "x", nested: { api_key: "y", url: "https://cdn", text: "hola" }, metadata: { scope: "ig" } })
  assert.equal(clean.accessToken, "[redactado]")
  assert.equal(clean.nested.api_key, "[redactado]")
  assert.equal(clean.nested.url, "[url omitida]")
  assert.equal(clean.nested.text, "hola")
})

function fakeFetch(responses) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200, headers: next.headers ?? {} })
  }
  return { fetchImpl, calls }
}

test("adaptador: GET reintenta 5xx y respeta Retry-After corto; 402 es terminal", async () => {
  const sleeps = []
  const { fetchImpl, calls } = fakeFetch([
    { status: 503, body: { error: "release" }, headers: { "retry-after": "1" } },
    { status: 200, body: { accounts: [] }, headers: { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "58" } },
  ])
  let rate
  const adapter = createZernioAdapter({ apiKey: "k", fetchImpl, sleep: async (ms) => { sleeps.push(ms) }, onRate: (_, info) => { rate = info } })
  const result = await adapter.listAccounts()
  assert.equal(calls.length, 2)
  assert.deepEqual(sleeps, [1000])
  assert.equal(rate.remaining, 58)
  assert.equal(result.data.accounts.length, 0)
  const billing = createZernioAdapter({ apiKey: "k", fetchImpl: fakeFetch([{ status: 402, body: { error: "Payment required" } }]).fetchImpl })
  await assert.rejects(billing.usage(), (error) => error instanceof ZernioAdapterError && error.kind === "billing" && error.terminal)
})

test("adaptador: un 429 largo se delega a la cola con retryAfterSeconds", async () => {
  const adapter = createZernioAdapter({ apiKey: "k", sleep: async () => {}, fetchImpl: fakeFetch([{ status: 429, body: { error: "Rate limit" }, headers: { "retry-after": "40" } }]).fetchImpl })
  await assert.rejects(adapter.listProfiles(), (error) => error.kind === "rate_limited" && error.retryAfterSeconds === 40 && !error.terminal)
})

test("adaptador: un envío con timeout o 5xx queda ambiguo y nunca se reintenta solo", async () => {
  const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" })
  const first = fakeFetch([timeout, { status: 200, body: {} }])
  const adapter = createZernioAdapter({ apiKey: "k", fetchImpl: first.fetchImpl, sleep: async () => {} })
  await assert.rejects(adapter.sendMessage("conv", { accountId: "a", message: "hola" }, "idem-1"), (error) => error.ambiguous && error.kind === "timeout")
  assert.equal(first.calls.length, 1)
  assert.equal(first.calls[0].init.headers["Idempotency-Key"], "idem-1")
  const server = fakeFetch([{ status: 500, body: { error: "boom" } }])
  await assert.rejects(createZernioAdapter({ apiKey: "k", fetchImpl: server.fetchImpl }).replyToComment("p", { accountId: "a", message: "x" }, "k2"),
    (error) => error.ambiguous && error.kind === "server")
  const invalid = fakeFetch([{ status: 400, body: { error: "privateReplyConsumed", details: { privateReplyConsumed: true } } }])
  await assert.rejects(createZernioAdapter({ apiKey: "k", fetchImpl: invalid.fetchImpl }).privateReply("p", "c", { accountId: "a", message: "x" }),
    (error) => !error.ambiguous && error.terminal && error.details.privateReplyConsumed === true)
})

test("firma HMAC-SHA256 del cuerpo crudo con comparación constante", () => {
  const body = JSON.stringify({ id: "evt", event: "webhook.test" })
  const signature = crypto.createHmac("sha256", "secreto").update(body).digest("hex")
  assert.equal(verifyZernioSignature(body, signature, "secreto"), true)
  assert.equal(verifyZernioSignature(body, signature.toUpperCase(), "secreto"), true)
  assert.equal(verifyZernioSignature(`${body} `, signature, "secreto"), false)
  assert.equal(verifyZernioSignature(body, signature, undefined), false)
  assert.equal(verifyZernioSignature(body, "abc", "secreto"), false)
})

test("simulador: modos contains/word/exact, exclusiones y tolerancia documentada", () => {
  assert.equal(keywordMatches("happy day", "app", "contains"), true)
  assert.equal(keywordMatches("happy day", "app", "word"), false)
  assert.equal(keywordMatches("INFO", "info", "exact"), true)
  assert.equal(keywordMatches("quiero la infor", "info", "word", true), true) // 1 edición para 4–7
  assert.equal(keywordMatches("quiero pro", "pre", "word", true), false) // <4 caracteres no es difuso
  const result = simulateRule({ keywords: ["precio"], exclude_keywords: ["gratis"], match_mode: "word" }, [
    { id: "1", text: "¿Precio?" }, { id: "2", text: "precio gratis?" }, { id: "3", text: "hola" },
  ])
  assert.deepEqual(result.results.map((row) => row.matched), [true, false, false])
  assert.match(result.results[1].reason, /excluido/)
  const body = toZernioAutomationBody({ name: "Info", config: { keywords: ["info"], dm_message: "Hola", match_mode: "word", platform_post_id: "m1" },
    zernioProfileId: "prof", zernioAccountId: "acc", forCreate: true })
  assert.deepEqual(body, { name: "Info", trigger: "comment", keywords: ["info"], matchMode: "word", dmMessage: "Hola", profileId: "prof", accountId: "acc", platformPostId: "m1" })
})

test("política: solo admin global activo/autorizado; mutaciones exigen mismo origen", () => {
  assert.equal(isGlobalAdminProfile({ role: "admin", is_authorized: true, is_active: true, deleted_at: null }), true)
  for (const profile of [
    { role: "member", is_authorized: true, is_active: true, deleted_at: null },
    { role: "admin", is_authorized: false, is_active: true, deleted_at: null },
    { role: "admin", is_authorized: true, is_active: false, deleted_at: null },
    { role: "admin", is_authorized: true, is_active: true, deleted_at: "2026-01-01" },
    null,
  ]) assert.equal(isGlobalAdminProfile(profile), false)
  const same = new Request("https://quepia.com/api/admin/social/threads/x", { method: "PATCH", headers: { origin: "https://quepia.com", "sec-fetch-site": "same-origin" } })
  assert.equal(isSameOriginMutation(same, null), true)
  const cross = new Request("https://quepia.com/api/admin/social/threads/x", { method: "PATCH", headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" } })
  assert.equal(isSameOriginMutation(cross, null), false)
  const noOrigin = new Request("https://quepia.com/api/x", { method: "POST" })
  assert.equal(isSameOriginMutation(noOrigin, null), false)
})

test("los límites HTTP cuentan bytes UTF-8 y no unidades UTF-16", () => {
  assert.equal(utf8ByteLength("abc"), 3)
  assert.equal(utf8ByteLength("á"), 2)
  assert.equal(utf8ByteLength("😀"), 4)
})
