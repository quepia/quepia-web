"use client"

import { useState } from "react"
import { formatValue, paramsQuery, useSocialData } from "../social-api"
import { ErrorState, LineChart, Loading, MetricTile, Panel, Select } from "../social-ui"
import type { TabProps } from "../social-module"

type Comparison = { current: number | null; previous: number | null; absolute_change: number | null; percent_change: number | null; percent_change_unavailable_reason: string | null; current_status?: string }
type CompareResult = { result: {
  comparison: Record<string, Comparison>
  interaction_decomposition: { total_change?: number; volume_effect?: number; rate_effect?: number; interactions_per_post_current?: number; interactions_per_post_previous?: number; eligible_posts_current?: number; eligible_posts_previous?: number; formula?: string; unavailable_reason?: string }
  previous_period: { from: string; to: string }
  warnings: string[]
} }
type SeriesResult = { result: { metric: string; series: { total: Array<{ bucket: string; value: number | null; posts?: number; accounts_reporting?: number; complete?: boolean; observations_without_previous_day?: number }>; semantics: string } } }
type OverviewResult = { result: { account_insights: { rows: Array<{ account_id: string; metric: string; value: number | null; unavailable_reason: string | null; period_start: string; period_end: string }>; note: string } } }

const METRICS = [
  { key: "views", label: "Views" },
  { key: "reach", label: "Suma de alcances", hint: "Suma de alcances por publicación: no son personas únicas." },
  { key: "likes", label: "Me gusta" },
  { key: "comments", label: "Comentarios" },
  { key: "shares", label: "Compartidos" },
  { key: "saves", label: "Guardados" },
]

const delta = (item?: Comparison) => item ? { absolute: item.absolute_change, percent: item.percent_change, reason: item.percent_change_unavailable_reason } : null

export function AnalyticsTab({ scope }: TabProps) {
  const [metric, setMetric] = useState("followers")
  const [attribution, setAttribution] = useState("publish")
  const [granularity, setGranularity] = useState("day")
  const compare = useSocialData<CompareResult>(`/api/admin/social/analytics?op=compare_periods&${paramsQuery(scope)}`)
  const series = useSocialData<SeriesResult>(`/api/admin/social/analytics?op=timeseries&${paramsQuery({ ...scope, metric, attribution, granularity })}`)
  const overview = useSocialData<OverviewResult>(`/api/admin/social/overview?${paramsQuery(scope)}`)

  if (compare.loading && !compare.data) return <Loading />
  if (compare.error) return <ErrorState error={compare.error} onRetry={compare.reload} />
  const data = compare.data?.result
  const decomposition = data?.interaction_decomposition

  return (
    <div className="space-y-4">
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {METRICS.map((item) => (
              <MetricTile key={item.key} label={item.label} hint={item.hint} value={data.comparison[item.key]?.current}
                status={data.comparison[item.key]?.current_status} delta={delta(data.comparison[item.key])} />
            ))}
            <MetricTile label="Engagement / alcance" unit="ratio" value={data.comparison.engagement_rate_reach?.current}
              hint="Suma de interacciones / suma de alcances de publicaciones con los cinco componentes soportados." delta={delta(data.comparison.engagement_rate_reach)} />
            <MetricTile label="Seguidores (Δ acumulado)" value={data.comparison.followers_change?.current}
              hint="Suma de cambios de cada cuenta; no es audiencia deduplicada." delta={delta(data.comparison.followers_change)} />
          </div>
          <Panel title="¿Más publicaciones o mejor rendimiento por publicación?" description={`Frente a ${data.previous_period.from} → ${data.previous_period.to}`}>
            {decomposition?.unavailable_reason ? <p className="text-sm text-[#a3a3a3]">{decomposition.unavailable_reason}</p> : decomposition && (
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div><div className="text-xs text-[#a3a3a3]">Cambio total de interacciones</div><div className="text-lg tabular-nums">{formatValue(decomposition.total_change)}</div></div>
                <div><div className="text-xs text-[#a3a3a3]">Efecto volumen ({decomposition.eligible_posts_previous} → {decomposition.eligible_posts_current} publicaciones)</div><div className="text-lg tabular-nums">{formatValue(decomposition.volume_effect)}</div></div>
                <div><div className="text-xs text-[#a3a3a3]">Efecto rendimiento ({formatValue(decomposition.interactions_per_post_previous)} → {formatValue(decomposition.interactions_per_post_current)} por publicación)</div><div className="text-lg tabular-nums">{formatValue(decomposition.rate_effect)}</div></div>
                <p className="text-xs text-[#a3a3a3] md:col-span-3">{decomposition.formula}. Es una descomposición contable, no prueba causalidad.</p>
              </div>
            )}
            {data.warnings.length > 0 && <ul className="mt-3 space-y-1 text-xs text-amber-200/80">{data.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>}
          </Panel>
        </>
      )}
      <Panel title="Evolución" actions={
        <div className="flex flex-wrap gap-2">
          <Select label="Métrica" value={metric} onChange={setMetric} options={[
            { value: "followers", label: "Seguidores" }, { value: "posts_published", label: "Publicaciones" },
            ...METRICS.map((item) => ({ value: item.key, label: item.label })),
          ]} />
          {!["followers", "posts_published"].includes(metric) && (
            <Select label="Atribución" value={attribution} onChange={setAttribution} options={[
              { value: "publish", label: "Por fecha de publicación" }, { value: "received", label: "Por día en que se recibió" },
            ]} />
          )}
          <Select label="Agrupar" value={granularity} onChange={setGranularity} options={[
            { value: "day", label: "Día" }, { value: "week", label: "Semana" }, { value: "month", label: "Mes" },
          ]} />
        </div>
      }>
        {series.loading && !series.data ? <Loading /> : <ErrorState error={series.error} />}
        {series.data && (
          <>
            <LineChart title={metric === "followers" ? "Seguidores acumulados de las cuentas del alcance" : `Total por ${granularity === "day" ? "día" : granularity === "week" ? "semana" : "mes"}`}
              points={series.data.result.series.total.map((point) => ({
                label: point.bucket,
                value: point.value === null ? null : Number(point.value),
                note: point.complete === false ? `Sin dato de todas las cuentas (${point.accounts_reporting} reportaron): no se suma parcialmente` : point.observations_without_previous_day ? `${point.observations_without_previous_day} observación(es) sin día previo` : undefined,
              }))} />
            <p className="mt-2 text-xs text-[#a3a3a3]">{series.data.result.series.semantics}</p>
          </>
        )}
      </Panel>
      <Panel title="Insights de cuenta (Instagram)" description={overview.data?.result.account_insights.note}>
        {overview.data && overview.data.result.account_insights.rows.length === 0 && <p className="text-sm text-[#a3a3a3]">Sin ventanas de insights contenidas en el período (se sincronizan ventanas de 7 y 30 días completos).</p>}
        <div className="grid gap-2 md:grid-cols-4">
          {overview.data?.result.account_insights.rows.map((row) => (
            <MetricTile key={`${row.account_id}-${row.metric}-${row.period_start}`}
              label={`${row.metric.replace("ig_account_", "").replace(/_/g, " ")} · ${row.period_start} → ${row.period_end}`}
              value={row.value} status={row.value === null ? "no_data" : null} hint={row.unavailable_reason ?? undefined} />
          ))}
        </div>
      </Panel>
    </div>
  )
}
