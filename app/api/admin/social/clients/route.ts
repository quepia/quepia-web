import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"
import { SocialError } from "@/lib/social/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = adminRoute(async ({ admin }) => socialRpc("social_admin_connections", { p_actor: admin.userId }))

// Asignaciones explícitas: nunca se infiere cliente por nombre.
export const POST = adminRoute(async ({ request, admin }) => {
  const body = await readJson(request)
  const actor = admin.userId
  switch (body.action) {
    case "create_client":
      return socialRpc("social_admin_create_client", { p_actor: actor, p_name: String(body.name || "") })
    case "assign_project":
      return socialRpc("social_admin_assign_project_client", { p_actor: actor, p_project_id: String(body.project_id), p_client_id: String(body.client_id) })
    case "assign_profile":
      return socialRpc("social_admin_assign_profile_client", { p_actor: actor, p_profile_id: String(body.profile_id), p_client_id: String(body.client_id) })
    case "link_account":
    case "unlink_account":
      return socialRpc("social_admin_link_project_account", {
        p_actor: actor, p_project_id: String(body.project_id), p_account_id: String(body.account_id), p_link: body.action === "link_account",
      })
    case "requeue_quarantine":
      return socialRpc("social_admin_requeue_quarantine", { p_actor: actor })
    default:
      throw new SocialError(400, "unknown_action", "Acción no permitida")
  }
})
