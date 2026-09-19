import { adminRoute, paramsFromUrl, socialQuery } from "@/lib/social/server"
import { socialRpc } from "@/lib/social/rpc"
import { SocialError } from "@/lib/social/errors"
import { toCsv } from "@/lib/social/csv"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ranked = { result: { rows: Array<Record<string, unknown>> } }
type Overview = { result: { content: { per_account: Array<Record<string, unknown>> } } }

// Exportación de agregados (ranking o resumen por cuenta). Nunca incluye DMs,
// notas ni datos de contactos. Queda auditada.
export const GET = adminRoute(async ({ request, admin }) => {
  const op = new URL(request.url).searchParams.get("op")
  const params = paramsFromUrl(request)
  let rows: Array<Record<string, unknown>>
  if (op === "rank_posts") {
    const data = await socialQuery<Ranked>(admin, "rank_posts", { ...params, limit: 50 })
    rows = data.result.rows.map((row) => ({
      rank: row.rank, plataforma: row.platform, formato: row.format, origen: row.origin, publicado: row.published_at,
      valor: row.value, enlace: row.permalink, caption: row.caption_excerpt,
    }))
  } else if (op === "overview") {
    const data = await socialQuery<Overview>(admin, "overview", params)
    rows = data.result.content.per_account.map((row) => {
      const metrics = (row.metrics ?? {}) as Record<string, { value: unknown; status: string }>
      const engagement = (row.engagement_rate_reach ?? {}) as Record<string, unknown>
      return {
        cuenta: row.username, plataforma: row.platform, publicaciones: row.posts_published,
        ...Object.fromEntries(Object.entries(metrics).flatMap(([key, metric]) => [[key, metric.value], [`${key}_estado`, metric.status]])),
        engagement_por_alcance: engagement.value, publicaciones_elegibles: engagement.eligible_posts,
      }
    })
  } else {
    throw new SocialError(400, "unknown_operation", "Exportación no permitida")
  }
  await socialRpc("social_admin_record_export", { p_actor: admin.userId, p_op: op, p_params: params, p_rows: rows.length })
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quepia-social-${op}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
