import { after, NextResponse } from "next/server"
import { z } from "zod"
import { mcpOAuthBearerClient } from "@/lib/mcp/oauth-bearer-client"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { attachMcpMedia, createMcpMediaUpload, removeMcpMedia } from "@/lib/zernio/mcp-media"
import { dispatchPublicationTelegramNotices } from "@/lib/zernio/publication-telegram"
import {
  cancelPublication,
  loadPublicationRecord,
  PUBLICATION_COLUMNS,
  retryPublication,
} from "@/lib/zernio/publication-actions"
import {
  assetPreview,
  loadAssets,
  loadPublishTask,
  publishTaskToZernio,
  syncPublicationStatuses,
  type PublicationRow,
  type PublishTaskRow,
} from "@/lib/zernio/publish-task"
import { instantToLocalDateTime } from "@/lib/zernio/publishing-rules"
import {
  apiErrorResponse,
  getProjectIntegration,
  syncProjectAccounts,
  ZernioRouteError,
} from "@/lib/zernio/server"

// Publicación social pedida por el servicio MCP con el token OAuth del usuario.
// La clave de Zernio nunca sale de este servidor y el perfil Zernio de cada
// cliente se resuelve por proyecto: el modelo no puede elegir otro.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_BODY_BYTES = 64 * 1024

type RouteContext = { params: Promise<{ action: string }> }

const uuid = z.string().uuid()
const isoDate = z.string().min(10).max(40)

const instagramSchema = z.object({
  publication_type: z.enum(["feed", "story"]).optional(),
  share_to_feed: z.boolean().optional(),
  comments_enabled: z.boolean().optional(),
  is_ai_generated: z.boolean().optional(),
  first_comment: z.string().max(2200).optional(),
  collaborators: z.array(z.string().max(31)).max(3).optional(),
  location_id: z.string().max(40).optional(),
  audio_name: z.string().max(100).optional(),
  trial_reel: z.boolean().optional(),
}).strict()

const ACTIONS = {
  "targets": {
    rpcAction: "social_list_publish_targets",
    rate: "read",
    schema: z.object({ project_id: uuid, task_id: uuid.optional() }).strict(),
  },
  "publications": {
    rpcAction: "social_list_publications",
    rate: "read",
    schema: z.object({
      project_id: uuid,
      task_id: uuid.optional(),
      publication_id: uuid.optional(),
      statuses: z.array(z.enum(["preparing", "draft", "scheduled", "publishing", "published", "partial", "failed", "cancelled"])).max(8).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }).strict(),
  },
  "upload-url": {
    rpcAction: "social_create_media_upload",
    rate: "write",
    schema: z.object({
      task_id: uuid,
      filename: z.string().min(1).max(200),
      content_type: z.string().min(3).max(100),
      size_bytes: z.number().int().positive(),
    }).strict(),
  },
  "attach-media": {
    rpcAction: "social_attach_media",
    rate: "write",
    schema: z.object({
      task_id: uuid,
      asset_type: z.enum(["single", "reel", "carousel"]).optional(),
      name: z.string().min(1).max(120).optional(),
      items: z.array(z.object({
        source_url: z.string().url().max(2048).optional(),
        upload_path: z.string().min(1).max(512).optional(),
        name: z.string().min(1).max(120).optional(),
      }).strict()).min(1).max(10),
    }).strict(),
  },
  "remove-media": {
    rpcAction: "social_remove_media",
    rate: "write",
    schema: z.object({ task_id: uuid, asset_id: uuid }).strict(),
  },
  "publish": {
    rpcAction: "social_publish_task",
    rate: "write",
    schema: z.object({
      task_id: uuid,
      publication_id: uuid.optional(),
      idempotency_key: uuid,
      mode: z.enum(["draft", "schedule", "now"]),
      scheduled_for: isoDate.optional(),
      content: z.string().max(10000),
      account_ids: z.array(z.string().min(1).max(100)).min(1).max(20),
      asset_ids: z.array(uuid).max(20),
      save_copy_to_task: z.boolean().optional(),
      instagram: instagramSchema.optional(),
    }).strict(),
  },
  "cancel": {
    rpcAction: "social_cancel_publication",
    rate: "write",
    schema: z.object({ publication_id: uuid }).strict(),
  },
  "retry": {
    rpcAction: "social_retry_publication",
    rate: "write",
    schema: z.object({ publication_id: uuid }).strict(),
  },
} as const

type ActionName = keyof typeof ACTIONS

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function fail(code: string, message: string, status: number) {
  return json({ ok: false, error: { code, message } }, status)
}

function codeForStatus(status: number) {
  if (status === 400 || status === 422) return "invalid_request"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 409) return "conflict"
  if (status === 413) return "payload_too_large"
  if (status === 415) return "unsupported_media_type"
  if (status === 503) return "not_configured"
  return "upstream_error"
}

async function requireTask(taskId: string) {
  const task = await loadPublishTask(createAdminClient(), taskId)
  if (!task) throw new ZernioRouteError(404, "Tarjeta no encontrada")
  return task
}

