import { dispatchPublicationTelegramNotices } from "@/lib/zernio/publication-telegram"
import { after, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import {
  assetPreview,
  loadAssets,
  loadPublishTask,
  parsePublishInput,
  publishTaskToZernio,
  syncPublicationStatuses,
  type PublicationRow,
} from "@/lib/zernio/publish-task"
import {
  apiErrorResponse,
  assertAdmin,
  assertProjectAccess,
  getProjectIntegration,
  getQuepiaSession,
  syncProjectAccounts,
  ZernioRouteError,
} from "@/lib/zernio/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function loadTaskContext(taskId: string) {
  const session = await getQuepiaSession()
  const task = await loadPublishTask(session.server, taskId)
  if (!task) throw new ZernioRouteError(404, "Tarea no encontrada o no autorizada")
  await assertProjectAccess(session, task.project_id)
  return { session, task }
}

export async function GET(request: Request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || ""
    if (!taskId) return NextResponse.json({ error: "Falta taskId" }, { status: 400 })

    const { session, task } = await loadTaskContext(taskId)
    const integration = await getProjectIntegration(task.project_id)
    const admin = createAdminClient()
    const { data: pendingPublications } = await admin
      .from("sistema_zernio_publications")
      .select("id, zernio_post_id, status")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(8)

    await syncPublicationStatuses((pendingPublications || []) as PublicationRow[])

    const [{ data: publications }, assets] = await Promise.all([
      admin
        .from("sistema_zernio_publications")
        .select("id, zernio_post_id, content, scheduled_for, timezone, status, account_ids, asset_ids, platform_results, error_message, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(8),
      loadAssets(taskId),
    ])

    let accounts: unknown[] = []
    let syncError: string | null = null
    if (integration) {
      try {
        accounts = await syncProjectAccounts(integration)
      } catch (error) {
        syncError = apiErrorResponse(error).message
      }
    }

    const assetsForPublishing = await Promise.all(assets.map(async (asset) => ({
      id: asset.id,
      name: asset.nombre,
      assetType: asset.asset_type,
      approvalStatus: asset.approval_status,
      currentVersion: asset.current_version,
      groupId: asset.group_id,
      groupOrder: asset.group_order,
      ...await assetPreview(asset),
    })))

    return NextResponse.json({
      configured: Boolean(integration),
      canPublish: session.isAdmin,
      task: {
        id: task.id,
        projectId: task.project_id,
        title: task.titulo,
        socialCopy: task.social_copy || "",
      },
      accounts,
      assets: assetsForPublishing,
      publications: publications || [],
      syncError,
    })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // La clave idempotente es solo para el MCP; el panel siempre genera una nueva.
    const input = parsePublishInput({ ...(body || {}), requestId: undefined })
    if (!input.taskId) return NextResponse.json({ error: "Falta taskId" }, { status: 400 })

    const { session, task } = await loadTaskContext(input.taskId)
    assertAdmin(session)
    const result = await publishTaskToZernio({
      input,
      task,
      actorUserId: session.user.id,
      assetStatusClient: session.server,
    })

    after(async () => {
      try { await dispatchPublicationTelegramNotices() }
      catch (error) { console.error("[Zernio] Telegram pendiente", error instanceof Error ? error.message : "error") }
    })
    return NextResponse.json(result)
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}
