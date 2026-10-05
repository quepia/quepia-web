import "server-only"
import crypto from "node:crypto"
import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { ASSET_BUCKET } from "@/lib/sistema/assets-storage"
import { formatBrandGuidelines, loadCreativeStudioSource } from "@/lib/ai/creative-studio-context"
import { getQuepiaSession, assertProjectAccess, ZernioRouteError, type QuepiaSession } from "@/lib/zernio/server"
import { composeStory } from "./story-composition"
import { STORY_FORMATS, storySettingsSchema, storyBasePrompt, imageUsageCost, storyReservation, type StorySettings, type StoryJob } from "./stories"

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

export async function referencePaths(server: SupabaseClient, taskId: string, projectId: string, ids: string[]) {
  if (!ids.length) return []
  const { data, error } = await server.from("sistema_assets")
    .select("id,current_version,access_revoked,versions:sistema_asset_versions(version_number,storage_path,file_type,file_size)")
    .eq("task_id", taskId).eq("project_id", projectId).in("id", ids)
  if (error) throw error
  return ids.map(id => {
    const asset = data?.find(a => a.id === id)
    const version = asset?.versions?.find(v => v.version_number === asset.current_version)
    if (!asset || asset.access_revoked || !version?.storage_path || !version.file_type?.startsWith("image/")
      || (version.file_size || 0) > 12 * 1024 * 1024 || !version.storage_path.startsWith(`${projectId}/${taskId}/`)) {
      throw new ZernioRouteError(422, "Una referencia no está disponible. Usá imágenes subidas a esta historia de hasta 12 MB.")
    }
    return version.storage_path
  })
}

