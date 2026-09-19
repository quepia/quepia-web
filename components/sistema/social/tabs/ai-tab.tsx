"use client"

import { useRef, useState } from "react"
import { Bot, Check, FlaskConical, Lightbulb, ListChecks, OctagonAlert, Square, X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { formatDateTime, socialFetch, useSocialData, SocialApiError } from "../social-api"
import { Button, ErrorState, Loading, Panel } from "../social-ui"
import type { TabProps } from "../social-module"

type Item = { statement: string; evidence_refs: number[]; rationale?: string; evaluation_metric?: string; success_criterion?: string }
type Report = { summary: string; data_sufficiency: string; findings: Item[]; interpretations: Item[]; limitations: Item[]; recommendations: Item[]; next_experiments: Item[]; removed_findings?: number }
type Stored = {
  run: { id: string; question: string; status: string; scope: Record<string, unknown>; model: string | null; prompt_version: string | null; input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null; started_at: string; actor_name: string; result: Report | null; error: string | null }
  evidence: Array<{ seq: number; op: string; params: Record<string, unknown>; query_hash: string; result: unknown; evidence: Record<string, unknown> }>
  insights: Array<{ id: string; kind: string; statement: string; review_status: string }>
}
type HistoryRow = { id: string; question: string; status: string; started_at: string; actor_name: string; period: { from: string; to: string } }

const SUGGESTED = [
  "¿Qué cambió en este período frente al anterior y qué contenido explica la variación?",
  "¿Qué formatos rinden mejor comparando publicaciones a igual edad (7 días)?",
  "¿Subió la interacción por publicar más o mejoró el rendimiento por publicación?",
  "¿Qué cuentas requieren atención y qué datos faltan para sacar conclusiones?",
  "¿Qué hipótesis conviene probar en el próximo calendario de contenido?",
]

const OP_LABEL: Record<string, string> = {
  coverage: "Cobertura y frescura", compare_periods: "Comparación de períodos", rank_posts: "Ranking", overview: "Resumen",
  timeseries: "Serie temporal", compare_formats: "Formatos", post_performance: "Publicación", attention: "Atención (agregado)", definitions: "Definiciones",
}

export function AiTab({ scope, scopes }: TabProps) {
  const [question, setQuestion] = useState("")
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<SocialApiError | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const history = useSocialData<HistoryRow[]>(`/api/admin/social/analyses${scope.client_ids?.length ? `?client_id=${scope.client_ids[0]}` : ""}`)

  const clientLabel = scope.client_ids?.length ? scopes.clients.find((client) => client.id === scope.client_ids![0])?.name : "Toda la agencia"
  const accountLabel = scope.account_ids?.length ? scopes.accounts.find((account) => account.id === scope.account_ids![0])?.username : null
  const projectLabel = scope.project_ids?.length ? scopes.projects.find((project) => project.id === scope.project_ids![0])?.name : null

  const run = async () => {
    controller.current = new AbortController()
    setRunning(true)
    setError(null)
    try {
      const result = await socialFetch<{ runId: string; status: string; error?: string }>("/api/admin/social/analyses", {
        method: "POST", json: { question, scope }, signal: controller.current.signal,
      })
      if (result.status !== "completed") setError(new SocialApiError(0, result.status, result.error ?? "El análisis no se completó"))
      setOpenRun(result.runId)
      history.reload()
    } catch (failure) {
      if ((failure as Error).name === "AbortError") setError(new SocialApiError(0, "cancelled", "Análisis cancelado"))
      else setError(failure as SocialApiError)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Panel title="Preguntar sobre las métricas" description="La IA solo consulta la capa de métricas de Quepia (solo lectura). No recibe mensajes directos, notas internas ni credenciales, y no puede publicar, responder ni activar reglas.">
          <p className="mb-2 text-xs text-[#a3a3a3]">
            Alcance: <strong className="text-white/75">{clientLabel}</strong>{projectLabel ? ` · proyecto ${projectLabel}` : ""}{accountLabel ? ` · @${accountLabel}` : ""}{scope.platforms?.length ? ` · ${scope.platforms.join(", ")}` : ""} · {scope.from} → {scope.to} · America/Argentina/Cordoba
          </p>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} maxLength={2000} placeholder="¿Qué querés entender?"
            className="w-full rounded-md border border-white/10 bg-[#141414] p-2 text-sm text-white/85 outline-none focus:border-white/25" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED.map((text) => (
              <button key={text} onClick={() => setQuestion(text)} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-[#a3a3a3] hover:bg-white/[0.05]">{text}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" disabled={running || question.trim().length < 3} onClick={run}><Bot className="h-4 w-4" /> {running ? "Analizando…" : "Analizar"}</Button>
            {running && <Button variant="ghost" onClick={() => controller.current?.abort()}><Square className="h-3.5 w-3.5" /> Cancelar</Button>}
          </div>
          {running && <p className="mt-2 text-xs text-[#a3a3a3]">Consultando métricas, comparando y verificando cada cifra contra la evidencia…</p>}
          <ErrorState error={error} />
        </Panel>
        {openRun && <AnalysisReport key={openRun} runId={openRun} />}
      </div>
      <Panel title="Análisis anteriores">
        {history.loading && !history.data ? <Loading /> : <ErrorState error={history.error} />}
        <ul className="space-y-1">
          {history.data?.map((row) => (
            <li key={row.id}>
              <button onClick={() => setOpenRun(row.id)} className={cn("w-full rounded-md px-2 py-1.5 text-left hover:bg-white/[0.04]", openRun === row.id && "bg-white/[0.06]")}>
                <div className="line-clamp-2 text-sm text-white/80">{row.question}</div>
                <div className="text-[11px] text-[#a3a3a3]">{formatDateTime(row.started_at)} · {row.actor_name} · {row.status}</div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

function Section({ title, icon: Icon, items, kind, onRef }: { title: string; icon: typeof Bot; items: Item[]; kind: string; onRef: (seq: number) => void }) {
  if (!items.length) return null
  return (
    <div>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-white/85"><Icon className="h-4 w-4 text-[#a3a3a3]" /> {title}</h4>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className={cn("rounded-md border px-3 py-2 text-sm", kind === "finding" ? "border-white/10" : "border-white/[0.05] text-white/75")}>
            {item.statement}
            {item.rationale && <div className="mt-1 text-xs text-[#a3a3a3]">Por qué: {item.rationale}</div>}
            {item.evaluation_metric && <div className="text-xs text-[#a3a3a3]">Cómo evaluarlo: {item.evaluation_metric}</div>}
            {item.success_criterion && <div className="text-xs text-[#a3a3a3]">Criterio de éxito: {item.success_criterion}</div>}
            {item.evidence_refs.length > 0 && (
              <div className="mt-1 flex gap-1">{item.evidence_refs.map((ref) => (
                <button key={ref} onClick={() => onRef(ref)} className="rounded bg-white/[0.06] px-1.5 text-[11px] text-[#a3a3a3] hover:bg-white/[0.12]">[{ref}]</button>
              ))}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AnalysisReport({ runId }: { runId: string }) {
  const stored = useSocialData<Stored>(`/api/admin/social/analyses/${runId}`)
  const [evidenceOpen, setEvidenceOpen] = useState<number | null>(null)
  if (stored.loading && !stored.data) return <Loading label="Cargando análisis" />
  if (!stored.data) return <ErrorState error={stored.error} />
  const { run, evidence, insights } = stored.data
  const report = run.result
  const review = async (id: string, status: string) => {
    await socialFetch(`/api/admin/social/insights/${id}`, { method: "PATCH", json: { status } })
    stored.reload()
  }
  return (
    <Panel title={run.question} description={`${formatDateTime(run.started_at)} · ${run.actor_name} · modelo ${run.model ?? "—"} · ${run.prompt_version ?? ""} · tokens ${run.input_tokens ?? "—"}/${run.output_tokens ?? "—"}${run.estimated_cost_usd !== null ? ` · USD ${run.estimated_cost_usd}` : " · costo no configurado"}`}>
      {run.error && <p className="mb-2 text-sm text-red-300">{run.error}</p>}
      {report && (
        <div className="space-y-4">
          <div className="rounded-md bg-white/[0.03] p-3 text-sm text-white/80">
            {report.summary}
            <div className={cn("mt-1 text-xs", report.data_sufficiency === "suficiente" ? "text-[#a3a3a3]" : "text-amber-300")}>
              Evidencia {report.data_sufficiency}{report.removed_findings ? ` · ${report.removed_findings} hallazgo(s) retirado(s) por cifras no rastreables` : ""}
            </div>
          </div>
          <Section title="Hallazgos (hechos verificables)" icon={ListChecks} items={report.findings} kind="finding" onRef={setEvidenceOpen} />
          <Section title="Interpretaciones posibles (hipótesis)" icon={Lightbulb} items={report.interpretations} kind="interpretation" onRef={setEvidenceOpen} />
          <Section title="Limitaciones" icon={OctagonAlert} items={report.limitations} kind="limitation" onRef={setEvidenceOpen} />
          <Section title="Recomendaciones" icon={Check} items={report.recommendations} kind="recommendation" onRef={setEvidenceOpen} />
          <Section title="Próximo experimento" icon={FlaskConical} items={report.next_experiments} kind="experiment" onRef={setEvidenceOpen} />
        </div>
      )}
      {insights.some((insight) => insight.kind === "recommendation" || insight.kind === "experiment") && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-[#a3a3a3]">Seguimiento de recomendaciones</div>
          <ul className="space-y-1 text-xs">
            {insights.filter((insight) => insight.kind === "recommendation" || insight.kind === "experiment").map((insight) => (
              <li key={insight.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[#a3a3a3]">{insight.statement}</span>
                <span className="flex shrink-0 gap-1">
                  {["accepted", "rejected", "done"].map((status) => (
                    <button key={status} onClick={() => review(insight.id, status)}
                      className={cn("rounded px-1.5 py-0.5", insight.review_status === status ? "bg-white/15 text-white" : "text-[#a3a3a3] hover:bg-white/[0.06]")}>
                      {status === "accepted" ? "Aceptar" : status === "rejected" ? "Descartar" : "Hecho"}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-4" open={evidenceOpen !== null}>
        <summary className="cursor-pointer text-xs text-[#a3a3a3]">Evidencia ({evidence.length} consultas deterministas)</summary>
        <ul className="mt-2 space-y-2">
          {evidence.map((item) => (
            <li key={item.seq} className={cn("rounded-md border p-2 text-xs", evidenceOpen === item.seq ? "border-white/30" : "border-white/[0.06]")}>
              <div className="flex items-center justify-between">
                <span className="text-white/70">[{item.seq}] {OP_LABEL[item.op] ?? item.op}</span>
                <span className="text-[#a3a3a3]">hash {item.query_hash?.slice(0, 10)} · datos al {formatDateTime(item.evidence?.data_as_of as string)}</span>
              </div>
              {evidenceOpen === item.seq && (
                <>
                  <button onClick={() => setEvidenceOpen(null)} className="float-right text-[#a3a3a3]"><X className="h-3 w-3" /></button>
                  <pre className="mt-1 max-h-72 overflow-auto rounded bg-black/40 p-2 text-[11px] text-[#a3a3a3]">{JSON.stringify({ params: item.params, result: item.result }, null, 2)}</pre>
                </>
              )}
              {evidenceOpen !== item.seq && <button onClick={() => setEvidenceOpen(item.seq)} className="text-[#a3a3a3] underline">Ver datos</button>}
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  )
}