async function requireProject(projectId: string) {
  const { data, error } = await createAdminClient()
    .from("sistema_projects")
    .select("id, nombre")
    .eq("id", projectId)
    .maybeSingle()
  if (error) throw new ZernioRouteError(500, error.message)
  if (!data) throw new ZernioRouteError(404, "Proyecto no encontrado")
  return data as { id: string; nombre: string }
}

async function listTargets(input: { project_id: string; task_id?: string }) {
  const project = await requireProject(input.project_id)
  const integration = await getProjectIntegration(project.id)
  let accounts: Array<Record<string, unknown>> = []
  let syncError: string | null = null
  if (integration) {
    try {
      accounts = await syncProjectAccounts(integration) as Array<Record<string, unknown>>
    } catch (error) {
      syncError = apiErrorResponse(error).message
    }
  }

  let task: Record<string, unknown> | null = null
  if (input.task_id) {
    const row = await requireTask(input.task_id)
    if (row.project_id !== project.id) throw new ZernioRouteError(400, "La tarjeta no pertenece a ese proyecto")
    const assets = await loadAssets(row.id)
    task = {
      id: row.id,
      title: row.titulo,
      task_type: row.task_type,
      social_copy: row.social_copy || "",
      assets: await Promise.all(assets.map(async (asset) => {
        const preview = await assetPreview(asset)
        return {
          id: asset.id,
          name: asset.nombre,
          asset_type: asset.asset_type,
          approval_status: asset.approval_status,
          group_id: asset.group_id,
          group_order: asset.group_order,
          file_type: preview.fileType,
          preview_url: preview.previewUrl && /^https:/i.test(preview.previewUrl) ? preview.previewUrl : null,
        }
      })),
    }
  }

  return {
    project: { id: project.id, name: project.nombre },
    zernio_configured: Boolean(integration),
    accounts: accounts.map((account) => ({
      account_id: account.zernio_account_id,
      platform: account.platform,
      username: account.username,
      display_name: account.display_name,
      is_active: account.is_active,
      needs_reconnection: account.needs_reconnection,
    })),
    sync_error: syncError,
    task,
  }
}

async function listPublications(input: z.infer<typeof ACTIONS["publications"]["schema"]>) {
  await requireProject(input.project_id)
  const admin = createAdminClient()
  let query = admin
    .from("sistema_zernio_publications")
    .select(PUBLICATION_COLUMNS)
    .eq("project_id", input.project_id)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25)
  if (input.task_id) query = query.eq("task_id", input.task_id)
  if (input.publication_id) query = query.eq("id", input.publication_id)
  if (input.statuses?.length) query = query.in("status", input.statuses)
  if (input.from) query = query.gte("scheduled_for", input.from)
  if (input.to) query = query.lte("scheduled_for", input.to)
  const { data, error } = await query
  if (error) throw new ZernioRouteError(500, error.message)

  await syncPublicationStatuses((data || []) as PublicationRow[])
  const ids = (data || []).map((row) => row.id)
  if (!ids.length) return { publications: [] }
  const { data: fresh, error: freshError } = await admin
    .from("sistema_zernio_publications")
    .select(PUBLICATION_COLUMNS)
    .in("id", ids)
    .order("created_at", { ascending: false })
  if (freshError) throw new ZernioRouteError(500, freshError.message)
  return { publications: fresh || [] }
}

function instagramOptions(input: z.infer<typeof instagramSchema> | undefined) {
  if (!input) return undefined
  return {
    ...(input.publication_type === "story" ? { publicationType: "story" } : {}),
    ...(input.share_to_feed !== undefined ? { shareToFeed: input.share_to_feed } : {}),
    ...(input.comments_enabled !== undefined ? { commentsEnabled: input.comments_enabled } : {}),
    ...(input.is_ai_generated !== undefined ? { isAiGenerated: input.is_ai_generated } : {}),
    ...(input.first_comment ? { firstComment: input.first_comment } : {}),
    ...(input.collaborators?.length ? { collaborators: input.collaborators } : {}),
    ...(input.location_id ? { locationId: input.location_id } : {}),
    ...(input.audio_name ? { audioName: input.audio_name } : {}),
    ...(input.trial_reel !== undefined ? { trialReel: input.trial_reel } : {}),
  }
}

