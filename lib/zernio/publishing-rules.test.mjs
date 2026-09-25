import assert from "node:assert/strict"
import test from "node:test"
import {
  buildZernioPlatformTargets,
  buildZernioTimingFields,
  localDateTimeToUtcIso,
  INSTAGRAM_REEL_MAX_SECONDS,
  INSTAGRAM_REEL_MIN_SECONDS,
  scheduledForDatabaseValue,
  validateMediaScheduleWindow,
  validateReelAssets,
} from "./publishing-rules.ts"

test("acepta la duración vigente de Reels de Instagram", () => {
  assert.equal(INSTAGRAM_REEL_MIN_SECONDS, 3)
  assert.equal(INSTAGRAM_REEL_MAX_SECONDS, 15 * 60)
  assert.ok(96 >= INSTAGRAM_REEL_MIN_SECONDS && 96 <= INSTAGRAM_REEL_MAX_SECONDS)
})

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
  assert.deepEqual(buildZernioTimingFields(null, true), { isDraft: true })
})

test("limita las Stories a los campos compatibles de Instagram", () => {
  assert.deepEqual(
    buildZernioPlatformTargets([
      { platform: "instagram", zernio_account_id: "ig_1" },
    ], {
      isInstagramReel: false,
      instagram: {
        contentType: "story",
        shareToFeed: true,
        commentsEnabled: false,
        isAiGenerated: true,
        locationId: "123",
        collaborators: ["colaborador"],
        muteAudio: true,
        firstComment: "No debe enviarse",
        isPaidPartnership: true,
      },
    }),
    [{
      platform: "instagram",
      accountId: "ig_1",
      platformSpecificData: {
        isAiGenerated: true,
        contentType: "story",
        muteAudio: true,
      },
    }],
  )
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

test("configura las opciones de Instagram solo en ese destino", () => {
  assert.deepEqual(
    buildZernioPlatformTargets([
      { platform: "instagram", zernio_account_id: "ig_1" },
      { platform: "linkedin", zernio_account_id: "li_1" },
    ], {
      isInstagramReel: true,
      instagramThumbnail: "https://cdn.example.com/cover.jpg",
      instagram: {
        shareToFeed: false,
        commentsEnabled: false,
        isAiGenerated: true,
        locationId: "123",
        collaborators: ["colaborador"],
        audioConfiguration: { audioId: "track_1", audioVolume: 80, videoVolume: 40 },
        trialParams: { graduationStrategy: "MANUAL" },
      },
    }),
    [
      {
        platform: "instagram",
        accountId: "ig_1",
        platformSpecificData: {
          commentsEnabled: false,
          isAiGenerated: true,
          locationId: "123",
          collaborators: ["colaborador"],
          shareToFeed: false,
          instagramThumbnail: "https://cdn.example.com/cover.jpg",
          audioConfiguration: { audioId: "track_1", audioVolume: 80, videoVolume: 40 },
          trialParams: { graduationStrategy: "MANUAL" },
        },
      },
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
