import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"
import { runSocialAnalysis } from "@/lib/social/analysis"
import { vertexResearchModel, VERTEX_RESEARCH_MODEL_ID } from "@/lib/ai/vertex"
import { SocialError } from "@/lib/social/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export const GET = adminRoute(async ({ request, admin }) => {
  const clientIds = new URL(request.url).searchParams.getAll("client_id").filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  return socialRpc("social_admin_list_analyses", { p_actor: admin.userId, p_client_ids: clientIds.length ? clientIds : null, p_limit: 30 })
})

// Ejecuta un análisis con IA de solo lectura. Cancelable abortando la solicitud.
export const POST = adminRoute(async ({ request, admin }) => {
  const body = await readJson(request)
  const question = String(body.question || "").trim()
  if (question.length < 3) throw new SocialError(400, "invalid_question", "Escribí una pregunta")
  const scope = body.scope && typeof body.scope === "object" ? (body.scope as Record<string, unknown>) : {}
  const limit = Number(process.env.SOCIAL_AI_DAILY_ANALYSES_PER_ADMIN)
  return runSocialAnalysis({
    actorId: admin.userId,
    question,
    scope,
    model: vertexResearchModel,
    modelLabel: VERTEX_RESEARCH_MODEL_ID,
    rpc: socialRpc,
    signal: request.signal,
    dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 40,
  })
})
