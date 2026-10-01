"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, RefreshCw, X } from "lucide-react"
import { ZernioPublishingPanel } from "../quepia/zernio-publishing-panel"
import { Button, Empty, Panel, Select } from "./social-ui"

type Publication = {
  id: string; project_id: string; task_id: string; content: string; scheduled_for: string | null
  timezone: string; status: string; account_ids: string[]; error_message: string | null
  created_at: string; updated_at: string; task: { titulo: string } | null; project: { nombre: string } | null
  platform_results: Array<{ platform?: string; status?: string; errorMessage?: string; platformPostUrl?: string; postUrl?: string }>
}
type Account = { zernio_account_id: string; username: string | null; display_name: string | null; platform: string }
type Result = { publications: Publication[]; accounts: Account[]; total: number }
const LABELS: Record<string, string> = { preparing: "Preparando", draft: "Borrador", scheduled: "Programada", publishing: "Publicando", published: "Publicada correctamente", partial: "Publicación parcial", failed: "Fallida", cancelled: "Cancelada" }
function date(value: string | null, timezone?: string) {
  return value ? new Date(value).toLocaleString("es-AR", { timeZone: timezone || "America/Argentina/Cordoba", dateStyle: "medium", timeStyle: "short" }) : "Sin horario"
}

export function PublicationsModule() {
  const [data, setData] = useState<Result | null>(null)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState("scheduled")
  const [account, setAccount] = useState("")
  const [search, setSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Publication | null>(null)
  const previous = useRef(new Map<string, string>())
  const inFlight = useRef(false)
  const generation = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)
  const load = useCallback(async (sync = false) => {
    if (sync && inFlight.current) return
    if (sync) inFlight.current = true
    const requestGeneration = ++generation.current
    setBusy(true)
    setError("")
    try {
      if (sync) {
        const response = await fetch("/api/admin/social/publications", { method: "POST" })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "No se pudo actualizar el estado")
        if (result.changes?.length) setNotice(result.changes.map((item: { title: string; status: string }) => `${item.title}: ${LABELS[item.status] || item.status}`).join(" · "))
        else if (result.failed) setNotice("Algunos estados no pudieron verificarse. Se conserva el último resultado conocido.")
      }
      const response = await fetch(`/api/admin/social/publications?${new URLSearchParams({ page: String(page), status, account, search: searchQuery })}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar las publicaciones")
      if (requestGeneration !== generation.current) return
      const next = result as Result
      const changes = next.publications.filter((item) => previous.current.has(item.id) && previous.current.get(item.id) !== item.status && ["published", "failed", "partial"].includes(item.status))
      if (changes.length) setNotice(changes.map((item) => `${item.task?.titulo || item.project?.nombre || "Publicación"}: ${LABELS[item.status]}`).join(" · "))
      next.publications.forEach((item) => previous.current.set(item.id, item.status))
      setData(next)
    } catch (failure) { if (requestGeneration === generation.current) setError(failure instanceof Error ? failure.message : "No se pudo actualizar") }
    finally { if (sync) inFlight.current = false; if (requestGeneration === generation.current) setBusy(false) }
  }, [page, status, account, searchQuery])
  useEffect(() => { const timer = setTimeout(() => { setSearchQuery(search); setPage(0) }, 300); return () => clearTimeout(timer) }, [search])
  useEffect(() => { void load(); const timer = setInterval(() => { if (document.visibilityState === "visible") void load(true) }, 60000); return () => clearInterval(timer) }, [load])
  useEffect(() => {
    if (!editing) return
    const previousFocus = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(null)
      if (event.key !== "Tab") return
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []).filter((node) => node.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus() }
  }, [editing])
  const accounts = useMemo(() => new Map(data?.accounts.map((item) => [item.zernio_account_id, item]) || []), [data])
  const rows = data?.publications || []
  async function act(item: Publication, retry: boolean) {
    if (!retry && !window.confirm(`¿Cancelar la publicación de “${item.task?.titulo || item.project?.nombre || "esta tarea"}”? Ya no se publicará.`)) return
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/zernio/publications/${encodeURIComponent(item.id)}`, retry ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) } : { method: "DELETE" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "No se pudo realizar la acción")
      setNotice(retry ? "Reintento solicitado. Revisá el estado final." : "Publicación cancelada.")
      await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo realizar la acción") }
    finally { setBusy(false) }
  }
  return <div className="h-full flex-1 overflow-auto bg-[#0a0a0a] p-4 text-white sm:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays className="h-5 w-5" />Publicaciones</h1><p className="mt-1 text-sm text-white/50">Agenda e historial de todas las cuentas · horario de Argentina · actualización automática cada minuto mientras esta vista está abierta.</p></div>
      <Button disabled={busy} onClick={() => void load(true)}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Actualizar estados</Button>
    </div>
    {notice && <div role="status" className="mb-4 flex justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-400/20 p-3 text-sm text-red-200">{error}</p>}
    <Panel title="Agenda de publicaciones" description={`${data?.total || 0} publicaciones registradas. Filtrá por estado para consultar la agenda o el historial.`}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-white/50">Buscar tarea, proyecto, cuenta o copy<input className="h-8 rounded-md border border-white/10 bg-[#141414] px-3 text-sm text-white" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. Brandalise" /></label>
        <Select label="Estado" value={status} onChange={(value) => { setStatus(value); setPage(0); setData(null) }} options={[{ value: "", label: "Todos" }, ...Object.entries(LABELS).map(([value, label]) => ({ value, label }))]} />
        <Select label="Cuenta" value={account} onChange={(value) => { setAccount(value); setPage(0); setData(null) }} options={[{ value: "", label: "Todas" }, ...(data?.accounts || []).map((item) => ({ value: item.zernio_account_id, label: `${item.display_name || item.username || "Cuenta"} · ${item.platform}` }))]} />
      </div>
      {!data && busy ? <p className="text-sm text-white/50">Cargando publicaciones…</p> : rows.length === 0 ? <Empty>No hay publicaciones con estos filtros seleccionados.</Empty> : <div className="space-y-3">{rows.map((item) => <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-medium">{item.task?.titulo || "Tarea eliminada"}</h2><p className="text-xs text-white/50">{item.project?.nombre || "Proyecto"}</p></div><span className={`text-sm ${item.status === "published" ? "text-emerald-300" : ["failed", "partial"].includes(item.status) ? "text-red-300" : "text-amber-200"}`}>{LABELS[item.status] || item.status}</span></div>
        <div className="my-2 flex flex-wrap gap-2">{item.account_ids.map((id) => { const a = accounts.get(id); return <span key={id} className="rounded-md bg-white/5 px-2 py-1 text-xs">{a?.display_name || (a?.username ? `@${a.username}` : "Cuenta no disponible")} · {a?.platform || "Red social"}</span> })}</div>
        <p className="text-sm text-white/70">{item.scheduled_for ? `Horario programado: ${date(item.scheduled_for, item.timezone)}` : `Creada: ${date(item.created_at)}`}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/60">{item.content || "Sin copy"}</p>
        {item.error_message && <p className="mt-2 text-sm text-red-300">{item.error_message}</p>}
        <div className="mt-2 space-y-1">{item.platform_results.map((result, index) => { const url = result.platformPostUrl || result.postUrl; return <p key={index} className="text-xs text-white/50">{result.platform} {result.status ? `· ${LABELS[result.status] || result.status}` : ""} {result.errorMessage && <span className="text-red-300">{result.errorMessage}</span>} {url && /^https:\/\//i.test(url) && <a href={url} target="_blank" rel="noopener noreferrer" className="underline">Ver publicación</a>}</p> })}</div>
        <div className="mt-3 flex flex-wrap gap-2">{["draft", "scheduled"].includes(item.status) && <><Button disabled={busy} onClick={() => setEditing(item)}>Editar publicación</Button><Button disabled={busy} onClick={() => void act(item, false)}>Cancelar</Button></>}{["failed", "partial"].includes(item.status) && <Button disabled={busy} onClick={() => void act(item, true)}>Reintentar</Button>}</div>
      </article>)}</div>}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-white/50"><span>Página {page + 1} · hasta 100 publicaciones por página</span><div className="flex gap-2"><Button disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Anterior</Button><Button disabled={busy || (page + 1) * 100 >= (data?.total || 0)} onClick={() => setPage(page + 1)}>Siguiente</Button></div></div>
    </Panel>
    {editing && <div className="fixed inset-0 z-50 flex justify-end bg-black/70" ref={dialog} role="dialog" aria-modal="true" aria-label="Editar publicación" onKeyDown={(event) => { if (event.key === "Escape") setEditing(null) }}><div className="h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-[#101010] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Editar · {editing.task?.titulo}</h2><button autoFocus aria-label="Cerrar editor" onClick={() => setEditing(null)}><X className="h-5 w-5" /></button></div><ZernioPublishingPanel key={editing.id} taskId={editing.task_id} projectId={editing.project_id} socialCopy={editing.content} initialPublicationId={editing.id} onPublished={() => { setEditing(null); void load() }} /></div></div>}
  </div>
}
