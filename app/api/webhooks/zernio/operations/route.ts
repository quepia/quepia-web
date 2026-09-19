import { receiveZernioWebhook } from "@/lib/social/webhook-receiver"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    return await receiveZernioWebhook(request, "operations")
  } catch (error) {
    // Sin persistencia no hay ack: Zernio reintentará.
    console.error(JSON.stringify({ scope: "social-webhook", event: "persist_failed", message: error instanceof Error ? error.message : "error" }))
    return new Response(JSON.stringify({ error: "No se pudo registrar el evento" }), { status: 503 })
  }
}