async function publish(
  input: z.infer<typeof ACTIONS["publish"]["schema"]>,
  task: PublishTaskRow,
  actorUserId: string,
) {
  if (input.mode === "schedule" && !input.scheduled_for) {
    throw new ZernioRouteError(400, "scheduled_for es obligatorio para programar")
  }
  // El MCP manda un instante con offset; el resto del flujo (igual que el
  // panel) trabaja con la hora de reloj de la zona de Zernio.
  let scheduledFor: string | null = null
  if (input.mode === "schedule" && input.scheduled_for) {
    try {
      scheduledFor = instantToLocalDateTime(input.scheduled_for)
    } catch (error) {
      throw new ZernioRouteError(400, error instanceof Error ? error.message : "La fecha programada no es válida")
    }
  }
  if (input.publication_id) {
    const existing = await loadPublicationRecord(input.publication_id, { requireZernioPost: false })
    if (existing.task_id !== task.id) throw new ZernioRouteError(400, "La publicación no pertenece a esa tarjeta")
  }

  const admin = createAdminClient()
  const content = input.content.trim()
  if (input.save_copy_to_task !== false && content && content !== (task.social_copy || "")) {
    const { error } = await admin.from("sistema_tasks").update({ social_copy: content }).eq("id", task.id)
    if (error) throw new ZernioRouteError(500, `No se pudo guardar el copy en la tarjeta: ${error.message}`)
  }

  return publishTaskToZernio({
    input: {
      taskId: task.id,
      publicationId: input.publication_id || "",
      publishingMode: input.mode,
      content,
      scheduledFor,
      accountIds: Array.from(new Set(input.account_ids)),
      assetIds: Array.from(new Set(input.asset_ids)),
      rawMediaEdits: [],
      rawInstagramOptions: instagramOptions(input.instagram),
      requestId: input.publication_id ? undefined : input.idempotency_key,
    },
    task,
    actorUserId,
    assetStatusClient: admin,
  })
}

export async function POST(request: Request, context: RouteContext) {
  const { action } = await context.params
  if (!Object.hasOwn(ACTIONS, action)) return fail("not_found", "Acción desconocida", 404)
  const definition = ACTIONS[action as ActionName]

  const bearer = await mcpOAuthBearerClient(request)
  if ("error" in bearer) return fail(bearer.error.code.toLowerCase(), bearer.error.message, bearer.status)

  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return fail("unsupported_media_type", "La solicitud requiere JSON.", 415)
  }
  const raw = await request.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return fail("payload_too_large", "La solicitud es demasiado grande.", 413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return fail("invalid_request", "El JSON no es válido.", 400)
  }
  const parsed = definition.schema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return fail("invalid_request", issue ? `${issue.path.join(".") || "request"}: ${issue.message}` : "Solicitud inválida.", 400)
  }
  const input = parsed.data as Record<string, unknown>

  const { data: authorization, error: authorizationError } = await bearer.client.rpc("social_publish_authorize", {
    p_request: {
      action: definition.rpcAction,
      rate_class: definition.rate,
      project_id: input.project_id ?? null,
      task_id: input.task_id ?? null,
      publication_id: input.publication_id ?? null,
    },
  })
  if (authorizationError) {
    console.error("[social-mcp] authorize rpc failed", authorizationError.code, authorizationError.message)
    return fail("authorization_unavailable", "No se pudo verificar el permiso de publicación.", 502)
  }
  const envelope = authorization as { ok?: boolean; data?: { user_id?: string }; error?: { code?: string; message?: string } } | null
  if (!envelope?.ok || !envelope.data?.user_id) {
    return fail(envelope?.error?.code || "forbidden", envelope?.error?.message || "Sin permiso para publicar.", 403)
  }
  const actorUserId = envelope.data.user_id

  try {
    let data: unknown
    switch (action as ActionName) {
      case "targets":
        data = await listTargets(parsed.data as z.infer<typeof ACTIONS["targets"]["schema"]>)
        break
      case "publications":
        data = await listPublications(parsed.data as z.infer<typeof ACTIONS["publications"]["schema"]>)
        break
      case "upload-url": {
        const value = parsed.data as z.infer<typeof ACTIONS["upload-url"]["schema"]>
        data = await createMcpMediaUpload(await requireTask(value.task_id), value)
        break
      }
      case "attach-media": {
        const value = parsed.data as z.infer<typeof ACTIONS["attach-media"]["schema"]>
        data = await attachMcpMedia({
          task: await requireTask(value.task_id),
          actorUserId,
          items: value.items,
          assetType: value.asset_type,
          name: value.name,
        })
        break
      }
      case "remove-media": {
        const value = parsed.data as z.infer<typeof ACTIONS["remove-media"]["schema"]>
        data = await removeMcpMedia(await requireTask(value.task_id), value.asset_id)
        break
      }
      case "publish": {
        const value = parsed.data as z.infer<typeof ACTIONS["publish"]["schema"]>
        data = await publish(value, await requireTask(value.task_id), actorUserId)
        after(async () => {
          try { await dispatchPublicationTelegramNotices() }
          catch (error) { console.error("[social-mcp] Telegram pendiente", error instanceof Error ? error.message : "error") }
        })
        break
      }
      case "cancel": {
        const value = parsed.data as z.infer<typeof ACTIONS["cancel"]["schema"]>
        data = { publication: await cancelPublication(await loadPublicationRecord(value.publication_id)) }
        break
      }
      case "retry": {
        const value = parsed.data as z.infer<typeof ACTIONS["retry"]["schema"]>
        data = { publication: await retryPublication(await loadPublicationRecord(value.publication_id)) }
        break
      }
    }
    return json({ ok: true, data: data ?? null })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    if (normalized.status >= 500) {
      console.error("[social-mcp]", action, normalized.status, normalized.message)
    }
    return fail(codeForStatus(normalized.status), normalized.message, normalized.status >= 400 && normalized.status < 600 ? normalized.status : 502)
  }
}
