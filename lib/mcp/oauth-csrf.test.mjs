import test from "node:test"
import assert from "node:assert/strict"
import {
  createOAuthCsrfToken,
  verifyOAuthCsrfToken,
} from "./oauth-csrf.ts"

const NOW_SECONDS = 1_785_095_200
const BINDING = {
  authorizationId: "authorization_01JZ.test-value",
  userId: "223e4567-e89b-42d3-a456-426614174000",
  sessionId: "323e4567-e89b-42d3-a456-426614174000",
  cookieSecret: "423e4567-e89b-42d3-a456-426614174000",
}

test("firma y verifica un token ligado a autorización, usuario y sesión", () => {
  const token = createOAuthCsrfToken({
    ...BINDING,
    nowSeconds: NOW_SECONDS,
  })

  assert.match(token, /^v1\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/)
  assert.equal(
    verifyOAuthCsrfToken(token, {
      ...BINDING,
      nowSeconds: NOW_SECONDS,
    }),
    true,
  )
})

test("rechaza token vencido, alterado o usado con otra sesión", () => {
  const token = createOAuthCsrfToken({
    ...BINDING,
    nowSeconds: NOW_SECONDS,
  })

  assert.equal(
    verifyOAuthCsrfToken(token, {
      ...BINDING,
      nowSeconds: NOW_SECONDS + 601,
    }),
    false,
  )
  assert.equal(
    verifyOAuthCsrfToken(`${token.slice(0, -1)}A`, {
      ...BINDING,
      nowSeconds: NOW_SECONDS,
    }),
    false,
  )
  assert.equal(
    verifyOAuthCsrfToken(token, {
      ...BINDING,
      sessionId: "523e4567-e89b-42d3-a456-426614174000",
      nowSeconds: NOW_SECONDS,
    }),
    false,
  )
})

test("rechaza secretos de cookie y bindings malformados", () => {
  assert.throws(
    () =>
      createOAuthCsrfToken({
        ...BINDING,
        cookieSecret: "predictable",
        nowSeconds: NOW_SECONDS,
      }),
    /INVALID_OAUTH_CSRF_BINDING/,
  )
})
