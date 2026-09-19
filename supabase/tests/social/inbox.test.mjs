import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createSocialDb, IDS, rpc, seedClientWithAccounts } from "./harness.mjs"

const db = await createSocialDb()
const MIN = 60_000
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()

const camping = await seedClientWithAccounts(db, { name: "Camping", accounts: [{ zernioId: "z_camping" }] })
const bomberos = await seedClientWithAccounts(db, { name: "Bomberos", accounts: [{ zernioId: "z_bomberos" }] })

function dm(overrides = {}, interaction = {}) {
  return {
    zernio_account_id: "z_camping",
    kind: "dm",
    thread_external_id: "conv_1",
    platform: "instagram",
    participant: { id: "user_9", name: "Ana", username: "ana" },
    ...overrides,
    interaction: { external_id: "m1", direction: "incoming", author_id: "user_9", text: "Hola, ¿precios?", occurred_at: iso(120 * MIN), ...interaction },
  }
}

async function threadFor(external) {
  const { rows } = await db.query("SELECT * FROM public.sistema_social_threads WHERE external_thread_id = $1", [external])
  return rows[0]
}

test("un DM entrante abre episodio; el mismo evento repetido no duplica", async () => {
  const first = await rpc(db, "social_ingest_interactions", [[dm()], "webhook"])
  assert.equal(first.data.inserted, 1)
  const again = await rpc(db, "social_ingest_interactions", [[dm()], "webhook"])
  assert.equal(again.data.inserted, 0)
  assert.equal(again.data.updated, 1)
  const thread = await threadFor("conv_1")
  assert.equal(thread.attention_status, "new")
  assert.ok(thread.pending_since)
  const episodes = await db.query("SELECT count(*)::int AS n FROM public.sistema_social_attention_episodes WHERE thread_id = $1", [thread.id])
  assert.equal(episodes.rows[0].n, 1)
})

test("eventos de cuentas desconocidas o sin cliente quedan en cuarentena", async () => {
  const result = await rpc(db, "social_ingest_interactions", [[dm({ zernio_account_id: "nadie" })], "webhook"])
  assert.equal(result.data.inserted, 0)
  assert.equal(result.data.quarantined[0].reason, "unknown_account")
})

test("una respuesta automática no cuenta como humana; sentVia nulo no se atribuye a un admin", async () => {
  await rpc(db, "social_ingest_interactions", [[
    dm({}, { external_id: "m2", direction: "outgoing", author_id: "z_camping", text: "Auto", sent_via: "comment_automation", occurred_at: iso(119 * MIN) }),
  ], "webhook"])
  let episode = (await db.query("SELECT * FROM public.sistema_social_attention_episodes WHERE resolved_at IS NULL")).rows[0]
  assert.ok(episode.first_automated_response_at)
  assert.equal(episode.first_human_response_at, null)
  await rpc(db, "social_ingest_interactions", [[
    dm({}, { external_id: "m3", direction: "incoming", text: "Gracias, ¿y para 4?", occurred_at: iso(100 * MIN) }),
    dm({}, { external_id: "m4", direction: "outgoing", text: "Respuesta desde el celular", sent_via: null, occurred_at: iso(90 * MIN) }),
  ], "webhook"])
  const { rows } = await db.query("SELECT origin, sent_by FROM public.sistema_social_interactions WHERE external_id = 'm4'")
  assert.deepEqual(rows[0], { origin: "external_unknown", sent_by: null })
  episode = (await db.query("SELECT * FROM public.sistema_social_attention_episodes WHERE resolved_at IS NULL")).rows[0]
  assert.equal(episode.first_human_response_at, null)
})

test("asignación solo a admins globales y control de versión en ediciones concurrentes", async () => {
  const thread = await threadFor("conv_1")
  const bad = await rpc(db, "social_admin_update_thread", [IDS.admin, thread.id, thread.version, { assignee_id: IDS.member }])
  assert.equal(bad.error.code, "invalid_assignee")
  const ok = await rpc(db, "social_admin_update_thread", [IDS.admin, thread.id, thread.version, { assignee_id: IDS.admin2 }])
  assert.equal(ok.ok, true, JSON.stringify(ok))
  assert.equal(ok.data.attention_status, "assigned")
  const stale = await rpc(db, "social_admin_update_thread", [IDS.admin2, thread.id, thread.version, { status: "resolved" }])
  assert.equal(stale.error.code, "version_conflict")
  const member = await rpc(db, "social_admin_update_thread", [IDS.member, thread.id, ok.data.version, { status: "resolved" }])
  assert.equal(member.error.code, "forbidden")
})

