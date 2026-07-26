import test from "node:test"
import assert from "node:assert/strict"
import {
  getDirectFirstPartySessionId,
  isDirectFirstPartySessionClaims,
  isFirstPartyProtectedPath,
} from "./session-boundary.ts"

const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000"

test("acepta únicamente claims de sesión web sin cliente OAuth MCP", () => {
  assert.equal(
    isDirectFirstPartySessionClaims({
      sub: "223e4567-e89b-42d3-a456-426614174000",
      role: "authenticated",
      session_id: SESSION_ID,
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

test("extrae únicamente session_id UUID de una sesión web directa", () => {
  assert.equal(
    getDirectFirstPartySessionId({
      sub: "223e4567-e89b-42d3-a456-426614174000",
      role: "authenticated",
      session_id: SESSION_ID,
    }),
    SESSION_ID,
  )
  assert.equal(
    getDirectFirstPartySessionId({
      sub: "223e4567-e89b-42d3-a456-426614174000",
      role: "authenticated",
    }),
    null,
  )
  assert.equal(
    getDirectFirstPartySessionId({
      sub: "223e4567-e89b-42d3-a456-426614174000",
      role: "authenticated",
      session_id: "not-a-uuid",
    }),
    null,
  )
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
