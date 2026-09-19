import { adminRoute, paramsFromUrl, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = adminRoute(async ({ request, admin }) =>
  socialRpc("social_admin_list_automations", { p_actor: admin.userId, p_params: paramsFromUrl(request) }))

// Crear siempre produce un borrador; activar es una acción separada.
export const POST = adminRoute(async ({ request, admin }) => {
  const body = await readJson(request)
  return socialRpc("social_admin_save_automation", { p_actor: admin.userId, p_automation_id: null, p_payload: body })
})
