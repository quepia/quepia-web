import test from "node:test"
import assert from "node:assert/strict"
import {
  parseAllowedOrigins,
  validateSameOriginRequest,
} from "./security.ts"

test("acepta POST del mismo origin", () => {
  assert.equal(
    validateSameOriginRequest({
      requestUrl: "https://sistema.quepia.com/api/mcp/approvals/id",
      origin: "https://sistema.quepia.com",
      secFetchSite: "same-origin",
    }),
    true,
  )
})
test("rechaza Origin ausente", () => {
  assert.equal(
    validateSameOriginRequest({
      requestUrl: "https://sistema.quepia.com/api/mcp/approvals/id",
      origin: null,
      secFetchSite: null,
    }),
    false,
  )
})

test("acepta Origin exacto aunque OAuth deje Sec-Fetch-Site tainted como cross-site", () => {
  assert.equal(
    validateSameOriginRequest({
      requestUrl: "https://sistema.quepia.com/api/oauth/decision",
      origin: "https://sistema.quepia.com",
      secFetchSite: "cross-site",
    }),
    true,
  )
})

test("rechaza solicitudes cross-site aunque el origin esté en la lista", () => {
  assert.equal(
    validateSameOriginRequest({
      requestUrl: "https://preview.vercel.app/api/mcp/approvals/id",
      origin: "https://sistema.quepia.com",
      secFetchSite: "cross-site",
      additionalAllowedOrigins: ["https://sistema.quepia.com"],
    }),
    false,
  )
})

test("rechaza un Origin cross-site que no está permitido", () => {
  assert.equal(
    validateSameOriginRequest({
      requestUrl: "https://sistema.quepia.com/api/oauth/decision",
      origin: "https://evil.example",
      secFetchSite: "cross-site",
    }),
    false,
  )
})

test("permite un origin de despliegue configurado para clientes sin Sec-Fetch-Site", () => {
  assert.equal(
    validateSameOriginRequest({
      requestUrl: "https://internal-host/api/mcp/approvals/id",
      origin: "https://sistema.quepia.com",
      secFetchSite: null,
      additionalAllowedOrigins: ["https://sistema.quepia.com"],
    }),
    true,
  )
})

test("normaliza una allowlist separada por comas", () => {
  assert.deepEqual(
    parseAllowedOrigins(
      " https://sistema.quepia.com,https://preview.vercel.app ,, ",
    ),
    ["https://sistema.quepia.com", "https://preview.vercel.app"],
  )
})
