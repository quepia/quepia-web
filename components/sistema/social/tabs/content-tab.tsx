"use client"

import { useState } from "react"
import Image from "next/image"
import { Download, ExternalLink, X } from "lucide-react"
import { formatDateTime, formatValue, paramsQuery, socialFetch, useSocialData, type SocialApiError } from "../social-api"
import { Button, Empty, ErrorState, FORMAT_LABEL, LineChart, Loading, Panel, PLATFORM_LABEL, Select, StatusTag } from "../social-ui"
import type { TabProps } from "../social-module"

const providerImageLoader = ({ src }: { src: string }) => src

type RankResult = { result: {
  rows: Array<{ rank: number; post_id: string; platform: string; format: string; origin: string; published_at: string; permalink: string | null; thumbnail_url: string | null; caption_excerpt: string | null; value: number }>
  sample: { posts_in_scope: number; ranked: number; excluded_not_supported: number; excluded_too_young: number; excluded_missing_observation: number }
  method: string
} }
type FormatsResult = { result: { groups: Array<{ format: string; platform: string; n: number; posts_total: number; median: number | null; p25: number | null; p75: number | null; max: number | null; small_sample: boolean }>; method: string } }
type PostResult = { result: {
  post: { id: string; client_id: string; platform: string; format: string; origin: string; published_at: string; permalink: string | null; caption_excerpt: string | null; task_id: string | null; provider_sync_status: string | null; metrics_observed_at: string | null }
  account: { username: string }
  projects: Array<{ project_id: string; name: string; source: string }>
  metrics: Array<{ metric: string; label: string; unit: string; status: string; value: number | null; provider_synced_at: string | null }>
  series: Record<string, Array<{ day: string; value: number; source: string }>>
  series_semantics: string
} }

const RANK_METRICS = [
  { value: "views", label: "Views" }, { value: "reach", label: "Alcance" }, { value: "interactions", label: "Interacciones" },
  { value: "engagement_rate_reach", label: "Engagement / alcance" }, { value: "saves", label: "Guardados" }, { value: "shares", label: "Compartidos" },
  { value: "comments", label: "Comentarios" }, { value: "ig_reels_avg_watch_time", label: "Tiempo medio (Reels)" },
]
const ORIGIN_LABEL: Record<string, string> = { quepia: "Publicado desde Quepia", zernio_api: "Vía API (fuera de Quepia)", external: "Publicado en la plataforma" }

