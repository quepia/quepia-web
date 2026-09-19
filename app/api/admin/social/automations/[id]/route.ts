import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

// Guarda una nueva versión. Si la regla está activa en Zernio, el cambio se
// aplica recién al volver a confirmar la activación con el nuevo hash.
export const PATCH = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  return socialRpc("social_admin_save_automation", { p_actor: admin.userId, p_automation_id: id, p_payload: body })
})
