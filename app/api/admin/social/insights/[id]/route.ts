import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export const PATCH = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  return socialRpc("social_admin_review_insight", { p_actor: admin.userId, p_insight_id: id, p_status: String(body.status || "") })
})
