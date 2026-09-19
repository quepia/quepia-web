import { adminRoute, readJson } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"
import { simulateRule, toZernioAutomationBody, type SimulationRule } from "@/lib/social/automation-simulator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

type Sample = {
  automation: { name: string; engine: string; platform_post_id: string | null }
  config: Record<string, unknown>
  config_hash: string
  comments: Array<{ id: string; text: string | null; platform_post_id: string | null; is_reply: boolean }>
  conflicts: unknown[]
}

// Simulación local sin efectos externos + vista previa exacta del cuerpo que
// se enviaría a Zernio al activar.
export const POST = adminRoute<Context>(async ({ request, admin, context }) => {
  const { id } = await context.params
  const body = await readJson(request)
  const sample = await socialRpc<Sample>("social_admin_simulation_sample", { p_actor: admin.userId, p_automation_id: id, p_limit: 200 })
  const extra = Array.isArray(body.sample_comments)
    ? (body.sample_comments as unknown[]).filter((text): text is string => typeof text === "string").slice(0, 20)
      .map((text, index) => ({ id: `manual-${index + 1}`, text, platform_post_id: null, is_reply: false }))
    : []
  const simulation = simulateRule(sample.config as SimulationRule, [...extra, ...sample.comments])
  return {
    simulation,
    conflicts: sample.conflicts,
    config_hash: sample.config_hash,
    provider_preview: sample.automation.engine === "zernio_comment_to_dm"
      ? toZernioAutomationBody({ name: sample.automation.name, config: sample.config, forCreate: false })
      : null,
    external_effects: "Ninguno: la simulación no envía mensajes ni modifica Zernio.",
  }
})
