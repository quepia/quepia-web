import test from "node:test"
import assert from "node:assert/strict"
import { mapSupabaseMcpError } from "./errors.ts"

test("mapea sesión inválida a 401", () => {
  const error = mapSupabaseMcpError({
    code: "invalid_session",
    message: "The web session is no longer active.",
  })

  assert.equal(error.code, "UNAUTHENTICATED")
  assert.equal(error.status, 401)
})

test("mapea AAL2 insuficiente a 403", () => {
  const error = mapSupabaseMcpError({
    code: "aal2_required",
    message: "AAL2 reauthentication is required.",
  })

  assert.equal(error.code, "AAL2_REQUIRED")
  assert.equal(error.status, 403)
})

test("mapea challenge consumido a conflicto no aprobable", () => {
  const error = mapSupabaseMcpError({
    code: "invalid_approval_nonce",
    message:
      "The approval challenge is invalid, consumed, or belongs to another session.",
  })

  assert.equal(error.code, "NOT_APPROVABLE")
  assert.equal(error.status, 409)
})

test("mapea payload alterado a conflicto de integridad", () => {
  const error = mapSupabaseMcpError({
    code: "payload_tampered",
    message:
      "The normalized operation payload no longer matches its server hash.",
  })

  assert.equal(error.code, "PAYLOAD_MISMATCH")
  assert.equal(error.status, 409)
})
