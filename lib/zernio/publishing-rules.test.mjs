import assert from "node:assert/strict"
import test from "node:test"
import {
  buildZernioPlatformTargets,
  buildZernioTimingFields,
  localDateTimeToUtcIso,
  scheduledForDatabaseValue,
  validateMediaScheduleWindow,
  validateReelAssets,
} from "./publishing-rules.ts"

test("convierte la hora de Córdoba a un instante UTC sin depender de la zona del navegador", () => {
  assert.equal(localDateTimeToUtcIso("2026-08-21T12:30"), "2026-08-21T15:30:00.000Z")
})

test("rechaza fechas inválidas o pasadas", () => {
  assert.throws(() => localDateTimeToUtcIso("2026-02-30T12:00"), /no es válida/)
  assert.throws(
    () => scheduledForDatabaseValue("2026-08-21T12:30", Date.parse("2026-08-21T16:00:00.000Z")),
    /debe estar en el futuro/,
  )
})

test("crea campos mutuamente excluyentes para publicar ahora o programar", () => {
  assert.deepEqual(buildZernioTimingFields(null), { publishNow: true })
  assert.deepEqual(buildZernioTimingFields("2026-08-21T12:30"), { scheduledFor: "2026-08-21T12:30" })
})

test("limita a siete días la programación de contenido con medios", () => {
  const now = Date.parse("2026-08-21T12:00:00.000Z")
  assert.doesNotThrow(() => validateMediaScheduleWindow("2026-08-28T12:00:00.000Z", true, now))
  assert.throws(
    () => validateMediaScheduleWindow("2026-08-28T12:00:01.000Z", true, now),
    /próximos 7 días/,
  )
  assert.doesNotThrow(() => validateMediaScheduleWindow("2026-09-28T12:00:00.000Z", false, now))
})

test("configura shareToFeed solamente para un Reel de Instagram", () => {
  assert.deepEqual(
    buildZernioPlatformTargets([
      { platform: "instagram", zernio_account_id: "ig_1" },
      { platform: "linkedin", zernio_account_id: "li_1" },
    ], { isInstagramReel: true, shareToFeed: false }),
    [
      { platform: "instagram", accountId: "ig_1", platformSpecificData: { shareToFeed: false } },
      { platform: "linkedin", accountId: "li_1" },
    ],
  )
})

test("un Reel requiere un único video MP4 o MOV", () => {
  assert.equal(validateReelAssets([{ assetType: "reel", fileType: "video/quicktime" }]), true)
  assert.throws(
    () => validateReelAssets([
      { assetType: "reel", fileType: "video/mp4" },
      { assetType: "single", fileType: "image/jpeg" },
    ]),
    /únicamente un video/,
  )
  assert.throws(() => validateReelAssets([{ assetType: "reel", fileType: "video/webm" }]), /MP4 o MOV/)
})
