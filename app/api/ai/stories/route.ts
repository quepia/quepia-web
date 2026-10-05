import { after, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"
import { vertexModel } from "@/lib/ai/vertex"
import { formatBrandGuidelines, loadCreativeStudioSource } from "@/lib/ai/creative-studio-context"
import { STORY_MODEL, storySession, enqueueStories, processStoryQueue, runStoryJob, referencePaths } from "@/lib/ai/story-generation"
import { prepareStory, StoryPreparationError } from "@/lib/ai/story-preparation"
import { storySettingsSchema, readStorySettings, isStoryColumn } from "@/lib/ai/stories"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ASSET_BUCKET } from "@/lib/sistema/assets-storage"
import { apiErrorResponse, ZernioRouteError } from "@/lib/zernio/server"
import type { ClientBrief } from "@/types/sistema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
const uuid = z.string().uuid()
const draftSchema = z.object({ title: z.string().trim().min(1).max(200), settings: storySettingsSchema })
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), projectId: uuid, request: z.string().trim().min(1).max(4000), count: z.number().int().min(1).max(20), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("create"), projectId: uuid, columnId: uuid, drafts: z.array(draftSchema).min(1).max(20) }),
  z.object({ action: z.literal("save"), projectId: uuid, taskId: uuid, title: z.string().trim().min(1).max(200), settings: storySettingsSchema }),
  z.object({ action: z.literal("prompt"), projectId: uuid, taskId: uuid, settings: storySettingsSchema }),
  z.object({ action: z.literal("generate"), projectId: uuid, taskIds: z.array(uuid).min(1).max(20), batchKey: uuid, budget: z.number().min(0).max(100) }),
  z.object({ action: z.literal("process"), projectId: uuid }),
  z.object({ action: z.enum(["approve", "recover", "cancel"]), projectId: uuid, jobId: uuid }),
  z.object({ action: z.literal("profile"), projectId: uuid, rules: z.string().trim().max(8000) }),
])
const promptOutput = z.object({ prompt: z.string().min(1).max(16000), headline: z.string().max(120), cta: z.string().max(70) })
const promptSystem = "Sos director de arte de Quepia. Usá el brief como fuente de verdad y las notas de IA como reglas particulares del cliente. No inventes datos, promociones, instalaciones ni servicios. Prepará un prompt para una pieza gráfica terminada generada íntegramente por OpenAI Imagen, incluyendo textos, logo, composición y estilo. No habrá agregado de elementos posterior. Evitá estética genérica de IA, anatomía deformada y alteraciones de la identidad de las referencias. No prometas preservación exacta. El prompt debe ser específico, con composición, iluminación y textos integrados en el diseño. Si hay texto solicitado, conservá su contenido exacto. Respondé en español."

export async function GET(request: Request) {
  try {
    const projectId = uuid.parse(new URL(request.url).searchParams.get("projectId"))
    const session = await storySession(projectId)
    const { data: columns, error: columnsError } = await session.server.from("sistema_columns").select("id,nombre").eq("project_id",projectId)
    if (columnsError) throw columnsError
    const storyColumns = (columns || []).filter(c=>isStoryColumn(c.nombre)).map(c=>c.id)
    const [tasks, jobs, brief] = await Promise.all([
      session.server.from("sistema_tasks").select("*").eq("project_id", projectId).or(storyColumns.length ? `task_type.eq.story,column_id.in.(${storyColumns.join(",")})` : "task_type.eq.story").order("due_date", { ascending: true }).order("created_at", { ascending: false }).limit(200),
      session.server.from("sistema_story_generations").select("id,task_id,status,asset_id,cost_usd,reserved_usd,error_message,created_at,settings,output_path,base_path").eq("project_id", projectId).order("created_at", { ascending: false }).limit(500),
      session.server.from("sistema_client_briefs").select("*").eq("project_id", projectId).maybeSingle(),
    ])
    if (tasks.error || jobs.error || brief.error) throw new ZernioRouteError(503, "No se pudo cargar Historias. Verificá que esté aplicada su migración.")
    const paths = (jobs.data || []).map(job => job.output_path).filter((path): path is string => Boolean(path))
    // Authorization was checked above; sign only output paths of this project.
    const signatures = paths.length ? await createAdminClient().storage.from(ASSET_BUCKET).createSignedUrls(paths, 3600) : null
    const assetIds = (jobs.data || []).map(job => job.asset_id).filter((id): id is string => Boolean(id))
    const approvals = assetIds.length ? await session.server.from("sistema_assets").select("id,current_version,approval_status,versions:sistema_asset_versions(version_number,storage_path)").in("id",assetIds) : null
    const approved = new Set(approvals?.data?.filter(asset => asset.current_version === 1 && ["approved_final","published"].includes(asset.approval_status)
      && asset.versions.some(version => version.version_number === 1 && version.storage_path === jobs.data?.find(job=>job.asset_id===asset.id)?.output_path)).map(asset=>asset.id) || [])
    const urls = new Map(signatures?.data?.map(file => [file.path, file.signedUrl]) || [])
    const result = (jobs.data || []).map(job => ({ ...job, previewUrl: job.output_path ? urls.get(job.output_path) || null : null, approved: approved.has(job.asset_id || ""), recoverable: Boolean(job.base_path), output_path: undefined, base_path: undefined }))
    return NextResponse.json({ tasks: tasks.data, jobs: result, brief: brief.data, configured: Boolean(process.env.OPENAI_API_KEY), model: STORY_MODEL(), userId: session.user.id, canPublish: session.isAdmin })
  } catch (error) { return storyError(error) }
}

