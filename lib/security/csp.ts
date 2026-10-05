/** Private pages use a fresh nonce; the public marketing site stays cacheable. */
export function isNonceProtectedPage(pathname: string): boolean {
  return ["/sistema", "/admin", "/auth", "/oauth"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function privateContentSecurityPolicy(nonce: string, development = false): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://use.typekit.net",
    "font-src 'self' data: https://fonts.gstatic.com https://use.typekit.net https://p.typekit.net",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    `connect-src 'self' https://www.googleapis.com https://*.supabase.co https://*.supabase.com${development ? " ws: wss:" : ""}`,
    "frame-src 'self' https://drive.google.com https://www.youtube.com https://www.youtube-nocookie.com",
    "frame-ancestors 'self'",
    "form-action 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ")
}
