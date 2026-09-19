"use client"

import { AlertTriangle, CheckCircle2, CircleSlash, Clock } from "lucide-react"
import { paramsQuery, relativeAge, formatValue, useSocialData } from "../social-api"
import { DeltaText, Empty, ErrorState, Loading, MetricTile, Panel, PLATFORM_LABEL, StatusTag } from "../social-ui"
import type { TabProps } from "../social-module"

type MetricCell = { value: number | null; status: string; posts_with_value?: number; posts_total?: number }
type AccountContent = {
  account_id: string; client_id: string; platform: string; username: string | null; posts_published: number
  data_as_of: string | null; metrics: Record<string, MetricCell>
  engagement_rate_reach: { value: number | null; eligible_posts: number; excluded_posts: number; unavailable_reason: string | null }
}
type Comparison = { current: number | null; previous: number | null; absolute_change: number | null; percent_change: number | null; percent_change_unavailable_reason: string | null; current_status?: string }
type CompareResult = {
  result: {
    current_period: { from: string; to: string; incomplete: boolean }
    previous_period: { from: string; to: string }
    comparison: Record<string, Comparison>
    current: { content: { per_account: AccountContent[]; totals: { warnings: string[]; metrics: Record<string, MetricCell & { label_note?: string }> } }; followers: { per_account: Array<{ account_id: string; change: number | null; percent_change: number | null; end: { value: number } | null; status: string }>; totals: { note: string } } }
    warnings: string[]
  }
  evidence: { data_as_of: string | null; timezone: string; generated_at: string }
}
type CoverageResult = { result: { accounts: Array<{ account_id: string; client_name: string; health_status: string; needs_reconnection: boolean; provider_analytics_synced_at: string | null; latest_post_metrics_at: string | null; followers_last_day: string | null; posts_without_metrics: number }>; queue: { queued: number; dead_or_failed_24h: number; oldest_queued_minutes: number | null } } }
type AttentionResult = { result: { pending_now: { threads: number; oldest_pending_minutes: number | null; unassigned: number }; first_human_response_minutes: { median_wall: number | null; p90_wall: number | null }; episodes_opened: number } }

const delta = (item?: Comparison) => item ? { absolute: item.absolute_change, percent: item.percent_change, reason: item.percent_change_unavailable_reason } : null

function HealthIcon({ status, reconnect }: { status: string; reconnect: boolean }) {
  if (reconnect || status === "needs_reconnect" || status === "error") return <span className="inline-flex items-center gap-1 text-xs text-red-300"><AlertTriangle className="h-3.5 w-3.5" /> Reconectar</span>
  if (status === "warning") return <span className="inline-flex items-center gap-1 text-xs text-amber-300"><Clock className="h-3.5 w-3.5" /> Advertencia</span>
  if (status === "removed") return <span className="inline-flex items-center gap-1 text-xs text-[#a3a3a3]"><CircleSlash className="h-3.5 w-3.5" /> Eliminada</span>
  if (status === "healthy") return <span className="inline-flex items-center gap-1 text-xs text-[#a3a3a3]"><CheckCircle2 className="h-3.5 w-3.5" /> Sana</span>
  return <span className="text-xs text-[#a3a3a3]">Sin verificar</span>
}