export function ContentTab({ scope, scopes }: TabProps) {
  const [metric, setMetric] = useState("views")
  const [age, setAge] = useState("7")
  const [format, setFormat] = useState("")
  const [origin, setOrigin] = useState("")
  const [openPost, setOpenPost] = useState<string | null>(null)
  const filters = { ...scope, ...(format ? { formats: [format] } : {}), ...(origin ? { origins: [origin] } : {}) }
  const rankParams = { ...filters, metric, limit: 20, ...(age ? { age_days: Number(age) } : {}) }
  const rank = useSocialData<RankResult>(`/api/admin/social/posts?${paramsQuery(rankParams)}`)
  const formats = useSocialData<FormatsResult>(`/api/admin/social/analytics?op=compare_formats&${paramsQuery({ ...filters, metric: ["views", "reach", "likes", "comments", "shares", "saves"].includes(metric) ? metric : "views", ...(age ? { age_days: Number(age) } : {}) })}`)
  const unit = metric === "engagement_rate_reach" ? "ratio" : metric.startsWith("ig_reels") ? "milliseconds" : undefined

  return (
    <div className="space-y-4">
      <Panel title="Ranking de publicaciones" description={rank.data?.result.method} actions={
        <div className="flex flex-wrap items-end gap-2">
          <Select label="Métrica" value={metric} onChange={setMetric} options={RANK_METRICS} />
          <Select label="Edad comparable" value={age} onChange={setAge} options={[
            { value: "", label: "Valor vigente" }, { value: "1", label: "A 1 día" }, { value: "3", label: "A 3 días" },
            { value: "7", label: "A 7 días" }, { value: "14", label: "A 14 días" }, { value: "30", label: "A 30 días" },
          ]} />
          <Select label="Formato" value={format} onChange={setFormat} options={[{ value: "", label: "Todos" }, ...Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label }))]} />
          <Select label="Origen" value={origin} onChange={setOrigin} options={[{ value: "", label: "Todos" }, ...Object.entries(ORIGIN_LABEL).map(([value, label]) => ({ value, label }))]} />
          <a href={`/api/admin/social/export?op=rank_posts&${paramsQuery(rankParams)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-3 text-sm text-white/70 hover:bg-white/[0.06]">
            <Download className="h-4 w-4" /> CSV
          </a>
        </div>
      }>
        {rank.loading && !rank.data ? <Loading /> : <ErrorState error={rank.error} onRetry={rank.reload} />}
        {rank.data && (
          <>
            <p className="mb-2 text-xs text-[#a3a3a3]">
              {rank.data.result.sample.ranked} de {rank.data.result.sample.posts_in_scope} publicaciones ordenadas ·
              excluidas: {rank.data.result.sample.excluded_too_young} por ser más jóvenes que la edad elegida, {rank.data.result.sample.excluded_missing_observation} sin observación a esa edad, {rank.data.result.sample.excluded_not_supported} sin métrica soportada.
            </p>
            {rank.data.result.rows.length === 0 ? <Empty>No hay publicaciones comparables con estos filtros.</Empty> : (
              <ol className="divide-y divide-white/[0.04]">
                {rank.data.result.rows.map((row) => (
                  <li key={row.post_id}>
                    <button onClick={() => setOpenPost(row.post_id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-white/[0.02]">
                      <span className="w-6 text-right text-xs tabular-nums text-[#a3a3a3]">{row.rank}</span>
                      {row.thumbnail_url
                        ? <Image src={row.thumbnail_url} loader={providerImageLoader} unoptimized width={40} height={40} sizes="40px" alt="" className="h-10 w-10 rounded object-cover" referrerPolicy="no-referrer" />
                        : <span className="h-10 w-10 rounded bg-white/[0.05]" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white/80">{row.caption_excerpt || "Sin texto"}</span>
                        <span className="text-xs text-[#a3a3a3]">{FORMAT_LABEL[row.format] ?? row.format} · {PLATFORM_LABEL[row.platform] ?? row.platform} · {formatDateTime(row.published_at)} · {ORIGIN_LABEL[row.origin]}</span>
                      </span>
                      <span className="text-sm tabular-nums text-white/85">{formatValue(row.value, unit)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Panel>
      <Panel title="Rendimiento por formato" description={formats.data?.result.method}>
        {formats.loading && !formats.data ? <Loading /> : <ErrorState error={formats.error} />}
        {formats.data && (formats.data.result.groups.length === 0 ? <Empty>Sin publicaciones en el período.</Empty> : (
          <div className="overflow-x-auto" role="region" aria-label="Rendimiento por formato" tabIndex={0}>
          <table className="w-full min-w-[600px] text-sm [&_td]:pr-4 [&_th]:pr-4">
            <thead><tr className="border-b border-white/[0.06] text-left text-xs text-[#a3a3a3]">
              <th className="py-2 font-normal">Formato</th><th className="py-2 font-normal">Red</th><th className="py-2 text-right font-normal">n</th>
              <th className="py-2 text-right font-normal">Mediana</th><th className="py-2 text-right font-normal">P25–P75</th><th className="py-2 text-right font-normal">Máximo</th>
            </tr></thead>
            <tbody>
              {formats.data.result.groups.map((group) => (
                <tr key={`${group.platform}-${group.format}`} className="border-b border-white/[0.04]">
                  <td className="py-2">{FORMAT_LABEL[group.format] ?? group.format}</td>
                  <td className="py-2 text-[#a3a3a3]">{PLATFORM_LABEL[group.platform] ?? group.platform}</td>
                  <td className="py-2 text-right tabular-nums">{group.n}/{group.posts_total} {group.small_sample && <span className="ml-1 text-[11px] text-amber-300">muestra chica</span>}</td>
                  <td className="py-2 text-right tabular-nums">{formatValue(group.median)}</td>
                  <td className="py-2 text-right tabular-nums text-[#a3a3a3]">{formatValue(group.p25)}–{formatValue(group.p75)}</td>
                  <td className="py-2 text-right tabular-nums text-[#a3a3a3]">{formatValue(group.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ))}
      </Panel>
      {openPost && <PostDrawer postId={openPost} onClose={() => setOpenPost(null)} projects={scopes.projects} />}
    </div>
  )
}

function PostDrawer({ postId, onClose, projects }: { postId: string; onClose: () => void; projects: TabProps["scopes"]["projects"] }) {
  const detail = useSocialData<PostResult>(`/api/admin/social/posts/${postId}`)
  const [attributing, setAttributing] = useState("")
  const [error, setError] = useState<SocialApiError | null>(null)
  const post = detail.data?.result
  const views = post?.series.views ?? []
  const clientProjects = projects.filter((project) => project.client_id === post?.post.client_id)
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Detalle de publicación" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0f0f0f] p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-base font-medium">Detalle de publicación</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-[#a3a3a3] hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {detail.loading && <Loading />}
        <ErrorState error={detail.error} />
        {post && (
          <div className="space-y-4">
            <div className="text-sm text-white/75">{post.post.caption_excerpt || "Sin texto"}</div>
            <div className="text-xs text-[#a3a3a3]">
              @{post.account.username} · {FORMAT_LABEL[post.post.format]} · publicada {formatDateTime(post.post.published_at)} · métricas {formatDateTime(post.post.metrics_observed_at)}
              {post.post.permalink && <a href={post.post.permalink} target="_blank" rel="noreferrer noopener" className="ml-2 inline-flex items-center gap-1 underline">Ver <ExternalLink className="h-3 w-3" /></a>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {post.metrics.filter((metric) => metric.status !== "not_supported").map((metric) => (
                <div key={metric.metric} className="rounded-md border border-white/[0.06] px-3 py-2">
                  <div className="text-xs text-[#a3a3a3]">{metric.label}</div>
                  <div className="tabular-nums">{metric.status === "unverified" || metric.status === "alias" ? "—" : formatValue(metric.value, metric.unit)}</div>
                  <StatusTag status={metric.value === null && metric.status === "supported" ? "no_data" : metric.status === "supported" ? null : metric.status} />
                </div>
              ))}
            </div>
            {views.length > 0 && <LineChart title="Views acumuladas" points={views.map((point) => ({ label: point.day, value: point.value, note: point.source }))} />}
            <p className="text-xs text-[#a3a3a3]">{post.series_semantics}</p>
            <div className="rounded-md border border-white/[0.06] p-3 text-sm">
              <div className="mb-1 text-xs text-[#a3a3a3]">Proyecto</div>
              {post.projects.length > 0
                ? post.projects.map((project) => <div key={project.project_id}>{project.name} <span className="text-xs text-[#a3a3a3]">({project.source === "publication" ? "heredado de la tarea" : "asignado manualmente"})</span></div>)
                : (
                  <div className="flex items-end gap-2">
                    <Select label="Sin atribución (publicación externa)" value={attributing} onChange={setAttributing}
                      options={[{ value: "", label: "Elegir proyecto del cliente" }, ...clientProjects.map((project) => ({ value: project.id, label: project.name }))]} />
                    <Button disabled={!attributing} onClick={async () => {
                      try {
                        await socialFetch(`/api/admin/social/posts/${postId}`, { method: "PATCH", json: { project_id: attributing } })
                        detail.reload()
                      } catch (failure) { setError(failure as SocialApiError) }
                    }}>Atribuir</Button>
                  </div>
                )}
              <ErrorState error={error} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
