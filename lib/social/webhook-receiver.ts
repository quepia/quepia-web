import "server-only"
import { after } from "next/server"
import { sanitizePayload, webhookContainsPrivateContent } from "./normalize"
import { sha256Hex, verifyZernioSignature } from "./webhook-signature"
import { socialRpc } from "./rpc"
import { createServerWorker, json, workerId } from "./server"
import { utf8ByteLength } from "./policy"

const MAX_BODY_BYTES = 1_000_000

/**
 * Receptor de webhooks de Zernio. Verifica HMAC sobre el cuerpo crudo,
 * persiste y deduplica ANTES de responder 2xx (Zernio exige < 5 s) y deja el
 * procesamiento a la cola durable. Canales separados: analítica (alto
 * volumen) y operaciones, cada uno con su secreto.
 */
export async function receiveZernioWebhook(request: Request, channel: "analytics" | "operations") {
  const secret = channel === "analytics"
    ? process.env.ZERNIO_WEBHOOK_SECRET_ANALYTICS?.trim()
    : process.env.ZERNIO_WEBHOOK_SECRET_OPERATIONS?.trim()
  if (!secret) return json({ error: "Webhook no configurado" }, 503)

  const length = Number(request.headers.get("content-length") || 0)
  if (length > MAX_BODY_BYTES) return json({ error: "Cuerpo demasiado grande" }, 413)
  const raw = await request.text()
  if (utf8ByteLength(raw) > MAX_BODY_BYTES) return json({ error: "Cuerpo demasiado grande" }, 413)

  const signature = request.headers.get("x-zernio-signature") ?? request.headers.get("x-late-signature")
  if (!verifyZernioSignature(raw, signature, secret)) {
    console.warn(JSON.stringify({ scope: "social-webhook", event: "invalid_signature", channel }))
    return json({ error: "Firma inválida" }, 401)
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: "JSON inválido" }, 400)
  }
  const eventId = String(payload.id ?? request.headers.get("x-zernio-event-id") ?? "")
  const eventType = String(payload.event ?? request.headers.get("x-zernio-event") ?? "")
  if (!eventId || !eventType) return json({ error: "Evento incompleto" }, 400)

  const account = (payload.account && typeof payload.account === "object" ? payload.account : {}) as Record<string, unknown>
  const isPrivate = webhookContainsPrivateContent(eventType)
  const recorded = await socialRpc<{ duplicate: boolean }>("social_record_webhook", {
    p_environment: process.env.VERCEL_ENV || "development",
    p_channel: channel,
    p_external_event_id: eventId.slice(0, 200),
    p_event_type: eventType.slice(0, 80),
    p_event_timestamp: typeof payload.timestamp === "string" ? payload.timestamp : null,
    p_zernio_account_id: typeof account.accountId === "string" ? account.accountId : typeof account.id === "string" ? account.id : null,
    p_zernio_profile_id: typeof account.profileId === "string" ? account.profileId : null,
    p_payload: sanitizePayload(payload),
    p_payload_hash: sha256Hex(raw),
    p_contains_private: isPrivate,
    p_retention_days: isPrivate ? 30 : 90,
  })

  if (!recorded.duplicate && eventType !== "webhook.test") {
    after(async () => {
      try {
        await socialRpc("social_schedule_jobs", { p_specs: [{ kind: "webhook.process", dedupe_key: `webhooks:${new Date().toISOString().slice(0, 16)}`, priority: 10, window_hours: 1 }] })
        await createServerWorker().runOnce({ workerId: workerId("webhook"), budgetMs: 20_000, kinds: ["webhook.process", "outbox.dispatch"], schedule: false })
      } catch (error) {
        console.error(JSON.stringify({ scope: "social-webhook", event: "after_failed", message: error instanceof Error ? error.message : "error" }))
      }
    })
  }
  return json({ received: true, duplicate: recorded.duplicate })
}
