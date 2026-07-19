import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getTaskAssetContexts } from "@/lib/ai/content-copilot-assets"
import type {
  CreativePieceContext,
  CreativeStudioAsset,
  CreativeStudioTask,
} from "@/lib/ai/creative-studio-types"
import type { BriefColor, BriefReference, ClientBrief } from "@/types/sistema"

export const MAX_CREATIVE_STUDIO_ASSETS = 6

interface TaskSourceRecord {
  id: string
  project_id: string
  titulo: string | null
  descripcion: string | null
  social_copy: string | null
  task_type: string | null
  labels: string[] | null
  type_metadata: Record<string, unknown> | null
  project: { nombre?: string | null } | { nombre?: string | null }[] | null
}

export interface CreativeStudioSource {
  task: CreativeStudioTask
  brief: ClientBrief | null
}

function cleanString(value: unknown, maxLength = 8_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function cleanStringArray(value: unknown, maxItems = 30, maxLength = 500) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, maxItems)
    .map((item) => cleanString(item, maxLength))
    .filter(Boolean)
}

function projectName(project: TaskSourceRecord["project"]) {
  const value = Array.isArray(project) ? project[0]?.nombre : project?.nombre
  return cleanString(value, 200)
}

export async function loadCreativeStudioSource(
  supabase: SupabaseClient,
  taskId: string,
): Promise<CreativeStudioSource | null> {
  const { data: taskData, error: taskError } = await supabase
    .from("sistema_tasks")
    .select("id, project_id, titulo, descripcion, social_copy, task_type, labels, type_metadata, project:sistema_projects(nombre)")
    .eq("id", taskId)
    .single()

  if (taskError || !taskData) return null
  const source = taskData as unknown as TaskSourceRecord

  const { data: briefData, error: briefError } = await supabase
    .from("sistema_client_briefs")
    .select("*")
    .eq("project_id", source.project_id)
    .maybeSingle()

  if (briefError) throw briefError

  return {
    task: {
      id: source.id,
      projectId: source.project_id,
      projectName: projectName(source.project),
      title: cleanString(source.titulo, 300),
      description: cleanString(source.descripcion, 8_000),
      socialCopy: cleanString(source.social_copy, 8_000),
      taskType: cleanString(source.task_type, 100),
      labels: cleanStringArray(source.labels, 30, 100),
      typeMetadata: source.type_metadata && typeof source.type_metadata === "object" ? source.type_metadata : {},
    },
    brief: briefData ? briefData as ClientBrief : null,
  }
}

export async function loadCreativeStudioAssets(
  supabase: SupabaseClient,
  taskId: string,
): Promise<CreativeStudioAsset[]> {
  const contexts = await getTaskAssetContexts(supabase, taskId)
  return contexts.map((context) => ({
    id: context.assetId,
    versionId: context.versionId,
    name: context.name,
    filename: context.filename,
    assetType: context.assetType,
    groupId: context.groupId,
    groupOrder: context.groupOrder,
    fileType: context.fileType,
    analysisStatus: context.analysis ? "ready" : "pending",
  }))
}

export function sanitizePieceContext(value: unknown): CreativePieceContext {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const modelTarget = ["general", "chatgpt", "midjourney", "imagen", "firefly"].includes(String(candidate.modelTarget))
    ? candidate.modelTarget as CreativePieceContext["modelTarget"]
    : "general"
  const promptLanguage = candidate.promptLanguage === "es" ? "es" : "en"
  const productionMode = candidate.productionMode === "visual-only" ? "visual-only" : "photo-with-overlay"

  return {
    deliverableType: cleanString(candidate.deliverableType, 300),
    platform: cleanString(candidate.platform, 200),
    format: cleanString(candidate.format, 200),
    objective: cleanString(candidate.objective, 4_000),
    visualRequest: cleanString(candidate.visualRequest, 4_000),
    headlineText: cleanString(candidate.headlineText ?? candidate.exactText, 500),
    referenceNotes: cleanString(candidate.referenceNotes, 4_000),
    campaignExceptions: cleanString(candidate.campaignExceptions, 4_000),
    productionMode,
    modelTarget,
    promptLanguage,
  }
}

export function sanitizeAssetIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim().slice(0, 100))
    .filter(Boolean)))
    .slice(0, MAX_CREATIVE_STUDIO_ASSETS)
}

function nonEmpty(value: unknown) {
  return typeof value === "string" ? Boolean(value.trim()) : Array.isArray(value) ? value.length > 0 : Boolean(value)
}

