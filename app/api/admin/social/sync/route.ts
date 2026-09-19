import { after } from "next/server"
import { adminRoute, createServerWorker, readJson, workerId } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Solicitud acotada: encola trabajos y procesa un lote corto en segundo plano.
export const POST = adminRoute(async ({ request, admin }) => {
  const body = await readJson(request)
  const kinds = Array.isArray(body.kinds) ? body.kinds.filter((kind): kind is string => typeof kind === "string").slice(0, 10) : []
  const result = await socialRpc("social_admin_request_sync", { p_actor: admin.userId, p_kinds: kinds })
  after(() => createServerWorker().runOnce({ workerId: workerId("manual"), budgetMs: 45_000, kinds, schedule: false }).then(() => undefined))
  return result
})
