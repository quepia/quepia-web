import test from "node:test"
import assert from "node:assert/strict"
import { createSocialDb, IDS, rpc, seedClientWithAccounts } from "./harness.mjs"

const db = await createSocialDb()
const camping = await seedClientWithAccounts(db, { name: "Camping", accounts: [{ zernioId: "z_camping" }] })
const other = await seedClientWithAccounts(db, { name: "Otro", accounts: [{ zernioId: "z_other" }] })
await db.query(
  "UPDATE public.sistema_zernio_accounts SET health_status = 'healthy', permissions = ARRAY['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'] WHERE zernio_account_id = 'z_camping'",
)

const baseConfig = { trigger: "comment", keywords: ["info", "precio"], match_mode: "word", dm_message: "¡Hola! Te paso la info." }

test("guardar una automatización crea un borrador versionado, nunca la activa", async () => {
  const saved = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Info general", config: baseConfig,
  }])
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.data.status, "draft")
  const outbox = await db.query("SELECT count(*)::int AS n FROM public.sistema_social_outbox")
  assert.equal(outbox.rows[0].n, 0)
})

test("la cuenta debe ser del cliente indicado y la configuración respeta el contrato", async () => {
  const cross = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: other.accountIds[0], name: "Cruce", config: baseConfig,
  }])
  assert.equal(cross.error.code, "scope_mismatch")
  const dmEverything = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Todo",
    config: { ...baseConfig, keywords: [], also_match_in_dms: true },
  }])
  assert.equal(dmEverything.error.code, "invalid_config")
  const storyPublic = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Story",
    config: { ...baseConfig, trigger: "story_reply", comment_reply: "gracias" },
  }])
  assert.equal(storyPublic.error.code, "invalid_config")
  const member = await rpc(db, "social_admin_save_automation", [IDS.member, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: camping.accountIds[0], name: "x", config: baseConfig,
  }])
  assert.equal(member.error.code, "forbidden")
})

test("activar exige el hash revisado, salud y permisos; luego encola la creación en Zernio", async () => {
  const { rows } = await db.query("SELECT id FROM public.sistema_social_automations WHERE name = 'Info general'")
  const id = rows[0].id
  const mismatch = await rpc(db, "social_admin_request_automation_state", [IDS.admin, id, "active", "hash-viejo"])
  assert.equal(mismatch.error.code, "confirmation_mismatch")
  const listed = await rpc(db, "social_admin_list_automations", [IDS.admin, {}])
  const hash = listed.data.automations.find((automation) => automation.id === id).config_hash
  await db.query("UPDATE public.sistema_zernio_accounts SET needs_reconnection = true WHERE zernio_account_id = 'z_camping'")
  const unhealthy = await rpc(db, "social_admin_request_automation_state", [IDS.admin, id, "active", hash])
  assert.equal(unhealthy.error.code, "account_unavailable")
  await db.query("UPDATE public.sistema_zernio_accounts SET needs_reconnection = false WHERE zernio_account_id = 'z_camping'")
  const requested = await rpc(db, "social_admin_request_automation_state", [IDS.admin, id, "active", hash])
  assert.equal(requested.ok, true, JSON.stringify(requested))
  assert.equal(requested.data.status, "pending_activation")
  const outbox = await db.query("SELECT action_type, status FROM public.sistema_social_outbox WHERE id = $1", [requested.data.outbox_id])
  assert.deepEqual(outbox.rows[0], { action_type: "automation_create", status: "pending" })
  // El worker aplica el resultado del proveedor.
  const applied = await rpc(db, "social_automation_apply_provider_result", [id, true, "zauto_1", true, IDS.admin, null])
  assert.equal(applied.data.status, "active")
})

