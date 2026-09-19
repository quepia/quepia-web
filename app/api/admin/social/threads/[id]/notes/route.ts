import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

// Notas internas: nunca se envían al proveedor ni a la IA.
export const POST = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  return socialRpc("social_admin_add_note", { p_actor: admin.userId, p_thread_id: id, p_body: String(body.body || "") })
})
