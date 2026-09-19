import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = adminRoute(async ({ admin }) => socialRpc("social_admin_list_mcp_grants", { p_actor: admin.userId }))

// Concede o retira social.analytics.read a un grant MCP de un admin global.
export const POST = adminRoute(async ({ request, admin }) => {
  const body = await readJson(request)
  return socialRpc("social_admin_set_mcp_social_access", { p_actor: admin.userId, p_grant_id: String(body.grant_id || ""), p_enabled: body.enabled === true })
})
