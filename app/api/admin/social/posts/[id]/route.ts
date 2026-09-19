import { adminRoute, paramsFromUrl, readJson, socialQuery } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export const GET = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  return socialQuery(admin, "post_performance", { ...paramsFromUrl(request), post_id: id })
})

// Atribución manual de un post externo a un proyecto del mismo cliente.
export const PATCH = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  return socialRpc("social_admin_attribute_post", { p_actor: admin.userId, p_post_id: id, p_project_id: String(body.project_id || "") })
})
