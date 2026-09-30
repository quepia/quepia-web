export function requiresAdminMfa(pathname: string): boolean {
  return pathname === "/sistema" || pathname.startsWith("/sistema/")
    || pathname === "/admin" || pathname.startsWith("/admin/")
    || pathname === "/api/zernio" || pathname.startsWith("/api/zernio/")
    || pathname === "/api/admin/social" || pathname.startsWith("/api/admin/social/")
}