export async function enqueueStories(session: QuepiaSession, projectId: string, ids: string[], batchKey: string, budget: number) {
  const model = STORY_MODEL()
  const jobs = []
  for (const taskId of ids) {
    const source = await loadCreativeStudioSource(session.server, taskId)
    if (!source || source.task.projectId !== projectId || source.task.taskType !== "story") throw new ZernioRouteError(404, "Historia no disponible")
    const settings = storySettingsSchema.parse(source.task.typeMetadata.story)
    if (settings.mode === "creative" && !process.env.OPENAI_API_KEY) throw new ZernioRouteError(503, "Configurá OPENAI_API_KEY en el servidor para generar imágenes")
    if (settings.mode === "creative" && !settings.prompt) throw new ZernioRouteError(422, "Prepará y guardá el prompt de cada historia antes de generar")
    if (settings.mode === "faithful" && settings.referenceAssetIds.length !== 1) throw new ZernioRouteError(422, "Composición fiel requiere exactamente una foto")
    if (settings.mode === "creative" && !source.brief) throw new ZernioRouteError(422, "Completá el brief de este cliente antes de generar")
    const paths = await referencePaths(session.server, taskId, projectId, settings.referenceAssetIds)
    const logoPath = settings.includeLogo ? source.brief?.logo_storage_path || null : null
    if (logoPath && !logoPath.startsWith(`briefs/${projectId}/`)) throw new ZernioRouteError(422, "El logo del brief no tiene una ruta válida")
    const snapshot = { task_id: taskId, settings, brand_context: formatBrandGuidelines(source.brief), reference_paths: paths, logo_path: logoPath, model }
    jobs.push({ ...snapshot, reserved_usd: storyReservation(settings), fingerprint: crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") })
  }
  const { data, error } = await createAdminClient().rpc("sistema_enqueue_stories", {
    p_actor: session.user.id, p_batch: batchKey, p_jobs: jobs, p_budget: budget,
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

export async function generateOpenAIImage(input: { model: string; prompt: string; settings: StorySettings; references: Buffer[] }) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("Configurá OPENAI_API_KEY para generar")
  const parameters = { model: input.model, prompt: input.prompt, size: STORY_FORMATS[input.settings.format].size, quality: input.settings.quality, n: 1, output_format: "png" }
  let body: FormData | string
  let endpoint: string
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  if (input.references.length) {
    const form = new FormData()
    for (const [name, value] of Object.entries(parameters)) form.set(name, String(value))
    input.references.forEach((bytes,i) => form.append("image[]", new Blob([new Uint8Array(bytes)], { type: "image/png" }), `reference-${i+1}.png`))
    body = form; endpoint = "edits"
  } else { headers["Content-Type"] = "application/json"; body = JSON.stringify(parameters); endpoint = "generations" }
  // No automatic provider retries: a timed-out call may already have been billed.
  const response = await fetch(`https://api.openai.com/v1/images/${endpoint}`, { method: "POST", headers, body, signal: AbortSignal.timeout(210_000) })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const code = payload?.error?.code
    if (response.status === 401) throw new Error("OpenAI rechazó la API key. Revisá OPENAI_API_KEY en Vercel.")
    if (response.status === 429) throw new Error("OpenAI alcanzó su límite de uso o saldo. Revisá la facturación.")
    if (code === "model_not_found") throw new Error("El modelo no está disponible para esta cuenta de OpenAI.")
    throw new Error(`OpenAI no pudo generar la imagen (HTTP ${response.status}). Revisá el pedido y el acceso al modelo.`)
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
  try {
    const settings = storySettingsSchema.parse(job.settings)
    let base: Buffer
    let usage = job.usage || null
    let requestId = job.provider_request_id
    if (basePath) {
      base = await privateImage(admin, basePath, 32 * 1024 * 1024)
    } else if (settings.mode === "faithful") {
      base = await privateImage(admin, job.reference_paths[0])
    } else {
      const references = await Promise.all(job.reference_paths.map(path => privateImage(admin, path)))
      providerStarted = true
      const generated = await generateOpenAIImage({ model: job.model, prompt: storyBasePrompt(settings, job.brand_context), settings, references })
      base = generated.bytes; usage = generated.usage; requestId = generated.requestId
      const { error: usageError } = await admin.from("sistema_story_generations").update({ usage, cost_usd: imageUsageCost(usage), provider_request_id: requestId }).eq("id", job.id)
      if (usageError) throw new Error("No se pudo registrar el consumo")
    }
    basePath = `${job.project_id}/${job.task_id}/stories/${job.id}/base.png`
    const uploadBase = await admin.storage.from(ASSET_BUCKET).upload(basePath, base, { contentType: "image/png", upsert: true })
    if (uploadBase.error) throw new Error("No se pudo guardar la imagen base")
    const savedBase = await admin.from("sistema_story_generations").update({ base_path: basePath }).eq("id", job.id)
    if (savedBase.error) throw new Error("No se pudo registrar la imagen base")
    const logo = job.logo_path && settings.includeLogo ? await privateImage(admin, job.logo_path) : null
    const final = await composeStory(base, settings, logo)
    const outputPath = basePath.replace("base.png", "final.png")
    const derived = [
      { path: outputPath, bytes: final, type: "image/png" },
      { path: outputPath.replace("final.png", "thumb.webp"), bytes: await sharp(final).resize(240).webp({ quality: 75 }).toBuffer(), type: "image/webp" },
      { path: outputPath.replace("final.png", "preview.webp"), bytes: await sharp(final).resize(720).webp({ quality: 85 }).toBuffer(), type: "image/webp" },
    ]
    for (const file of derived) {
      const result = await admin.storage.from(ASSET_BUCKET).upload(file.path, file.bytes, { contentType: file.type, upsert: true })
      if (result.error) throw new Error("No se pudo guardar la historia terminada")
    }
    const finished = await admin.rpc("sistema_finish_story", { p_job: job.id, p_output: outputPath, p_base: basePath, p_size: final.length, p_usage: usage, p_cost: settings.mode === "faithful" ? 0 : imageUsageCost(usage), p_request: requestId })
    if (finished.error) throw new Error("La imagen quedó guardada, pero no se pudo registrar su asset. Usá Recuperar.")
  } catch (error) {
    const ambiguous = providerStarted && (error instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(error.name))
    await admin.from("sistema_story_generations").update({ status: ambiguous ? "needs_attention" : "failed",
      error_message: ambiguous ? "OpenAI no confirmó el resultado. El intento puede haber sido cobrado; no se reintentó automáticamente." : error instanceof Error ? error.message : "No se pudo completar la historia",
      finished_at: new Date().toISOString(),
      ...(!providerStarted && !job.base_path ? { cost_usd: 0 } : {}),
    }).eq("id", job.id).in("status", ["running", "needs_attention"])
  }
}
