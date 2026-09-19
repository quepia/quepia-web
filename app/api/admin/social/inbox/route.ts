import { adminRoute, paramsFromUrl } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = adminRoute(async ({ request, admin }) =>
  socialRpc("social_admin_list_threads", { p_actor: admin.userId, p_params: paramsFromUrl(request) }))
