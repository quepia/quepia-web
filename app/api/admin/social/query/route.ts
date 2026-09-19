import { adminRoute, readJson, socialQuery } from "@/lib/social/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Consulta única a la capa semántica (misma que usan la IA y el MCP).
export const POST = adminRoute(async ({ request, admin }) => {
  const body = await readJson(request)
  const op = String(body.op || "")
  const params = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : {}
  return socialQuery(admin, op, params)
})
