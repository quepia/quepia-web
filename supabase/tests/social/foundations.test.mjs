import test from "node:test"
import assert from "node:assert/strict"
import { asRole, createSocialDb, IDS, pgArray, rpc, seedClientWithAccounts } from "./harness.mjs"

const db = await createSocialDb()

test("solo administradores globales activos, autorizados y no eliminados pasan el predicado", async () => {
  assert.equal(await rpc(db, "social_check_admin", [IDS.admin]), true)
  assert.equal(await rpc(db, "social_check_admin", [IDS.member]), false)
  assert.equal(await rpc(db, "social_check_admin", [IDS.revoked]), false)
  assert.equal(await rpc(db, "social_check_admin", [IDS.unauthorized]), false)
  assert.equal(await rpc(db, "social_check_admin", [null]), false)
  const created = await rpc(db, "social_admin_create_client", [IDS.member, "Intruso"])
  assert.equal(created.ok, false)
  assert.equal(created.error.code, "forbidden")
})

test("un admin eliminado pierde acceso en la siguiente consulta", async () => {
  await db.query("UPDATE public.sistema_users SET deleted_at = now() WHERE id = $1", [IDS.admin2])
  assert.equal(await rpc(db, "social_check_admin", [IDS.admin2]), false)
  await db.query("UPDATE public.sistema_users SET deleted_at = NULL WHERE id = $1", [IDS.admin2])
})

test("anon, authenticated y mcp_authenticated no leen tablas ni ejecutan RPC sociales", async () => {
  for (const role of ["anon", "authenticated", "mcp_authenticated"]) {
    await assert.rejects(asRole(db, role, "SELECT * FROM public.sistema_social_jobs"), /permission denied/)
    await assert.rejects(asRole(db, role, "SELECT * FROM public.sistema_social_audit_events"), /permission denied/)
    await assert.rejects(asRole(db, role, "SELECT public.social_check_admin($1)", [IDS.admin]), /permission denied/)
    await assert.rejects(
      asRole(db, role, "SELECT public.social_admin_create_client($1, 'x')", [IDS.admin]),
      /permission denied/,
    )
  }
})

test("la cuenta hereda el cliente del perfil y no puede cruzar a otro cliente", async () => {
  const a = await seedClientWithAccounts(db, { name: "Camping", accounts: [{ zernioId: "acc_a1" }] })
  const b = await seedClientWithAccounts(db, { name: "Bomberos", accounts: [{ zernioId: "acc_b1" }] })
  const { rows } = await db.query("SELECT client_id FROM public.sistema_zernio_accounts WHERE id = $1", [a.accountIds[0]])
  assert.equal(rows[0].client_id, a.clientId)

  // Forzar una cuenta de A con cliente B viola la FK compuesta perfil-cliente.
  await assert.rejects(
    db.query("UPDATE public.sistema_zernio_accounts SET client_id = $1 WHERE id = $2", [b.clientId, a.accountIds[0]]),
    /foreign key|violates/,
  )
  // Vincular cuenta de A a proyecto de B es rechazado.
  const link = await rpc(db, "social_admin_link_project_account", [IDS.admin, b.projectIds[0], a.accountIds[0], true])
  assert.equal(link.ok, false)
  assert.equal(link.error.code, "scope_mismatch")
  // Reasignar el proyecto de A al cliente B queda bloqueado (no reclasifica histórico).
  const reassign = await rpc(db, "social_admin_assign_project_client", [IDS.admin, a.projectIds[0], b.clientId])
  assert.equal(reassign.ok, false)
  assert.equal(reassign.error.code, "client_reassignment_blocked")
  await assert.rejects(
    db.query("UPDATE public.sistema_zernio_profiles SET client_id = $1 WHERE id = $2", [b.clientId, a.profileIds[0]]),
    /reclasificado/,
  )
})

test("dos cuentas de la misma red para un cliente conviven en perfiles distintos", async () => {
  const seeded = await seedClientWithAccounts(db, {
    name: "Multicuenta",
    projects: 2,
    accounts: [
      { zernioId: "ig_main", profileIndex: 0 },
      { zernioId: "ig_second", profileIndex: 1 },
    ],
  })
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM public.sistema_zernio_accounts WHERE client_id = $1 AND platform = 'instagram' AND is_active",
    [seeded.clientId],
  )
  assert.equal(rows[0].n, 2)
})

