"use client"

import { useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileSearch,
  Globe2,
  Lightbulb,
  Link2,
  ListChecks,
  Loader2,
  Megaphone,
  MessageSquareQuote,
  PackageSearch,
  PanelsTopLeft,
  Plus,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm-provider"
import { useToast } from "@/components/ui/toast-provider"
import { useProjectIntelligence } from "@/lib/sistema/hooks/useProjectIntelligence"
import { useClientBrief } from "@/lib/sistema/hooks/useClientBrief"
import { cn } from "@/lib/sistema/utils"
import {
  COMPETITOR_CATEGORY_LABELS,
  OPPORTUNITY_LEVEL_LABELS,
  type CompetitorAnalysisCompetitor,
  type CompetitorCategory,
  type OpportunityLevel,
  type ProjectCompetitor,
  type StrategyDocumentType,
  type StrategyNarrativeContent,
  type StrategyOpportunity,
  STRATEGY_DOCUMENT_LABELS,
} from "@/types/sistema"
import { ProjectWorkspaceHeader, type ProjectWorkspaceSection } from "@/components/sistema/quepia/project-workspace-header"

type IntelligenceTab = "overview" | "comparison" | "sources"

interface ProjectIntelligenceViewProps {
  projectId: string
  projectName: string
  activeWorkspaceSection: ProjectWorkspaceSection
  onWorkspaceSectionChange: (section: ProjectWorkspaceSection) => void
  onTaskCreated?: () => void
}

const CATEGORY_OPTIONS: CompetitorCategory[] = ["direct", "indirect", "local", "aspirational"]

const STRATEGY_DOCUMENTS: Array<{
  type: StrategyDocumentType
  description: string
  icon: typeof Radar
}> = [
  { type: "product_information", description: "Oferta, audiencias y valor", icon: PackageSearch },
  { type: "marketing_strategy", description: "Posición, canales y objetivos", icon: Megaphone },
  { type: "competitor_analysis", description: "Mercado, brechas y oportunidades", icon: Radar },
  { type: "brand_voice", description: "Personalidad, tono y lenguaje", icon: MessageSquareQuote },
  { type: "content_strategy", description: "Pilares, formatos y distribución", icon: PanelsTopLeft },
]

const LEVEL_STYLES: Record<OpportunityLevel, string> = {
  high: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
  medium: "border-amber-400/20 bg-amber-400/[0.08] text-amber-300",
  low: "border-white/10 bg-white/[0.04] text-white/55",
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin generar"
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function LevelBadge({ label, level }: { label: string; level: OpportunityLevel }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", LEVEL_STYLES[level])}>
      {label}: {OPPORTUNITY_LEVEL_LABELS[level]}
    </span>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const percentage = Math.round(value)
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/40" title="Confianza según la evidencia encontrada">
      <ShieldCheck className="h-3 w-3" />
      {percentage}% confianza
    </span>
  )
}

function EmptyAnalysis({ hasCompetitors, onAdd, onGenerate, generating }: {
  hasCompetitors: boolean
  onAdd: () => void
  onGenerate: () => void
  generating: boolean
}) {
  return (
    <section className="flex min-h-[430px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-5 text-center">
      <div className="max-w-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(42,231,228,0.18)] bg-[rgba(42,231,228,0.07)]">
          <Radar className="h-6 w-6 text-[#41efec]" />
        </div>
        <p className="mt-5 text-lg font-semibold text-white">Tu mapa competitivo empieza acá</p>
        <p className="mt-2 text-sm leading-6 text-white/45">
          {hasCompetitors
            ? "Ya hay competidores cargados. Generá un análisis respaldado por fuentes para detectar brechas, riesgos y próximas acciones."
            : "La IA puede descubrir las marcas que compiten por la misma audiencia o podés indicar competidores conocidos para orientar la búsqueda."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#41efec] px-4 text-xs font-semibold text-black transition-colors hover:bg-[#6ff4f1] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Investigando…" : hasCompetitors ? "Generar estrategia" : "Descubrir y generar"}
          </button>
          {!hasCompetitors ? (
            <button type="button" onClick={onAdd} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-medium text-white/60 hover:bg-white/[0.05] hover:text-white">
              <Plus className="h-4 w-4" /> Indicar competidor
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function CompetitorManager({
  competitors,
  onAdd,
  onRemove,
}: {
  competitors: ProjectCompetitor[]
  onAdd: () => void
  onRemove: (competitor: ProjectCompetitor) => void
}) {
  return (
    <aside className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-4 lg:sticky lg:top-0 lg:self-start">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Competidores</p>
          <p className="mt-0.5 text-[11px] text-white/35">Marcas incluidas en la investigación</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
          aria-label="Agregar competidor"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {competitors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-white/35">
            Todavía no agregaste competidores.
          </div>
        ) : competitors.map((competitor) => (
          <div key={competitor.id} className="group rounded-xl border border-white/[0.06] bg-black/20 p-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/45">
                <Globe2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white/85">{competitor.name}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#41efec]/65">
                  {COMPETITOR_CATEGORY_LABELS[competitor.category]}
                </p>
                {competitor.website_url ? (
                  <a
                    href={competitor.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex max-w-full items-center gap-1 text-[11px] text-white/35 hover:text-white/65"
                  >
                    <span className="truncate">{getDomain(competitor.website_url)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onRemove(competitor)}
                className="rounded-md p-1.5 text-white/20 opacity-100 transition-colors hover:bg-red-400/10 hover:text-red-300 lg:opacity-0 lg:group-hover:opacity-100"
                aria-label={`Quitar ${competitor.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function OpportunityCard({
  opportunity,
  onCreateTask,
  onDismiss,
  onOpenProduction,
}: {
  opportunity: StrategyOpportunity
  onCreateTask: (opportunity: StrategyOpportunity) => void
  onDismiss: (opportunity: StrategyOpportunity) => void
  onOpenProduction: () => void
}) {
  const isDismissed = opportunity.status === "dismissed"
  const hasTask = Boolean(opportunity.linked_task_id)

  return (
    <article className={cn(
      "rounded-2xl border p-4 transition-colors",
      isDismissed ? "border-white/[0.04] bg-white/[0.01] opacity-55" : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.11]",
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelBadge label="Impacto" level={opportunity.impact} />
            <LevelBadge label="Esfuerzo" level={opportunity.effort} />
          </div>
          <h3 className="mt-3 text-sm font-semibold leading-5 text-white/90">{opportunity.title}</h3>
          <p className="mt-1.5 text-xs leading-5 text-white/45">{opportunity.description}</p>
        </div>
        <ConfidenceBadge value={opportunity.confidence} />
      </div>

      {!isDismissed ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
          <button
            type="button"
            onClick={hasTask ? onOpenProduction : () => onCreateTask(opportunity)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition-colors",
              hasTask
                ? "border border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300 hover:bg-emerald-400/[0.12]"
                : "bg-white text-black hover:bg-white/85",
            )}
          >
            {hasTask ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
            {hasTask ? "Ver tarea en Producción" : "Convertir en tarea"}
          </button>
          {!hasTask ? (
            <button
              type="button"
              onClick={() => onDismiss(opportunity)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/65"
            >
              <X className="h-3.5 w-3.5" />
              Descartar
            </button>
          ) : null}
          {opportunity.evidence.length > 0 ? (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-white/30">
              <Link2 className="h-3 w-3" />
              {opportunity.evidence.length} fuente{opportunity.evidence.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function CompetitorDeepDive({ competitor }: { competitor: CompetitorAnalysisCompetitor }) {
  return (
    <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] open:bg-white/[0.03]">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-xs font-bold text-white/55">
          {competitor.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white/90">{competitor.name}</p>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/35">
              {COMPETITOR_CATEGORY_LABELS[competitor.category]}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-white/35">{competitor.positioning}</p>
        </div>
        <span className="text-[10px] text-white/30 group-open:hidden">Ver detalle</span>
        <span className="hidden text-[10px] text-white/30 group-open:inline">Ocultar</span>
      </summary>

      <div className="grid gap-5 border-t border-white/[0.06] p-4 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Posicionamiento</p>
            <p className="mt-1.5 text-xs leading-5 text-white/60">{competitor.positioning}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Oferta y audiencia</p>
            <p className="mt-1.5 text-xs leading-5 text-white/60">{competitor.offer}</p>
            <p className="mt-1 text-xs leading-5 text-white/40">Audiencia: {competitor.targetAudience}</p>
            <p className="mt-1 text-xs leading-5 text-white/40">Precio: {competitor.pricing}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Canales observados</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {competitor.channels.map((channel) => (
                <span key={channel} className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-white/50">{channel}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
          <InsightList title="Fortalezas" items={competitor.strengths} tone="positive" />
          <InsightList title="Debilidades" items={competitor.weaknesses} tone="risk" />
          <InsightList title="Diferenciales" items={competitor.differentiators} />
          <InsightList title="Patrones de contenido" items={competitor.contentPatterns} />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] pt-3 md:col-span-2">
          <ConfidenceBadge value={competitor.confidence} />
          {competitor.website ? (
            <a href={competitor.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[#41efec]/70 hover:text-[#41efec]">
              {getDomain(competitor.website)} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          <span className="ml-auto text-[10px] text-white/25">{competitor.evidenceUrls.length} fuentes vinculadas</span>
        </div>
      </div>
    </details>
  )
}

function InsightList({ title, items, tone = "neutral" }: {
  title: string
  items: string[]
  tone?: "neutral" | "positive" | "risk"
}) {
  const iconClass = tone === "positive" ? "text-emerald-300" : tone === "risk" ? "text-amber-300" : "text-[#41efec]/70"
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[11px] leading-4 text-white/50">
            <Check className={cn("mt-0.5 h-3 w-3 shrink-0", iconClass)} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NarrativeDocumentView({
  content,
  documentType,
  projectName,
}: {
  content: StrategyNarrativeContent
  documentType: StrategyDocumentType
  projectName: string
}) {
  return (
    <main className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[radial-gradient(circle_at_top_right,rgba(42,231,228,0.08),transparent_45%),rgba(255,255,255,0.018)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#41efec]/70">
            <Sparkles className="h-3.5 w-3.5" />
            {STRATEGY_DOCUMENT_LABELS[documentType]}
          </div>
          <ConfidenceBadge value={content.confidence} />
        </div>
        <p className="mt-3 text-base leading-7 text-white/78">{content.executiveSummary}</p>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        {content.sections.map((section, index) => (
          <section key={`${section.title}-${index}`} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#41efec]/[0.08] text-[10px] font-bold text-[#41efec]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white/90">{section.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-white/45">{section.summary}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 border-t border-white/[0.05] pt-4">
              {section.points.map((point) => (
                <li key={point} className="flex gap-2 text-xs leading-5 text-white/55">
                  <Check className="mt-1 h-3 w-3 shrink-0 text-[#41efec]/70" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            {section.evidenceUrls.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {section.evidenceUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-white/[0.06] px-2 py-1 text-[9px] text-white/30 hover:border-[#41efec]/20 hover:text-[#41efec]/75"
                  >
                    <span className="truncate">{getDomain(url)}</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ArrowRight className="h-4 w-4 text-[#41efec]" /> Próximas acciones para {projectName}
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {content.nextActions.map((action, index) => (
            <li key={action} className="flex gap-3 rounded-xl border border-white/[0.05] bg-black/15 p-3 text-xs leading-5 text-white/55">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#41efec]/10 text-[10px] font-bold text-[#41efec]">{index + 1}</span>
              {action}
            </li>
          ))}
        </ol>
      </section>

      {content.limitations.length > 0 ? (
        <section className="rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/55">Límites y datos pendientes</p>
          <ul className="mt-2 space-y-1.5">
            {content.limitations.map((limitation) => <li key={limitation} className="text-[11px] leading-5 text-white/40">• {limitation}</li>)}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

function AddCompetitorDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { name: string; website: string; category: CompetitorCategory; notes: string }) => Promise<boolean>
}) {
  const [name, setName] = useState("")
  const [website, setWebsite] = useState("")
  const [category, setCategory] = useState<CompetitorCategory>("direct")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    const saved = await onSubmit({ name, website, category, notes })
    setSaving(false)
    if (!saved) return
    setName("")
    setWebsite("")
    setCategory("direct")
    setNotes("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.08] bg-[#111318] sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Agregar competidor</DialogTitle>
            <p className="text-xs leading-5 text-white/40">La web ayuda a que la investigación identifique la marca correcta.</p>
          </DialogHeader>

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-white/65">Nombre *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Estudio Norte"
                autoFocus
                className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-[#41efec]/45"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-white/65">Sitio web</span>
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="competidor.com"
                inputMode="url"
                className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-[#41efec]/45"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-white/65">Tipo de competidor</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as CompetitorCategory)}
                className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#0b0d11] px-3 text-sm text-white outline-none focus:border-[#41efec]/45"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{COMPETITOR_CATEGORY_LABELS[option]}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-white/65">Contexto opcional</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Qué querés observar o por qué compite con el cliente…"
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-[#41efec]/45"
              />
            </label>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg px-3 text-xs text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#41efec] px-4 text-xs font-semibold text-black transition-colors hover:bg-[#6ff4f1] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Agregar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectIntelligenceView({
  projectId,
  projectName,
  activeWorkspaceSection,
  onWorkspaceSectionChange,
  onTaskCreated,
}: ProjectIntelligenceViewProps) {
  const [activeTab, setActiveTab] = useState<IntelligenceTab>("overview")
  const [activeDocumentType, setActiveDocumentType] = useState<StrategyDocumentType>("competitor_analysis")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { brief, loading: briefLoading } = useClientBrief(projectId)
  const {
    competitors,
    documents,
    activeDocuments,
    document: competitorDocument,
    sources,
    opportunities,
    latestRun,
    loading,
    generating,
    error,
    setupRequired,
    addCompetitor,
    removeCompetitor,
    generateAnalysis,
    updateDocumentStatus,
    createTaskFromOpportunity,
    dismissOpportunity,
  } = useProjectIntelligence(projectId)

  const visibleOpportunities = useMemo(
    () => opportunities.filter((opportunity) => opportunity.status !== "dismissed"),
    [opportunities],
  )
  const openOpportunities = useMemo(
    () => visibleOpportunities.filter((opportunity) => !opportunity.linked_task_id),
    [visibleOpportunities],
  )
  const selectedDocument = documents.find((strategyDocument) => strategyDocument.document_type === activeDocumentType) || null
  const selectedActiveDocument = activeDocuments.find((strategyDocument) => strategyDocument.document_type === activeDocumentType) || null
  const selectedDocumentIsActiveInAI = selectedDocument?.id === selectedActiveDocument?.id
  const competitorContent = competitorDocument?.content
  const narrativeContent = activeDocumentType !== "competitor_analysis"
    ? selectedDocument?.content as StrategyNarrativeContent | undefined
    : undefined
  const selectedLimitations = activeDocumentType === "competitor_analysis"
    ? competitorContent?.limitations || []
    : narrativeContent?.limitations || []
  const briefCoverage = brief ? [
    brief.value_proposition,
    brief.objectives,
    brief.target_audience,
    brief.brand_personality,
    brief.tone_of_voice,
    brief.key_messages,
    brief.visual_style_keywords,
    brief.avoid_elements,
  ].filter((value) => Array.isArray(value) ? value.length > 0 : Boolean(value)).length : 0

  const handleGenerate = async () => {
    const generated = await generateAnalysis()
    if (generated) {
      setActiveTab("overview")
      toast({ title: "Paquete estratégico generado", description: "La IA creó cinco documentos con fuentes para revisión humana.", variant: "success" })
    }
  }

  const handleRemoveCompetitor = async (competitor: ProjectCompetitor) => {
    const accepted = await confirm({
      title: `Quitar a ${competitor.name}`,
      description: "Dejará de incluirse en los próximos análisis. Los informes anteriores no cambian.",
      confirmText: "Quitar",
      cancelText: "Cancelar",
      tone: "danger",
    })
    if (!accepted) return
    const removed = await removeCompetitor(competitor.id)
    if (removed) toast({ title: "Competidor quitado", variant: "success" })
  }

  const handleCreateTask = async (opportunity: StrategyOpportunity) => {
    const taskId = await createTaskFromOpportunity(opportunity)
    if (!taskId) return
    onTaskCreated?.()
    toast({ title: "Oportunidad convertida en tarea", description: "La vas a encontrar en la primera columna de Producción.", variant: "success" })
  }

  const handleDismiss = async (opportunity: StrategyOpportunity) => {
    const accepted = await confirm({
      title: "Descartar oportunidad",
      description: `“${opportunity.title}” dejará de mostrarse entre las acciones recomendadas.`,
      confirmText: "Descartar",
      cancelText: "Cancelar",
      tone: "danger",
    })
    if (!accepted) return
    await dismissOpportunity(opportunity.id)
  }

  const handleReview = async () => {
    if (!selectedDocument) return
    const reviewed = await updateDocumentStatus(selectedDocument.id, "reviewed")
    if (reviewed) {
      toast({
        title: "Documento activo en la IA",
        description: "Desde ahora orienta el Copiloto, el Estudio Creativo y los calendarios de este cliente.",
        variant: "success",
      })
    }
  }

  const tabs: Array<{ id: IntelligenceTab; label: string; count?: number }> = activeDocumentType === "competitor_analysis"
    ? [
      { id: "overview", label: "Resumen", count: visibleOpportunities.length },
      { id: "comparison", label: "Comparativa", count: competitorContent?.comparisonDimensions.length },
      { id: "sources", label: "Fuentes", count: sources.length },
    ]
    : [
      { id: "overview", label: "Documento" },
      { id: "sources", label: "Fuentes", count: sources.length },
    ]

  const handleDocumentChange = (documentType: StrategyDocumentType) => {
    setActiveDocumentType(documentType)
    setActiveTab("overview")
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
      <ProjectWorkspaceHeader
        projectName={projectName}
        activeSection={activeWorkspaceSection}
        onSectionChange={onWorkspaceSectionChange}
        actions={(
          <>
            <button
              type="button"
              onClick={() => setAddDialogOpen(true)}
              disabled={setupRequired}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Competidor
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || setupRequired}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#41efec] px-3 text-xs font-semibold text-black transition-colors hover:bg-[#6ff4f1] disabled:cursor-not-allowed disabled:opacity-45"
              title={competitors.length === 0 ? "Descubrir competidores y generar los documentos" : "Investigar y generar una nueva versión"}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : documents.length > 0 ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generating ? "Investigando…" : documents.length > 0 ? "Actualizar estrategia" : "Generar estrategia"}
            </button>
          </>
        )}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
          <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#41efec]/65">
                <Bot className="h-3.5 w-3.5" />
                Inteligencia competitiva
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Decisiones con evidencia, no intuición</h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-white/40">
                Investigá el mercado de {projectName}, detectá espacios de oportunidad y transformá hallazgos en trabajo concreto.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Metric label="Competidores" value={competitors.length} icon={Target} />
              <Metric label="Oportunidades" value={openOpportunities.length} icon={Lightbulb} accent />
              <Metric label="Fuentes" value={sources.length} icon={BookOpen} />
              <Metric label="Brief" value={briefLoading ? "…" : brief ? `${briefCoverage}/8` : "Sin brief"} icon={FileCheck2} accent={Boolean(brief)} />
              <Metric label="Versión" value={selectedDocument ? `v${selectedDocument.version}` : "—"} icon={FileSearch} />
            </div>
          </div>

          <div className={cn(
            "mb-4 flex items-start gap-3 rounded-xl border px-4 py-3",
            brief
              ? "border-[#41efec]/15 bg-[#41efec]/[0.035]"
              : "border-amber-400/15 bg-amber-400/[0.035]",
          )}>
            {brief ? <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#41efec]" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
            <div>
              <p className="text-xs font-semibold text-white/70">
                {briefLoading ? "Comprobando brief de marca…" : brief ? "Brief de marca conectado" : "Este proyecto no tiene brief de marca"}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-white/35">
                {brief
                  ? `La IA usa este brief como fuente de verdad (${briefCoverage} de 8 áreas estratégicas cubiertas) y lo cruza con la investigación pública.`
                  : "La IA puede investigar el mercado, pero marcará como limitación todo lo que dependa de objetivos, público, tono o reglas de marca no definidos."}
              </p>
            </div>
          </div>

          {error ? (
            <div className={cn(
              "mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs",
              setupRequired ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-200" : "border-red-400/20 bg-red-400/[0.07] text-red-200",
            )} role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">{setupRequired ? "Configuración pendiente" : "No se pudo completar la acción"}</p>
                <p className="mt-1 opacity-75">{error}</p>
              </div>
            </div>
          ) : null}

          {latestRun?.status === "failed" && latestRun.error ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-xs text-amber-100/80">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">El último intento no terminó</p>
                <p className="mt-1 opacity-70">{latestRun.error}</p>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[430px] items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.01]">
              <div className="text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#41efec]" />
                <p className="mt-3 text-xs text-white/35">Cargando inteligencia del proyecto…</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="tablist" aria-label="Documentos estratégicos">
                {STRATEGY_DOCUMENTS.map((item) => {
                  const Icon = item.icon
                  const strategyDocument = documents.find((candidate) => candidate.document_type === item.type)
                  const activeStrategyDocument = activeDocuments.find((candidate) => candidate.document_type === item.type)
                  const isActive = activeDocumentType === item.type
                  const isActiveInAI = strategyDocument?.id === activeStrategyDocument?.id
                  return (
                    <button
                      key={item.type}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="strategy-document-panel"
                      onClick={() => handleDocumentChange(item.type)}
                      className={cn(
                        "group flex min-h-[86px] cursor-pointer items-start gap-3 rounded-xl border p-3 text-left outline-none transition-all focus-visible:border-[#41efec]/50 focus-visible:ring-2 focus-visible:ring-[#41efec]/15",
                        isActive
                          ? "border-[#41efec]/35 bg-[#41efec]/[0.075] shadow-[inset_0_0_0_1px_rgba(65,239,236,0.04)]"
                          : "border-white/[0.08] bg-white/[0.022] hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.045]",
                      )}
                    >
                      <span className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        isActive ? "bg-[#41efec]/10 text-[#41efec]" : "bg-white/[0.04] text-white/35 group-hover:text-white/60",
                      )}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[11px] font-semibold leading-4", isActive ? "text-white" : "text-white/60")}>{STRATEGY_DOCUMENT_LABELS[item.type]}</span>
                        <span className="mt-1 block text-[9px] leading-3.5 text-white/25">{item.description}</span>
                        <span className={cn(
                          "mt-2 inline-flex items-center gap-1 text-[9px] font-semibold",
                          isActiveInAI ? "text-emerald-300/80" : strategyDocument ? "text-white/45" : "text-white/25",
                        )}>
                          {isActiveInAI ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                          {isActiveInAI
                            ? `Activa en IA · v${strategyDocument?.version}`
                            : strategyDocument && activeStrategyDocument
                              ? `Nueva v${strategyDocument.version} · IA usa v${activeStrategyDocument.version}`
                            : strategyDocument
                              ? `Disponible para revisar · v${strategyDocument.version}`
                              : "Pendiente de generar"}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Vistas del análisis">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
                        activeTab === tab.id ? "bg-white/[0.08] text-white" : "text-white/35 hover:text-white/65",
                      )}
                    >
                      {tab.label}
                      {typeof tab.count === "number" ? <span className="text-[10px] text-white/25">{tab.count}</span> : null}
                    </button>
                  ))}
                </div>
                {selectedDocument ? (
                  <div className="flex items-center gap-2 px-2 text-[10px] text-white/30">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-1 font-semibold",
                      selectedDocumentIsActiveInAI
                        ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
                        : "border-amber-400/20 bg-amber-400/[0.06] text-amber-300",
                    )} title={selectedDocumentIsActiveInAI ? "Este documento se usa como contexto en las herramientas de IA del cliente" : undefined}>
                      {selectedDocumentIsActiveInAI ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                      {selectedDocument.status === "published"
                        ? "Publicado · activo en IA"
                        : selectedDocument.status === "reviewed"
                          ? "Activo en IA"
                          : selectedDocument.status === "archived"
                            ? "Archivado"
                            : "Borrador IA"}
                    </span>
                    <span>Actualizado {formatDate(selectedDocument.generated_at || selectedDocument.updated_at)}</span>
                    {!selectedDocumentIsActiveInAI && selectedActiveDocument ? (
                      <span title="La versión aprobada anterior sigue orientando las herramientas de IA">
                        IA usa v{selectedActiveDocument.version}
                      </span>
                    ) : null}
                    {selectedDocument.status === "draft" ? (
                      <button type="button" onClick={handleReview} className="rounded-md px-2 py-1 text-white/50 hover:bg-white/[0.05] hover:text-white/80">
                        Revisar y activar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div id="strategy-document-panel" role="tabpanel" aria-label={STRATEGY_DOCUMENT_LABELS[activeDocumentType]}>
              {!selectedDocument ? (
                <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <CompetitorManager competitors={competitors} onAdd={() => setAddDialogOpen(true)} onRemove={handleRemoveCompetitor} />
                  <EmptyAnalysis hasCompetitors={competitors.length > 0} onAdd={() => setAddDialogOpen(true)} onGenerate={handleGenerate} generating={generating} />
                </div>
              ) : activeDocumentType !== "competitor_analysis" && narrativeContent && activeTab === "overview" ? (
                <NarrativeDocumentView content={narrativeContent} documentType={activeDocumentType} projectName={projectName} />
              ) : !competitorContent ? (
                <EmptyAnalysis hasCompetitors={competitors.length > 0} onAdd={() => setAddDialogOpen(true)} onGenerate={handleGenerate} generating={generating} />
              ) : activeTab === "overview" ? (
                <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <CompetitorManager competitors={competitors} onAdd={() => setAddDialogOpen(true)} onRemove={handleRemoveCompetitor} />
                  <main className="min-w-0 space-y-5">
                    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[radial-gradient(circle_at_top_right,rgba(42,231,228,0.08),transparent_45%),rgba(255,255,255,0.018)] p-5 sm:p-6">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#41efec]/70">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Resumen ejecutivo
                      </div>
                      <p className="mt-3 text-base leading-7 text-white/78">{competitorContent.executiveSummary}</p>
                      <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Posición en el mercado</p>
                        <p className="mt-2 text-xs leading-5 text-white/55">{competitorContent.marketPosition}</p>
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">Oportunidades priorizadas</p>
                          <p className="mt-1 text-xs text-white/35">Pasá los hallazgos accionables al tablero de producción.</p>
                        </div>
                        <span className="text-[10px] text-white/30">{openOpportunities.length} por evaluar</span>
                      </div>
                      <div className="grid gap-3 xl:grid-cols-2">
                        {visibleOpportunities.map((opportunity) => (
                          <OpportunityCard
                            key={opportunity.id}
                            opportunity={opportunity}
                            onCreateTask={handleCreateTask}
                            onDismiss={handleDismiss}
                            onOpenProduction={() => onWorkspaceSectionChange("production")}
                          />
                        ))}
                      </div>
                    </section>

                    <section className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.025] p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300/80">
                          <CheckCircle2 className="h-4 w-4" /> Fortalezas de {projectName}
                        </div>
                        <div className="mt-3"><InsightList title="Ventajas defendibles" items={competitorContent.clientStrengths} tone="positive" /></div>
                      </div>
                      <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.025] p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300/80">
                          <AlertCircle className="h-4 w-4" /> Riesgos a vigilar
                        </div>
                        <div className="mt-3"><InsightList title="Brechas competitivas" items={competitorContent.clientRisks} tone="risk" /></div>
                      </div>
                    </section>

                    <section>
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-white">Deep dives de competidores</p>
                        <p className="mt-1 text-xs text-white/35">Oferta, comunicación y patrones observados en cada marca.</p>
                      </div>
                      <div className="space-y-2">
                        {competitorContent.competitors.map((competitor) => <CompetitorDeepDive key={competitor.competitorId || competitor.name} competitor={competitor} />)}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white"><ArrowRight className="h-4 w-4 text-[#41efec]" /> Próximos movimientos</div>
                      <ol className="mt-4 grid gap-3 md:grid-cols-2">
                        {competitorContent.recommendedActions.map((action, index) => (
                          <li key={action} className="flex gap-3 rounded-xl border border-white/[0.05] bg-black/15 p-3 text-xs leading-5 text-white/55">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#41efec]/10 text-[10px] font-bold text-[#41efec]">{index + 1}</span>
                            {action}
                          </li>
                        ))}
                      </ol>
                    </section>
                  </main>
                </div>
              ) : activeTab === "comparison" ? (
                <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.015]">
                  <div className="border-b border-white/[0.06] p-5">
                    <p className="text-sm font-semibold text-white">Matriz competitiva</p>
                    <p className="mt-1 text-xs text-white/35">Comparación sintética de los atributos que influyen en la elección.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[860px] w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-white/[0.06] bg-black/20">
                          <th className="sticky left-0 z-10 w-48 bg-[#0d0e11] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">Dimensión</th>
                          <th className="min-w-52 border-l border-white/[0.05] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#41efec]/75">{projectName}</th>
                          {competitorContent.competitors.map((competitor) => (
                            <th key={competitor.competitorId || competitor.name} className="min-w-52 border-l border-white/[0.05] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{competitor.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {competitorContent.comparisonDimensions.map((dimension) => (
                          <tr key={dimension.label} className="border-b border-white/[0.05] last:border-0">
                            <th className="sticky left-0 z-10 bg-[#0b0c0f] px-4 py-4 align-top text-xs font-semibold text-white/65">{dimension.label}</th>
                            <td className="border-l border-white/[0.05] bg-[#41efec]/[0.015] px-4 py-4 align-top text-xs leading-5 text-white/60">{dimension.clientValue}</td>
                            {competitorContent.competitors.map((competitor) => {
                              const value = dimension.competitorValues.find((item) => item.competitorId === competitor.competitorId)?.value
                              return <td key={competitor.competitorId || competitor.name} className="border-l border-white/[0.05] px-4 py-4 align-top text-xs leading-5 text-white/45">{value || "Sin evidencia suficiente"}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5">
                  <div className="flex flex-col gap-2 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Fuentes de la investigación</p>
                      <p className="mt-1 text-xs text-white/35">Abrí la evidencia original para validar cada conclusión.</p>
                    </div>
                    <p className="text-[10px] text-white/25">Consultadas {formatDate(latestRun?.completed_at)}</p>
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {sources.map((source) => (
                      <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 py-3.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-white/30 group-hover:text-[#41efec]">
                          <Globe2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-white/65 group-hover:text-white">{source.title || getDomain(source.url)}</p>
                          <p className="mt-1 truncate text-[10px] text-white/25">{source.url}</p>
                        </div>
                        <span className="hidden rounded-full border border-white/[0.07] px-2 py-1 text-[9px] uppercase tracking-wider text-white/30 sm:inline-flex">
                          {source.source_type === "competitor_site" ? "Sitio competidor" : source.source_type === "client_site" ? "Sitio cliente" : "Web"}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 text-white/20 group-hover:text-white/55" />
                      </a>
                    ))}
                  </div>
                  {sources.length === 0 ? (
                    <div className="py-12 text-center text-xs text-white/30">No quedaron fuentes registradas para esta versión.</div>
                  ) : null}
                  {selectedLimitations.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/55">Límites del análisis</p>
                      <ul className="mt-2 space-y-1.5">
                        {selectedLimitations.map((limitation) => <li key={limitation} className="text-[11px] leading-5 text-white/40">• {limitation}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </section>
              )}
              </div>
            </>
          )}
        </div>
      </div>

      <AddCompetitorDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onSubmit={addCompetitor} />
    </div>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: string | number
  icon: typeof Target
  accent?: boolean
}) {
  return (
    <div className="min-w-[118px] rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-white/30">
        <Icon className={cn("h-3 w-3", accent && "text-[#41efec]")} />
        {label}
      </div>
      <p className={cn("mt-1 text-base font-semibold text-white/75", accent && "text-[#41efec]")}>{value}</p>
    </div>
  )
}
