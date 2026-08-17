import { NextResponse } from "next/server"
import { zernioRequest } from "@/lib/zernio/client"
import {
  apiErrorResponse,
  assertAdmin,
  assertProjectAccess,
  ensureProjectIntegration,
  getQuepiaSession,
} from "@/lib/zernio/server"

const SUPPORTED_PLATFORMS = new Set([
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "twitter",
  "threads",
])

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const projectId = String(body?.projectId || "").trim()
    const platform = String(body?.platform || "").trim().toLowerCase()
    const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : ""

    if (!projectId) return NextResponse.json({ error: "Falta projectId" }, { status: 400 })
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: "Plataforma no compatible en esta primera fase" }, { status: 400 })
    }

    const session = await getQuepiaSession()
    assertAdmin(session)
    const project = await assertProjectAccess(session, projectId)
    const integration = await ensureProjectIntegration({
      projectId,
      projectName: project.nombre,
      userId: session.user.id,
    })

    const redirectUrl = new URL("/sistema", request.url)
    redirectUrl.searchParams.set("project", projectId)
    redirectUrl.searchParams.set("zernio", "connected")
    if (taskId) redirectUrl.searchParams.set("taskId", taskId)

    const query = new URLSearchParams({
      profileId: String(integration.zernio_profile_id),
      redirect_url: redirectUrl.toString(),
    })
    const response = await zernioRequest<{ authUrl: string; state?: string }>(
      `/connect/${encodeURIComponent(platform)}?${query.toString()}`,
    )

    return NextResponse.json({ authUrl: response.authUrl })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}
