import test from "node:test"
import assert from "node:assert/strict"
import { isVerifiedAdminSession } from "../mcp/session-boundary.ts"
import { requiresAdminMfa } from "../sistema/auth/mfa-policy.ts"
import { isNonceProtectedPage, privateContentSecurityPolicy } from "./csp.ts"

test("MFA accepts only first-party sessions with verified assurance", () => {
  assert.equal(isVerifiedAdminSession({ role: "authenticated", aal: "aal2" }), true)
  for (const claims of [null, {}, { role: "authenticated", aal: "aal1" },
    { role: "authenticated", aal: "aal2", client_id: "oauth-client" },
    { role: "mcp_authenticated", aal: "aal2" }]) {
    assert.equal(isVerifiedAdminSession(claims), false)
  }
})

test("MFA protects all social entrypoints and leaves enrollment accessible", () => {
  for (const path of ["/sistema", "/sistema/mcp", "/admin", "/api/zernio/publish", "/api/admin/social/threads/id/replies"]) {
    assert.equal(requiresAdminMfa(path), true)
  }
  for (const path of ["/auth/mfa", "/auth/login", "/api/webhooks/zernio/operations", "/api/internal/social/process"]) {
    assert.equal(requiresAdminMfa(path), false)
  }
})

test("private production pages disallow untrusted inline scripts and eval", () => {
  const policy = privateContentSecurityPolicy("nonce-a")
  const scripts = policy.split("; ").find((p) => p.startsWith("script-src"))
  assert.ok(scripts.includes("'nonce-nonce-a'"))
  assert.ok(scripts.includes("'strict-dynamic'"))
  assert.ok(!scripts.includes("unsafe-inline"))
  assert.ok(!scripts.includes("unsafe-eval"))
  assert.notEqual(policy, privateContentSecurityPolicy("nonce-b"))
  assert.ok(privateContentSecurityPolicy("nonce-a", true).includes("unsafe-eval"))
  assert.equal(isNonceProtectedPage("/auth/mfa"), true)
  assert.equal(isNonceProtectedPage("/sistema"), true)
  assert.equal(isNonceProtectedPage("/sistema-other"), false)
  assert.equal(isNonceProtectedPage("/"), false)
})


test("middleware skips public media but always protects API and private paths", async () => {
  const { projectModule } = await import('../../scripts/lib/load-project-module.mjs')
  const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server.js')
  const { config } = projectModule('middleware.ts', {
    '@/lib/supabase/middleware': { updateSession: () => {} },
    '@/lib/security/csp': {},
  })
  for (const path of ['/', '/contacto', '/portfolio', '/cliente/token', '/hero-bg.mp4', '/fonts/site.woff2', '/physics.wasm', '/images/photo.webp']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: `https://quepia.com${path}` }), false, path)
  }
  for (const path of ['/api/assets/drive-upload-session', '/api/assets/example.mp4', '/sistema/example.webp', '/admin', '/auth/mfa', '/oauth/consent']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: `https://quepia.com${path}` }), true, path)
  }
})
