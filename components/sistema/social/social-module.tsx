"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import { Bot, Building2, ChartLine, Inbox, LayoutList, PlugZap, Workflow } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { shiftDate, todayLocal, useSocialData, useSocialScope, type SocialScope } from "./social-api"
import { ErrorState, Loading, PLATFORM_LABEL, Select } from "./social-ui"

export type ScopesResult = {
  result: {
    clients: Array<{ id: string; name: string }>
    projects: Array<{ id: string; name: string; client_id: string }>
    accounts: Array<{ id: string; client_id: string; platform: string; username: string | null; health_status: string; project_ids: string[] }>
    unassigned: { profiles: number; accounts: number; projects: number }
  }
}

export type TabProps = { scope: SocialScope; scopes: ScopesResult["result"] }

const tabFallback = () => <Loading />
const AgencyTab = dynamic(() => import("./tabs/agency-tab").then((mod) => mod.AgencyTab), { loading: tabFallback })
const AnalyticsTab = dynamic(() => import("./tabs/analytics-tab").then((mod) => mod.AnalyticsTab), { loading: tabFallback })
const ContentTab = dynamic(() => import("./tabs/content-tab").then((mod) => mod.ContentTab), { loading: tabFallback })
const InboxTab = dynamic(() => import("./tabs/inbox-tab").then((mod) => mod.InboxTab), { loading: tabFallback })
const AutomationsTab = dynamic(() => import("./tabs/automations-tab").then((mod) => mod.AutomationsTab), { loading: tabFallback })
const ConnectionsTab = dynamic(() => import("./tabs/connections-tab").then((mod) => mod.ConnectionsTab), { loading: tabFallback })
const AiTab = dynamic(() => import("./tabs/ai-tab").then((mod) => mod.AiTab), { loading: tabFallback })

const TABS = [
  { id: "agency", label: "Agencia", icon: Building2 },
  { id: "analytics", label: "Analítica", icon: ChartLine },
  { id: "content", label: "Contenido", icon: LayoutList },
  { id: "inbox", label: "Bandeja", icon: Inbox },
  { id: "automations", label: "Automatizaciones", icon: Workflow },
  { id: "ai", label: "Análisis con IA", icon: Bot },
  { id: "connections", label: "Conexiones", icon: PlugZap },
]

const PERIODS = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "custom", label: "Personalizado" },
]