test("detecta conflictos: regla por publicación duplicada bloquea; palabras superpuestas advierten", async () => {
  const perPost = { ...baseConfig, platform_post_id: "media_1" }
  const first = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Post A", config: perPost,
  }])
  const listed = await rpc(db, "social_admin_list_automations", [IDS.admin, {}])
  const hashA = listed.data.automations.find((automation) => automation.id === first.data.id).config_hash
  await rpc(db, "social_admin_request_automation_state", [IDS.admin, first.data.id, "active", hashA])
  await rpc(db, "social_automation_apply_provider_result", [first.data.id, true, "zauto_2", true, IDS.admin, null])
  const second = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Post A bis",
    config: { ...perPost, keywords: ["otro"] },
  }])
  assert.ok(second.data.conflicts.some((conflict) => conflict.severity === "blocking"))
  const blocked = await rpc(db, "social_admin_request_automation_state", [IDS.admin, second.data.id, "active", second.data.config_hash])
  assert.equal(blocked.error.code, "blocking_conflict")
  const overlap = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "zernio_comment_to_dm", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Precios",
    config: { ...baseConfig, keywords: ["precio", "tarifa"] },
  }])
  assert.ok(overlap.data.conflicts.some((conflict) => conflict.severity === "warning" && /precio/.test(conflict.reason)))
})

test("reglas externas se inventarían como no administradas y logs se deduplican", async () => {
  const synced = await rpc(db, "social_sync_provider_automations", [[
    { id: "zauto_1", accountId: "z_camping", isActive: true, stats: { triggered: 5, dmsSent: 4, dmsFailed: 1 } },
    { id: "zauto_ext", accountId: "z_camping", name: "Hecha en Zernio", isActive: true, keywords: ["info"] },
  ]])
  assert.deepEqual(synced.data, { known: 1, discovered_external: 1, skipped: 0 })
  const { rows } = await db.query("SELECT id, status FROM public.sistema_social_automations WHERE zernio_automation_id = 'zauto_1'")
  const logs = [{ id: "log1", commentId: "c1", status: "sent" }, { id: "log2", commentId: "c2", status: "failed", error: "subcode 1545133", privateReplyConsumed: true }]
  await rpc(db, "social_ingest_automation_logs", [rows[0].id, logs])
  await rpc(db, "social_ingest_automation_logs", [rows[0].id, logs])
  const runs = await db.query("SELECT status, count(*)::int AS n FROM public.sistema_social_automation_runs WHERE automation_id = $1 GROUP BY status ORDER BY status", [rows[0].id])
  assert.deepEqual(runs.rows, [{ status: "failed", n: 1 }, { status: "sent", n: 1 }])
  // La regla externa no puede editarse ni activarse desde Quepia.
  const external = await db.query("SELECT id FROM public.sistema_social_automations WHERE zernio_automation_id = 'zauto_ext'")
  const locked = await rpc(db, "social_admin_save_automation", [IDS.admin, external.rows[0].id, { config: baseConfig }])
  assert.equal(locked.error.code, "locked")
})

test("reglas internas: asignación a admin válido y recordatorio SLA una vez por episodio", async () => {
  await rpc(db, "social_ingest_interactions", [[{
    zernio_account_id: "z_camping", kind: "dm", thread_external_id: "conv_a", platform: "instagram",
    interaction: { external_id: "m1", direction: "incoming", text: "hola", occurred_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
  }], "webhook"])
  const assign = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "quepia_assignment", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Asignar a Admin 2",
    config: { assignee_id: IDS.admin2 },
  }])
  const invalidAssignee = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "quepia_assignment", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Asignar a integrante",
    config: { assignee_id: IDS.member },
  }])
  assert.equal(invalidAssignee.error.code, "invalid_assignee")
  await rpc(db, "social_admin_request_automation_state", [IDS.admin, assign.data.id, "active", assign.data.config_hash])
  const reminder = await rpc(db, "social_admin_save_automation", [IDS.admin, null, {
    engine: "quepia_sla_reminder", client_id: camping.clientId, account_id: camping.accountIds[0], name: "Recordar a las 2 h",
    config: { after_minutes: 120 },
  }])
  await rpc(db, "social_admin_request_automation_state", [IDS.admin, reminder.data.id, "active", reminder.data.config_hash])

  const firstRun = await rpc(db, "social_run_internal_automations", [])
  assert.equal(firstRun.data.assigned, 1)
  const secondRun = await rpc(db, "social_run_internal_automations", [])
  assert.equal(secondRun.data.assigned, 0)
  assert.equal(secondRun.data.reminders, 0)
  const notifications = await db.query("SELECT user_id, type FROM public.sistema_notifications")
  assert.deepEqual(notifications.rows, [{ user_id: IDS.admin2, type: "system" }])
})
