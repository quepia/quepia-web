// Registro de los dos endpoints de webhooks del módulo social en Zernio.
//
// Por defecto es una SIMULACIÓN: muestra exactamente qué se crearía, sin
// llamar al proveedor. Crear endpoints modifica la cuenta de Zernio y requiere
// aprobación explícita.
//
//   node --env-file=.env.local scripts/social/zernio-webhooks.mjs --list
//   node --env-file=.env.local scripts/social/zernio-webhooks.mjs --base-url https://quepia.com
//   node --env-file=.env.local scripts/social/zernio-webhooks.mjs --base-url https://quepia.com --apply
//
// Requiere ZERNIO_API_KEY y, para --apply, ZERNIO_WEBHOOK_SECRET_OPERATIONS y
// ZERNIO_WEBHOOK_SECRET_ANALYTICS (los mismos valores configurados en Vercel).
const API = "https://zernio.com/api/v1"
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const key = process.env.ZERNIO_API_KEY?.trim()
if (!key) {
  console.error("Falta ZERNIO_API_KEY")
  process.exit(1)
}
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }

if (flag("--list")) {
  const response = await fetch(`${API}/webhooks/settings`, { headers })
  const payload = await response.json()
  const webhooks = payload.webhooks ?? payload.data ?? []
  console.log(`HTTP ${response.status}`)
  for (const webhook of webhooks) {
    console.log(`- ${webhook.name} → ${webhook.url} · activo=${webhook.isActive} · fallas=${webhook.failureCount ?? "?"} · eventos=${(webhook.events ?? []).join(",")}`)
  }
  process.exit(0)
}

const baseUrl = value("--base-url")?.replace(/\/$/, "")
if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
  console.error("Indicá --base-url https://<dominio de producción>")
  process.exit(1)
}

const endpoints = [
  {
    name: "Quepia social · operaciones",
    url: `${baseUrl}/api/webhooks/zernio/operations`,
    secretEnv: "ZERNIO_WEBHOOK_SECRET_OPERATIONS",
    events: [
      "message.received", "message.sent", "conversation.started", "message.edited", "message.deleted",
      "message.delivered", "message.read", "message.failed", "comment.received",
      "account.connected", "account.disconnected",
    ],
  },
  {
    // Endpoint dedicado: analytics.synced es de alto volumen y su contador de
    // fallas no debe desactivar los eventos operativos.
    name: "Quepia social · analítica",
    url: `${baseUrl}/api/webhooks/zernio/analytics`,
    secretEnv: "ZERNIO_WEBHOOK_SECRET_ANALYTICS",
    events: ["analytics.synced"],
  },
]

for (const endpoint of endpoints) {
  const secret = process.env[endpoint.secretEnv]?.trim()
  const body = { name: endpoint.name, url: endpoint.url, events: endpoint.events, secret: secret ? "[definido]" : "[FALTA]" }
  console.log(`\n${flag("--apply") ? "Creando" : "SIMULACIÓN (sin cambios)"}:`, JSON.stringify(body, null, 2))
  if (!flag("--apply")) continue
  if (!secret || secret.length < 32) {
    console.error(`${endpoint.secretEnv} debe existir y tener al menos 32 caracteres`)
    process.exit(1)
  }
  const response = await fetch(`${API}/webhooks/settings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: endpoint.name, url: endpoint.url, events: endpoint.events, secret }),
  })
  const payload = await response.json().catch(() => null)
  console.log(`HTTP ${response.status}`, payload?.webhook?._id ? `id=${payload.webhook._id}` : JSON.stringify(payload))
  if (!response.ok) process.exit(1)
  // Evento de prueba: llega aunque no esté en la lista de eventos.
  const test = await fetch(`${API}/webhooks/test`, { method: "POST", headers, body: JSON.stringify({ webhookId: payload.webhook._id }) })
  console.log("webhook.test →", test.status)
}
