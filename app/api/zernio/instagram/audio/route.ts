import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { zernioRequest } from "@/lib/zernio/client"
import {
  apiErrorResponse,
  assertAdmin,
  assertProjectAccess,
  getProjectIntegration,
  getQuepiaSession,
  ZernioRouteError,
} from "@/lib/zernio/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type InstagramAudioAsset = {
  audioId: string
  title?: string
  audioType?: string
  durationInMs?: number
  displayArtist?: string
  coverArtworkThumbnailUrl?: string
  downloadUrl?: string
  igUsername?: string
  isAdsEligible?: boolean
  onPlatformAudioPreviewLink?: string
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const taskId = params.get("taskId")?.trim() || ""
    const accountId = params.get("accountId")?.trim() || ""
    const query = params.get("q")?.trim().slice(0, 100) || ""
    if (!taskId || !accountId) {
      return NextResponse.json({ error: "Faltan la tarea o la cuenta de Instagram" }, { status: 400 })
    }

    const session = await getQuepiaSession()
    assertAdmin(session)
    const { data: task } = await session.server
      .from("sistema_tasks")
      .select("project_id")
      .eq("id", taskId)
      .maybeSingle()
    if (!task) throw new ZernioRouteError(404, "Tarea no encontrada o no autorizada")
    await assertProjectAccess(session, task.project_id)

    const integration = await getProjectIntegration(task.project_id)
    if (!integration) throw new ZernioRouteError(409, "Este proyecto todavía no tiene un perfil Zernio")
    const admin = createAdminClient()
    const { data: account } = await admin
      .from("sistema_zernio_accounts")
      .select("zernio_account_id, platform, is_active, needs_reconnection")
      .eq("integration_id", integration.id)
      .eq("zernio_account_id", accountId)
      .maybeSingle()
    if (!account || account.platform.toLowerCase() !== "instagram") {
      throw new ZernioRouteError(403, "La cuenta de Instagram no pertenece a este proyecto")
    }
    if (!account.is_active || account.needs_reconnection) {
      throw new ZernioRouteError(409, "La cuenta de Instagram necesita reconexión")
    }

    const upstream = new URLSearchParams({ audioType: "music" })
    if (query) upstream.set("q", query)
    const response = await zernioRequest<{ audio?: InstagramAudioAsset[] }>(
      `/accounts/${encodeURIComponent(accountId)}/instagram/audio?${upstream.toString()}`,
    )
    return NextResponse.json({ audio: Array.isArray(response.audio) ? response.audio : [] })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}