export async function POST(request: Request) {
  try {
    const text = await request.text()
    if (text.length > 500_000) throw new ZernioRouteError(413, "El pedido es demasiado grande")
    const input = requestSchema.parse(JSON.parse(text))
    const session = await storySession(input.projectId, true)
    const admin = createAdminClient()
    if (input.action === "process") {
      after(async () => { try { await processStoryQueue(input.projectId) } catch { console.error("[Stories] No se pudo procesar la cola") } })
      return NextResponse.json({ ok: true })
    }
    if (input.action === "generate") {
      const jobs = await enqueueStories(session, input.projectId, [...new Set(input.taskIds)], input.batchKey, input.budget)
      after(async () => { try { await processStoryQueue(input.projectId) } catch { console.error("[Stories] No se pudo procesar la cola") } })
      return NextResponse.json({ jobs }, { status: 202 })
    }
    if (["approve", "recover", "cancel"].includes(input.action)) {
      const action = input as Extract<z.infer<typeof requestSchema>, { jobId: string }>
      const { data: job, error } = await admin.from("sistema_story_generations").select("*").eq("id", action.jobId).eq("project_id", input.projectId).single()
      if (error || !job) throw new ZernioRouteError(404, "Generación no disponible")
      if (action.action === "cancel") {
        const result = await admin.from("sistema_story_generations").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", job.id).eq("status", "queued").select("id").maybeSingle()
        if (result.error || !result.data) throw new ZernioRouteError(409, "Solo se pueden cancelar historias en cola")
      } else if (action.action === "approve") {
        if (job.status !== "succeeded" || !job.asset_id) throw new ZernioRouteError(409, "La historia todavía no está terminada")
        const { data: version } = await session.server.from("sistema_asset_versions").select("id").eq("asset_id", job.asset_id).eq("version_number", 1).eq("storage_path", job.output_path).maybeSingle()
        if (!version) throw new ZernioRouteError(409, "La versión de esta imagen cambió. Revisala desde la tarea.")
        const result = await session.server.from("sistema_assets").update({ approval_status: "approved_final" }).eq("id", job.asset_id).eq("task_id", job.task_id).eq("current_version", 1).select("id").maybeSingle()
        if (result.error || !result.data) throw new ZernioRouteError(409, "El asset cambió o no tenés permiso para aprobarlo")
      } else {
        if (!job.base_path || !["failed", "needs_attention"].includes(job.status)) throw new ZernioRouteError(409, "No hay una imagen base recuperable")
        const result = await admin.from("sistema_story_generations").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job.id).in("status", ["failed", "needs_attention"]).select("*").maybeSingle()
        if (result.error || !result.data) throw new ZernioRouteError(409, "Esta historia ya se está recuperando")
        after(async () => { await runStoryJob(admin, result.data) })
      }
      return NextResponse.json({ ok: true })
    }
    if (input.action === "create") {
      const { data: column } = await session.server.from("sistema_columns").select("id").eq("id", input.columnId).eq("project_id", input.projectId).maybeSingle()
      if (!column) throw new ZernioRouteError(404, "Columna no disponible")
      const { data: latest } = await session.server.from("sistema_tasks").select("orden").eq("column_id", input.columnId).order("orden", { ascending: false }).limit(1).maybeSingle()
      if (input.drafts.some(draft => draft.settings.referenceAssetIds.length || draft.settings.referenceDriveFileIds.length)) throw new ZernioRouteError(422, "Agregá referencias después de guardar las historias")
      const result = await session.server.from("sistema_tasks").insert(input.drafts.map((draft,i) => ({ project_id: input.projectId, column_id: input.columnId, titulo: draft.title, descripcion: draft.settings.request, task_type: "story", due_date: draft.settings.date || null,
        deadline: draft.settings.date ? `${draft.settings.date}T12:00:00-03:00` : null, orden: (latest?.orden || 0) + i + 1, type_metadata: { story: draft.settings } }))).select("*")
      if (result.error) throw new ZernioRouteError(500, "No se pudieron guardar las historias")
      return NextResponse.json({ tasks: result.data })
    }
    const { data: brief, error: briefError } = await session.server.from("sistema_client_briefs").select("*").eq("project_id", input.projectId).maybeSingle()
    if (briefError) throw briefError
    if (input.action === "profile") {
      if (!brief) throw new ZernioRouteError(422, "Creá el brief del cliente para guardar sus reglas")
      const result = await session.server.from("sistema_client_briefs").update({ ai_generation_notes: input.rules }).eq("project_id", input.projectId).select("id").maybeSingle()
      if (result.error || !result.data) throw new ZernioRouteError(403, "No se pudieron guardar las reglas del cliente")
      return NextResponse.json({ ok: true })
    }
    if (input.action === "plan") {
      if (!brief) throw new ZernioRouteError(422, "Completá el brief del cliente antes de preparar el lote")
      const { output } = await generateText({ model: vertexModel, system: promptSystem, output: Output.object({ schema: z.object({ stories: z.array(z.object({ title: z.string().max(200), request: z.string().max(4000), ...promptOutput.shape })).length(input.count) }) }),
        prompt: `${formatBrandGuidelines(brief as ClientBrief)}\n\nPrepará ${input.count} historias distintas para este pedido: ${input.request}. La imagen será vertical 9:16. Cada historia debe tener su propio prompt y texto breve.` })
      const start = new Date(`${input.date}T12:00:00-03:00`)
      return NextResponse.json({ drafts: output.stories.map((story,i) => {
        const date = new Date(start); date.setUTCDate(date.getUTCDate() + i)
        const colors = Array.isArray(brief.color_palette) ? brief.color_palette : []
        const brandColor = colors.find((c: { hex?: string }) => /^#[\da-f]{6}$/i.test(c.hex || ""))?.hex
        return { title: story.title, settings: storySettingsSchema.parse({ ...story, date: date.toISOString().slice(0,10), backgroundColor: brandColor || "#111111" }) }
      }) })
    }
    if (input.action !== "save" && input.action !== "prompt") throw new ZernioRouteError(400, "Acción inválida")
    const source = await loadCreativeStudioSource(session.server, input.taskId)
    if (!source || source.task.projectId !== input.projectId || source.task.taskType !== "story") throw new ZernioRouteError(404, "Historia no disponible")
    await referencePaths(session.server, input.taskId, input.projectId, input.settings.referenceAssetIds, input.settings.referenceDriveFileIds, source.brief)
    if (input.action === "save") {
      const result = await session.server.from("sistema_tasks").update({ titulo: input.title, task_type: "story", due_date: input.settings.date || null, deadline: input.settings.date ? `${input.settings.date}T12:00:00-03:00` : null,
        type_metadata: { ...source.task.typeMetadata, story: input.settings } }).eq("id", input.taskId).select("id").maybeSingle()
      if (result.error || !result.data) throw new ZernioRouteError(403, "No se pudo guardar la historia")
      return NextResponse.json({ ok: true })
    }
    if (!brief) throw new ZernioRouteError(422, "Completá el brief del cliente antes de preparar el prompt")
    const settings = readStorySettings({ story: input.settings }, { descripcion: source.task.description })
    const prepared = await prepareStory(session.server, source, settings)
    const output = prepared
    return NextResponse.json({ result: output })
  } catch (error) { return storyError(error) }
}
function storyError(error: unknown) {
  if (error instanceof StoryPreparationError) return NextResponse.json({ error: error.message }, { status: 422 })
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Revisá los campos del pedido" }, { status: 400 })
  if (error instanceof ZernioRouteError) {
    const result = apiErrorResponse(error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
  console.error("[Stories] Error al procesar el pedido", error instanceof Error ? error.name : "Unknown")
  return NextResponse.json({ error: "No se pudo completar el pedido de historias" }, { status: 500 })
}