test("la reconciliación es atómica y no confunde respuestas parciales con eliminaciones", async () => {
  const seeded = await seedClientWithAccounts(db, {
    name: "Reconciliar",
    accounts: [{ zernioId: "rec_1" }, { zernioId: "rec_2" }],
  })
  const profileId = seeded.profileIds[0]
  // Respuesta parcial: solo rec_1. No debe marcar rec_2 como eliminada.
  let result = await rpc(db, "social_reconcile_profile_accounts", [profileId, [
    { zernio_account_id: "rec_1", platform: "instagram", username: "rec1", platform_user_id: "p1", permissions: ["a"] },
  ], false])
  assert.equal(result.ok, true)
  let state = await db.query("SELECT zernio_account_id, is_active, provider_removed_at FROM public.sistema_zernio_accounts WHERE integration_id = $1 ORDER BY 1", [profileId])
  assert.deepEqual(state.rows.map((row) => [row.zernio_account_id, row.is_active, row.provider_removed_at === null]), [
    ["rec_1", true, true],
    ["rec_2", true, true],
  ])
  // Respuesta completa sin rec_2: queda eliminada del proveedor y registrada.
  result = await rpc(db, "social_reconcile_profile_accounts", [profileId, [
    { zernio_account_id: "rec_1", platform: "instagram", username: "rec1", platform_user_id: "p1" },
  ], true])
  assert.equal(result.data.removed, 1)
  state = await db.query("SELECT health_status, is_active FROM public.sistema_zernio_accounts WHERE zernio_account_id = 'rec_2'")
  assert.deepEqual(state.rows[0], { health_status: "removed", is_active: false })
  // Cambio de identidad nativa queda en historial.
  await rpc(db, "social_reconcile_profile_accounts", [profileId, [
    { zernio_account_id: "rec_1", platform: "instagram", platform_user_id: "p1-new" },
  ], false])
  const history = await db.query(
    "SELECT event FROM public.sistema_social_account_connections c JOIN public.sistema_zernio_accounts a ON a.id = c.account_id WHERE a.zernio_account_id = 'rec_1' ORDER BY c.id",
  )
  assert.ok(history.rows.some((row) => row.event === "identity_changed"))
  // Una cuenta reportada bajo otro perfil no se mueve en silencio.
  const other = await seedClientWithAccounts(db, { name: "Otro perfil" })
  await rpc(db, "social_reconcile_profile_accounts", [other.profileIds[0], [
    { zernio_account_id: "rec_1", platform: "instagram" },
  ], false])
  const owner = await db.query("SELECT integration_id FROM public.sistema_zernio_accounts WHERE zernio_account_id = 'rec_1'")
  assert.equal(owner.rows[0].integration_id, profileId)
})

test("la cola deduplica, reclama con lease y recupera trabajos de un worker caído", async () => {
  const first = await rpc(db, "social_enqueue_job", ["analytics.delta", {}, "delta:global", 10, null, null, null])
  const second = await rpc(db, "social_enqueue_job", ["analytics.delta", {}, "delta:global", 10, null, null, null])
  assert.equal(second.data.deduplicated, true)
  assert.equal(second.data.id, first.data.id)

  const claimed = await rpc(db, "social_claim_jobs", ["worker-a", 5, 60, null])
  assert.equal(claimed.data.jobs.length, 1)
  // Otro worker no puede reclamar lo mismo.
  const none = await rpc(db, "social_claim_jobs", ["worker-b", 5, 60, null])
  assert.equal(none.data.jobs.length, 0)
  // Simula caída: lease vencido.
  await db.query("UPDATE public.sistema_social_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [first.data.id])
  const recovered = await rpc(db, "social_claim_jobs", ["worker-b", 5, 60, null])
  assert.equal(recovered.data.recovered_leases, 1)
  assert.equal(recovered.data.jobs[0].id, first.data.id)
  assert.equal(recovered.data.jobs[0].attempts, 2)
  // El worker original ya no puede completar (evita doble efecto).
  const stale = await rpc(db, "social_complete_job", [first.data.id, "worker-a", {}])
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, "lease_lost")
  const done = await rpc(db, "social_complete_job", [first.data.id, "worker-b", { ok: 1 }])
  assert.equal(done.ok, true)
  // Tras completar, la misma clave de deduplicación puede volver a encolarse.
  const again = await rpc(db, "social_enqueue_job", ["analytics.delta", {}, "delta:global", 10, null, null, null])
  assert.equal(again.data.deduplicated, false)
})

test("fallas terminales no se reintentan; 429 respeta Retry-After", async () => {
  const job = await rpc(db, "social_enqueue_job", ["health.check", {}, "health:test", 20, null, null, null])
  await rpc(db, "social_claim_jobs", ["w", 1, 60, pgArray(["health.check"])])
  const retry = await rpc(db, "social_fail_job", [job.data.id, "w", "429", 42, false])
  assert.equal(retry.data.status, "queued")
  assert.equal(retry.data.retry_in_seconds, 42)
  await db.query("UPDATE public.sistema_social_jobs SET run_after = now() WHERE id = $1", [job.data.id])
  await rpc(db, "social_claim_jobs", ["w", 1, 60, pgArray(["health.check"])])
  const terminal = await rpc(db, "social_fail_job", [job.data.id, "w", "402 payment required", null, true])
  assert.equal(terminal.data.status, "failed")
})

test("webhooks duplicados se registran una sola vez y cuentan redeliveries", async () => {
  const args = ["test", "operations", "evt-1", "comment.received", "2026-09-18T10:00:00Z", "acc_a1", "zp", { id: "evt-1" }, "hash-1", true, 30]
  const first = await rpc(db, "social_record_webhook", args)
  assert.equal(first.data.duplicate, false)
  const again = await rpc(db, "social_record_webhook", args)
  assert.equal(again.data.duplicate, true)
  const { rows } = await db.query("SELECT duplicate_deliveries, client_id IS NOT NULL AS has_client FROM public.sistema_social_webhook_events WHERE external_event_id = 'evt-1'")
  assert.equal(rows[0].duplicate_deliveries, 1)
  assert.equal(rows[0].has_client, true)
})

test("la auditoría es de solo inserción", async () => {
  await assert.rejects(db.query("UPDATE public.sistema_social_audit_events SET action = 'x'"), /solo inserción/)
  await assert.rejects(db.query("DELETE FROM public.sistema_social_audit_events"), /solo inserción/)
})

test("la retención redacta payloads vencidos conservando el hash", async () => {
  await db.query("UPDATE public.sistema_social_provider_payloads SET retain_until = now() - interval '1 day'")
  const result = await rpc(db, "social_apply_payload_retention", [100])
  assert.ok(result.data.redacted >= 1)
  const { rows } = await db.query("SELECT payload, payload_hash FROM public.sistema_social_provider_payloads LIMIT 1")
  assert.deepEqual(rows[0].payload, { redacted: true })
  assert.ok(rows[0].payload_hash)
})
