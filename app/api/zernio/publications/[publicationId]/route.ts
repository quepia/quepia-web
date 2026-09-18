import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { zernioRequest } from "@/lib/zernio/client"
import {
  apiErrorResponse,
  assertAdmin,
  assertProjectAccess,
  getQuepiaSession,
  ZernioRouteError,
} from "@/lib/zernio/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ publicationId: string }> }

async function loadPublication(publicationId: string) {
  const session = await getQuepiaSession()
  assertAdmin(session)
  const admin = createAdminClient()
  const { data: publication, error } = await admin
    .from("sistema_zernio_publications")
    .select("id, project_id, task_id, zernio_post_id, content, scheduled_for, timezone, status, account_ids, asset_ids, platform_results, error_message, created_at")
    .eq("id", publicationId)
    .maybeSingle()
  if (error) throw new ZernioRouteError(500, error.message)
  if (!publication) throw new ZernioRouteError(404, "Publicación no encontrada")
  await assertProjectAccess(session, publication.project_id)
  if (!publication.zernio_post_id) throw new ZernioRouteError(409, "La publicación todavía no tiene un identificador de Zernio")
  return { admin, publication }
}

function postState(post: Record<string, unknown>, fallback: string) {
  const status = typeof post.status === "string" ? post.status : fallback
  const platforms = Array.isArray(post.platforms) ? post.platforms : []
  const errorMessage = platforms
    .map((platform) => platform && typeof platform === "object" ? (platform as Record<string, unknown>).errorMessage : null)
    .find((value): value is string => typeof value === "string" && Boolean(value)) || null
  return { status, platforms, errorMessage }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { publicationId } = await context.params
    const { publication } = await loadPublication(publicationId)
    const response = await zernioRequest<{ post?: Record<string, unknown> }>(
      `/posts/${encodeURIComponent(publication.zernio_post_id)}`,
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
    const { admin, publication } = await loadPublication(publicationId)
    if (!["draft", "scheduled"].includes(publication.status)) {
      throw new ZernioRouteError(409, "Solo se pueden cancelar borradores o publicaciones programadas")
    }
    await zernioRequest(`/posts/${encodeURIComponent(publication.zernio_post_id)}`, { method: "DELETE" })
    const { error } = await admin
      .from("sistema_zernio_publications")
      .update({ status: "cancelled", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", publication.id)
    if (error) throw new ZernioRouteError(500, error.message)
    return NextResponse.json({ publication: { ...publication, status: "cancelled", error_message: null } })
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
    const { admin, publication } = await loadPublication(publicationId)
    if (!["failed", "partial"].includes(publication.status)) {
      throw new ZernioRouteError(409, "Solo se pueden reintentar publicaciones fallidas o parciales")
    }

    const response = await zernioRequest<{ post?: Record<string, unknown> }>(
      `/posts/${encodeURIComponent(publication.zernio_post_id)}/retry`,
      { method: "POST" },
    )
    const post = response.post || {}
    const state = postState(post, publication.status)
    const { error } = await admin
      .from("sistema_zernio_publications")
      .update({
        status: state.status,
        platform_results: state.platforms,
        error_message: state.errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", publication.id)
    if (error) throw new ZernioRouteError(500, error.message)
    if (state.status === "published" && publication.asset_ids.length > 0) {
      await admin
        .from("sistema_assets")
        .update({ approval_status: "published" })
        .in("id", publication.asset_ids)
    }
    return NextResponse.json({ publication: { id: publication.id, ...state } })
  } catch (error) {
    const normalized = apiErrorResponse(error)
    return NextResponse.json({ error: normalized.message, details: normalized.details }, { status: normalized.status })
  }
}
