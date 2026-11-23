import { NextResponse } from "next/server"
import { zernioRequest } from "@/lib/zernio/client"
import { cancelPublication, loadPublicationRecord, retryPublication } from "@/lib/zernio/publication-actions"
import {
  apiErrorResponse,
  assertAdmin,
  assertProjectAccess,
  getQuepiaSession,
} from "@/lib/zernio/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ publicationId: string }> }

async function loadPublication(publicationId: string) {
  const session = await getQuepiaSession()
  assertAdmin(session)
  const publication = await loadPublicationRecord(publicationId)
  await assertProjectAccess(session, publication.project_id)
  return { publication }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { publicationId } = await context.params
    const { publication } = await loadPublication(publicationId)
    const response = await zernioRequest<{ post?: Record<string, unknown> }>(
      `/posts/${encodeURIComponent(publication.zernio_post_id!)}`,
    )
    return NextResponse.json({ publication, post: response.post || {} })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { publicationId } = await context.params
    const { publication } = await loadPublication(publicationId)
    return NextResponse.json({ publication: await cancelPublication(publication) })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = await request.json().catch(() => null)
    if (body?.action !== "retry") {
      return NextResponse.json({ error: "Acción no compatible" }, { status: 400 })
    }
    const { publicationId } = await context.params
    const { publication } = await loadPublication(publicationId)
    return NextResponse.json({ publication: await retryPublication(publication) })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}
