import { NextResponse } from "next/server"
import { requireSocialAdmin } from "@/lib/social/auth"
import { errorBody } from "@/lib/social/errors"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { zernioRequest } from "@/lib/zernio/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    await requireSocialAdmin(request)
    const params = new URL(request.url).searchParams
    const page = Math.floor(Math.max(0, Math.min(10000, Number(params.get("page")) || 0)))
    const status = params.get("status") || ""
    const account = params.get("account") || ""
    const search = (params.get("search") || "").replace(/[^\p{L}\p{N} @_-]/gu, "").slice(0, 120).trim()
    const admin = createAdminClient()
    const accounts = await admin.from("sistema_zernio_accounts").select("zernio_account_id, username, display_name, platform")
    if (accounts.error) throw accounts.error
    let query = admin.from("sistema_zernio_publications")
      .select("id, project_id, task_id, content, scheduled_for, timezone, status, account_ids, platform_results, error_message, created_at, updated_at, task:sistema_tasks(titulo), project:sistema_projects(nombre)", { count: "exact" })
    if (status) query = query.eq("status", status)
    if (account) query = query.contains("account_ids", [account])
    if (search) {
      const [tasks, projects] = await Promise.all([
        admin.from("sistema_tasks").select("id").ilike("titulo", `%${search}%`).limit(500),
        admin.from("sistema_projects").select("id").ilike("nombre", `%${search}%`).limit(500),
      ])
      if (tasks.error) throw tasks.error
      if (projects.error) throw projects.error
      const clauses = [`content.ilike.%${search}%`]
      if (tasks.data.length) clauses.push(`task_id.in.(${tasks.data.map((task) => task.id).join(",")})`)
      if (projects.data.length) clauses.push(`project_id.in.(${projects.data.map((project) => project.id).join(",")})`)
      for (const item of accounts.data || []) {
        if (`${item.username || ""} ${item.display_name || ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) {
          // Provider identifiers are escaped for PostgREST array literals.
          clauses.push(`account_ids.cs.${JSON.stringify([item.zernio_account_id]).replace("[", "{").replace("]", "}")}`)
        }
      }
      query = query.or(clauses.join(","))
    }
    const publications = await (status === "scheduled"
      ? query.order("scheduled_for", { ascending: true, nullsFirst: false })
      : query.order("created_at", { ascending: false }))
      .order("id", { ascending: true }).range(page * 100, page * 100 + 99)
    if (publications.error) throw publications.error
    return NextResponse.json({ publications: publications.data, accounts: accounts.data, total: publications.count, page })
  } catch (error) {
    const result = errorBody(error)
    return NextResponse.json(result.body, { status: result.status })
  }
}

// Actualiza solo publicaciones próximas o en curso; el listado siempre sigue
// disponible si el proveedor está temporalmente fuera de servicio.
export async function POST(request: Request) {
  try {
    await requireSocialAdmin(request)
    const admin = createAdminClient()
    const { data, error } = await admin.from("sistema_zernio_publications")
      .select("id, zernio_post_id, status, asset_ids, task:sistema_tasks(titulo)")
      .in("status", ["scheduled", "publishing", "preparing"])
      .not("zernio_post_id", "is", null)
      .or(`scheduled_for.is.null,scheduled_for.lte.${new Date(Date.now() + 86400000).toISOString()}`)
      .order("updated_at", { ascending: true }).limit(5)
    if (error) throw error
    let failed = 0
    const changes: Array<{ id: string; status: string; title: string }> = []
    await Promise.all((data || []).map(async (publication) => {
      try {
        const response = await zernioRequest<{ post?: { status?: string; platforms?: Array<{ errorMessage?: string }> } }>(`/posts/${encodeURIComponent(publication.zernio_post_id!)}`, { signal: AbortSignal.timeout(10000) })
        const post = response.post
        if (!post?.status || !["preparing", "draft", "scheduled", "publishing", "published", "partial", "failed", "cancelled"].includes(post.status)) { failed++; return }
        const { data: updated, error: updateError } = await admin.from("sistema_zernio_publications").update({
          status: post.status, platform_results: post.platforms || [],
          error_message: post.platforms?.find((platform) => platform.errorMessage)?.errorMessage || null,
          updated_at: new Date().toISOString(),
        }).eq("id", publication.id).eq("status", publication.status).select("id")
        if (updateError) throw updateError
        if (updated?.length && post.status !== publication.status && ["published", "failed", "partial"].includes(post.status)) {
          const task = Array.isArray(publication.task) ? publication.task[0] : publication.task
          changes.push({ id: publication.id, status: post.status, title: task?.titulo || "Publicación" })
        }
        if (updated?.length && post.status === "published" && publication.asset_ids.length) {
          const { error: assetError } = await admin.from("sistema_assets").update({ approval_status: "published" }).in("id", publication.asset_ids)
          if (assetError) throw assetError
        }
      } catch { failed++ }
    }))
    return NextResponse.json({ checked: data?.length || 0, failed, changes })
  } catch (error) {
    const result = errorBody(error)
    return NextResponse.json(result.body, { status: result.status })
  }
}
