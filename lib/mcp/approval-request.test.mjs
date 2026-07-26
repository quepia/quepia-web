import test from "node:test"
import assert from "node:assert/strict"
import {
  parseMcpApprovalRequest,
  utf8ByteLength,
} from "./approval-request.ts"

const hash =
  "3f49d66c8f4ebf80b13a7eaec09bb8f37e8c80f45fb1ec952c99d31a6a974ca8"

test("acepta únicamente la intención y el hash visto", () => {
  assert.deepEqual(
    parseMcpApprovalRequest({
      intent: "approve_expense",
      viewed_hash: hash,
    }),
    {
      intent: "approve_expense",
      viewedHash: hash,
    },
  )
})

test("rechaza campos de negocio enviados por el navegador", () => {
  assert.equal(
    parseMcpApprovalRequest({
      intent: "approve_expense",
      viewed_hash: hash,
      amount: "1.00",
    }),
    null,
  )
})

test("rechaza una intención o hash inválidos", () => {
  assert.equal(
    parseMcpApprovalRequest({
      intent: "commit_expense",
      viewed_hash: hash,
    }),
    null,
  )
  assert.equal(
    parseMcpApprovalRequest({
      intent: "approve_expense",
      viewed_hash: "not-a-hash",
    }),
    null,
  )
})

test("mide bytes UTF-8 reales y no caracteres declarados", () => {
  assert.equal(utf8ByteLength("a"), 1)
  assert.equal(utf8ByteLength("á"), 2)
  assert.equal(utf8ByteLength("🛡️"), 7)
})
