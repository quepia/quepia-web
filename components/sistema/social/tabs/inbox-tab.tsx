"use client"

import { useEffect, useMemo, useState } from "react"
import { Bot, Lock, MessageCircle, MessagesSquare, Send, StickyNote, User } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { formatDateTime, paramsQuery, relativeAge, socialFetch, useSocialData, SocialApiError } from "../social-api"
import { Button, Empty, ErrorState, Loading, MetricTile, PLATFORM_LABEL, Select } from "../social-ui"
import type { TabProps } from "../social-module"

type ThreadRow = {
  id: string; kind: "dm" | "comment"; platform: string; participant_name: string | null; participant_username: string | null
  attention_status: string; assignee_id: string | null; pending_since: string | null; last_activity_at: string | null
  version: number; claimed_by: string | null; account_username: string | null; client_name: string; last_message: string | null
  post_caption: string | null; imported_as_historical: boolean
}
type ThreadDetail = {
  thread: ThreadRow & { account_id: string; project_id: string | null; external_thread_id: string; platform_post_id: string | null }
  account: { platform: string; username: string; is_active: boolean; needs_reconnection: boolean; permissions: string[] }
  client: { name: string }
  post: { permalink: string | null; caption_excerpt: string | null } | null
  projects: Array<{ id: string; name: string }>
  interactions: Array<{ id: string; external_id: string; direction: string; author_name: string | null; author_username: string | null; body: string | null; is_deleted: boolean; attachments: Array<{ type: string; original_type?: string }>; occurred_at: string; origin: string; sent_via: string | null; delivery_status: string | null; parent_external_id: string | null }>
  notes: Array<{ id: string; author_name: string; body: string; created_at: string }>
  events: Array<{ event: string; occurred_at: string }>
  outbox: Array<{ id: string; action_type: string; status: string; last_error: string | null; created_at: string }>
  assignable_admins: Array<{ id: string; name: string }>
}
type AttentionResult = { result: {
  pending_now: { threads: number; oldest_pending_minutes: number | null; unassigned: number }
  first_human_response_minutes: { median_wall: number | null; p90_wall: number | null; median_business: number | null; p90_business: number | null; within_target: number; target_minutes_business: number }
  first_automated_response_minutes: { median_wall: number | null; n: number }
  episodes_opened: number; episodes_with_human_response: number; episodes_answered_only_by_automation: number; episodes_first_answered_outside_quepia_unknown: number
  definitions: Record<string, string>
} }

const STATUS_LABEL: Record<string, string> = { new: "Nuevo", assigned: "Asignado", in_progress: "En atención", waiting: "Esperando respuesta", resolved: "Resuelto" }
const ORIGIN_LABEL: Record<string, string> = {
  contact: "Contacto", quepia_admin: "Admin (Quepia)", zernio_automation: "Automatización", zernio_human: "Humano en Zernio", external_unknown: "Autoría desconocida",
}

