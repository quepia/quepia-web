export const MCP_OAUTH_CSRF_COOKIE_NAME = "quepia_oauth_csrf"
export const MCP_OAUTH_CSRF_COOKIE_MAX_AGE_SECONDS = 15 * 60

const CSRF_COOKIE_SECRET_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isOAuthCsrfCookieSecret(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    CSRF_COOKIE_SECRET_PATTERN.test(value)
  )
}
