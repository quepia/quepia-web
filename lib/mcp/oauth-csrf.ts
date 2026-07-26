import { createHmac, timingSafeEqual } from "node:crypto"

const CSRF_TOKEN_VERSION = "v1"
const CSRF_TOKEN_TTL_SECONDS = 10 * 60
const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/
const CSRF_COOKIE_SECRET_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OAUTH_CSRF_TOKEN_PATTERN =
  /^v1\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface OAuthCsrfBinding {
  authorizationId: string
  userId: string
  sessionId: string
  cookieSecret: string
}

interface OAuthCsrfTokenInput extends OAuthCsrfBinding {
  nowSeconds?: number
}

function isValidBinding(binding: OAuthCsrfBinding): boolean {
  return (
    AUTHORIZATION_ID_PATTERN.test(binding.authorizationId) &&
    UUID_PATTERN.test(binding.userId) &&
    UUID_PATTERN.test(binding.sessionId) &&
    CSRF_COOKIE_SECRET_PATTERN.test(binding.cookieSecret)
  )
}

function csrfMessage(
  binding: OAuthCsrfBinding,
  expiresAt: number,
): string {
  return [
    CSRF_TOKEN_VERSION,
    String(expiresAt),
    binding.authorizationId,
    binding.userId,
    binding.sessionId,
  ].join("\n")
}

function createSignature(
  binding: OAuthCsrfBinding,
  expiresAt: number,
): string {
  return createHmac("sha256", binding.cookieSecret)
    .update(csrfMessage(binding, expiresAt))
    .digest("base64url")
}

export function createOAuthCsrfToken({
  nowSeconds = Math.floor(Date.now() / 1000),
  ...binding
}: OAuthCsrfTokenInput): string {
  if (!Number.isSafeInteger(nowSeconds) || !isValidBinding(binding)) {
    throw new Error("INVALID_OAUTH_CSRF_BINDING")
  }

  const expiresAt = nowSeconds + CSRF_TOKEN_TTL_SECONDS
  return [
    CSRF_TOKEN_VERSION,
    String(expiresAt),
    createSignature(binding, expiresAt),
  ].join(".")
}

export function verifyOAuthCsrfToken(
  token: string,
  {
    nowSeconds = Math.floor(Date.now() / 1000),
    ...binding
  }: OAuthCsrfTokenInput,
): boolean {
  if (
    !Number.isSafeInteger(nowSeconds) ||
    !isValidBinding(binding) ||
    !OAUTH_CSRF_TOKEN_PATTERN.test(token)
  ) {
    return false
  }

  const [, expiresValue, suppliedSignature] = token.split(".")
  const expiresAt = Number(expiresValue)
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < nowSeconds ||
    expiresAt > nowSeconds + CSRF_TOKEN_TTL_SECONDS
  ) {
    return false
  }

  const expectedSignature = createSignature(binding, expiresAt)
  const suppliedBuffer = Buffer.from(suppliedSignature, "base64url")
  const expectedBuffer = Buffer.from(expectedSignature, "base64url")

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  )
}
