import { adminRoute, paramsFromUrl, socialQuery } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = adminRoute(async ({ request, admin }) => {
  const [inventory, coverage] = await Promise.all([
    socialRpc("social_admin_connections", { p_actor: admin.userId }),
    socialQuery(admin, "coverage", paramsFromUrl(request)),
  ])
  return { inventory, coverage }
})
