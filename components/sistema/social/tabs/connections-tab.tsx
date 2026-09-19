"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import { formatDateTime, relativeAge, socialFetch, useSocialData, SocialApiError } from "../social-api"
import { Button, ErrorState, Loading, Panel, PLATFORM_LABEL, Select } from "../social-ui"
import type { TabProps } from "../social-module"

type Account = {
  id: string; platform: string; username: string | null; is_active: boolean; needs_reconnection: boolean; health_status: string
  health_issues: unknown[]; permissions: string[]; can_post: boolean | null; can_fetch_analytics: boolean | null
  token_expires_at: string | null; provider_removed_at: string | null; last_health_check_at: string | null
  provider_analytics_synced_at: string | null; dm_backfill_status: string | null; client_id: string | null; linked_project_ids: string[]
}
type Inventory = {
  clients: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string; client_id: string | null }>
  profiles: Array<{ id: string; zernio_profile_id: string; name: string; project_id: string | null; client_id: string | null; provider_removed_at: string | null; last_synced_at: string | null; accounts: Account[] }>
  quarantined_events: number
  recent_sync_runs: Array<{ stream: string; status: string; started_at: string; items_seen: number; items_written: number; items_skipped: number; error: string | null }>
  jobs: Array<{ kind: string; status: string; attempts: number; last_error: string | null; run_after: string }>
}
type Coverage = { result: { streams: Array<{ stream: string; status: string; last_success_at: string | null; last_error: string | null; cursor_age_hours: number | null }>; webhooks: { last_received_at: string | null; quarantined: number; failed: number }; provider_freshness_note: string } }
type Grant = { grant_id: string; user_name: string | null; client_id: string; created_at: string; user_is_global_admin: boolean; social_enabled: boolean }

const SYNC_KINDS = [
  { kind: "inventory.reconcile", label: "Inventario" }, { kind: "health.check", label: "Salud" }, { kind: "analytics.delta", label: "Analítica (delta)" },
  { kind: "analytics.bootstrap", label: "Carga histórica" }, { kind: "followers.daily", label: "Seguidores" }, { kind: "timeline.backfill", label: "Evolución de posts" },
  { kind: "ig_insights.refresh", label: "Insights IG" }, { kind: "inbox.backfill", label: "Bandeja" }, { kind: "automations.sync", label: "Automatizaciones" },
]

