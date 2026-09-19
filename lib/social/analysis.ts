// Análisis con IA dentro de Quepia sobre la capa semántica común.
// El modelo solo puede invocar operaciones de lectura permitidas; el alcance
// (cliente, proyectos, cuentas, zona horaria) lo fija el servidor al crear el
// análisis y la base lo reimpone en cada consulta. No recibe DMs, notas,
// credenciales ni SQL.
import { generateText, isStepCount, Output, tool, type LanguageModel } from "ai"
import { z } from "zod"
import {
  ALLOWED_ANALYSIS_OPS,
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  compactForModel,
  enforceEvidence,
  type AnalysisReport,
} from "./analysis-guards"
import { SocialError } from "./errors"

type Rpc = <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<T>

// En Gemini 2.5 el razonamiento consume tokens de salida: se acota para que el
// informe estructurado no quede truncado.
const MODEL_OPTIONS = {
  googleVertex: { thinkingConfig: { thinkingBudget: 1024 } },
  google: { thinkingConfig: { thinkingBudget: 1024 } },
}

const toolParamsSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    compare_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    compare_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    metric: z.string().max(40).optional(),
    age_days: z.number().int().optional(),
    limit: z.number().int().min(1).max(20).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    granularity: z.enum(["day", "week", "month"]).optional(),
    attribution: z.enum(["publish", "received"]).optional(),
    formats: z.array(z.enum(["reel", "image", "carousel", "video", "story", "text"])).max(6).optional(),
    origins: z.array(z.enum(["quepia", "zernio_api", "external"])).max(3).optional(),
    post_id: z.string().uuid().optional(),
    account_ids: z.array(z.string().uuid()).max(20).optional(),
  })
  .strict()

// Esquema tolerante para el modelo (Gemini no aplica bien maxLength/maxItems en
// salida estructurada); los límites se imponen después con normalizeReport().
const itemSchema = z.object({
  statement: z.string(),
  evidence_refs: z.array(z.number()).describe("Números de evidencia [n] que respaldan la afirmación"),
  rationale: z.string().optional(),
  evaluation_metric: z.string().optional().describe("Métrica y horizonte con que se evaluará"),
  success_criterion: z.string().optional(),
})

export const reportSchema = z.object({
  summary: z.string().describe("Resumen de 2 a 4 oraciones, sin cifras no citadas"),
  data_sufficiency: z.enum(["suficiente", "limitada", "insuficiente"]),
  findings: z.array(itemSchema).describe("Hechos verificables con cifras copiadas de la evidencia"),
  interpretations: z.array(itemSchema).describe("Hipótesis posibles, nunca causalidad demostrada"),
  limitations: z.array(itemSchema),
  recommendations: z.array(itemSchema).describe("Incluir rationale y evaluation_metric"),
  next_experiments: z.array(itemSchema).describe("Incluir success_criterion"),
})

function normalizeReport(raw: z.infer<typeof reportSchema>): AnalysisReport {
  const items = (list: z.infer<typeof itemSchema>[], max: number) => list
    .filter((item) => typeof item.statement === "string" && item.statement.trim().length >= 3)
    .slice(0, max)
    .map((item) => ({
      statement: item.statement.trim().slice(0, 600),
      evidence_refs: (item.evidence_refs ?? []).filter((ref) => Number.isInteger(ref)).slice(0, 8),
      ...(item.rationale ? { rationale: item.rationale.slice(0, 400) } : {}),
      ...(item.evaluation_metric ? { evaluation_metric: item.evaluation_metric.slice(0, 200) } : {}),
      ...(item.success_criterion ? { success_criterion: item.success_criterion.slice(0, 300) } : {}),
    }))
  return {
    summary: raw.summary.trim().slice(0, 800),
    data_sufficiency: raw.data_sufficiency,
    findings: items(raw.findings, 8),
    interpretations: items(raw.interpretations, 6),
    limitations: items(raw.limitations, 8),
    recommendations: items(raw.recommendations, 6),
    next_experiments: items(raw.next_experiments, 3),
  }
}

export type AnalysisResult = {
  runId: string
  status: "completed" | "failed" | "cancelled"
  report: AnalysisReport | null
  removedFindings: number
  toolCalls: number
  error?: string
}

