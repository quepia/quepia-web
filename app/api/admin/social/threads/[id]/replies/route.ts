import { after } from "next/server"
import { adminRoute, createServerWorker, readJson, workerId } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

// Encola la respuesta (clave idempotente del formulario) y la despacha en
// segundo plano. Envío ambiguo ⇒ conciliación, nunca reenvío automático.
export const POST = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  const result = await socialRpc<{ outbox_id: string; status: string; replayed: boolean }>("social_admin_enqueue_reply", {
    p_actor: admin.userId,
    p_thread_id: id,
    p_expected_version: Number(body.expected_version),
    p_action: String(body.action || ""),
    p_text: String(body.text || ""),
    p_reply_to_external_id: typeof body.reply_to === "string" ? body.reply_to : null,
    p_request_id: String(body.request_id || ""),
  })
  if (!result.replayed) {
    after(async () => {
      await socialRpc("social_enqueue_job", { p_kind: "outbox.dispatch", p_dedupe_key: `outbox:reply:${result.outbox_id}`, p_priority: 5 })
      await createServerWorker().runOnce({ workerId: workerId("reply"), budgetMs: 25_000, kinds: ["outbox.dispatch"], schedule: false })
    })
  }
  return result
})