export function ConnectionsTab({ onScopesChanged }: TabProps & { onScopesChanged: () => void }) {
  const inventory = useSocialData<{ inventory: Inventory; coverage: Coverage }>("/api/admin/social/connections")
  const grants = useSocialData<Grant[]>("/api/admin/social/mcp-access")
  const [clientName, setClientName] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<SocialApiError | null>(null)
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null)
    setMessage(null)
    try {
      await fn()
      if (done) setMessage(done)
      inventory.reload()
      onScopesChanged()
    } catch (failure) {
      setError(failure as SocialApiError)
    }
  }
  const post = (json: Record<string, unknown>) => socialFetch("/api/admin/social/clients", { method: "POST", json })

  if (inventory.loading && !inventory.data) return <Loading />
  if (!inventory.data) return <ErrorState error={inventory.error} onRetry={inventory.reload} />
  const { inventory: data, coverage } = inventory.data
  const clientOptions = [{ value: "", label: "Sin cliente" }, ...data.clients.map((client) => ({ value: client.id, label: client.name }))]

  return (
    <div className="space-y-4">
      {message && <p role="status" className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/70">{message}</p>}
      <ErrorState error={error} />
      <Panel title="Clientes y proyectos" description="La identidad comercial se asigna explícitamente. Cambiar el cliente de un proyecto o perfil ya asignado está bloqueado para no reclasificar el histórico.">
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-[#a3a3a3]">Nuevo cliente
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} maxLength={120}
              className="block h-8 w-64 rounded-md border border-white/10 bg-[#141414] px-2 text-sm text-white/85" /></label>
          <Button disabled={clientName.trim().length < 2} onClick={() => act(async () => { await post({ action: "create_client", name: clientName }); setClientName("") }, "Cliente creado")}>Crear cliente</Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/[0.06] text-left text-xs text-[#a3a3a3]"><th className="py-2 font-normal">Proyecto</th><th className="py-2 font-normal">Cliente</th></tr></thead>
          <tbody>
            {data.projects.map((project) => (
              <tr key={project.id} className="border-b border-white/[0.04]">
                <td className="py-2">{project.name}</td>
                <td className="py-2">
                  {project.client_id ? <span className="text-white/70">{data.clients.find((client) => client.id === project.client_id)?.name}</span> : (
                    <Select label="" value="" options={clientOptions} onChange={(value) => value && act(() => post({ action: "assign_project", project_id: project.id, client_id: value }), "Proyecto asignado")} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Perfiles y cuentas de Zernio" actions={data.quarantined_events > 0 && (
        <Button onClick={() => act(() => post({ action: "requeue_quarantine" }), "Eventos en cuarentena reprogramados")}>Reprocesar {data.quarantined_events} evento(s) en cuarentena</Button>
      )}>
        <div className="space-y-4">
          {data.profiles.map((profile) => (
            <div key={profile.id} className="rounded-md border border-white/[0.06] p-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-sm text-white/85">{profile.name}</div>
                  <div className="text-xs text-[#a3a3a3]">Perfil {profile.zernio_profile_id} · {profile.project_id ? `proyecto: ${data.projects.find((project) => project.id === profile.project_id)?.name ?? "—"}` : "sin proyecto"} · sincronizado {relativeAge(profile.last_synced_at)}{profile.provider_removed_at ? " · ya no existe en Zernio" : ""}</div>
                </div>
                {profile.client_id
                  ? <span className="text-xs text-[#a3a3a3]">Cliente: {data.clients.find((client) => client.id === profile.client_id)?.name}</span>
                  : <Select label="Asignar cliente (cuarentena hasta asignar)" value="" options={clientOptions}
                      onChange={(value) => value && act(() => post({ action: "assign_profile", profile_id: profile.id, client_id: value }), "Perfil asignado")} />}
              </div>
              {profile.accounts.length === 0 && <p className="mt-2 text-xs text-[#a3a3a3]">Sin cuentas conectadas en este perfil.</p>}
              {profile.accounts.map((account) => (
                <div key={account.id} className="mt-2 grid gap-2 border-t border-white/[0.04] pt-2 text-xs md:grid-cols-[1fr_1fr_1fr]">
                  <div>
                    <div className="text-sm text-white/80">@{account.username} <span className="text-[#a3a3a3]">{PLATFORM_LABEL[account.platform] ?? account.platform}</span></div>
                    {account.provider_removed_at ? <span className="text-[#a3a3a3]">Eliminada del proveedor {formatDateTime(account.provider_removed_at)}</span>
                      : account.needs_reconnection || ["error", "needs_reconnect"].includes(account.health_status)
                        ? <span className="inline-flex items-center gap-1 text-red-300"><AlertTriangle className="h-3 w-3" /> Necesita reconexión (desde el proyecto, flujo de publicación existente)</span>
                        : account.health_status === "healthy" ? <span className="inline-flex items-center gap-1 text-[#a3a3a3]"><CheckCircle2 className="h-3 w-3" /> Sana</span>
                          : <span className="text-[#a3a3a3]">Salud: {account.health_status}</span>}
                  </div>
                  <div className="text-[#a3a3a3]">
                    Permisos: {account.permissions.length ? account.permissions.map((permission) => permission.replace("instagram_business_", "")).join(", ") : "sin datos"}<br />
                    Analítica {account.can_fetch_analytics === false ? "no disponible" : "ok"} · Zernio sincronizó {relativeAge(account.provider_analytics_synced_at)} · DMs históricos: {account.dm_backfill_status ?? "—"}
                  </div>
                  <div>
                    {account.client_id ? (
                      <div className="flex flex-wrap gap-1">
                        {data.projects.filter((project) => project.client_id === account.client_id).map((project) => {
                          const linked = account.linked_project_ids.includes(project.id)
                          return (
                            <button key={project.id} onClick={() => act(() => post({ action: linked ? "unlink_account" : "link_account", project_id: project.id, account_id: account.id }))}
                              className={linked ? "rounded border border-white/20 px-1.5 py-0.5 text-white/80" : "rounded border border-white/[0.06] px-1.5 py-0.5 text-[#a3a3a3]"}
                              title={linked ? "Desvincular desde hoy (el histórico se conserva)" : "Vincular desde hoy"}>
                              {linked ? "✓ " : "+ "}{project.name}
                            </button>
                          )
                        })}
                      </div>
                    ) : <span className="text-amber-200">Sin cliente: no entra en analítica ni bandeja</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Sincronización" description={coverage.result.provider_freshness_note}>
        <div className="mb-3 flex flex-wrap gap-2">
          {SYNC_KINDS.map((item) => (
            <Button key={item.kind} onClick={() => act(() => socialFetch("/api/admin/social/sync", { method: "POST", json: { kinds: [item.kind] } }), `Encolado: ${item.label}`)}>
              <RefreshCw className="h-3.5 w-3.5" /> {item.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-[#a3a3a3]">Flujos · último webhook {relativeAge(coverage.result.webhooks.last_received_at)} · fallidos {coverage.result.webhooks.failed}</div>
            <ul className="space-y-1 text-xs">
              {coverage.result.streams.map((stream) => (
                <li key={stream.stream} className="text-[#a3a3a3]">{stream.stream}: {stream.status} · éxito {relativeAge(stream.last_success_at)}{stream.cursor_age_hours !== null ? ` · cursor ${stream.cursor_age_hours} h` : ""}{stream.last_error ? <span className="text-red-300"> · {stream.last_error}</span> : null}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 text-xs text-[#a3a3a3]">Ejecuciones recientes</div>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {data.recent_sync_runs.map((run, index) => (
                <li key={index} className={run.status === "failed" ? "text-red-300" : "text-[#a3a3a3]"}>{formatDateTime(run.started_at)} · {run.stream} · {run.status} · {run.items_written}/{run.items_seen}{run.items_skipped ? ` (omitidos ${run.items_skipped})` : ""}{run.error ? ` · ${run.error}` : ""}</li>
              ))}
            </ul>
            {data.jobs.filter((job) => ["failed", "dead"].includes(job.status)).map((job, index) => (
              <p key={index} className="text-xs text-red-300">{job.kind}: {job.status} tras {job.attempts} intento(s) · {job.last_error}</p>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Acceso de IA por MCP" description="Las herramientas sociales de solo lectura requieren la capacidad social.analytics.read, que no se otorga por defecto. Solo grants de administradores globales pueden recibirla y cada consulta revalida el rol.">
        {grants.loading && !grants.data ? <Loading /> : <ErrorState error={grants.error} />}
        {grants.data && grants.data.length === 0 && <p className="text-sm text-[#a3a3a3]">No hay conexiones MCP activas.</p>}
        <ul className="space-y-1 text-sm">
          {grants.data?.map((grant) => (
            <li key={grant.grant_id} className="flex items-center justify-between gap-2">
              <span className="text-white/70">{grant.user_name ?? "Usuario"} · conectado {formatDateTime(grant.created_at)}</span>
              <Button disabled={!grant.user_is_global_admin && !grant.social_enabled}
                onClick={() => act(async () => { await socialFetch("/api/admin/social/mcp-access", { method: "POST", json: { grant_id: grant.grant_id, enabled: !grant.social_enabled } }); grants.reload() })}>
                {grant.social_enabled ? "Quitar analítica social" : grant.user_is_global_admin ? "Permitir analítica social" : "No es admin global"}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
