import "server-only"
import crypto from "node:crypto"
import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ASSET_BUCKET } from "@/lib/sistema/assets-storage"
import { formatBrandGuidelines, loadCreativeStudioSource } from "@/lib/ai/creative-studio-context"
import { getQuepiaSession, assertProjectAccess, ZernioRouteError, type QuepiaSession } from "@/lib/zernio/server"
import { composeStoryPhotoOverlay } from "./story-photo-overlay"
import { composeStory } from "./story-composition"
import { imagePromptTransportText, OPENAI_IMAGE_PROMPT_LIMIT, STORY_FORMATS, storySettingsSchema, readStorySettings, storyBasePrompt, imageUsageCost, storyReservation, type StorySettings, type StoryJob } from "./stories"

export const STORY_MODEL = () => {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst"
  if (!["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"].includes(model)) throw new ZernioRouteError(503, "El modelo de imágenes configurado no es compatible")
  return model
}
function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}
export async function storySession(projectId: string, write = false): Promise<QuepiaSession> {
  const session = await getQuepiaSession()
  await assertProjectAccess(session, projectId)
  if (write && !session.isAdmin) {
    const [{ data: project }, { data: member }] = await Promise.all([
      session.server.from("sistema_projects").select("owner_id").eq("id", projectId).single(),
      session.server.from("sistema_project_members").select("role").eq("project_id", projectId).eq("user_id", session.user.id).maybeSingle(),
    ])
    if (project?.owner_id !== session.user.id && !["owner", "admin", "member"].includes(member?.role || "")) throw new ZernioRouteError(403, "No tenés permiso para editar historias")
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ZernioRouteError(503, "Falta configurar el servicio de historias en el servidor")
  return session
}

export { referencePaths } from "./story-references"
import { referencePaths, readStoryReference, storyDesignReferencePaths } from "./story-references"
import { prepareStory } from "./story-preparation"

export async function enqueueStories(session: QuepiaSession, projectId: string, ids: string[], batchKey: string) {
  const model = STORY_MODEL()
  const { data: existing, error: existingError } = await session.server.from("sistema_story_generations").select("*")
    .eq("project_id",projectId).eq("created_by",session.user.id).eq("batch_key",batchKey)
  if (existingError) throw existingError
  if (existing?.length) {
    if (existing.length !== ids.length || !existing.every(job=>ids.includes(job.task_id))) throw new ZernioRouteError(409,"El lote ya existe con otras historias")
    return existing as StoryJob[]
  }
  const jobs = []
  for (const taskId of ids) {
    const source = await loadCreativeStudioSource(session.server, taskId)
    if (!source || source.task.projectId !== projectId || source.task.taskType !== "story") throw new ZernioRouteError(404, "Historia no disponible")
    const normalized = await session.server.from("sistema_tasks").update({ task_type: "story" }).eq("id",taskId).eq("project_id",projectId).select("id,due_date").maybeSingle()
    if (normalized.error || !normalized.data) throw new ZernioRouteError(403,"No se pudo preparar la tarea de historias")
    let settings = readStorySettings(source.task.typeMetadata, { descripcion: source.task.description, due_date: normalized.data.due_date })
    settings = { ...settings, renderMode: settings.backgroundSource === "bank" ? "ai-overlay" : "full-ai", mode: "creative" }
    if (settings.mode === "creative" && !process.env.OPENAI_API_KEY) throw new ZernioRouteError(503, "Configurá OPENAI_API_KEY en el servidor para generar imágenes")
    if (settings.mode === "creative" && !source.brief) throw new ZernioRouteError(422, "Completá el brief de este cliente antes de generar")
    // Always rebuild creative direction from the current task and brief. Cached legacy
    // prompts explicitly excluded typography and logos, and must never reach OpenAI.
    settings = await prepareStory(session.server, source, settings)
    const paths = await referencePaths(session.server, taskId, projectId, settings.referenceAssetIds, settings.referenceDriveFileIds, source.brief)
    const logoPath = settings.includeLogo ? source.brief?.logo_storage_path || null : null
    if (logoPath && !logoPath.startsWith(`briefs/${projectId}/`)) throw new ZernioRouteError(422, "El logo del brief no tiene una ruta válida")
    if(settings.renderMode === "ai-overlay" && paths.length !== 1) throw new ZernioRouteError(422,"Elegí exactamente una foto original como fondo")
    const designs = (await storyDesignReferencePaths(source.brief)).slice(0, 1)
    const roles = [
      ...paths.map((_,i)=>`Imagen ${i+1}: foto real del lugar/producto. ${settings.renderMode === "ai-overlay" ? "Solo contexto de ubicación y contraste: NO generarla en la capa transparente; el sistema la usará como fondo original." : "Usarla en la pieza."}`),
      ...designs.map((ref,i)=>`Imagen ${paths.length+i+1}: referencia de DISEÑO, solo estilo. ${ref.note}`),
      ...(logoPath?[`Imagen ${paths.length+designs.length+1}: LOGOTIPO de la marca; integralo fielmente.`]:[]),
    ].join("\n")
    const snapshot = { task_id: taskId, settings, brand_context: formatBrandGuidelines(source.brief).slice(0, 6000) + "\n\nRoles de las imágenes adjuntas:\n" + roles, reference_paths: [...paths,...designs.map(ref=>ref.path)], logo_path: logoPath, model }
    jobs.push({ ...snapshot, reserved_usd: storyReservation(settings), fingerprint: crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") })
  }
  const { data, error } = await createAdminClient().rpc("sistema_enqueue_stories", {
    p_actor: session.user.id, p_batch: batchKey, p_jobs: jobs, p_budget: Math.ceil(jobs.reduce((sum, job) => sum + job.reserved_usd, 0) * 100) / 100,
    p_daily_limit: Math.floor(envNumber("STORIES_DAILY_LIMIT", 50)), p_daily_budget: envNumber("STORIES_DAILY_BUDGET_USD", 25),
  })
  if (error) {
    if (/presupuesto|límite|lote|autorizad/i.test(error.message)) throw new ZernioRouteError(409, error.message)
    throw new ZernioRouteError(503, "No se pudo guardar el lote. Verificá la migración de Historias.")
  }
  return data as StoryJob[]
}

export async function privateImage(admin: SupabaseClient, path: string, maxBytes = 12 * 1024 * 1024) {
  const { data, error } = await admin.storage.from(ASSET_BUCKET).download(path)
  if (error || !data) throw new Error("No se pudo leer una imagen privada")
  if (data.size > maxBytes) throw new Error("La imagen supera el tamaño permitido")
  return sharp(Buffer.from(await data.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().png().toBuffer()
}

class OpenAIImageRejectedError extends Error {}

export async function generateOpenAIImage(input: { model: string; prompt: string; settings: StorySettings; references: Buffer[] }) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("Configurá OPENAI_API_KEY para generar")
  const prompt = imagePromptTransportText(input.prompt)
  if (prompt.length > OPENAI_IMAGE_PROMPT_LIMIT) throw new Error("El prompt de imagen supera los 32.000 caracteres. Acortá el pedido antes de generar.")
  const providerReferences = await Promise.all(input.references.map(bytes => sharp(bytes).resize(768, 768, { fit: "inside", withoutEnlargement: true }).png().toBuffer()))
  const parameters = { model: input.model, prompt, size: STORY_FORMATS[input.settings.format].size, quality: input.settings.quality, n: 1, output_format: "png", background: input.settings.renderMode === "ai-overlay" ? "transparent" : "opaque" }
  let body: FormData | string
  let endpoint: string
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  if (input.references.length) {
    const form = new FormData()
    for (const [name, value] of Object.entries(parameters)) form.set(name, String(value))
    providerReferences.forEach((bytes,i) => form.append("image[]", new Blob([new Uint8Array(bytes)], { type: "image/png" }), `reference-${i+1}.png`))
    body = form; endpoint = "edits"
  } else { headers["Content-Type"] = "application/json"; body = JSON.stringify(parameters); endpoint = "generations" }
  // No automatic provider retries: a timed-out call may already have been billed.
  const response = await fetch(`https://api.openai.com/v1/images/${endpoint}`, { method: "POST", headers, body, signal: AbortSignal.timeout(210_000) })
  if (!response.ok) {
    const rejectionError = (message: string) => response.status === 400 ? new OpenAIImageRejectedError(message) : new Error(message)
    const payload = await response.json().catch(() => null)
    const code = payload?.error?.code
    const providerMessage = typeof payload?.error?.message === "string"
      ? payload.error.message.replace(/sk-[\w-]+/g, "[redacted]").replace(/https?:\/\/[^\s]+/g, "[url]").slice(0, 600)
      : ""
    console.error("[Stories] OpenAI rechazó la imagen", {
      status: response.status, code, param: payload?.error?.param,
      requestId: response.headers.get("x-request-id"), model: input.model,
      size: parameters.size, referenceCount: input.references.length,
      message: providerMessage,
    })
    if (response.status === 401) throw rejectionError("OpenAI rechazó la API key. Revisá OPENAI_API_KEY en Vercel.")
    if (response.status === 429) throw rejectionError("OpenAI alcanzó su límite de uso o saldo. Revisá la facturación.")
    if (code === "moderation_blocked" || code === "content_policy_violation") throw rejectionError("OpenAI bloqueó el pedido por sus reglas de contenido. Ajustá el texto o las referencias antes de volver a generar.")
    if (response.status === 403) throw rejectionError("OpenAI no permite generar imágenes con esta cuenta. Revisá los permisos del proyecto y la verificación de la organización.")
    if (code === "model_not_found") throw rejectionError("El modelo no está disponible para esta cuenta de OpenAI.")
    if (response.status === 400 && providerMessage) throw rejectionError(`OpenAI rechazó el pedido: ${providerMessage}`)
    throw rejectionError(`OpenAI no pudo generar la imagen (HTTP ${response.status}). Revisá el pedido y el acceso al modelo.`)
  }
  const payload = await response.json()
  const encoded = payload?.data?.[0]?.b64_json
  if (typeof encoded !== "string" || !encoded || payload.data.length !== 1 || encoded.length > 45_000_000) throw new Error("OpenAI devolvió una imagen no válida")
  return { bytes: Buffer.from(encoded, "base64"), usage: payload.usage || null, requestId: response.headers.get("x-request-id") }
}

type WorkerJob = StoryJob & { project_id: string; created_by: string; brand_context: string; reference_paths: string[]; logo_path: string | null; model: string; base_path: string | null; usage: unknown; provider_request_id: string | null }
export async function processStoryQueue(projectId?: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("sistema_claim_story", { p_project: projectId || null })
  if (error) throw new Error("No se pudo reclamar una historia")
  if (!data) return false
  await runStoryJob(admin, data as WorkerJob)
  return true
}

export async function runStoryJob(admin: SupabaseClient, job: WorkerJob) {
  let basePath = job.base_path
  let providerStarted = false
  let usage = job.usage || null
  let requestId = job.provider_request_id
  let outputPath: string | null = null
  try {
    const settings = storySettingsSchema.parse(job.settings)
    let base: Buffer
    let originalPhoto: Buffer | null = null
    const photoPath = `${job.project_id}/${job.task_id}/stories/${job.id}/background.png`
    if (settings.renderMode === "ai-overlay") {
      if (basePath) originalPhoto = await privateImage(admin,photoPath,32*1024*1024)
      else {
        if (!job.reference_paths.length) throw new Error("La historia necesita una foto original de fondo")
        originalPhoto = await readStoryReference(admin,job.reference_paths[0])
        const photoSaved = await admin.storage.from(ASSET_BUCKET).upload(photoPath,originalPhoto,{contentType:"image/png",upsert:true})
        if(photoSaved.error) throw new Error("No se pudo guardar la foto original; no se llamó a OpenAI")
      }
    }
    if (basePath) {
      base = await privateImage(admin, basePath, 32 * 1024 * 1024)
    } else if (settings.renderMode === "legacy" && settings.mode === "faithful") {
      base = await readStoryReference(admin, job.reference_paths[0])
    } else {
      const references = await Promise.all(job.reference_paths.map((path,i) => i===0 && originalPhoto ? originalPhoto : readStoryReference(admin, path)))
      if(settings.renderMode !== "legacy" && job.logo_path && settings.includeLogo) references.push(await privateImage(admin,job.logo_path))
      providerStarted = true
      const generated = await generateOpenAIImage({ model: job.model, prompt: storyBasePrompt(settings, job.brand_context), settings, references })
      base = generated.bytes; usage = generated.usage; requestId = generated.requestId
    }
    const destination = `${job.project_id}/${job.task_id}/stories/${job.id}/base.png`
    const uploadBase = await admin.storage.from(ASSET_BUCKET).upload(destination, base, { contentType: "image/png", upsert: true })
    if (uploadBase.error) throw new Error("No se pudo guardar la imagen base")
    basePath = destination
    const savedBase = await admin.from("sistema_story_generations").update({ base_path: basePath, usage, cost_usd: settings.renderMode === "legacy" && settings.mode === "faithful" ? 0 : imageUsageCost(usage), provider_request_id: requestId }).eq("id", job.id)
    if (savedBase.error) throw new Error("No se pudo registrar la imagen base")
    // The AI draws every graphic element; the system only combines the transparent layer and original photo.
    // Legacy rendering remains solely to recover already-paid historical jobs.
    const logo = settings.renderMode === "legacy" && job.logo_path && settings.includeLogo ? await privateImage(admin, job.logo_path) : null
    const final = settings.renderMode === "ai-overlay" ? await composeStoryPhotoOverlay(originalPhoto!,base,settings) : settings.renderMode === "full-ai" ? base : await composeStory(base, settings, logo)
    const finalPath = basePath.replace("base.png", "final.png")
    const derived = [
      { path: finalPath, bytes: final, type: "image/png" },
      { path: finalPath.replace("final.png", "thumb.webp"), bytes: await sharp(final).resize(240).webp({ quality: 75 }).toBuffer(), type: "image/webp" },
      { path: finalPath.replace("final.png", "preview.webp"), bytes: await sharp(final).resize(720).webp({ quality: 85 }).toBuffer(), type: "image/webp" },
    ]
    for (const file of derived) {
      const result = await admin.storage.from(ASSET_BUCKET).upload(file.path, file.bytes, { contentType: file.type, upsert: true })
      if (result.error) throw new Error("No se pudo guardar la historia terminada")
    }
    outputPath = finalPath
    const finished = await admin.rpc("sistema_finish_story", { p_job: job.id, p_output: finalPath, p_base: basePath, p_size: final.length, p_usage: usage, p_cost: settings.renderMode === "legacy" && settings.mode === "faithful" ? 0 : imageUsageCost(usage), p_request: requestId })
    if (finished.error) { console.error("[Stories] Asset registration failed", { jobId: job.id, code: finished.error.code, message: finished.error.message }); throw new Error("La imagen quedó guardada, pero no se pudo registrar su asset. Usá Recuperar.") }
  } catch (error) {
    const ambiguous = providerStarted && (error instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(error.name))
    await admin.from("sistema_story_generations").update({ status: ambiguous ? "needs_attention" : "failed",
      error_message: ambiguous ? "OpenAI no confirmó el resultado. El intento puede haber sido cobrado; no se reintentó automáticamente." : error instanceof Error ? error.message : "No se pudo completar la historia",
      finished_at: new Date().toISOString(),
      ...(basePath ? { base_path: basePath } : {}),
      ...(outputPath ? { output_path: outputPath } : {}),
      ...(usage ? { usage, cost_usd: imageUsageCost(usage), provider_request_id: requestId } : {}),
      ...((!providerStarted || error instanceof OpenAIImageRejectedError) && !job.base_path && !usage ? { cost_usd: 0 } : {}),
    }).eq("id", job.id).in("status", ["running", "needs_attention"])
  }
}