export function InboxTab({ scope }: TabProps) {
  const [status, setStatus] = useState("open")
  const [kind, setKind] = useState("")
  const [onlyMine, setOnlyMine] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const listParams = {
    ...scope,
    statuses: status === "open" ? ["new", "assigned", "in_progress", "waiting"] : status ? [status] : undefined,
    kinds: kind ? [kind] : undefined,
    only_mine: onlyMine,
  }
  delete (listParams as Record<string, unknown>).from
  delete (listParams as Record<string, unknown>).to
  const threads = useSocialData<{ threads: ThreadRow[] }>(`/api/admin/social/inbox?${paramsQuery(listParams)}`)
  const attention = useSocialData<AttentionResult>(`/api/admin/social/analytics?op=attention&${paramsQuery(scope)}`)
  const { reload } = threads

  useEffect(() => {
    const timer = setInterval(reload, 30_000)
    return () => clearInterval(timer)
  }, [reload])

  const sla = attention.data?.result
  return (
    <div className="space-y-3">
      {sla && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <MetricTile label="Pendientes ahora" value={sla.pending_now.threads} hint={`Más antiguo: ${sla.pending_now.oldest_pending_minutes ?? "—"} min`} />
          <MetricTile label="1ª resp. humana · mediana (h. laboral)" value={sla.first_human_response_minutes.median_business} hint={sla.definitions.human_response} />
          <MetricTile label="1ª resp. humana · p90 (h. laboral)" value={sla.first_human_response_minutes.p90_business} />
          <MetricTile label="Dentro del objetivo" value={`${sla.first_human_response_minutes.within_target}/${sla.episodes_with_human_response}`} hint={`Objetivo: ${sla.first_human_response_minutes.target_minutes_business} min laborales`} />
          <MetricTile label="Solo automatización" value={sla.episodes_answered_only_by_automation} hint="Atendidos por automatizaciones sin respuesta humana; se miden por separado." />
        </div>
      )}
      <div className="grid min-h-[560px] gap-3 lg:grid-cols-[320px_1fr_280px]">
        <aside className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <div className="flex flex-wrap gap-2 border-b border-white/[0.06] p-3">
            <Select label="Estado" value={status} onChange={(value) => { setStatus(value); setSelected(null) }} options={[
              { value: "open", label: "Abiertos" }, { value: "new", label: "Nuevos" }, { value: "waiting", label: "Esperando" },
              { value: "resolved", label: "Resueltos" }, { value: "", label: "Todos" },
            ]} />
            <Select label="Tipo" value={kind} onChange={(value) => { setKind(value); setSelected(null) }} options={[{ value: "", label: "DMs y comentarios" }, { value: "dm", label: "DMs" }, { value: "comment", label: "Comentarios" }]} />
            <label className="flex items-center gap-1.5 self-end pb-1.5 text-xs text-[#a3a3a3]">
              <input type="checkbox" checked={onlyMine} onChange={(event) => { setOnlyMine(event.target.checked); setSelected(null) }} /> Asignados a mí
            </label>
          </div>
          {threads.loading && !threads.data ? <Loading /> : <ErrorState error={threads.error} onRetry={threads.reload} />}
          {threads.data && threads.data.threads.length === 0 && <Empty>No hay hilos con estos filtros.</Empty>}
          <ul className="max-h-[640px] divide-y divide-white/[0.04] overflow-y-auto">
            {threads.data?.threads.map((thread) => (
              <li key={thread.id}>
                <button onClick={() => setSelected(thread.id)} className={cn("w-full px-3 py-2.5 text-left hover:bg-white/[0.03]", selected === thread.id && "bg-white/[0.05]")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-white/85">
                      {thread.kind === "dm" ? <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[#a3a3a3]" /> : <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-[#a3a3a3]" />}
                      {thread.participant_name || (thread.participant_username ? `@${thread.participant_username}` : "Participante")}
                    </span>
                    {thread.pending_since && <span className="shrink-0 text-[11px] text-amber-300">{relativeAge(thread.pending_since)}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[#a3a3a3]">{thread.last_message || thread.post_caption || "—"}</div>
                  <div className="mt-1 text-[11px] text-[#a3a3a3]">{thread.client_name} · @{thread.account_username} · {STATUS_LABEL[thread.attention_status]}{thread.claimed_by ? " · en respuesta" : ""}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        {selected ? <ThreadPanel key={selected} threadId={selected} onChanged={threads.reload} /> : (
          <div className="flex items-center justify-center rounded-lg border border-white/[0.08] text-sm text-[#a3a3a3] lg:col-span-2">Elegí un hilo para ver la conversación.</div>
        )}
      </div>
    </div>
  )
}

function ThreadPanel({ threadId, onChanged }: { threadId: string; onChanged: () => void }) {
  const detail = useSocialData<ThreadDetail>(`/api/admin/social/threads/${threadId}`)
  const [text, setText] = useState("")
  const [note, setNote] = useState("")
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SocialApiError | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const data = detail.data
  const lastInbound = useMemo(() => [...(data?.interactions ?? [])].reverse().find((item) => item.direction === "inbound"), [data])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      detail.reload()
      onChanged()
    } catch (failure) {
      setError(failure instanceof SocialApiError ? failure : new SocialApiError(0, "error", "Error"))
      if (failure instanceof SocialApiError && failure.code === "version_conflict") detail.reload()
    } finally {
      setBusy(false)
    }
  }

  if (detail.loading && !data) return <div className="lg:col-span-2"><Loading /></div>
  if (!data) return <div className="lg:col-span-2"><ErrorState error={detail.error} /></div>
  const thread = data.thread
  const canReply = data.account.is_active && !data.account.needs_reconnection
  const isComment = thread.kind === "comment"
  const privateAllowed = isComment && ["instagram", "facebook"].includes(data.account.platform)
  const send = (action: string) => act(async () => {
    await socialFetch(`/api/admin/social/threads/${threadId}/replies`, { method: "POST", json: {
      expected_version: thread.version, action, text, reply_to: replyTo ?? lastInbound?.external_id ?? null, request_id: requestId,
    } })
    setText("")
    setRequestId(crypto.randomUUID())
  })
  const update = (changes: Record<string, unknown>) => act(() => socialFetch(`/api/admin/social/threads/${threadId}`, { method: "PATCH", json: { expected_version: thread.version, changes } }))

  return (
    <>
      <section className="flex flex-col rounded-lg border border-white/[0.08] bg-white/[0.02]">
        <header className="border-b border-white/[0.06] px-4 py-3">
          <div className="text-sm text-white/85">{thread.participant_name || `@${thread.participant_username ?? "participante"}`}</div>
          <div className="text-xs text-[#a3a3a3]">{isComment ? "Comentarios públicos" : "Mensajes directos"} · {data.client.name} · {PLATFORM_LABEL[data.account.platform]} @{data.account.username}</div>
          {data.post?.caption_excerpt && <div className="mt-1 truncate text-xs text-[#a3a3a3]">Publicación: {data.post.caption_excerpt}</div>}
        </header>
        <ol className="flex-1 space-y-2 overflow-y-auto p-4" aria-label="Conversación">
          {data.interactions.map((item) => (
            <li key={item.id} className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", item.direction === "inbound" ? "bg-white/[0.05]" : "ml-auto bg-[#159e9b]/15")}>
              <div className="mb-0.5 flex items-center gap-1 text-[11px] text-[#a3a3a3]">
                {item.origin === "zernio_automation" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                {item.direction === "inbound" ? (item.author_name || `@${item.author_username ?? "contacto"}`) : ORIGIN_LABEL[item.origin]}
                · {formatDateTime(item.occurred_at)}{item.delivery_status ? ` · ${item.delivery_status}` : ""}
              </div>
              {item.is_deleted ? <em className="text-[#a3a3a3]">Mensaje eliminado por el remitente</em> : <p className="whitespace-pre-wrap text-white/85">{item.body}</p>}
              {item.attachments.length > 0 && <div className="mt-1 text-[11px] text-[#a3a3a3]">Adjuntos: {item.attachments.map((attachment) => attachment.original_type || attachment.type).join(", ")}</div>}
              {isComment && item.direction === "inbound" && (
                <button onClick={() => setReplyTo(item.external_id)} className={cn("mt-1 text-[11px] underline", replyTo === item.external_id ? "text-white" : "text-[#a3a3a3]")}>Responder a este</button>
              )}
            </li>
          ))}
        </ol>
        <div className="border-t border-white/[0.06] p-3">
          <div className="mb-1 text-[11px] text-[#a3a3a3]">
            Responde como <strong className="text-white/70">@{data.account.username}</strong> ({PLATFORM_LABEL[data.account.platform]}).{" "}
            {!canReply && <span className="text-red-300">La cuenta necesita reconexión: no se puede responder.</span>}
          </div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={3} placeholder={isComment ? "Respuesta pública o privada…" : "Mensaje directo…"}
            className="w-full resize-none rounded-md border border-white/10 bg-[#141414] p-2 text-sm text-white/85 outline-none focus:border-white/25" />
          <div className="mt-2 flex flex-wrap gap-2">
            {!isComment && <Button variant="primary" disabled={busy || !text.trim() || !canReply} onClick={() => send("send_dm")}><Send className="h-4 w-4" /> Enviar DM</Button>}
            {isComment && <Button variant="primary" disabled={busy || !text.trim() || !canReply} onClick={() => send("reply_comment")}><Send className="h-4 w-4" /> Responder en público</Button>}
            {privateAllowed && <Button disabled={busy || !text.trim() || !canReply} onClick={() => send("private_reply")} title="Una sola vez por comentario, dentro de 7 días">
              <Lock className="h-4 w-4" /> Responder en privado</Button>}
          </div>
          {data.outbox.filter((item) => item.status !== "sent").map((item) => (
            <p key={item.id} className={cn("mt-2 text-xs", item.status === "failed" ? "text-red-300" : "text-amber-300")}>
              {item.status === "ambiguous" ? "Envío sin confirmar: se está conciliando con Zernio antes de permitir reenviar." : item.status === "failed" ? `No enviado: ${item.last_error}` : "Enviando…"}
            </p>
          ))}
          <ErrorState error={error} />
        </div>
      </section>
      <aside className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
        <Select label="Estado de atención" value={thread.attention_status} onChange={(value) => update({ status: value })}
          options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select label="Responsable (solo admins globales)" value={thread.assignee_id ?? ""} onChange={(value) => update({ assignee_id: value || null })}
          options={[{ value: "", label: "Sin asignar" }, ...data.assignable_admins.map((admin) => ({ value: admin.id, label: admin.name }))]} />
        <Select label="Proyecto (opcional)" value={thread.project_id ?? ""} onChange={(value) => update({ project_id: value || null })}
          options={[{ value: "", label: "Sin proyecto" }, ...data.projects.map((project) => ({ value: project.id, label: project.name }))]} />
        {thread.pending_since && <p className="text-xs text-amber-300">Sin responder desde {formatDateTime(thread.pending_since)}</p>}
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs text-[#a3a3a3]"><StickyNote className="h-3.5 w-3.5" /> Notas internas (no se envían al cliente ni a la IA)</div>
          <ul className="mb-2 max-h-48 space-y-1.5 overflow-y-auto">
            {data.notes.map((item) => (
              <li key={item.id} className="rounded-md bg-amber-400/[0.06] px-2 py-1.5 text-xs text-white/75">
                <div className="text-[10px] text-[#a3a3a3]">{item.author_name} · {formatDateTime(item.created_at)}</div>{item.body}
              </li>
            ))}
          </ul>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={5000} placeholder="Nota interna…"
            className="w-full resize-none rounded-md border border-white/10 bg-[#141414] p-2 text-xs text-white/85 outline-none" />
          <Button disabled={busy || !note.trim()} onClick={() => act(async () => {
            await socialFetch(`/api/admin/social/threads/${threadId}/notes`, { method: "POST", json: { body: note } })
            setNote("")
          })}>Guardar nota</Button>
        </div>
        <details className="text-xs text-[#a3a3a3]">
          <summary className="cursor-pointer">Historial de atención</summary>
          <ul className="mt-1 space-y-0.5">{data.events.map((event, index) => <li key={index}>{formatDateTime(event.occurred_at)} · {event.event}</li>)}</ul>
        </details>
      </aside>
    </>
  )
}