export function SocialModule() {
  const { scope, tab, selected, update } = useSocialScope()
  const scopes = useSocialData<ScopesResult>("/api/admin/social/analytics?op=scopes")

  const options = useMemo(() => {
    const data = scopes.data?.result
    const accounts = (data?.accounts ?? []).filter((account) =>
      (!selected.client || account.client_id === selected.client)
      && (!selected.platform || account.platform === selected.platform)
      && (!selected.project || account.project_ids.includes(selected.project)))
    return {
      clients: data?.clients ?? [],
      projects: (data?.projects ?? []).filter((project) => !selected.client || project.client_id === selected.client),
      platforms: Array.from(new Set((data?.accounts ?? []).filter((account) => !selected.client || account.client_id === selected.client).map((account) => account.platform))),
      accounts,
    }
  }, [scopes.data, selected.client, selected.platform, selected.project])

  const today = todayLocal()
  const periodDays = scope.to === today && scope.from ? String(Math.round((Date.parse(scope.to) - Date.parse(scope.from)) / 86_400_000) + 1) : "custom"
  const period = selected.period === "custom" ? "custom" : PERIODS.some((item) => item.value === periodDays) ? periodDays : "custom"
  // Un cambio de alcance cierra detalles y descarta borradores del contexto
  // anterior antes de permitir otra acción (especialmente enviar respuestas).
  const scopeKey = JSON.stringify(scope)

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#0a0a0a] text-white">
      <div className="border-b border-white/[0.06] px-4 pt-4 sm:px-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Gestión social</h1>
            <p className="text-xs text-[#a3a3a3]">Exclusivo de administradores globales · datos locales sincronizados desde Zernio</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Select label="Cliente" value={selected.client} onChange={(value) => update({ client: value || null })}
              options={[{ value: "", label: "Todos (agencia)" }, ...options.clients.map((client) => ({ value: client.id, label: client.name }))]} />
            <Select label="Proyecto" value={selected.project} onChange={(value) => update({ project: value || null })}
              options={[{ value: "", label: "Todos" }, ...options.projects.map((project) => ({ value: project.id, label: project.name }))]} />
            {selected.project && (
              <Select label="Proyecto significa" value={selected.mode} onChange={(value) => update({ mode: value === "accounts" ? "accounts" : null })}
                options={[{ value: "attributed", label: "Contenido atribuido" }, { value: "accounts", label: "Cuentas vinculadas" }]} />
            )}
            <Select label="Plataforma" value={selected.platform} onChange={(value) => update({ platform: value || null })}
              options={[{ value: "", label: "Todas" }, ...options.platforms.map((platform) => ({ value: platform, label: PLATFORM_LABEL[platform] ?? platform }))]} />
            <Select label="Cuenta" value={selected.account} onChange={(value) => update({ account: value || null })}
              options={[{ value: "", label: "Todas" }, ...options.accounts.map((account) => ({ value: account.id, label: `@${account.username ?? account.id.slice(0, 6)}` }))]} />
            <Select label="Período" value={period} onChange={(value) => {
              if (value === "custom") {
                update({ period: "custom", from: scope.from, to: scope.to })
                return
              }
              update({ period: null, to: null, from: shiftDate(today, -(Number(value) - 1)) })
            }} options={PERIODS} />
            {period === "custom" && (
              <>
                <label className="flex flex-col gap-1 text-[11px] text-[#a3a3a3]">Desde
                  <input type="date" value={scope.from} max={scope.to} onChange={(event) => update({ from: event.target.value || null })}
                    className="h-8 rounded-md border border-white/10 bg-[#141414] px-2 text-sm text-white/85" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[#a3a3a3]">Hasta
                  <input type="date" value={scope.to} min={scope.from} onChange={(event) => update({ to: event.target.value || null })}
                    className="h-8 rounded-md border border-white/10 bg-[#141414] px-2 text-sm text-white/85" />
                </label>
              </>
            )}
          </div>
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Secciones de gestión social">
          {TABS.map((item) => (
            <button key={item.id} onClick={() => update({ tab: item.id === "agency" ? null : item.id })}
              aria-current={tab === item.id ? "page" : undefined}
              className={cn("flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                tab === item.id ? "border-white text-white" : "border-transparent text-[#a3a3a3] hover:text-white/80")}>
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
        {scopes.loading && !scopes.data && <Loading label="Cargando alcance" />}
        <ErrorState error={scopes.error} onRetry={scopes.reload} />
        {scopes.data && (
          <>
            {scopes.data.result.unassigned.accounts > 0 && tab !== "connections" && (
              <p className="mb-3 rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
                Hay {scopes.data.result.unassigned.accounts} cuenta(s) sin cliente asignado: no entran en analítica ni bandeja hasta asignarlas en Conexiones.
              </p>
            )}
            {tab === "agency" && <AgencyTab scope={scope} scopes={scopes.data.result} />}
            {tab === "analytics" && <AnalyticsTab scope={scope} scopes={scopes.data.result} />}
            {tab === "content" && <ContentTab key={scopeKey} scope={scope} scopes={scopes.data.result} />}
            {tab === "inbox" && <InboxTab key={scopeKey} scope={scope} scopes={scopes.data.result} />}
            {tab === "automations" && <AutomationsTab key={scopeKey} scope={scope} scopes={scopes.data.result} />}
            {tab === "ai" && <AiTab key={scopeKey} scope={scope} scopes={scopes.data.result} />}
            {tab === "connections" && <ConnectionsTab scope={scope} scopes={scopes.data.result} onScopesChanged={scopes.reload} />}
          </>
        )}
      </div>
    </div>
  )
}
