import { createHmac, timingSafeEqual } from "node:crypto"

const MEDIA_URL_TTL_SECONDS = 30 * 60

function getSigningSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) throw new Error("Content Copilot media signing secret is not configured")
  return secret
}

function createSignature(versionId: string, expires: number) {
  return createHmac("sha256", getSigningSecret())
    .update(`${versionId}:${expires}`)
    .digest("hex")
}

export function createContentCopilotMediaUrl(origin: string, versionId: string) {
  const expires = Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_SECONDS
  const url = new URL(`/api/ai/content-copilot/media/${encodeURIComponent(versionId)}`, origin)
  url.searchParams.set("expires", String(expires))
  url.searchParams.set("signature", createSignature(versionId, expires))
  return url
}

export function verifyContentCopilotMediaToken(versionId: string, expiresValue: string, signature: string) {
  const expires = Number(expiresValue)
  if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false

  const expected = createSignature(versionId, expires)
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false

  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))
}
