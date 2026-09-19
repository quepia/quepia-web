"use client"

import { useState } from "react"
import { AlertTriangle, Pause, Play, Plus, TestTube2 } from "lucide-react"
import { paramsQuery, socialFetch, useSocialData, SocialApiError } from "../social-api"
import { Button, Empty, ErrorState, Loading, Panel, PLATFORM_LABEL, Select } from "../social-ui"
import type { TabProps } from "../social-module"

type Conflict = { automation_id: string; name: string; status: string; severity: "blocking" | "warning"; reason: string }
type Automation = {
  id: string; client_id: string; account_id: string; account_username: string; platform: string; engine: string; name: string
  trigger: string | null; platform_post_id: string | null; status: string; version: number; config: Record<string, unknown>; config_hash: string
  daily_cap: number | null; last_provider_stats: Record<string, number> | null; last_error: string | null; conflicts: Conflict[]
  runs_24h: Record<string, number> | null
}
type Simulation = {
  simulation: { total: number; matched: number; results: Array<{ id: string; matched: boolean; reason: string }>; note: string }
  conflicts: Conflict[]; config_hash: string; provider_preview: Record<string, unknown> | null; external_effects: string
}
type Inventory = { admins: Array<{ id: string; name: string }> }

const ENGINE_LABEL: Record<string, string> = {
  zernio_comment_to_dm: "Comentario → DM (Zernio)", quepia_assignment: "Asignación automática (Quepia)", quepia_sla_reminder: "Recordatorio de SLA (Quepia)",
}
const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", pending_activation: "Activando…", active: "Activa", pending_pause: "Pausando…", paused: "Pausada",
  error: "Error", external_unmanaged: "Creada fuera de Quepia", archived: "Archivada",
}

