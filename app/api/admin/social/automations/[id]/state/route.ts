import { after } from "next/server"
import { adminRoute, createServerWorker, readJson, workerId } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

// Activar/pausar. La activación exige el hash de la configuración revisada.
// Pausar en Zernio detiene nuevas ejecuciones; las demoradas ya iniciadas
// pueden completarse (comportamiento documentado del proveedor).
export const POST = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  const result = await socialRpc<{ outbox_id: string | null; status: string }>("social_admin_request_automation_state", {
    p_actor: admin.userId, p_automation_id: id, p_target: String(body.target || ""), p_confirm_hash: typeof body.confirm_hash === "string" ? body.confirm_hash : null,
  })
  if (result.outbox_id) {
    after(async () => {
      await socialRpc("social_enqueue_job", { p_kind: "outbox.dispatch", p_dedupe_key: `outbox:automation:${result.outbox_id}`, p_priority: 5 })
      await createServerWorker().runOnce({ workerId: workerId("automation"), budgetMs: 25_000, kinds: ["outbox.dispatch"], schedule: false })
    })
  }
  return result
})
