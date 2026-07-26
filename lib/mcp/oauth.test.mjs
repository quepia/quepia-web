import test from "node:test"
import assert from "node:assert/strict"
import {
  buildOAuthConsentPath,
  classifyMcpOAuthRevocation,
  isAllowedOAuthRedirect,
  isOAuthGrantAbsentError,
  isOAuthAuthorizationId,
  mergeMcpOAuthServerGrants,
  normalizeInternalRedirect,
  parseMcpOAuthLifecycle,
  parseMcpOAuthRevokeRequest,
  parseMcpOAuthRevokeResult,
  parseOAuthAuthorizationResult,
  parseOAuthDecisionRequest,
  parseOAuthScopes,
  runIndependentOAuthRevocations,
  shouldShowMcpSetupPrompt,
} from "./oauth.ts"

const AUTHORIZATION_ID = "authorization_01JZ.test-value"
const CLIENT_ID = "123e4567-e89b-42d3-a456-426614174000"
const USER_ID = "223e4567-e89b-42d3-a456-426614174000"
const GRANT_ID = "323e4567-e89b-42d3-a456-426614174000"
const CSRF_TOKEN =
  "v1.1785095200.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

test("conserva únicamente redirects internos absolutos", () => {
  assert.equal(
    normalizeInternalRedirect(
      "/oauth/consent?authorization_id=abc#review",
    ),
    "/oauth/consent?authorization_id=abc#review",
  )
  assert.equal(
    normalizeInternalRedirect("https://evil.example/path"),
    "/sistema",
  )
  assert.equal(normalizeInternalRedirect("//evil.example/path"), "/sistema")
  assert.equal(
    normalizeInternalRedirect("/\\evil.example/path"),
    "/sistema",
  )
  assert.equal(normalizeInternalRedirect("javascript:alert(1)"), "/sistema")
})

test("usa un fallback interno aun si el fallback recibido es inseguro", () => {
  assert.equal(
    normalizeInternalRedirect(null, "//evil.example"),
    "/sistema",
  )
})

test("valida authorization_id opaco y acotado", () => {
  assert.equal(isOAuthAuthorizationId(AUTHORIZATION_ID), true)
  assert.equal(isOAuthAuthorizationId("contains/slash"), false)
  assert.equal(isOAuthAuthorizationId(""), false)
  assert.equal(isOAuthAuthorizationId("a".repeat(257)), false)
})

test("construye el retorno de consentimiento sin interpolación insegura", () => {
  assert.equal(
    buildOAuthConsentPath(AUTHORIZATION_ID, "request_failed"),
    "/oauth/consent?authorization_id=authorization_01JZ.test-value&error=request_failed",
  )
})

test("parsea una decisión de formulario mínima", () => {
  assert.deepEqual(
    parseOAuthDecisionRequest(
      `authorization_id=${encodeURIComponent(
        AUTHORIZATION_ID,
      )}&decision=approve&csrf_token=${CSRF_TOKEN}`,
    ),
    {
      authorizationId: AUTHORIZATION_ID,
      decision: "approve",
      csrfToken: CSRF_TOKEN,
    },
  )
  assert.equal(
    parseOAuthDecisionRequest(
      `authorization_id=${AUTHORIZATION_ID}&decision=approve&csrf_token=${CSRF_TOKEN}&redirect_uri=https%3A%2F%2Fevil.example`,
    ),
    null,
  )
  assert.equal(
    parseOAuthDecisionRequest(
      `authorization_id=${AUTHORIZATION_ID}&authorization_id=other&decision=deny&csrf_token=${CSRF_TOKEN}`,
    ),
    null,
  )
  assert.equal(
    parseOAuthDecisionRequest(
      `authorization_id=${AUTHORIZATION_ID}&decision=grant&csrf_token=${CSRF_TOKEN}`,
    ),
    null,
  )
  assert.equal(
    parseOAuthDecisionRequest(
      `authorization_id=${AUTHORIZATION_ID}&decision=approve`,
    ),
    null,
  )
})

