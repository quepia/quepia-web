import { NextResponse } from "next/server"
import { requireSocialAdmin } from "@/lib/social/auth"
import { errorBody } from "@/lib/social/errors"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { syncPendingPublications } from "@/lib/zernio/sync-publications"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    await requireSocialAdmin(request)
    const sync = await syncPendingPublications()
    const params = new URL(request.url).searchParams
    const page = Math.floor(Math.max(0, Math.min(10000, Number(params.get("page")) || 0)))
    const status = params.get("status") || ""
    const account = params.get("account") || ""
    const search = (params.get("search") || "").replace(/[^\p{L}\p{N} @_-]/gu, "").slice(0, 120).trim()
    const admin = createAdminClient()
    const accounts = await admin.from("sistema_zernio_accounts").select("zernio_account_id, username, display_name, platform")
    if (accounts.error) throw accounts.error
    let query = admin.from("sistema_zernio_publications")
      .select("id, zernio_post_id, project_id, task_id, content, scheduled_for, timezone, status, account_ids, platform_results, error_message, created_at, updated_at, task:sistema_tasks(titulo), project:sistema_projects(nombre)", { count: "exact" })
    query = query.not("zernio_post_id", "is", null)
    // Unverified active records must not masquerade as provider confirmations.
    query = query.or(`status.not.in.(preparing,scheduled,publishing)${sync.verifiedIds.length ? `,id.in.(${sync.verifiedIds.join(",")})` : ""}`)
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
    return NextResponse.json({ publications: publications.data, accounts: accounts.data, total: publications.count, page, changes: sync.changes, unverified: sync.failed })
  } catch (error) {
    const result = errorBody(error)
    return NextResponse.json(result.body, { status: result.status })
  }
}

// Manual refresh uses the same reconciliation as the first page load.
export async function POST(request: Request) {
  try {
    await requireSocialAdmin(request)
    return NextResponse.json(await syncPendingPublications())
  } catch (error) {
    const result = errorBody(error)
    return NextResponse.json(result.body, { status: result.status })
  }
}
