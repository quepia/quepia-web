export const ZERNIO_TIME_ZONE = "America/Argentina/Cordoba"
export const ZERNIO_MEDIA_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

type LocalDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export type ZernioAccountTarget = {
  platform: string
  zernio_account_id: string
}

export type ZernioReelAsset = {
  assetType: string
  fileType: string | null
}

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value)
  if (!match) throw new Error("La fecha programada no tiene un formato válido")

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  }
  const candidate = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ))
  if (
    candidate.getUTCFullYear() !== parts.year
    || candidate.getUTCMonth() !== parts.month - 1
    || candidate.getUTCDate() !== parts.day
    || candidate.getUTCHours() !== parts.hour
    || candidate.getUTCMinutes() !== parts.minute
    || candidate.getUTCSeconds() !== parts.second
  ) {
    throw new Error("La fecha programada no es válida")
  }
  return parts
}

function partsInTimeZone(date: Date, timeZone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function partsAsUtc(parts: LocalDateTimeParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

export function localDateTimeToUtcIso(value: string, timeZone = ZERNIO_TIME_ZONE) {
  const requested = parseLocalDateTime(value)
  const wallClockAsUtc = partsAsUtc(requested)

  let instant = wallClockAsUtc
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const represented = partsInTimeZone(new Date(instant), timeZone)
    instant += wallClockAsUtc - partsAsUtc(represented)
  }

  const represented = partsInTimeZone(new Date(instant), timeZone)
  if (partsAsUtc(represented) !== wallClockAsUtc) {
    throw new Error("La fecha programada no existe en la zona horaria configurada")
  }
  return new Date(instant).toISOString()
}

export function scheduledForDatabaseValue(
  value: string | null,
  now = Date.now(),
  timeZone = ZERNIO_TIME_ZONE,
) {
  if (!value) return null
  const scheduledFor = localDateTimeToUtcIso(value, timeZone)
  if (new Date(scheduledFor).getTime() <= now) {
    throw new Error("La fecha programada debe estar en el futuro")
  }
  return scheduledFor
}

export function buildZernioTimingFields(scheduledFor: string | null) {
  return scheduledFor ? { scheduledFor } : { publishNow: true }
}

export function validateMediaScheduleWindow(
  scheduledForDatabase: string | null,
  hasMedia: boolean,
  now = Date.now(),
) {
  if (
    scheduledForDatabase
    && hasMedia
    && new Date(scheduledForDatabase).getTime() - now > ZERNIO_MEDIA_RETENTION_MS
  ) {
    throw new Error("Las publicaciones con assets deben programarse dentro de los próximos 7 días por la vigencia temporal del archivo en Zernio")
  }
}

export function validateReelAssets(assets: ZernioReelAsset[]) {
  const hasReel = assets.some((asset) => asset.assetType === "reel")
  if (!hasReel) return false
  if (assets.length !== 1) {
    throw new Error("Para publicar un Reel seleccioná únicamente un video")
  }

  const [asset] = assets
  if (asset.fileType && !asset.fileType.startsWith("video/")) {
    throw new Error("El asset marcado como Reel no contiene un video")
  }
  if (asset.fileType && !["video/mp4", "video/quicktime"].includes(asset.fileType)) {
    throw new Error("Instagram admite Reels en formato MP4 o MOV")
  }
  return true
}

export function buildZernioPlatformTargets(
  accounts: ZernioAccountTarget[],
  options: { isInstagramReel: boolean; shareToFeed: boolean },
) {
  return accounts.map((account) => {
    const target: Record<string, unknown> = {
      platform: account.platform,
      accountId: account.zernio_account_id,
    }
    if (options.isInstagramReel && account.platform.toLowerCase() === "instagram") {
      target.platformSpecificData = { shareToFeed: options.shareToFeed }
    }
    return target
  })
}
