import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const PATCH = adminRoute(async ({ request, admin }) => {
  const body = await readJson(request)
  return socialRpc("social_admin_update_attention_settings", { p_actor: admin.userId, p_settings: body })
})