test("valida el contrato de getAuthorizationDetails y enlaza el usuario", () => {
  const result = parseOAuthAuthorizationResult(
    {
      authorization_id: AUTHORIZATION_ID,
      redirect_uri: "https://ai.example/oauth/callback",
      scope: "openid email profile email",
      client: {
        id: CLIENT_ID,
        name: "Aplicación IA",
        uri: "https://ai.example",
      },
      user: {
        id: USER_ID,
        email: "admin@quepia.test",
      },
    },
    AUTHORIZATION_ID,
    USER_ID,
  )

  assert.equal(result.kind, "consent")
  assert.deepEqual(result.details.scopes, ["openid", "email", "profile"])
  assert.throws(
    () =>
      parseOAuthAuthorizationResult(
        {
          authorization_id: AUTHORIZATION_ID,
          redirect_uri: "https://ai.example/oauth/callback",
          scope: "openid",
          client: {
            id: CLIENT_ID,
            name: "Aplicación IA",
            uri: "https://ai.example",
          },
          user: {
            id: USER_ID,
            email: "admin@quepia.test",
          },
        },
        AUTHORIZATION_ID,
        "different-user",
      ),
    /INVALID_OAUTH_AUTHORIZATION/,
  )
})

test("solo acepta redirects OAuth web o loopback registrados", () => {
  assert.equal(
    isAllowedOAuthRedirect(
      "https://ai.example/callback?code=secret&state=state",
    ),
    true,
  )
  assert.equal(
    isAllowedOAuthRedirect("http://127.0.0.1:49152/callback?code=secret"),
    true,
  )
  assert.equal(
    isAllowedOAuthRedirect("http://[::1]:49152/callback?code=secret"),
    true,
  )
  assert.equal(
    isAllowedOAuthRedirect("http://ai.example/callback?code=secret"),
    false,
  )
  assert.equal(
    isAllowedOAuthRedirect("javascript:alert(document.domain)"),
    false,
  )
  assert.equal(
    isAllowedOAuthRedirect("https://user:pass@ai.example/callback"),
    false,
  )
})

test("un redirect autoaprobado no infiere client_id del callback", () => {
  assert.deepEqual(
    parseOAuthAuthorizationResult(
      {
        redirect_url:
          "https://ai.example/callback?code=secret&state=state",
      },
      AUTHORIZATION_ID,
      USER_ID,
    ),
    {
      kind: "redirect",
      redirectUrl:
        "https://ai.example/callback?code=secret&state=state",
    },
  )
  assert.deepEqual(
    parseOAuthAuthorizationResult(
      {
        redirect_url:
          "https://ai.example/callback?code=secret&state=state",
        client_id: CLIENT_ID,
      },
      AUTHORIZATION_ID,
      USER_ID,
    ),
    {
      kind: "redirect",
      redirectUrl:
        "https://ai.example/callback?code=secret&state=state",
    },
  )
})

test("rechaza scopes vacíos o con caracteres de control", () => {
  assert.throws(() => parseOAuthScopes(""), /INVALID_OAUTH_SCOPES/)
  assert.throws(
    () => parseOAuthScopes("openid email<script>"),
    /INVALID_OAUTH_SCOPES/,
  )
})

test("parsea el lifecycle MCP sin aceptar material OAuth secreto", () => {
  const lifecycle = parseMcpOAuthLifecycle({
    resource_uri: "https://mcp.quepia.com/mcp",
    clients: [
      {
        id: CLIENT_ID,
        name: "Aplicación IA",
        uri: "https://ai.example",
        type: "public",
        registration_type: "manual",
        enabled: true,
        min_aal: "aal2",
        grant: {
          id: GRANT_ID,
          expires_at: null,
          active: true,
          lifetime: "oauth_grant",
        },
      },
    ],
  })

  assert.equal(lifecycle.resourceUri, "https://mcp.quepia.com/mcp")
  assert.equal(lifecycle.clients[0].grant.id, GRANT_ID)
  assert.equal(lifecycle.clients[0].grant.expiresAt, null)
  assert.equal(lifecycle.clients[0].grant.lifetime, "oauth_grant")
  assert.equal(lifecycle.clients[0].oauthGrant, null)
  assert.throws(
    () =>
      parseMcpOAuthLifecycle({
        resource_uri: "http://mcp.quepia.com/mcp",
        clients: [],
      }),
    /INVALID_MCP_RESOURCE_URI/,
  )
  assert.throws(
    () =>
      parseMcpOAuthLifecycle({
        resource_uri: "https://mcp.quepia.com/mcp",
        clients: [
          {
            id: CLIENT_ID,
            enabled: true,
            min_aal: "aal2",
          },
          {
            id: CLIENT_ID,
            enabled: true,
            min_aal: "aal2",
          },
        ],
    }),
    /INVALID_MCP_OAUTH_CLIENT_ID/,
  )
  assert.throws(
    () =>
      parseMcpOAuthLifecycle({
        resource_uri: "https://mcp.quepia.com/mcp",
        clients: [
          {
            id: CLIENT_ID,
            enabled: true,
            min_aal: "aal1",
            grant: {
              id: GRANT_ID,
              active: true,
              lifetime: "database_expiry",
            },
          },
        ],
      }),
    /INVALID_MCP_OAUTH_GRANT/,
  )
})

