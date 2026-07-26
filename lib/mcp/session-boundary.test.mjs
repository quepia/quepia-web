import test from "node:test"
import assert from "node:assert/strict"
import {
  isDirectFirstPartySessionClaims,
  isFirstPartyProtectedPath,
} from "./session-boundary.ts"

test("acepta únicamente claims de sesión web sin cliente OAuth MCP", () => {
  assert.equal(
    isDirectFirstPartySessionClaims({
      sub: "223e4567-e89b-42d3-a456-426614174000",
      role: "authenticated",
    }),
    true,
  )
  assert.equal(
    isDirectFirstPartySessionClaims({
      sub: "223e4567-e89b-42d3-a456-426614174000",
      role: "mcp_authenticated",
      client_id: "123e4567-e89b-42d3-a456-426614174000",
    }),
    false,
  )
  assert.equal(
    isDirectFirstPartySessionClaims({
      sub: "223e4567-e89b-42d3-a456-426614174000",
      role: "authenticated",
      client_id: "123e4567-e89b-42d3-a456-426614174000",
    }),
    false,
  )
  assert.equal(
    isDirectFirstPartySessionClaims({
      sub: "223e4567-e89b-42d3-a456-426614174000",
    }),
    false,
  )
  assert.equal(isDirectFirstPartySessionClaims(null), false)
})

test("cubre APIs y superficies web privilegiadas sin bloquear la web pública", () => {
  for (const path of [
    "/api/sistema-data",
    "/sistema",
    "/sistema/mcp",
    "/admin/usuarios",
    "/oauth/consent",
    "/auth/mfa",
  ]) {
    assert.equal(isFirstPartyProtectedPath(path), true, path)
  }

  for (const path of ["/", "/portfolio", "/auth/login", "/auth/callback"]) {
    assert.equal(isFirstPartyProtectedPath(path), false, path)
  }
})