test("un proyecto de otro cliente no puede asociarse al hilo", async () => {
  const thread = await threadFor("conv_1")
  const result = await rpc(db, "social_admin_update_thread", [IDS.admin, thread.id, thread.version, { project_id: bomberos.projectIds[0] }])
  assert.equal(result.error.code, "scope_mismatch")
})

test("las notas internas se guardan sin registrar su contenido en auditoría", async () => {
  const thread = await threadFor("conv_1")
  const note = await rpc(db, "social_admin_add_note", [IDS.admin, thread.id, "Cliente VIP, no ofrecer descuento"])
  assert.equal(note.ok, true)
  const audit = await db.query("SELECT changes::text AS changes FROM public.sistema_social_audit_events WHERE action = 'note.created'")
  assert.ok(!audit.rows[0].changes.includes("VIP"))
})

test("respuesta: idempotente, bloquea doble respuesta y registra al admin al confirmarse", async () => {
  let thread = await threadFor("conv_1")
  const requestId = randomUUID()
  const enqueued = await rpc(db, "social_admin_enqueue_reply", [IDS.admin, thread.id, thread.version, "send_dm", "Sí, tenemos lugar", null, requestId])
  assert.equal(enqueued.ok, true, JSON.stringify(enqueued))
  const replay = await rpc(db, "social_admin_enqueue_reply", [IDS.admin, thread.id, thread.version, "send_dm", "Sí, tenemos lugar", null, requestId])
  assert.equal(replay.data.replayed, true)
  thread = await threadFor("conv_1")
  const other = await rpc(db, "social_admin_enqueue_reply", [IDS.admin2, thread.id, thread.version, "send_dm", "Otra respuesta", null, randomUUID()])
  assert.equal(other.ok, false)
  assert.ok(["claimed_by_other", "reply_in_flight"].includes(other.error.code))
  const wrongKind = await rpc(db, "social_admin_enqueue_reply", [IDS.admin, thread.id, thread.version, "reply_comment", "x", null, randomUUID()])
  assert.equal(wrongKind.error.code, "unsupported_action")

  const begun = await rpc(db, "social_outbox_begin", [requestId])
  assert.equal(begun.ok, true)
  // Timeout tras aceptación: queda ambiguo, no se reintenta solo.
  const ambiguous = await rpc(db, "social_outbox_finish", [requestId, "ambiguous", null, null, "timeout"])
  assert.equal(ambiguous.data.status, "ambiguous")
  const pending = await rpc(db, "social_outbox_pending", [10])
  assert.ok(!pending.data.includes(requestId))
  // La conciliación confirma el envío con el id del proveedor.
  const sent = await rpc(db, "social_outbox_finish", [requestId, "sent", "mid_555", { success: true }, null])
  assert.equal(sent.data.status, "sent")
  // El eco del webhook con el mismo id no duplica la interacción.
  await rpc(db, "social_ingest_interactions", [[dm({}, { external_id: "mid_555", direction: "outgoing", text: "Sí, tenemos lugar", sent_via: "api", occurred_at: iso(0) })], "webhook"])
  const outbound = await db.query("SELECT origin, sent_by FROM public.sistema_social_interactions WHERE external_id = 'mid_555'")
  assert.equal(outbound.rows.length, 1)
  assert.deepEqual(outbound.rows[0], { origin: "quepia_admin", sent_by: IDS.admin })
  const episode = (await db.query("SELECT first_human_response_at, first_human_responder FROM public.sistema_social_attention_episodes WHERE first_human_response_at IS NOT NULL")).rows[0]
  assert.equal(episode.first_human_responder, IDS.admin)
  thread = await threadFor("conv_1")
  assert.equal(thread.attention_status, "waiting")
  assert.equal(thread.pending_since, null)
})

test("una acción diferida de un admin revocado se cancela antes de enviarse", async () => {
  const thread = await threadFor("conv_1")
  await db.query("UPDATE public.sistema_social_threads SET claimed_by = NULL, claimed_until = NULL WHERE id = $1", [thread.id])
  const requestId = randomUUID()
  const enqueued = await rpc(db, "social_admin_enqueue_reply", [IDS.admin2, thread.id, thread.version, "send_dm", "Hola", null, requestId])
  assert.equal(enqueued.ok, true, JSON.stringify(enqueued))
  await db.query("UPDATE public.sistema_users SET is_active = false WHERE id = $1", [IDS.admin2])
  const begun = await rpc(db, "social_outbox_begin", [requestId])
  assert.equal(begun.error.code, "author_revoked")
  await db.query("UPDATE public.sistema_users SET is_active = true WHERE id = $1", [IDS.admin2])
})

