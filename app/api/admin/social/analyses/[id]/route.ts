import { adminRoute } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

// Reabrir un análisis revalida al administrador.
export const GET = adminRoute<Context>(async ({ admin, context }) => {
  const { id } = await context.params
  return socialRpc("social_admin_get_analysis", { p_actor: admin.userId, p_run_id: id })
})