test("acepta el grant OAuth real cuando Supabase omite expires_at nulo", () => {
  const lifecycle = parseMcpOAuthLifecycle({
    resource_uri: "https://mcp.quepia.com/mcp",
    clients: [
      {
        id: CLIENT_ID,
        name: "Claude",
        type: "confidential",
        registration_type: "dynamic",
        enabled: true,
        min_aal: "aal1",
        grant: {
          id: GRANT_ID,
          active: true,
          lifetime: "oauth_grant",
        },
      },
    ],
  })

  assert.equal(lifecycle.clients[0].grant.expiresAt, null)
  assert.equal(lifecycle.clients[0].grant.lifetime, "oauth_grant")
})

test("correlaciona el grant de Supabase Auth por client_id canónico", () => {
  const lifecycle = parseMcpOAuthLifecycle({
    resource_uri: "https://mcp.quepia.com/mcp",
    clients: [
      {
        id: CLIENT_ID,
        enabled: true,
        min_aal: "aal2",
      },
    ],
  })
  const merged = mergeMcpOAuthServerGrants(lifecycle, [
    {
      client: {
        id: CLIENT_ID,
        name: "Aplicación IA",
        uri: "https://ai.example",
        logo_uri: "https://ai.example/logo.png",
      },
      scopes: ["openid", "email"],
      granted_at: "2026-07-26T12:00:00.000Z",
    },
  ])

  assert.equal(merged.oauthGrantStateAvailable, true)
  assert.deepEqual(merged.clients[0].oauthGrant.scopes, [
    "openid",
    "email",
  ])
})

test("muestra configurar MCP sólo cuando el lifecycle completo no está activo", () => {
  const activeClient = {
    id: CLIENT_ID,
    name: "Aplicación IA",
    uri: "https://ai.example",
    type: "public",
    registrationType: "manual",
    enabled: true,
    minAal: "aal1",
    grant: {
      id: GRANT_ID,
      expiresAt: null,
      active: true,
      lifetime: "oauth_grant",
    },
    oauthGrant: {
      scopes: ["openid"],
      grantedAt: "2026-07-26T12:00:00.000Z",
    },
  }

  assert.equal(
    shouldShowMcpSetupPrompt({
      resourceUri: "https://mcp.quepia.com/mcp",
      clients: [activeClient],
      oauthGrantStateAvailable: true,
    }),
    false,
  )
  assert.equal(
    shouldShowMcpSetupPrompt({
      resourceUri: "https://mcp.quepia.com/mcp",
      clients: [{ ...activeClient, oauthGrant: null }],
      oauthGrantStateAvailable: true,
    }),
    true,
  )
  assert.equal(
    shouldShowMcpSetupPrompt({
      resourceUri: "https://mcp.quepia.com/mcp",
      clients: [],
      oauthGrantStateAvailable: true,
    }),
    true,
  )
  assert.equal(
    shouldShowMcpSetupPrompt({
      resourceUri: "https://mcp.quepia.com/mcp",
      clients: [],
      oauthGrantStateAvailable: false,
    }),
    false,
  )
})

