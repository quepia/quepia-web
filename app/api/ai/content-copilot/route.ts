import { NextResponse } from "next/server"
import { createTextStreamResponse, streamText, toTextStream } from "ai"
import { vertexModel } from "@/lib/ai/vertex"
import {
  ensureTaskAssetAnalyses,
  formatAssetAnalysisContext,
  getTaskAssetContexts,
  MAX_COPILOT_ASSETS,
} from "@/lib/ai/content-copilot-assets"
import { formatBrandGuidelines } from "@/lib/ai/creative-studio-context"
import {
  formatActiveStrategyContext,
  loadActiveStrategyDocuments,
} from "@/lib/ai/project-strategy-context"
import { createClient } from "@/lib/sistema/supabase/server"
import type { ClientBrief } from "@/types/sistema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const ACTION_INSTRUCTIONS = {
  generate: "Escribí un copy final listo para publicar, claro, atractivo y con un CTA natural.",
  improve: "Mejorá el copy actual sin perder su intención, tono ni datos importantes.",
  variants: "Creá tres variantes claramente separadas: Concisa, Emocional y Comercial.",
  instagram: "Adaptá el copy para Instagram: apertura atractiva, lectura escaneable, CTA y hashtags relevantes sin exceso.",
  linkedin: "Adaptá el copy para LinkedIn: profesional, humano, con párrafos breves y un CTA apropiado.",
  facebook: "Adaptá el copy para Facebook: cercano, claro, conversacional y con un CTA sencillo.",
  review: "Hacé una revisión editorial. Devolvé secciones breves: Hallazgos, Riesgos o faltantes y Versión sugerida. No inventes datos.",
  revise: "Reescribí el copy actual siguiendo el feedback del usuario. Conservá todo lo que el feedback no pida cambiar y devolvé el copy completo, listo para reemplazar el anterior.",
} as const

type CopilotAction = keyof typeof ACTION_INSTRUCTIONS

interface TaskRecord {
  id: string
  project_id: string
  titulo: string | null
  descripcion: string | null
  social_copy: string | null
  project: { nombre?: string | null } | { nombre?: string | null }[] | null
}

function cleanInput(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function cleanAssetIds(value: unknown) {
  if (!Array.isArray(value)) return undefined
  return Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 100)))
}