export function getBriefCoverage(brief: ClientBrief | null) {
  const checks: Array<[string, unknown]> = [
    ["objetivo", brief?.objectives],
    ["público", brief?.target_audience],
    ["personalidad", brief?.brand_personality],
    ["paleta", brief?.color_palette],
    ["tipografía", brief?.typography],
    ["dirección visual", brief?.image_direction],
    ["composición", brief?.composition_guidelines],
    ["elementos a evitar", brief?.avoid_elements],
  ]
  const missing = checks.filter(([, value]) => !nonEmpty(value)).map(([label]) => label)
  return { completed: checks.length - missing.length, total: checks.length, missing }
}

function formatColors(value: unknown) {
  if (!Array.isArray(value)) return ""
  return (value as BriefColor[])
    .slice(0, 20)
    .map((color) => [cleanString(color.name, 100), cleanString(color.hex, 20), cleanString(color.usage, 300)]
      .filter(Boolean)
      .join(" · "))
    .filter(Boolean)
    .join(" | ")
}

function formatReferences(value: unknown) {
  if (!Array.isArray(value)) return ""
  return (value as BriefReference[])
    .slice(0, 20)
    .map((reference) => {
      const url = cleanString(reference.url, 1_000)
      const note = cleanString(reference.note, 1_000)
      return url ? `${url}${note ? ` — ${note}` : ""}` : ""
    })
    .filter(Boolean)
    .join("\n")
}

function line(label: string, value: unknown) {
  const text = Array.isArray(value) ? cleanStringArray(value).join(", ") : cleanString(value)
  return text ? `${label}: ${text}` : ""
}

export function formatBrandGuidelines(brief: ClientBrief | null) {
  if (!brief) return "No hay un brief de cliente disponible. Señalá esta limitación y evitá inventar reglas de marca."

  const colors = formatColors(brief.color_palette)
  const references = formatReferences(brief.reference_links)
  return [
    "GUÍA DE MARCA DEL CLIENTE — FUENTE DE VERDAD",
    line("Marca", brief.brand_name),
    line("Rubro", brief.industry),
    line("Descripción", brief.brand_description),
    line("Propuesta de valor", brief.value_proposition),
    line("Objetivo general", brief.objectives),
    line("Público", brief.target_audience),
    line("Personalidad", brief.brand_personality),
    line("Tono", brief.tone_of_voice),
    line("Mensajes clave", brief.key_messages),
    brief.keep_existing_brand ? line("Identidad que debe conservarse", brief.existing_elements) : "",
    colors ? `Paleta y usos: ${colors}` : "",
    line("Tipografía", brief.typography),
    line("Palabras de estilo", brief.visual_style_keywords),
    line("Dirección de arte", brief.image_direction),
    line("Fotografía / ilustración", brief.photography_style),
    line("Composición", brief.composition_guidelines),
    line("Siempre incluir", brief.must_include),
    line("Evitar", brief.avoid_elements),
    line("Formatos habituales", brief.output_formats),
    line("Plataformas", brief.platforms),
    brief.logo_storage_path ? `Logotipo disponible: ${cleanString(brief.logo_file_name, 300) || "sí"}` : "",
    references ? `Referencias declaradas:\n${references}` : "",
    line("Notas específicas para IA", brief.ai_generation_notes),
  ].filter(Boolean).join("\n")
}

export function formatTaskContext(task: CreativeStudioTask) {
  return [
    "CONTEXTO DE LA TAREA — ESPECÍFICO DE ESTA PIEZA",
    line("Proyecto", task.projectName),
    line("Título", task.title),
    line("Descripción / brief de tarea", task.description),
    line("Copy / SEO de publicación — CONTEXTO/CAPTION, NO TEXTO PARA RENDERIZAR EN LA IMAGEN", task.socialCopy),
    line("Tipo", task.taskType),
    line("Etiquetas", task.labels),
    Object.keys(task.typeMetadata).length ? `Metadatos técnicos: ${JSON.stringify(task.typeMetadata).slice(0, 4_000)}` : "",
  ].filter(Boolean).join("\n")
}

export function formatPieceContext(piece: CreativePieceContext) {
  return [
    "DECISIONES DE ESTA PIEZA — TIENEN PRIORIDAD SOLO CUANDO SON EXPLÍCITAS",
    line("Entregable", piece.deliverableType),
    line("Plataforma", piece.platform),
    line("Formato", piece.format),
    line("Objetivo específico", piece.objective),
    line("Pedido visual", piece.visualRequest),
    line("Titular breve para agregar en diseño, fuera del generador", piece.headlineText),
    line("Modo de producción", piece.productionMode === "photo-with-overlay" ? "imagen base limpia + titular agregado en diseño" : "imagen visual sin texto"),
    line("Lectura de referencias", piece.referenceNotes),
    line("Excepciones de campaña", piece.campaignExceptions),
    line("Modelo destino", piece.modelTarget),
    line("Idioma del prompt", piece.promptLanguage === "en" ? "inglés" : "español"),
  ].filter(Boolean).join("\n")
}
