"use client"

import React, { useState, useMemo, useEffect } from "react"
import {
  Sparkles,
  ExternalLink,
  ClipboardPaste,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Table2,
} from "lucide-react"

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
const FREQUENCIES = [
  { label: "3 por semana", value: "3/week" },
  { label: "5 por semana", value: "5/week" },
  { label: "Diario", value: "daily" },
] as const

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const JSON_PLACEHOLDER = `[
  {
    "date": "2024-01-15",
    "pillar": "Educativo",
    "format": "Carrusel",
    "topic": "5 tips para...",
    "copy_suggestion": "¿Sabías que...?"
  }
]`

export default function AICalendarModal({
  isOpen,
  onClose,
  onImport,
  projectName,
}: AICalendarModalProps) {
  const [step, setStep] = useState(1)

  // Step 1 state
  const [industry, setIndustry] = useState("")
  const [month, setMonth] = useState(new Date().getMonth())
  const [pillars, setPillars] = useState("")
  const [frequency, setFrequency] = useState<string>("3/week")
  const [platforms, setPlatforms] = useState<string[]>(["Instagram"])
  const [editablePrompt, setEditablePrompt] = useState("")

  // Step 2 state
  const [jsonInput, setJsonInput] = useState("")
  const [jsonError, setJsonError] = useState("")

  // Step 3 state
  const [events, setEvents] = useState<ImportedEvent[]>([])
  const [editingCell, setEditingCell] = useState<{ row: number; col: keyof ImportedEvent } | null>(null)

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setJsonInput("")
      setJsonError("")
      setEvents([])
    }
  }, [isOpen])

  const generatedPrompt = useMemo(() => {
    const year = new Date().getFullYear()
    const platformList = platforms.join(", ")
    const freqLabel = FREQUENCIES.find((f) => f.value === frequency)?.label ?? frequency
    return `Generá un calendario de contenido para ${MONTHS[month]} ${year} para una marca del rubro "${industry || "..."}".\n\nPlataformas: ${platformList}\nFrecuencia: ${freqLabel}\nPilares/temas: ${pillars || "..."}\n${projectName ? `Proyecto: ${projectName}\n` : ""}\nDevolvé SOLO un JSON válido (sin markdown, sin explicación) con este formato exacto:\n[\n  {\n    "date": "YYYY-MM-DD",\n    "pillar": "nombre del pilar",\n    "format": "Carrusel|Reel|Post|Story",\n    "topic": "título del contenido",\n    "copy_suggestion": "sugerencia de copy"\n  }\n]`
  }, [industry, month, pillars, frequency, platforms, projectName])

  // Sync generated prompt into editable field when inputs change
  useEffect(() => {
    setEditablePrompt(generatedPrompt)
  }, [generatedPrompt])

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  const handleOpenGemini = () => {
    window.open(
      `https://gemini.google.com/app?q=${encodeURIComponent(editablePrompt)}`,
      "_blank"
    )
  }

  const handleValidateJSON = () => {
    setJsonError("")
    try {
      const parsed = JSON.parse(jsonInput)
      if (!Array.isArray(parsed)) {
        setJsonError("El JSON debe ser un array de objetos.")
        return
      }
      const required = ["date", "pillar", "format", "topic", "copy_suggestion"]
      for (let i = 0; i < parsed.length; i++) {
        for (const key of required) {
          if (typeof parsed[i][key] !== "string") {
            setJsonError(`Objeto #${i + 1}: falta o es inválido el campo "${key}".`)
            return
          }
        }
      }
      setEvents(parsed as ImportedEvent[])
      setStep(3)
    } catch {
      setJsonError("JSON inválido. Asegurate de pegar solo el JSON sin texto adicional.")
    }
  }

  const handleCellEdit = (row: number, col: keyof ImportedEvent, value: string) => {
    setEvents((prev) => {
      const copy = [...prev]
      copy[row] = { ...copy[row], [col]: value }
      return copy
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-50 w-full h-[100svh] sm:h-auto sm:max-w-3xl sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-xl border-0 sm:border sm:border-white/10 bg-[#1a1a1a] shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-quepia-cyan" />
            <h2 className="text-lg font-semibold text-white">
              Calendario con IA
            </h2>
            <span className="ml-2 text-xs text-white/40">
              Paso {step} de 3
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 px-4 sm:px-6 pt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                s <= step ? "bg-quepia-cyan" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {/* ── Step 1: Prompt Builder ── */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Industry */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white/70">
                    Industria / Rubro
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="Ej: Gastronomía, Moda, Tech..."
                    className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-quepia-cyan focus:outline-none focus:ring-1 focus:ring-quepia-cyan/50 transition-colors"
                  />
                </div>

                {/* Month */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white/70">Mes</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:border-quepia-cyan focus:outline-none focus:ring-1 focus:ring-quepia-cyan/50 transition-colors"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pillars */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70">
                  Pilares / Temas
                </label>
                <input
                  type="text"
                  value={pillars}
                  onChange={(e) => setPillars(e.target.value)}
                  placeholder="Ej: Educativo, Entretenimiento, Producto, Testimonios"
                  className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-quepia-cyan focus:outline-none focus:ring-1 focus:ring-quepia-cyan/50 transition-colors"
                />
              </div>

              {/* Frequency */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70">
                  Frecuencia
                </label>
                <div className="flex gap-2">
                  {FREQUENCIES.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFrequency(f.value)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        frequency === f.value
                          ? "border-quepia-cyan bg-quepia-cyan/10 text-quepia-cyan"
                          : "border-white/10 bg-[#0a0a0a] text-white/50 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Platforms */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70">
                  Plataformas
                </label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <label
                      key={p}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        platforms.includes(p)
                          ? "border-quepia-cyan bg-quepia-cyan/10 text-quepia-cyan"
                          : "border-white/10 bg-[#0a0a0a] text-white/50 hover:text-white hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={platforms.includes(p)}
                        onChange={() => togglePlatform(p)}
                        className="sr-only"
                      />
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          platforms.includes(p)
                            ? "border-quepia-cyan bg-quepia-cyan"
                            : "border-white/30 bg-transparent"
                        }`}
                      >
                        {platforms.includes(p) && <Check className="h-3 w-3 text-black" />}
                      </div>
                      {p}
                    </label>
                  ))}
                </div>
              </div>

              {/* Generated Prompt */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70">
                  Prompt generado (editable)
                </label>
                <textarea
                  value={editablePrompt}
                  onChange={(e) => setEditablePrompt(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-white/80 font-mono focus:border-quepia-cyan focus:outline-none focus:ring-1 focus:ring-quepia-cyan/50 transition-colors resize-none"
                />
              </div>

              {/* Open in Gemini */}
              <button
                onClick={handleOpenGemini}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-quepia-cyan/90"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir en Gemini
              </button>

              {/* Instructions */}
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/50">
                <p className="font-medium text-white/70 mb-1">Instrucciones:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Copia el resultado de Gemini</li>
                  <li>Pégalo aquí abajo</li>
                </ol>
              </div>
            </div>
          )}

          {/* ── Step 2: JSON Import ── */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center gap-2 text-white/70">
                <ClipboardPaste className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Pegá el JSON generado por Gemini
                </span>
              </div>

              <textarea
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value)
                  setJsonError("")
                }}
                rows={12}
                placeholder={JSON_PLACEHOLDER}
                className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-white/80 font-mono placeholder:text-white/20 focus:border-quepia-cyan focus:outline-none focus:ring-1 focus:ring-quepia-cyan/50 transition-colors resize-none"
              />

              {jsonError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {jsonError}
                </div>
              )}

              <button
                onClick={handleValidateJSON}
                disabled={!jsonInput.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-quepia-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="h-4 w-4" />
                Validar JSON
              </button>
            </div>
          )}

          {/* ── Step 3: Preview & Confirm ── */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center gap-2 text-white/70">
                <Table2 className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Vista previa — {events.length} publicaciones
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Pilar</th>
                      <th className="px-3 py-2">Formato</th>
                      <th className="px-3 py-2">Tema</th>
                      <th className="px-3 py-2">Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        {(
                          ["date", "pillar", "format", "topic", "copy_suggestion"] as const
                        ).map((col) => (
                          <td
                            key={col}
                            className="px-3 py-2 text-white/80 cursor-text"
                            onClick={() => setEditingCell({ row: i, col })}
                          >
                            {editingCell?.row === i && editingCell.col === col ? (
                              <input
                                autoFocus
                                type="text"
                                value={ev[col]}
                                onChange={(e) =>
                                  handleCellEdit(i, col, e.target.value)
                                }
                                onBlur={() => setEditingCell(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") setEditingCell(null)
                                }}
                                className="w-full bg-[#0a0a0a] border border-quepia-cyan/50 rounded px-1.5 py-0.5 text-sm text-white focus:outline-none"
                              />
                            ) : (
                              <span className="block truncate max-w-[180px]">
                                {ev[col]}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
            >
              Cancelar
            </button>

            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 rounded-lg bg-quepia-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-quepia-cyan/90 transition-colors"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {step === 3 && (
              <button
                onClick={() => onImport(events)}
                className="flex items-center gap-1 rounded-lg bg-quepia-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-quepia-cyan/90 transition-colors"
              >
                <Check className="h-4 w-4" />
                Importar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
