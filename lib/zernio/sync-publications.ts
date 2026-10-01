import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { zernioRequest } from "./client"

const ACTIVE = ["preparing", "scheduled", "publishing", "partial"]
const STATUSES = new Set([...ACTIVE, "draft", "published", "partial", "failed", "cancelled"])

type ProviderPost = {
  status?: string; content?: string; scheduledFor?: string; timezone?: string
  platforms?: Array<{ errorMessage?: string }>
}

/** Reconcile sends with the provider before filtering the local agenda.
 * Task deadlines are never a source of publication status or timing.
 * Failed checks remain unverified; they are never presented as scheduled.
 */
export async function syncPendingPublications() {
  const admin = createAdminClient()
  const { data, error, count } = await admin.from("sistema_zernio_publications")
    .select("id, zernio_post_id, status, asset_ids, updated_at, task:sistema_tasks(titulo)", { count: "exact" })
    .in("status", ACTIVE).not("zernio_post_id", "is", null)
    .order("updated_at", { ascending: true }).limit(100)
  if (error) throw error
  const verifiedIds: string[] = []
  const changes: Array<{ id: string; status: string; title: string }> = []
  let failed = Math.max(0, (count || 0) - (data?.length || 0))
  const deadline = AbortSignal.timeout(40000)
  const queue = [...(data || [])]
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (queue.length) {
      const publication = queue.shift()!
      try {
        const response = await zernioRequest<{ post?: ProviderPost }>(`/posts/${encodeURIComponent(publication.zernio_post_id!)}`, {
          signal: AbortSignal.any([deadline, AbortSignal.timeout(10000)]),
        })
        const post = response.post
        if (!post?.status || !STATUSES.has(post.status)) throw new Error("Estado de Zernio no reconocido")
        const scheduledFor = post.scheduledFor ? new Date(post.scheduledFor).toISOString() : null
        const { data: updated, error: updateError } = await admin.from("sistema_zernio_publications").update({
          status: post.status,
          scheduled_for: scheduledFor,
          ...(typeof post.content === "string" ? { content: post.content } : {}),
          ...(post.timezone ? { timezone: post.timezone } : {}),
          platform_results: post.platforms || [],
          error_message: post.platforms?.find((platform) => platform.errorMessage)?.errorMessage || null,
          updated_at: new Date().toISOString(),
        }).eq("id", publication.id).eq("updated_at", publication.updated_at).select("id")
        if (updateError) throw updateError
        if (!updated?.length) throw new Error("La publicación cambió durante la verificación")
        verifiedIds.push(publication.id)
        if (post.status !== publication.status && ["published", "failed", "partial"].includes(post.status)) {
          const task = Array.isArray(publication.task) ? publication.task[0] : publication.task
          changes.push({ id: publication.id, status: post.status, title: task?.titulo || "Publicación" })
        }
        if (post.status === "published" && publication.asset_ids.length) {
          const { error: assetError } = await admin.from("sistema_assets").update({ approval_status: "published" }).in("id", publication.asset_ids)
          if (assetError) throw assetError
        }
      } catch { failed++ }
    }
  }))
  return { checked: data?.length || 0, failed, verifiedIds, changes }
}
