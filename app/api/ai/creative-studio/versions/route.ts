import { NextResponse } from "next/server"
import {
  loadCreativeStudioSource,
  sanitizeAssetIds,
  sanitizePieceContext,
} from "@/lib/ai/creative-studio-context"
import type {
  CreativeDirection,
  CreativePromptPack,
  CreativeReview,
} from "@/lib/ai/creative-studio-types"
import { createClient } from "@/lib/sistema/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function sanitizeDirection(value: unknown): CreativeDirection | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Record<string, unknown>
  const title = cleanString(candidate.title, 300)
  const concept = cleanString(candidate.concept, 4_000)
  if (!title || !concept) return null
  return {
    id: cleanString(candidate.id, 100) || "direction",
    title,
    concept,
    socialHook: cleanString(candidate.socialHook, 2_000),
    headline: cleanString(candidate.headline, 500),
    imagePlan: cleanString(candidate.imagePlan, 4_000),
    visualMetaphor: cleanString(candidate.visualMetaphor, 4_000),
    composition: cleanString(candidate.composition, 4_000),
    mobileRead: cleanString(candidate.mobileRead, 2_000),
    styleMood: cleanString(candidate.styleMood, 4_000),
    brandConnection: cleanString(candidate.brandConnection, 4_000),
    risk: cleanString(candidate.risk, 2_000),
  }
}

function sanitizeDirections(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 3).map(sanitizeDirection).filter((item): item is CreativeDirection => Boolean(item))
}

function sanitizePromptPack(value: unknown): CreativePromptPack | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Record<string, unknown>
  const visualPrompt = cleanString(candidate.visualPrompt, 16_000)
  if (!visualPrompt) return null
  return {
    title: cleanString(candidate.title, 300) || "Prompt visual",
    rationale: cleanString(candidate.rationale, 4_000),
    visualPrompt,
    brandRules: cleanString(candidate.brandRules, 8_000),
    negativePrompt: cleanString(candidate.negativePrompt, 8_000),
    layoutNotes: cleanString(candidate.layoutNotes, 8_000),
    exactCopy: cleanString(candidate.exactCopy, 8_000),
    captionBoundary: cleanString(candidate.captionBoundary, 4_000),
    technicalSettings: cleanString(candidate.technicalSettings, 4_000),
    variations: Array.isArray(candidate.variations)
      ? candidate.variations.slice(0, 8).map((item) => cleanString(item, 4_000)).filter(Boolean)
      : [],
    publishabilityChecklist: stringList(candidate.publishabilityChecklist, 8),
  }
}

function score(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(5, Math.max(1, Math.round(parsed))) : 1
}

function stringList(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return []
  return value.slice(0, maxItems).map((item) => cleanString(item, 2_000)).filter(Boolean)
}

function sanitizeReview(value: unknown): CreativeReview | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Record<string, unknown>
  const scores = candidate.scores && typeof candidate.scores === "object"
    ? candidate.scores as Record<string, unknown>
    : {}
  const summary = cleanString(candidate.summary, 6_000)
  const correctionPrompt = cleanString(candidate.correctionPrompt, 12_000)
  if (!summary && !correctionPrompt) return null
  return {
    verdict: ["publishable", "needs-work", "reject"].includes(String(candidate.verdict))
      ? candidate.verdict as CreativeReview["verdict"]
      : "needs-work",
    summary,
    scores: {
      brandConsistency: score(scores.brandConsistency),
      taskAlignment: score(scores.taskAlignment),
      socialPublishability: score(scores.socialPublishability),
      mobileLegibility: score(scores.mobileLegibility),
      visualAuthenticity: score(scores.visualAuthenticity),
    },
    strengths: stringList(candidate.strengths),
    issues: stringList(candidate.issues),
    correctionPrompt,
    layoutCorrection: cleanString(candidate.layoutCorrection, 8_000),
    nextSteps: stringList(candidate.nextSteps, 6),
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await request.json()
    const taskId = cleanString(body?.taskId, 100)
    if (!taskId) return NextResponse.json({ error: "Falta la tarea" }, { status: 400 })

    const source = await loadCreativeStudioSource(supabase, taskId)
    if (!source) {
      return NextResponse.json({ error: "No se encontró la tarea o no tenés acceso" }, { status: 404 })
    }

    const promptPack = sanitizePromptPack(body?.promptPack)
    if (!promptPack) return NextResponse.json({ error: "Generá un Prompt Pack antes de guardarlo" }, { status: 400 })

    const payload = {
      task_id: taskId,
      project_id: source.task.projectId,
      created_by: data.user.id,
      piece_context: sanitizePieceContext(body?.pieceContext),
      directions: sanitizeDirections(body?.directions),
      selected_direction: sanitizeDirection(body?.selectedDirection),
      prompt_pack: promptPack,
      review: sanitizeReview(body?.review),
      source_asset_ids: sanitizeAssetIds(body?.selectedAssetIds),
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: latest, error: latestError } = await supabase
        .from("sistema_creative_prompt_versions")
        .select("version_number")
        .eq("task_id", taskId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestError) throw latestError
      const versionNumber = (latest?.version_number || 0) + 1
      const { data: saved, error: saveError } = await supabase
        .from("sistema_creative_prompt_versions")
        .insert({ ...payload, version_number: versionNumber })
        .select("*")
        .single()

      if (!saveError) return NextResponse.json({ version: saved }, { status: 201 })
      if (saveError.code !== "23505" || attempt === 1) throw saveError
    }

    return NextResponse.json({ error: "No se pudo asignar una versión" }, { status: 409 })
  } catch (error) {
    console.error("[CreativeStudioVersions] Error:", error)
    const message = error instanceof Error && /sistema_creative_prompt_versions/i.test(error.message)
      ? "Falta aplicar la migración del Estudio Creativo"
      : "No se pudo guardar la versión"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
