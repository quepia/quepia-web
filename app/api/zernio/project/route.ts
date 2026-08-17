import { NextResponse } from "next/server"
import {
  apiErrorResponse,
  assertAdmin,
  assertProjectAccess,
  ensureProjectIntegration,
  getProjectIntegration,
  getQuepiaSession,
  syncProjectAccounts,
} from "@/lib/zernio/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || ""
    if (!projectId) return NextResponse.json({ error: "Falta projectId" }, { status: 400 })

    const session = await getQuepiaSession()
    await assertProjectAccess(session, projectId)
    const integration = await getProjectIntegration(projectId)

    if (!integration) {
      return NextResponse.json({ configured: false, canManage: session.isAdmin, accounts: [] })
    }

    let accounts: Awaited<ReturnType<typeof syncProjectAccounts>> = []
    let syncError: string | null = null
    try {
      accounts = await syncProjectAccounts(integration)
    } catch (error) {
      syncError = apiErrorResponse(error).message
    }

    return NextResponse.json({
      configured: true,
      canManage: session.isAdmin,
      profile: {
        id: integration.id,
        zernioProfileId: integration.zernio_profile_id,
        name: integration.name,
        status: integration.status,
        lastSyncedAt: integration.last_synced_at,
      },
      accounts,
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
    const projectId = String(body?.projectId || "").trim()
    if (!projectId) return NextResponse.json({ error: "Falta projectId" }, { status: 400 })

    const session = await getQuepiaSession()
    assertAdmin(session)
    const project = await assertProjectAccess(session, projectId)
    const integration = await ensureProjectIntegration({
      projectId,
      projectName: project.nombre,
      userId: session.user.id,
    })

    return NextResponse.json({
      configured: true,
      profile: {
        id: integration.id,
        zernioProfileId: integration.zernio_profile_id,
        name: integration.name,
        status: integration.status,
      },
      accounts: await syncProjectAccounts(integration),
    })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}
