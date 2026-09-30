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