test("un entrante posterior a la resolución reabre el hilo", async () => {
  let thread = await threadFor("conv_1")
  const resolved = await rpc(db, "social_admin_update_thread", [IDS.admin, thread.id, thread.version, { status: "resolved" }])
  assert.equal(resolved.data.attention_status, "resolved")
  await rpc(db, "social_ingest_interactions", [[dm({}, { external_id: "m9", text: "Una consulta más", occurred_at: iso(-1 * MIN) })], "webhook"])
  thread = await threadFor("conv_1")
  assert.equal(thread.attention_status, "assigned")
  const reopened = await db.query("SELECT count(*)::int AS n FROM public.sistema_social_attention_episodes WHERE thread_id = $1 AND is_reopen", [thread.id])
  assert.equal(reopened.rows[0].n, 1)
})

test("respuesta privada: solo comentarios IG/FB, dentro de 7 días y una sola vez", async () => {
  const comment = {
    zernio_account_id: "z_camping", kind: "comment", thread_external_id: "c_root", platform: "instagram",
    post: { platform_post_id: "ig_media_1" }, participant: { id: "u2", username: "pepe" },
    interaction: { external_id: "c_root", direction: "incoming", text: "INFO", occurred_at: iso(10 * MIN) },
  }
  const old = { ...comment, thread_external_id: "c_old", interaction: { ...comment.interaction, external_id: "c_old", occurred_at: iso(8 * 24 * 60 * MIN) } }
  await rpc(db, "social_ingest_interactions", [[comment, old], "webhook"])
  const thread = await threadFor("c_root")
  const first = await rpc(db, "social_admin_enqueue_reply", [IDS.admin, thread.id, thread.version, "private_reply", "Te escribimos por DM", "c_root", randomUUID()])
  assert.equal(first.ok, true, JSON.stringify(first))
  const refreshed = await threadFor("c_root")
  const second = await rpc(db, "social_admin_enqueue_reply", [IDS.admin, thread.id, refreshed.version, "private_reply", "Otra", "c_root", randomUUID()])
  assert.equal(second.error.code, "private_reply_consumed")
  const oldThread = await threadFor("c_old")
  const expired = await rpc(db, "social_admin_enqueue_reply", [IDS.admin, oldThread.id, oldThread.version, "private_reply", "Tarde", "c_old", randomUUID()])
  assert.equal(expired.error.code, "window_expired")
})

test("el historial importado antiguo no genera pendientes ni entra al SLA", async () => {
  await rpc(db, "social_ingest_interactions", [[
    dm({ thread_external_id: "conv_old" }, { external_id: "old1", occurred_at: iso(30 * 24 * 60 * MIN) }),
  ], "backfill"])
  const thread = await threadFor("conv_old")
  assert.equal(thread.attention_status, "resolved")
  assert.equal(thread.imported_as_historical, true)
  assert.equal(thread.pending_since, null)
})

test("el SLA agregado separa humano/automático, incluye pendientes y no expone cuerpos", async () => {
  const today = new Date().toISOString().slice(0, 10)
  const result = await rpc(db, "social_query", [IDS.admin, "attention", { client_ids: [camping.clientId], from: "2026-01-01", to: today }])
  assert.equal(result.ok, true, JSON.stringify(result))
  const data = result.data.result
  assert.ok(data.episodes_opened >= 2)
  assert.equal(data.episodes_with_human_response, 1)
  assert.ok(data.first_human_response_minutes.median_wall > 0)
  assert.ok(data.pending_now.threads >= 1)
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes("precios"))
  assert.ok(!serialized.includes("VIP"))
})

test("el listado y detalle de bandeja son exclusivos de admins y ocultan mensajes borrados", async () => {
  const denied = await rpc(db, "social_admin_list_threads", [IDS.member, {}])
  assert.equal(denied.error.code, "forbidden")
  await rpc(db, "social_ingest_interactions", [[dm({}, { external_id: "m9", is_deleted: true, deleted_at: iso(0) })], "webhook"])
  const thread = await threadFor("conv_1")
  const detail = await rpc(db, "social_admin_get_thread", [IDS.admin, thread.id])
  const deleted = detail.data.interactions.find((interaction) => interaction.external_id === "m9")
  assert.equal(deleted.is_deleted, true)
  assert.equal(deleted.body, null)
  const listed = await rpc(db, "social_admin_list_threads", [IDS.admin, { client_ids: [bomberos.clientId] }])
  assert.equal(listed.data.threads.length, 0)
})