export function AgencyTab({ scope, scopes }: TabProps) {
  const query = paramsQuery(scope)
  const compare = useSocialData<CompareResult>(`/api/admin/social/analytics?op=compare_periods&${query}`)
  const coverage = useSocialData<CoverageResult>(`/api/admin/social/analytics?op=coverage&${query}`)
  const attention = useSocialData<AttentionResult>(`/api/admin/social/analytics?op=attention&${query}`)

  if (compare.loading && !compare.data) return <Loading />
  if (compare.error) return <ErrorState error={compare.error} onRetry={compare.reload} />
  if (!compare.data) return null
  const data = compare.data.result
  const coverageByAccount = new Map((coverage.data?.result.accounts ?? []).map((row) => [row.account_id, row]))
  const clientName = new Map(scopes.clients.map((client) => [client.id, client.name]))
  const followersByAccount = new Map(data.current.followers.per_account.map((row) => [row.account_id, row]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <MetricTile label="Publicaciones" value={data.comparison.posts_published?.current} delta={delta(data.comparison.posts_published)} hint="Una publicación multiplataforma cuenta una vez por cuenta." />
        <MetricTile label="Pendientes sin responder" value={attention.data?.result.pending_now.threads} hint="Hilos con mensajes/comentarios entrantes sin respuesta, incluidos los sin asignar." />
        <MetricTile label="Sin asignar" value={attention.data?.result.pending_now.unassigned} />
        <MetricTile label="1ª respuesta humana (mediana)" value={attention.data?.result.first_human_response_minutes.median_wall} hint="Minutos de reloj; ver Bandeja para horario laboral y p90." />
        <MetricTile label="Cola de sincronización" value={coverage.data?.result.queue.queued} hint="Trabajos en espera" />
        <MetricTile label="Fallas 24 h" value={coverage.data?.result.queue.dead_or_failed_24h} />
      </div>
      <p className="text-xs text-[#a3a3a3]">
        Período {data.current_period.from} → {data.current_period.to}{data.current_period.incomplete ? " (incompleto: incluye hoy)" : ""} · comparado con {data.previous_period.from} → {data.previous_period.to} ·
        zona {compare.data.evidence.timezone} · datos al {compare.data.evidence.data_as_of ? relativeAge(compare.data.evidence.data_as_of) : "sin sincronizar"}.
        No se muestra un engagement global de agencia: los denominadores de distintas cuentas y redes no son comparables.
      </p>
      <Panel title="Cuentas" description="Métricas de contenido publicado en el período por cuenta. Seguidores: cambio de la cuenta completa (no se atribuye a proyectos).">
        {data.current.content.per_account.length === 0 ? <Empty>No hay cuentas con cliente asignado en este alcance.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs text-[#a3a3a3]">
                  <th className="py-2 font-normal">Cliente / cuenta</th>
                  <th className="py-2 text-right font-normal">Publicaciones</th>
                  <th className="py-2 text-right font-normal">Views</th>
                  <th className="py-2 text-right font-normal" title="Suma de alcances por publicación: no son personas únicas">Suma de alcances</th>
                  <th className="py-2 text-right font-normal" title="(likes+comentarios+compartidos+guardados) / alcance, ponderado">Engagement / alcance</th>
                  <th className="py-2 text-right font-normal">Seguidores (Δ)</th>
                  <th className="py-2 pl-4 font-normal">Salud</th>
                  <th className="py-2 font-normal">Frescura</th>
                </tr>
              </thead>
              <tbody>
                {data.current.content.per_account.map((row) => {
                  const cover = coverageByAccount.get(row.account_id)
                  const followers = followersByAccount.get(row.account_id)
                  return (
                    <tr key={row.account_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="py-2">
                        <div className="text-white/85">@{row.username}</div>
                        <div className="text-xs text-[#a3a3a3]">{clientName.get(row.client_id)} · {PLATFORM_LABEL[row.platform] ?? row.platform}</div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{row.posts_published}</td>
                      <td className="py-2 text-right tabular-nums">{formatValue(row.metrics.views?.value)} <StatusTag status={row.metrics.views?.status} /></td>
                      <td className="py-2 text-right tabular-nums">{formatValue(row.metrics.reach?.value)} <StatusTag status={row.metrics.reach?.status} /></td>
                      <td className="py-2 text-right tabular-nums" title={`${row.engagement_rate_reach.eligible_posts} publicaciones elegibles, ${row.engagement_rate_reach.excluded_posts} excluidas`}>
                        {row.engagement_rate_reach.value === null ? <span className="text-[#a3a3a3]">no disponible</span> : formatValue(row.engagement_rate_reach.value, "ratio")}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {followers?.end ? formatValue(followers.end.value) : "—"}{" "}
                        {followers && <DeltaText delta={{ absolute: followers.change, percent: followers.percent_change, reason: followers.change !== null && followers.percent_change === null ? "denominador_cero" : null }} />}
                      </td>
                      <td className="py-2 pl-4">{cover ? <HealthIcon status={cover.health_status} reconnect={cover.needs_reconnection} /> : "—"}</td>
                      <td className="py-2 text-xs text-[#a3a3a3]">
                        Métricas {relativeAge(cover?.latest_post_metrics_at ?? row.data_as_of)}
                        {cover?.posts_without_metrics ? <span className="block text-amber-300">{cover.posts_without_metrics} sin métricas</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {[...data.warnings, ...data.current.content.totals.warnings].length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-amber-200/80">
            {[...data.warnings, ...data.current.content.totals.warnings].map((warning) => <li key={warning}>• {warning}</li>)}
          </ul>
        )}
      </Panel>
    </div>
  )
}