export function AutomationsTab({ scope, scopes }: TabProps) {
  const list = useSocialData<{ automations: Automation[] }>(`/api/admin/social/automations?${paramsQuery({ client_ids: scope.client_ids, account_ids: scope.account_ids, platforms: scope.platforms })}`)
  const inventory = useSocialData<Inventory>("/api/admin/social/clients")
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const current = list.data?.automations.find((item) => item.id === selected) ?? null

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#a3a3a3]">
        Zernio ejecuta las respuestas por mensaje (comentario→DM y respuesta a Story); Quepia ejecuta asignaciones y recordatorios internos.
        Guardar nunca activa: activar crea la regla en Zernio con la configuración exacta que revisaste. Respuestas autónomas con IA no están habilitadas.
      </p>
      <div className="flex justify-end"><Button onClick={() => { setCreating(true); setSelected(null) }}><Plus className="h-4 w-4" /> Nueva regla</Button></div>
      {creating && <AutomationEditor scopes={scopes} admins={inventory.data?.admins ?? []} onDone={(id) => { setCreating(false); list.reload(); if (id) setSelected(id) }} />}
      <Panel title="Reglas">
        {list.loading && !list.data ? <Loading /> : <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data && list.data.automations.length === 0 && <Empty>No hay reglas en este alcance.</Empty>}
        <ul className="divide-y divide-white/[0.04]">
          {list.data?.automations.map((item) => (
            <li key={item.id}>
              <button onClick={() => { setSelected(item.id); setCreating(false) }} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-white/[0.02]">
                <span className="min-w-0">
                  <span className="block text-sm text-white/85">{item.name} <span className="text-xs text-[#a3a3a3]">v{item.version}</span></span>
                  <span className="text-xs text-[#a3a3a3]">{ENGINE_LABEL[item.engine]} · @{item.account_username} ({PLATFORM_LABEL[item.platform]}){item.platform_post_id ? " · una publicación" : item.engine === "zernio_comment_to_dm" ? " · toda la cuenta" : ""}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {item.conflicts.some((conflict) => conflict.severity === "blocking") && <span className="inline-flex items-center gap-1 text-red-300"><AlertTriangle className="h-3 w-3" /> Conflicto</span>}
                  <span className={item.status === "active" ? "text-white/80" : item.status === "error" ? "text-red-300" : "text-[#a3a3a3]"}>{STATUS_LABEL[item.status] ?? item.status}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {current && <AutomationDetail key={current.id + current.version + current.status} automation={current} scopes={scopes} admins={inventory.data?.admins ?? []} onChanged={list.reload} />}
    </div>
  )
}

function configFromForm(form: Record<string, string | boolean>) {
  const list = (value: unknown) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean)
  if (form.engine === "quepia_assignment") return { assignee_id: form.assignee_id, ...(form.kind ? { kind: form.kind } : {}) }
  if (form.engine === "quepia_sla_reminder") return { after_minutes: Number(form.after_minutes || 120), ...(form.fallback_admin_id ? { fallback_admin_id: form.fallback_admin_id } : {}) }
  return {
    trigger: form.trigger || "comment",
    keywords: list(form.keywords),
    exclude_keywords: list(form.exclude_keywords),
    match_mode: form.match_mode || "word",
    typo_tolerance: form.match_mode === "word" && form.typo_tolerance === true,
    dm_message: form.dm_message,
    ...(form.comment_reply && form.trigger !== "story_reply" ? { comment_reply: form.comment_reply } : {}),
    ...(form.platform_post_id ? { platform_post_id: form.platform_post_id } : {}),
    ...(form.also_match_in_dms === true ? { also_match_in_dms: true } : {}),
  }
}

function formFromAutomation(item?: Automation): Record<string, string | boolean> {
  const config = item?.config ?? {}
  const join = (value: unknown) => (Array.isArray(value) ? value.join(", ") : "")
  return {
    engine: item?.engine ?? "zernio_comment_to_dm", name: item?.name ?? "", account_id: item?.account_id ?? "", client_id: item?.client_id ?? "",
    trigger: String(config.trigger ?? "comment"), keywords: join(config.keywords), exclude_keywords: join(config.exclude_keywords),
    match_mode: String(config.match_mode ?? "word"), typo_tolerance: config.typo_tolerance === true, dm_message: String(config.dm_message ?? ""),
    comment_reply: String(config.comment_reply ?? ""), platform_post_id: String(config.platform_post_id ?? ""), also_match_in_dms: config.also_match_in_dms === true,
    assignee_id: String(config.assignee_id ?? ""), kind: String(config.kind ?? ""), after_minutes: String(config.after_minutes ?? "120"),
    fallback_admin_id: String(config.fallback_admin_id ?? ""), daily_cap: item?.daily_cap ? String(item.daily_cap) : "",
  }
}

function AutomationEditor({ scopes, admins, automation, onDone }: { scopes: TabProps["scopes"]; admins: Inventory["admins"]; automation?: Automation; onDone: (id?: string) => void }) {
  const [form, setForm] = useState(() => formFromAutomation(automation))
  const [error, setError] = useState<SocialApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: string, value: string | boolean) => setForm((previous) => ({ ...previous, [key]: value }))
  const account = scopes.accounts.find((item) => item.id === form.account_id)
  const isZernio = form.engine === "zernio_comment_to_dm"
  const input = "h-8 w-full rounded-md border border-white/10 bg-[#141414] px-2 text-sm text-white/85"

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload = { engine: form.engine, name: form.name, client_id: account?.client_id, account_id: form.account_id, daily_cap: form.daily_cap || null, config: configFromForm(form) }
      const result = automation
        ? await socialFetch<{ id: string }>(`/api/admin/social/automations/${automation.id}`, { method: "PATCH", json: payload })
        : await socialFetch<{ id: string }>("/api/admin/social/automations", { method: "POST", json: payload })
      onDone(result.id)
    } catch (failure) {
      setError(failure as SocialApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={automation ? `Editar “${automation.name}” (nueva versión)` : "Nueva regla (borrador)"}>
      <div className="grid gap-3 md:grid-cols-2">
        {!automation && <Select label="Motor" value={String(form.engine)} onChange={(value) => set("engine", value)} options={Object.entries(ENGINE_LABEL).map(([value, label]) => ({ value, label }))} />}
        <label className="text-[11px] text-[#a3a3a3]">Nombre<input className={input} value={String(form.name)} onChange={(event) => set("name", event.target.value)} maxLength={120} /></label>
        {!automation && <Select label="Cuenta (cliente explícito)" value={String(form.account_id)} onChange={(value) => set("account_id", value)}
          options={[{ value: "", label: "Elegir cuenta" }, ...scopes.accounts
            .filter((item) => !isZernio || ["instagram", "facebook"].includes(item.platform))
            .map((item) => ({ value: item.id, label: `@${item.username} · ${scopes.clients.find((client) => client.id === item.client_id)?.name ?? ""}` }))]} />}
        <label className="text-[11px] text-[#a3a3a3]">Tope diario (opcional)<input className={input} type="number" min={1} max={5000} value={String(form.daily_cap)} onChange={(event) => set("daily_cap", event.target.value)} /></label>
        {isZernio ? (
          <>
            <Select label="Disparador" value={String(form.trigger)} onChange={(value) => set("trigger", value)} options={[
              { value: "comment", label: "Comentario con palabra clave" }, ...(account?.platform === "facebook" ? [] : [{ value: "story_reply", label: "Respuesta a Story (Instagram)" }]),
            ]} />
            <label className="text-[11px] text-[#a3a3a3]">Publicación específica (ID de la plataforma, vacío = toda la cuenta)<input className={input} value={String(form.platform_post_id)} onChange={(event) => set("platform_post_id", event.target.value)} /></label>
            <label className="text-[11px] text-[#a3a3a3]">Palabras clave (separadas por coma; vacío = cualquier comentario)<input className={input} value={String(form.keywords)} onChange={(event) => set("keywords", event.target.value)} /></label>
            <label className="text-[11px] text-[#a3a3a3]">Excluir si contiene<input className={input} value={String(form.exclude_keywords)} onChange={(event) => set("exclude_keywords", event.target.value)} /></label>
            <Select label="Coincidencia" value={String(form.match_mode)} onChange={(value) => set("match_mode", value)} options={[
              { value: "word", label: "Palabra completa" }, { value: "contains", label: "Contiene" }, { value: "exact", label: "Comentario exacto" },
            ]} />
            <div className="flex flex-col justify-end gap-1 text-xs text-[#a3a3a3]">
              <label className="flex items-center gap-1.5"><input type="checkbox" disabled={form.match_mode !== "word"} checked={form.typo_tolerance === true} onChange={(event) => set("typo_tolerance", event.target.checked)} /> Tolerar errores de tipeo</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.also_match_in_dms === true} onChange={(event) => set("also_match_in_dms", event.target.checked)} /> También responder si escriben la palabra por DM</label>
            </div>
            <label className="text-[11px] text-[#a3a3a3] md:col-span-2">Mensaje directo (obligatorio, hasta 1000 caracteres)
              <textarea className="w-full rounded-md border border-white/10 bg-[#141414] p-2 text-sm text-white/85" rows={3} maxLength={1000} value={String(form.dm_message)} onChange={(event) => set("dm_message", event.target.value)} /></label>
            {form.trigger !== "story_reply" && <label className="text-[11px] text-[#a3a3a3] md:col-span-2">Respuesta pública complementaria (opcional; Zernio la publica solo si el DM se envía)
              <input className={input} value={String(form.comment_reply)} onChange={(event) => set("comment_reply", event.target.value)} /></label>}
          </>
        ) : form.engine === "quepia_assignment" ? (
          <>
            <Select label="Asignar a" value={String(form.assignee_id)} onChange={(value) => set("assignee_id", value)} options={[{ value: "", label: "Elegir admin" }, ...admins.map((admin) => ({ value: admin.id, label: admin.name }))]} />
            <Select label="Tipo de hilo" value={String(form.kind)} onChange={(value) => set("kind", value)} options={[{ value: "", label: "DMs y comentarios" }, { value: "dm", label: "Solo DMs" }, { value: "comment", label: "Solo comentarios" }]} />
          </>
        ) : (
          <>
            <label className="text-[11px] text-[#a3a3a3]">Avisar tras (minutos sin respuesta)<input className={input} type="number" min={5} max={10080} value={String(form.after_minutes)} onChange={(event) => set("after_minutes", event.target.value)} /></label>
            <Select label="Si no hay responsable, avisar a" value={String(form.fallback_admin_id)} onChange={(value) => set("fallback_admin_id", value)} options={[{ value: "", label: "Nadie" }, ...admins.map((admin) => ({ value: admin.id, label: admin.name }))]} />
          </>
        )}
      </div>
      <ErrorState error={error} />
      <div className="mt-3 flex gap-2">
        <Button variant="primary" disabled={busy || !form.name || (!automation && !form.account_id)} onClick={save}>Guardar borrador</Button>
        <Button variant="ghost" onClick={() => onDone()}>Cancelar</Button>
      </div>
    </Panel>
  )
}

