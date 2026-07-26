import test from "node:test"
import assert from "node:assert/strict"
import {
  operationCanBeApproved,
  operationIsExpired,
  operationNeedsAal2,
  parseMcpApprovalChallenge,
  parseMcpApprovalResult,
  parseMcpExpenseOperation,
  parseMcpRpcEnvelope,
} from "./contracts.ts"

const operationId = "018f1f47-15f7-7e8c-81ef-77f83f817fc7"
const payloadHash =
  "3f49d66c8f4ebf80b13a7eaec09bb8f37e8c80f45fb1ec952c99d31a6a974ca8"

function validOperation(overrides = {}) {
  return {
    operation_id: operationId,
    operation_type: "accounting_expense",
    normalized_payload: {
      amount: "28490.00",
      currency: "ARS",
      description: "Adobe",
    },
    payload_hash: payloadHash,
    risk_level: 2,
    expires_at: "2099-07-26T13:00:00.000Z",
    status: "awaiting_approval",
    ...overrides,
  }
}

test("desempaqueta el envelope común antes de parsear la operación", () => {
  const envelope = parseMcpRpcEnvelope({
    ok: true,
    data: validOperation(),
    error: null,
  })

  assert.equal(envelope.ok, true)
  if (!envelope.ok) return

  const operation = parseMcpExpenseOperation(envelope.data)
  assert.equal(operation.operationId, operationId)
  assert.equal(operation.payloadHash, payloadHash)
  assert.deepEqual(operation.normalizedPayload, {
    amount: "28490.00",
    currency: "ARS",
    description: "Adobe",
  })
  assert.equal(operationCanBeApproved(operation), true)
})

test("parsea el contrato DB anidado y conserva el payload canónico", () => {
  const envelope = parseMcpRpcEnvelope({
    ok: true,
    data: {
      operation: {
        id: operationId,
        operation_type: "accounting_expense",
        payload: validOperation().normalized_payload,
        payload_hash: payloadHash,
        risk_level: 2,
        expires_at: "2099-07-26T13:00:00.000Z",
        status: "awaiting_approval",
      },
      approval: {
        required: true,
        requires_aal2: true,
        aal_required: "aal2",
      },
    },
    error: null,
  })
  assert.equal(envelope.ok, true)
  if (!envelope.ok) return

  const operation = parseMcpExpenseOperation(envelope.data)
  assert.equal(operation.operationId, operationId)
  assert.equal(operation.requiresAal2, true)
  assert.deepEqual(operation.normalizedPayload, validOperation().normalized_payload)
})

test("rechaza un payload normalizado que no sea objeto", () => {
  assert.throws(
    () =>
      parseMcpExpenseOperation(
        validOperation({ normalized_payload: "28490 ARS" }),
      ),
    /INVALID_NORMALIZED_PAYLOAD/,
  )
})

test("rechaza envelopes exitosos sin data", () => {
  assert.throws(
    () => parseMcpRpcEnvelope({ ok: true, error: null }),
    /INVALID_RPC_ENVELOPE/,
  )
})

test("preserva el error tipado del envelope", () => {
  const envelope = parseMcpRpcEnvelope({
    ok: false,
    data: null,
    error: {
      code: "AAL2_REQUIRED",
      message: "Se requiere MFA.",
    },
  })

  assert.equal(envelope.ok, false)
  if (envelope.ok) return
  assert.equal(envelope.error.code, "AAL2_REQUIRED")
})

test("bloquea expiradas aunque su estado todavía no haya sido actualizado", () => {
  const operation = parseMcpExpenseOperation(
    validOperation({ expires_at: "2025-01-01T00:00:00.000Z" }),
  )

  assert.equal(operationIsExpired(operation), true)
  assert.equal(operationCanBeApproved(operation), false)
})

test("considera AAL2 obligatorio para riesgo alto", () => {
  const operation = parseMcpExpenseOperation(
    validOperation({ risk_level: 3, requires_aal2: false }),
  )

  assert.equal(operationNeedsAal2(operation), true)
})

test("acepta el nivel crítico 4 del contrato DB", () => {
  const operation = parseMcpExpenseOperation(
    validOperation({ risk_level: 4, requires_aal2: false }),
  )

  assert.equal(operation.riskLevel, 4)
  assert.equal(operationNeedsAal2(operation), true)
})

test("parsea una aprobación sin exponer el nonce", () => {
  const result = parseMcpApprovalResult(
    {
      operation_id: operationId,
      status: "approved",
      approved_at: "2026-07-26T13:00:00.000Z",
    },
    operationId,
  )

  assert.deepEqual(result, {
    operationId,
    status: "approved",
    approvedAt: "2026-07-26T13:00:00.000Z",
  })
  assert.equal("approvalNonce" in result, false)
})

test("extrae el challenge DB solo dentro del proceso servidor", () => {
  const challenge = parseMcpApprovalChallenge(
    {
      operation: {
        id: operationId,
        operation_type: "accounting_expense",
        payload: validOperation().normalized_payload,
        payload_hash: payloadHash,
        risk_level: 2,
        expires_at: "2099-07-26T13:00:00.000Z",
        status: "awaiting_approval",
      },
      approval: {
        requires_aal2: true,
        challenge_nonce:
          "sVuMhnRxyBZRuZbp0c7Lj5LdK2a0O4YK16sPHw2xgWc",
        challenge_expires_at: "2099-07-26T12:50:00.000Z",
      },
    },
    operationId,
  )

  assert.equal(challenge.operation.operationId, operationId)
  assert.equal(
    challenge.nonce,
    "sVuMhnRxyBZRuZbp0c7Lj5LdK2a0O4YK16sPHw2xgWc",
  )
})
