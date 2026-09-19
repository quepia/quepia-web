// Verificaciones HTTP contra Next + stack local (node scripts/testing/social-http-checks.mjs)
import crypto from "node:crypto"
const APP = "http://localhost:3100"
const STACK = "http://localhost:54321"
let failures = 0
const check = (name, condition, detail = "") => { console.log(`${condition ? "✔" : "✖"} ${name}${condition ? "" : ` ${detail}`}`); if (!condition) failures += 1 }

async function cookieFor(email, password, extraClaims) {
  const session = await (await fetch(`${STACK}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json()
  if (extraClaims) {
    // Token con client_id (como un token OAuth de MCP): debe ser rechazado como sesión web.
    const [head, body] = session.access_token.split(".")
    const payload = { ...JSON.parse(Buffer.from(body, "base64url")), ...extraClaims }
    const newBody = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const signature = crypto.createHmac("sha256", "local-social-stack-secret").update(`${head}.${newBody}`).digest("base64url")
    session.access_token = `${head}.${newBody}.${signature}`
  }
  return `sb-localhost-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`
}
const admin = await cookieFor("admin@quepia.test", "admin-local-123")
const member = await cookieFor("member@quepia.test", "member-local-123")
const oauth = await cookieFor("admin@quepia.test", "admin-local-123", { client_id: "11111111-1111-4111-8111-111111111111" })

const reads = ["/api/admin/social/overview", "/api/admin/social/analytics?op=coverage", "/api/admin/social/posts", "/api/admin/social/inbox",
  "/api/admin/social/automations", "/api/admin/social/connections", "/api/admin/social/analyses", "/api/admin/social/mcp-access",
  "/api/admin/social/export?op=overview"]
for (const path of reads) {
  const asMember = await fetch(APP + path, { headers: { cookie: member } })
  check(`integrante no admin → 403 ${path}`, asMember.status === 403, `(${asMember.status})`)
  const asAdmin = await fetch(APP + path, { headers: { cookie: admin } })
  check(`admin global → 200 ${path}`, asAdmin.status === 200, `(${asAdmin.status} ${(await asAdmin.text()).slice(0, 160)})`)
}
const oauthResponse = await fetch(APP + "/api/admin/social/overview", { headers: { cookie: oauth } })
check("token OAuth/MCP no sirve como sesión web", oauthResponse.status === 403, `(${oauthResponse.status})`)
const page = await fetch(APP + "/sistema/social", { headers: { cookie: member }, redirect: "manual" })
const pageHtml = await page.text()
check("página directa: integrante no ve el módulo", !pageHtml.includes("Exclusivo de administradores globales") && !pageHtml.includes("Gestión social") && pageHtml.includes("404"), `(${page.status})`)
const adminPage = await fetch(APP + "/sistema/social", { headers: { cookie: admin }, redirect: "manual" })
check("página directa: admin accede", adminPage.status === 200, `(${adminPage.status})`)

const cross = await fetch(APP + "/api/admin/social/clients", { method: "POST", headers: { cookie: admin, origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: JSON.stringify({ action: "create_client", name: "CSRF" }) })
check("mutación desde otro origen → 403", cross.status === 403, `(${cross.status})`)
const sameOrigin = { cookie: admin, origin: APP, "sec-fetch-site": "same-origin", "content-type": "application/json" }
const created = await fetch(APP + "/api/admin/social/clients", { method: "POST", headers: sameOrigin, body: JSON.stringify({ action: "create_client", name: `Cliente HTTP ${Date.now()}` }) })
check("mutación mismo origen (admin) → 200", created.status === 200, `(${created.status})`)
const memberWrite = await fetch(APP + "/api/admin/social/clients", { method: "POST", headers: { ...sameOrigin, cookie: member }, body: JSON.stringify({ action: "create_client", name: "Intruso" }) })
check("mutación de integrante → 403", memberWrite.status === 403, `(${memberWrite.status})`)
const sqlAttempt = await fetch(APP + "/api/admin/social/query", { method: "POST", headers: sameOrigin, body: JSON.stringify({ op: "overview", params: { sql: "select * from sistema_social_notes" } }) })
check("parámetro no permitido rechazado", sqlAttempt.status === 400 && (await sqlAttempt.json()).code === "unknown_parameter")

// Webhooks
const body = JSON.stringify({ id: `evt-${Date.now()}`, event: "comment.received", timestamp: new Date().toISOString(),
  comment: { id: `c-http-${Date.now()}`, platformPostId: "ig_2", platform: "instagram", text: "¿Info?", author: { id: "u9", username: "u9" }, createdAt: new Date().toISOString(), isReply: false, parentCommentId: null },
  post: { platformPostId: "ig_2" }, account: { id: "za_norte", accountId: "za_norte", platform: "instagram", username: "demo_norte" } })
const sign = (secret, raw) => crypto.createHmac("sha256", secret).update(raw).digest("hex")
const bad = await fetch(APP + "/api/webhooks/zernio/operations", { method: "POST", headers: { "x-zernio-signature": sign("otro", body), "content-type": "application/json" }, body })
check("webhook con firma inválida → 401", bad.status === 401, `(${bad.status})`)
const good = await fetch(APP + "/api/webhooks/zernio/operations", { method: "POST", headers: { "x-zernio-signature": sign("local-webhook-secret", body), "content-type": "application/json" }, body })
check("webhook firmado → 200", good.status === 200, `(${good.status} ${await good.clone().text()})`)
const again = await fetch(APP + "/api/webhooks/zernio/operations", { method: "POST", headers: { "x-zernio-signature": sign("local-webhook-secret", body), "content-type": "application/json" }, body })
check("redelivery duplicado → 200 duplicate", again.status === 200 && (await again.json()).duplicate === true)
const wrongChannel = await fetch(APP + "/api/webhooks/zernio/analytics", { method: "POST", headers: { "x-zernio-signature": sign("local-webhook-secret", body), "content-type": "application/json" }, body })
check("secreto de un canal no vale para el otro", wrongChannel.status === 401, `(${wrongChannel.status})`)

// Endpoint interno
const noSecret = await fetch(APP + "/api/internal/social/process", { method: "POST" })
check("proceso interno sin secreto → 401", noSecret.status === 401, `(${noSecret.status})`)
const withSecret = await fetch(APP + "/api/internal/social/process", { method: "POST", headers: { authorization: "Bearer local-cron-secret" } })
const processed = await withSecret.json()
check("proceso interno con CRON_SECRET → 200", withSecret.status === 200, JSON.stringify(processed).slice(0, 300))
check("los trabajos del proceso interno terminan sin fallas", Array.isArray(processed.summary) && !processed.summary.some((job) => job.status === "failed"), JSON.stringify(processed.summary).slice(0, 1200))
console.log(JSON.stringify(processed.summary ?? processed).slice(0, 900))

// El comentario del webhook quedó en la bandeja sin abrir ninguna pantalla.
const inbox = await (await fetch(APP + `/api/admin/social/inbox?params=${encodeURIComponent(JSON.stringify({ kinds: ["comment"] }))}`, { headers: { cookie: admin } })).json()
check("webhook procesado aparece en la bandeja", inbox.threads?.some((thread) => thread.last_message === "¿Info?"), JSON.stringify(inbox).slice(0, 200))
console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLA(S)`)
process.exit(failures ? 1 : 0)
