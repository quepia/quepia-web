"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Check, ChevronLeft, Loader2, MessageSquareText, Sparkles, Table2, X } from "lucide-react"

export interface ImportedEvent {
  date: string
  pillar: string
  format: string
  topic: string
  copy_suggestion: string
}

interface AICalendarModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (events: ImportedEvent[]) => void
  projectName?: string
}

const PLATFORMS = ["Instagram", "TikTok", "LinkedIn", "Twitter"] as const
const FREQUENCIES = [2, 3, 4, 5, 7] as const
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

export default function AICalendarModal({ isOpen, onClose, onImport, projectName }: AICalendarModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [industry, setIndustry] = useState("")
  const [month, setMonth] = useState(new Date().getMonth())
  const [pillars, setPillars] = useState("")
  const [postsPerWeek, setPostsPerWeek] = useState(3)
  const [platforms, setPlatforms] = useState<string[]>(["Instagram"])
  const [editablePrompt, setEditablePrompt] = useState("")
  const [events, setEvents] = useState<ImportedEvent[]>([])
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [editingCell, setEditingCell] = useState<{ row: number; col: keyof ImportedEvent } | null>(null)

  const generatedPrompt = useMemo(() => {
    const year = new Date().getFullYear()
    return [
      `Generá un calendario de contenido para ${MONTHS[month]} ${year} para una marca del rubro "${industry || "por definir"}".`,
      `Plataformas: ${platforms.join(", ") || "por definir"}.`,
      `Frecuencia: exactamente ${postsPerWeek} publicaciones por semana, distribuidas de forma equilibrada.`,
      `Pilares o temas: ${pillars || "proponelos según la industria"}.`,
      projectName ? `Proyecto: ${projectName}.` : "",
      "Cada publicación debe incluir fecha, pilar, formato, tema concreto y una sugerencia de copy.",
    ].filter(Boolean).join("\n")
  }, [industry, month, pillars, postsPerWeek, platforms, projectName])

  useEffect(() => setEditablePrompt(generatedPrompt), [generatedPrompt])
  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setEvents([])
      setFeedback("")
      setError("")
      setGenerating(false)
    }
  }, [isOpen])

  const togglePlatform = (platform: string) => {
    setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform])
  }

  const generateCalendar = async (isRevision = false) => {
    setGenerating(true)
    setError("")
    try {
      const response = await fetch("/api/ai/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: editablePrompt,
          ...(isRevision ? { feedback, events } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "No se pudo generar el calendario")
      if (!Array.isArray(data?.events) || data.events.length === 0) throw new Error("La IA no devolvió publicaciones")
      setEvents(data.events)
      setFeedback("")
      setStep(2)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo generar el calendario")
    } finally {
      setGenerating(false)
    }
  }

  const editCell = (row: number, col: keyof ImportedEvent, value: string) => {
    setEvents((current) => current.map((event, index) => index === row ? { ...event, [col]: value } : event))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={generating ? undefined : onClose} />
      <div className="relative z-50 flex h-[100svh] w-full flex-col rounded-t-2xl bg-[#1a1a1a] shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-xl sm:border sm:border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-quepia-cyan" />
            <h2 className="text-lg font-semibold text-white">Calendario con IA</h2>
            <span className="ml-2 text-xs text-white/40">Paso {step} de 2</span>
          </div>
          <button onClick={onClose} disabled={generating} className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-1 px-4 pt-4 sm:px-6">
          {[1, 2].map((item) => <div key={item} className={`h-1 flex-1 rounded-full ${item <= step ? "bg-quepia-cyan" : "bg-white/10"}`} />)}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Industria / Rubro"><input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Ej: Gastronomía, Moda, Tech..." className="input-ai" /></Field>
                <Field label="Mes"><select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-ai">{MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></Field>
              </div>
              <Field label="Pilares / Temas"><input value={pillars} onChange={(e) => setPillars(e.target.value)} placeholder="Ej: Educativo, Entretenimiento, Producto, Testimonios" className="input-ai" /></Field>
              <Field label="Frecuencia">
                <div className="flex flex-wrap items-center gap-2">
                  {FREQUENCIES.map((value) => <button key={value} type="button" onClick={() => setPostsPerWeek(value)} className={`rounded-lg border px-3 py-1.5 text-sm ${postsPerWeek === value ? "border-quepia-cyan bg-quepia-cyan/10 text-quepia-cyan" : "border-white/10 bg-[#0a0a0a] text-white/50"}`}>{value} por semana</button>)}
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-1.5 text-sm text-white/60">Personalizado<input type="number" min={1} max={7} value={postsPerWeek} onChange={(e) => setPostsPerWeek(Math.min(7, Math.max(1, Number(e.target.value))))} className="w-10 bg-transparent text-center text-white outline-none" /></label>
                </div>
              </Field>
              <Field label="Plataformas"><div className="flex flex-wrap gap-2">{PLATFORMS.map((platform) => <button key={platform} type="button" onClick={() => togglePlatform(platform)} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${platforms.includes(platform) ? "border-quepia-cyan bg-quepia-cyan/10 text-quepia-cyan" : "border-white/10 bg-[#0a0a0a] text-white/50"}`}><span className={`flex h-4 w-4 items-center justify-center rounded border ${platforms.includes(platform) ? "border-quepia-cyan bg-quepia-cyan" : "border-white/30"}`}>{platforms.includes(platform) && <Check className="h-3 w-3 text-black" />}</span>{platform}</button>)}</div></Field>
              <Field label="Brief para la IA (editable)"><textarea value={editablePrompt} onChange={(e) => setEditablePrompt(e.target.value)} rows={7} className="input-ai resize-none font-mono" /></Field>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-white/70"><Table2 className="h-4 w-4" /><span className="text-sm font-medium">Vista previa — {events.length} publicaciones</span><span className="text-xs text-white/35">Hacé clic en una celda para editarla</span></div>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[850px] text-sm">
                  <thead><tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">{["Fecha", "Pilar", "Formato", "Tema", "Copy"].map((title) => <th key={title} className="px-3 py-2">{title}</th>)}</tr></thead>
                  <tbody>{events.map((event, row) => <tr key={`${event.date}-${row}`} className="border-b border-white/5 hover:bg-white/5">{(["date", "pillar", "format", "topic", "copy_suggestion"] as const).map((col) => <td key={col} onClick={() => setEditingCell({ row, col })} className="cursor-text px-3 py-2 text-white/80">{editingCell?.row === row && editingCell.col === col ? <input autoFocus value={event[col]} onChange={(e) => editCell(row, col, e.target.value)} onBlur={() => setEditingCell(null)} onKeyDown={(e) => e.key === "Enter" && setEditingCell(null)} className="w-full rounded border border-quepia-cyan/50 bg-[#0a0a0a] px-1.5 py-0.5 text-white outline-none" /> : <span className="block max-w-[230px] truncate">{event[col]}</span>}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="rounded-xl border border-quepia-cyan/20 bg-quepia-cyan/[0.04] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80"><MessageSquareText className="h-4 w-4 text-quepia-cyan" />¿Qué querés cambiar?</div>
                <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Ej: Usá un tono más cercano, cambiá los reels de los viernes por carruseles y sumá dos ideas sobre testimonios..." className="input-ai resize-none" />
                <div className="mt-3 flex justify-end"><button onClick={() => generateCalendar(true)} disabled={!feedback.trim() || generating} className="flex items-center gap-2 rounded-lg border border-quepia-cyan/40 bg-quepia-cyan/10 px-4 py-2 text-sm font-medium text-quepia-cyan hover:bg-quepia-cyan/20 disabled:cursor-not-allowed disabled:opacity-40">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Aplicar cambios con IA</button></div>
              </div>
            </div>
          )}
          {error && <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-4 sm:px-6">
          <div>{step === 2 && <button onClick={() => setStep(1)} disabled={generating} className="flex items-center gap-1 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Brief</button>}</div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={generating} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white disabled:opacity-40">Cancelar</button>
            {step === 1 ? <button onClick={() => generateCalendar()} disabled={!editablePrompt.trim() || platforms.length === 0 || generating} className="flex items-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-quepia-cyan/90 disabled:cursor-not-allowed disabled:opacity-40">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? "Generando..." : "Generar calendario"}</button> : <button onClick={() => onImport(events)} disabled={generating || events.length === 0} className="flex items-center gap-1 rounded-lg bg-quepia-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-quepia-cyan/90 disabled:opacity-40"><Check className="h-4 w-4" />Importar calendario</button>}
          </div>
        </div>
      </div>
      <style jsx>{`.input-ai { width: 100%; border-radius: .5rem; border: 1px solid rgb(255 255 255 / .1); background: #0a0a0a; padding: .625rem .75rem; font-size: .875rem; color: rgb(255 255 255 / .85); outline: none; } .input-ai:focus { border-color: var(--quepia-cyan, #2dd4d7); box-shadow: 0 0 0 1px rgb(45 212 215 / .35); } .input-ai::placeholder { color: rgb(255 255 255 / .25); }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-sm font-medium text-white/70">{label}</label>{children}</div>
}
