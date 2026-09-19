import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export const GET = adminRoute<Context>(async ({ admin, context }) => {
  const { id } = await context.params
  return socialRpc("social_admin_get_thread", { p_actor: admin.userId, p_thread_id: id })
})

// Estado, responsable y proyecto con control de versión optimista.
export const PATCH = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  return socialRpc("social_admin_update_thread", {
    p_actor: admin.userId, p_thread_id: id, p_expected_version: Number(body.expected_version), p_changes: body.changes ?? {},
  })
})