test("acepta solo client_id en el POST de revocación", () => {
  assert.equal(
    parseMcpOAuthRevokeRequest(
      `client_id=${encodeURIComponent(CLIENT_ID)}`,
    ),
    CLIENT_ID,
  )
  assert.equal(
    parseMcpOAuthRevokeRequest(
      `client_id=${CLIENT_ID}&redirect_uri=https%3A%2F%2Fevil.example`,
    ),
    null,
  )
  assert.equal(
    parseMcpOAuthRevokeRequest(
      `client_id=${CLIENT_ID}&client_id=${CLIENT_ID}`,
    ),
    null,
  )
})

test("enlaza la respuesta de revocación al client_id solicitado", () => {
  assert.deepEqual(
    parseMcpOAuthRevokeResult(
      {
        client_id: CLIENT_ID,
        grant_id: GRANT_ID,
        revoked: true,
        revoked_connection_count: 2,
        idempotent_replay: false,
      },
      CLIENT_ID,
    ),
    {
      clientId: CLIENT_ID,
      grantId: GRANT_ID,
      revoked: true,
      revokedConnectionCount: 2,
      idempotentReplay: false,
    },
  )
  assert.throws(
    () =>
      parseMcpOAuthRevokeResult(
        {
          client_id: "423e4567-e89b-42d3-a456-426614174000",
          grant_id: null,
          revoked: false,
          revoked_connection_count: 0,
          idempotent_replay: true,
        },
        CLIENT_ID,
      ),
    /INVALID_MCP_OAUTH_REVOKE_RESULT/,
  )
})

test("inicia ambos intentos aunque Auth falle de inmediato", async () => {
  const calls = []
  const outcome = await runIndependentOAuthRevocations(
    async () => {
      calls.push("auth")
      throw Object.assign(new Error("OAuth unavailable"), { status: 503 })
    },
    async () => {
      calls.push("database")
      return "db-revoked"
    },
  )

  assert.deepEqual(calls, ["auth", "database"])
  assert.equal(outcome.auth.ok, false)
  assert.deepEqual(outcome.database, {
    ok: true,
    value: "db-revoked",
  })
})

test("inicia DB antes de que una revocación Auth pendiente resuelva", async () => {
  const calls = []
  let resolveAuth
  const pendingAuth = new Promise((resolve) => {
    resolveAuth = resolve
  })

  const outcomePromise = runIndependentOAuthRevocations(
    async () => {
      calls.push("auth")
      return pendingAuth
    },
    async () => {
      calls.push("database")
      return "db-revoked"
    },
  )

  assert.deepEqual(calls, ["auth", "database"])
  resolveAuth("auth-revoked")

  const outcome = await outcomePromise
  assert.deepEqual(outcome, {
    auth: { ok: true, value: "auth-revoked" },
    database: { ok: true, value: "db-revoked" },
  })
})

test("conserva outcomes independientes cuando falla DB", async () => {
  const outcome = await runIndependentOAuthRevocations(
    async () => "auth-revoked",
    async () => {
      throw new Error("DB unavailable")
    },
  )

  assert.deepEqual(outcome.auth, {
    ok: true,
    value: "auth-revoked",
  })
  assert.equal(outcome.database.ok, false)
})

test("trata grant OAuth ausente como revocación idempotente", () => {
  assert.equal(isOAuthGrantAbsentError({ status: 404 }), true)
  assert.equal(
    isOAuthGrantAbsentError({ code: "oauth_grant_not_found" }),
    true,
  )
  assert.equal(isOAuthGrantAbsentError({ status: 503 }), false)
  assert.equal(
    isOAuthGrantAbsentError({ status: 404, code: "feature_disabled" }),
    false,
  )
})

test("clasifica los cuatro outcomes de revocación", () => {
  assert.equal(
    classifyMcpOAuthRevocation({
      authSucceeded: true,
      databaseSucceeded: true,
      databaseRevoked: true,
    }),
    "revoked",
  )
  assert.equal(
    classifyMcpOAuthRevocation({
      authSucceeded: false,
      databaseSucceeded: true,
      databaseRevoked: true,
    }),
    "revoked_db_only",
  )
  assert.equal(
    classifyMcpOAuthRevocation({
      authSucceeded: true,
      databaseSucceeded: false,
      databaseRevoked: false,
    }),
    "revoked_auth_only",
  )
  assert.equal(
    classifyMcpOAuthRevocation({
      authSucceeded: false,
      databaseSucceeded: false,
      databaseRevoked: false,
    }),
    "revocation_failed",
  )
})