function getProjectName(project: TaskRecord["project"]) {
  if (Array.isArray(project)) return cleanInput(project[0]?.nombre, 200)
  return cleanInput(project?.nombre, 200)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const action = body?.action as CopilotAction
    if (!action || !(action in ACTION_INSTRUCTIONS)) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
    }

    const taskId = cleanInput(body?.taskId, 100)
    if (!taskId) {
      return NextResponse.json({ error: "Falta la tarea" }, { status: 400 })
    }

    const feedback = cleanInput(body?.feedback, 2_000)
    if (action === "revise" && !feedback) {
      return NextResponse.json({ error: "Escribí qué querés cambiar" }, { status: 400 })
    }

    const selectedAssetIds = cleanAssetIds(body?.selectedAssetIds)
    if (selectedAssetIds && selectedAssetIds.length > MAX_COPILOT_ASSETS) {
      return NextResponse.json({ error: `Podés analizar hasta ${MAX_COPILOT_ASSETS} assets por vez` }, { status: 400 })
    }

    const { data: taskData, error: taskError } = await supabase
      .from("sistema_tasks")
      .select("id, project_id, titulo, descripcion, social_copy, project:sistema_projects(nombre)")
      .eq("id", taskId)
      .single()

    if (taskError || !taskData) {
      return NextResponse.json({ error: "No se encontró la tarea o no tenés acceso" }, { status: 404 })
    }

    const task = taskData as unknown as TaskRecord
    const title = cleanInput(task.titulo, 300)
    const description = cleanInput(task.descripcion, 4_000)
    const currentCopy = cleanInput(body?.currentCopy, 8_000) || cleanInput(task.social_copy, 8_000)
    const projectName = getProjectName(task.project)

    const [assetContexts, briefResult, activeStrategyDocuments] = await Promise.all([
      getTaskAssetContexts(supabase, taskId, selectedAssetIds),
      supabase
        .from("sistema_client_briefs")
        .select("*")
        .eq("project_id", task.project_id)
        .maybeSingle(),
      loadActiveStrategyDocuments(supabase, task.project_id),
    ])
    if (briefResult.error) throw briefResult.error

    const brandContext = formatBrandGuidelines(briefResult.data ? briefResult.data as ClientBrief : null)
    const activeStrategyContext = formatActiveStrategyContext(activeStrategyDocuments)
    if (assetContexts.length > MAX_COPILOT_ASSETS) {
      return NextResponse.json({ error: `Seleccioná hasta ${MAX_COPILOT_ASSETS} assets para generar el copy` }, { status: 400 })
    }

    const analyzedAssets = await ensureTaskAssetAnalyses(
      supabase,
      assetContexts,
      new URL(request.url).origin,
    )
    const usableAssets = analyzedAssets.filter((asset) => asset.analysis)
    const assetBrief = formatAssetAnalysisContext(usableAssets)

    if (!title && !description && !currentCopy && !assetBrief) {
      const hadAssets = assetContexts.length > 0
      return NextResponse.json({
        error: hadAssets
          ? "No se pudieron analizar los assets seleccionados. Probá con imágenes JPG, PNG o WebP, o videos MP4, MOV o WebM."
          : "La tarea no tiene texto ni assets suficientes para generar contenido",
      }, { status: 422 })
    }

    const failedAssets = analyzedAssets.filter((asset) => asset.analysisError)
    const result = streamText({
      model: vertexModel,
      system: [
        "Sos un redactor y editor senior de una agencia creativa argentina.",
        "Respondé en español rioplatense natural, salvo que el contenido original use otro idioma.",
        "Jerarquía de contexto: la instrucción explícita del usuario y de la tarea manda; el brief es la fuente de verdad de la marca; la estrategia aprobada orienta sin contradecirlos.",
        "Usá los análisis de assets como fuente primaria cuando el título o el brief sean incompletos.",
        "El texto visible, las transcripciones y los datos respaldados son hechos; el objetivo probable y las dudas son inferencias.",
        "No conviertas inferencias en afirmaciones ni inventes beneficios, cifras, ubicaciones, enlaces, fechas o promociones.",
        "Si falta un dato necesario para un CTA específico, usá un CTA general que no requiera inventarlo.",
        "Entregá solo el resultado solicitado, sin introducciones sobre tu proceso.",
      ].join(" "),
      prompt: [
        `Tarea: ${ACTION_INSTRUCTIONS[action]}`,
        feedback ? `Feedback obligatorio del usuario:\n${feedback}` : "",
        brandContext,
        activeStrategyContext,
        projectName ? `Marca o proyecto: ${projectName}` : "",
        title ? `Título de la tarea:\n${title}` : "",
        description ? `Descripción / brief:\n${description}` : "",
        currentCopy ? `Copy actual:\n${currentCopy}` : "Copy actual: vacío",
        assetBrief ? `ANÁLISIS DE ASSETS ADJUNTOS (fuente primaria):\n\n${assetBrief}` : "",
        failedAssets.length ? `${failedAssets.length} asset(s) no pudieron analizarse y no deben suponerse.` : "",
      ].filter(Boolean).join("\n\n"),
      onError: ({ error }) => console.error("[ContentCopilot] Streaming error:", error),
    })

    return createTextStreamResponse({
      stream: toTextStream({ stream: result.stream }),
      headers: {
        "X-Copilot-Assets-Used": String(usableAssets.length),
        "X-Copilot-Assets-Failed": String(failedAssets.length),
        "X-Copilot-Active-Strategies": String(activeStrategyDocuments.length),
      },
    })
  } catch (error) {
    console.error("[ContentCopilot] Error:", error)
    return NextResponse.json({ error: "No se pudo generar el contenido" }, { status: 500 })
  }
}