export async function runSocialAnalysis(input: {
  actorId: string
  question: string
  scope: Record<string, unknown>
  model: LanguageModel
  modelLabel: string
  rpc: Rpc
  signal?: AbortSignal
  maxModelToolCalls?: number
  dailyLimit?: number
}): Promise<AnalysisResult> {
  const question = input.question.trim().slice(0, 2000)
  const started = await input.rpc<{ run_id: string; scope: Record<string, unknown> }>("social_admin_start_analysis", {
    p_actor: input.actorId, p_question: question, p_scope_params: input.scope, p_daily_limit: input.dailyLimit ?? 40,
  })
  const runId = started.run_id
  const evidence = new Map<number, unknown>()
  const evidenceLog: string[] = []
  let toolCalls = 0

  const query = async (op: string, params: Record<string, unknown>) => {
    const response = await input.rpc<{ result: unknown; evidence: unknown; evidence_ref: { seq: number } }>("social_admin_analysis_query", {
      p_actor: input.actorId, p_run_id: runId, p_op: op, p_params: params,
    })
    const seq = response.evidence_ref.seq
    evidence.set(seq, response.result)
    evidenceLog.push(`[${seq}] ${op} ${JSON.stringify(params)}\n${compactForModel({ result: response.result, evidence: pickEvidence(response.evidence) })}`)
    return { seq, result: response.result }
  }

  let usageIn = 0
  let usageOut = 0
  try {
    // Evidencia base determinista: cobertura y comparación con el período previo.
    await query("coverage", {})
    await query("compare_periods", {})
    await query("rank_posts", { metric: "views", limit: 5 })

    const scopeText = compactForModel(started.scope, 3000)
    const gather = await generateText({
      model: input.model,
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: `Pregunta del administrador: ${question}\n\nAlcance fijado por Quepia (no se puede cambiar): ${scopeText}\n\nEvidencia disponible:\n${evidenceLog.join("\n\n")}\n\nSi necesitás más datos para responder con rigor (por ejemplo ranking a igual edad, comparación de formatos, series o SLA agregado), pedilos con query_social_metrics. Cuando tengas suficiente, escribí notas breves de análisis citando [n].`,
      tools: {
        query_social_metrics: tool({
          description: "Consulta de solo lectura a la capa de métricas de Quepia. Devuelve resultados deterministas con número de evidencia. El alcance de cliente/cuentas lo impone el servidor.",
          inputSchema: z.object({ op: z.enum(ALLOWED_ANALYSIS_OPS), params: toolParamsSchema.default({}) }),
          execute: async ({ op, params }) => {
            toolCalls += 1
            if (toolCalls > (input.maxModelToolCalls ?? 6)) return { error: "tool_budget_exceeded" }
            try {
              const { seq, result } = await query(op, params ?? {})
              return { evidence_ref: seq, result_json: compactForModel(result, 10_000) }
            } catch (error) {
              return { error: error instanceof SocialError ? error.code : "query_failed", message: error instanceof Error ? error.message : "Error" }
            }
          },
        }),
      },
      stopWhen: isStepCount((input.maxModelToolCalls ?? 6) + 1),
      maxOutputTokens: 4096,
      providerOptions: MODEL_OPTIONS,
      abortSignal: input.signal,
    })
    usageIn += gather.totalUsage?.inputTokens ?? gather.usage?.inputTokens ?? 0
    usageOut += gather.totalUsage?.outputTokens ?? gather.usage?.outputTokens ?? 0

    const report = await generateText({
      model: input.model,
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: `Pregunta: ${question}\n\nEvidencia numerada:\n${evidenceLog.join("\n\n")}\n\nNotas previas del análisis (pueden contener errores; verificá contra la evidencia):\n${gather.text.slice(0, 4000)}\n\nProducí el informe estructurado. Cada hallazgo debe citar [n] y copiar cifras exactas de esa evidencia.`,
      output: Output.object({ schema: reportSchema }),
      maxOutputTokens: 8192,
      providerOptions: MODEL_OPTIONS,
      abortSignal: input.signal,
    })
    usageIn += report.usage?.inputTokens ?? 0
    usageOut += report.usage?.outputTokens ?? 0

    const { report: enforced, removed } = enforceEvidence(normalizeReport(report.output), evidence)
    await input.rpc("social_admin_finish_analysis", {
      p_actor: input.actorId, p_run_id: runId, p_status: "completed",
      p_result: { ...enforced, removed_findings: removed, evidence_count: evidence.size },
      p_usage: usage(input.modelLabel, usageIn, usageOut), p_error: null,
    })
    return { runId, status: "completed", report: enforced, removedFindings: removed, toolCalls }
  } catch (error) {
    const aborted = input.signal?.aborted || (error instanceof Error && error.name === "AbortError")
    const message = error instanceof Error ? error.message : String(error)
    await input.rpc("social_admin_finish_analysis", {
      p_actor: input.actorId, p_run_id: runId, p_status: aborted ? "cancelled" : "failed", p_result: null,
      p_usage: usage(input.modelLabel, usageIn, usageOut), p_error: message.slice(0, 500),
    }).catch(() => undefined)
    return { runId, status: aborted ? "cancelled" : "failed", report: null, removedFindings: 0, toolCalls, error: message }
  }
}

function usage(model: string, inputTokens: number, outputTokens: number) {
  const inputPrice = Number(process.env.SOCIAL_AI_USD_PER_MTOK_INPUT)
  const outputPrice = Number(process.env.SOCIAL_AI_USD_PER_MTOK_OUTPUT)
  // Sin precios configurados no se inventa un costo.
  const cost = Number.isFinite(inputPrice) && Number.isFinite(outputPrice) && inputPrice > 0
    ? (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000
    : null
  return { provider: "google-vertex", model, prompt_version: ANALYSIS_PROMPT_VERSION, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost }
}

function pickEvidence(evidence: unknown) {
  if (!evidence || typeof evidence !== "object") return null
  const record = evidence as Record<string, unknown>
  return { period: record.period, timezone: record.timezone, data_as_of: record.data_as_of, query_hash: record.query_hash }
}