function AutomationDetail({ automation, scopes, admins, onChanged }: { automation: Automation; scopes: TabProps["scopes"]; admins: Inventory["admins"]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [samples, setSamples] = useState("")
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<SocialApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const managed = automation.status !== "external_unmanaged"
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await fn() } catch (failure) { setError(failure as SocialApiError) } finally { setBusy(false) }
  }
  const simulate = () => run(async () => {
    setSimulation(await socialFetch<Simulation>(`/api/admin/social/automations/${automation.id}/simulate`, { method: "POST", json: { sample_comments: samples.split("\n").map((line) => line.trim()).filter(Boolean) } }))
  })
  const changeState = (target: "active" | "paused") => run(async () => {
    await socialFetch(`/api/admin/social/automations/${automation.id}/state`, { method: "POST", json: { target, confirm_hash: target === "active" ? simulation?.config_hash ?? automation.config_hash : null } })
    setConfirming(false)
    onChanged()
  })

  if (editing) return <AutomationEditor scopes={scopes} admins={admins} automation={automation} onDone={() => { setEditing(false); onChanged() }} />
  return (
    <Panel title={automation.name} description={`${ENGINE_LABEL[automation.engine]} · @${automation.account_username} · ${STATUS_LABEL[automation.status]}`} actions={managed && (
      <>
        {!["pending_activation", "pending_pause"].includes(automation.status) && <Button onClick={() => setEditing(true)}>Editar</Button>}
        {automation.status === "active"
          ? <Button variant="danger" disabled={busy} onClick={() => changeState("paused")}><Pause className="h-4 w-4" /> Pausar</Button>
          : ["draft", "paused", "error"].includes(automation.status) && <Button variant="primary" disabled={busy} onClick={() => { setConfirming(true); if (!simulation) simulate() }}><Play className="h-4 w-4" /> Activar…</Button>}
      </>
    )}>
      {!managed && <p className="mb-3 text-xs text-amber-200">Regla creada fuera de Quepia en esta cuenta. Se muestra para detectar conflictos y doble motor; se administra desde Zernio.</p>}
      {automation.last_error && <p className="mb-3 text-xs text-red-300">Último error: {automation.last_error}</p>}
      {automation.conflicts.length > 0 && (
        <ul className="mb-3 space-y-1 text-xs">
          {automation.conflicts.map((conflict) => (
            <li key={conflict.automation_id} className={conflict.severity === "blocking" ? "text-red-300" : "text-amber-200"}>
              {conflict.severity === "blocking" ? "Bloquea la activación" : "Advertencia"}: “{conflict.name}” — {conflict.reason}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-[#a3a3a3]">Configuración v{automation.version}</div>
          <pre className="max-h-64 overflow-auto rounded-md bg-black/40 p-2 text-[11px] text-white/70">{JSON.stringify(automation.config, null, 2)}</pre>
          {automation.last_provider_stats && (
            <p className="mt-2 text-xs text-[#a3a3a3]">Zernio: {Object.entries(automation.last_provider_stats).map(([key, value]) => `${key} ${value}`).join(" · ")}. “Enviado” significa aceptado por la plataforma, no leído.</p>
          )}
          {automation.runs_24h && <p className="mt-1 text-xs text-[#a3a3a3]">Últimas 24 h: {Object.entries(automation.runs_24h).map(([key, value]) => `${key} ${value}`).join(" · ")}</p>}
        </div>
        {automation.engine === "zernio_comment_to_dm" && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs text-[#a3a3a3]"><TestTube2 className="h-3.5 w-3.5" /> Simulación sin efectos (comentarios recientes + los que escribas, uno por línea)</div>
            <textarea value={samples} onChange={(event) => setSamples(event.target.value)} rows={3} className="w-full rounded-md border border-white/10 bg-[#141414] p-2 text-xs text-white/85" placeholder={"¿Precio?\nquiero info"} />
            <Button disabled={busy} onClick={simulate}>Simular</Button>
            {simulation && (
              <div className="mt-2 text-xs">
                <p className="text-[#a3a3a3]">{simulation.simulation.matched} de {simulation.simulation.total} comentarios dispararían la regla. {simulation.external_effects}</p>
                <ul className="mt-1 max-h-40 overflow-y-auto">{simulation.simulation.results.slice(0, 30).map((result) => (
                  <li key={result.id} className={result.matched ? "text-white/80" : "text-[#a3a3a3]"}>{result.matched ? "✓" : "–"} {result.id.startsWith("manual") ? "(ejemplo) " : ""}{result.reason}</li>
                ))}</ul>
                <p className="mt-1 text-[#a3a3a3]">{simulation.simulation.note}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {confirming && (
        <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/[0.05] p-3 text-sm">
          <p className="mb-2 text-amber-100">Confirmá la activación sobre esta configuración exacta. {automation.engine === "zernio_comment_to_dm"
            ? `Se creará/actualizará la regla en Zernio para @${automation.account_username} y empezará a enviar DMs reales a quienes comenten.`
            : "Solo tiene efectos internos en Quepia (asignaciones o avisos)."}</p>
          {simulation?.provider_preview && <pre className="mb-2 max-h-48 overflow-auto rounded bg-black/40 p-2 text-[11px] text-white/70">{JSON.stringify(simulation.provider_preview, null, 2)}</pre>}
          <p className="mb-2 text-xs text-[#a3a3a3]">Pausar luego detiene nuevas ejecuciones; los envíos demorados ya iniciados por Zernio pueden completarse.</p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => changeState("active")}>Confirmar activación</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <ErrorState error={error} />
    </Panel>
  )
}
