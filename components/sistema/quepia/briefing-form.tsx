"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  X,
  Save,
  CheckCircle,
  Target,
  Users,
  MessageCircle,
  Link2,
  DollarSign,
  Calendar,
  Megaphone,
  Palette,
  Globe,
  FileText,
  ToggleLeft,
  ToggleRight,
  Clock,
  Loader2,
} from "lucide-react"

interface BriefingData {
  project_type: string
  objectives: string
  target_audience: string
  tone_of_voice: string
  references: string
  budget?: string
  timeline?: string
  includes_ads?: boolean
  ad_budget?: string
  platforms?: string[]
  keep_existing_brand?: boolean
  existing_elements?: string
  content_frequency?: string
  key_messages?: string
}

interface BriefingFormProps {
  projectId: string
  projectType?: string
  initialData?: BriefingData | null
  isOpen: boolean
  onClose: () => void
  onSave: (data: BriefingData) => void
}

const PROJECT_TYPES = [
  { value: "campana_redes", label: "Campana de Redes", icon: Megaphone },
  { value: "rebranding", label: "Rebranding", icon: Palette },
  { value: "web_corporativa", label: "Web Corporativa", icon: Globe },
  { value: "contenido_marca", label: "Contenido de Marca", icon: FileText },
  { value: "otro", label: "Otro", icon: Target },
]

const PLATFORM_OPTIONS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "LinkedIn",
  "X (Twitter)",
  "YouTube",
  "Pinterest",
]

const FREQUENCY_OPTIONS = [
  "Diario",
  "3 veces por semana",
  "Semanal",
  "Quincenal",
  "Mensual",
]

const EMPTY_FORM: BriefingData = {
  project_type: "",
  objectives: "",
  target_audience: "",
  tone_of_voice: "",
  references: "",
  budget: "",
  timeline: "",
  includes_ads: false,
  ad_budget: "",
  platforms: [],
  keep_existing_brand: false,
  existing_elements: "",
  content_frequency: "",
  key_messages: "",
}

export function BriefingForm({ projectId, projectType, initialData, isOpen, onClose, onSave }: BriefingFormProps) {
  const [form, setForm] = useState<BriefingData>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const draftBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const storageKey = `briefing_draft_${projectId}`

  // Restore draft or initial data on mount
  useEffect(() => {
    if (!isOpen) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as BriefingData
        setForm(parsed)
      } else if (initialData) {
        setForm(initialData)
      } else {
        setForm({ ...EMPTY_FORM, project_type: projectType || "" })
      }
    } catch {
      if (initialData) {
        setForm(initialData)
      } else {
        setForm({ ...EMPTY_FORM, project_type: projectType || "" })
      }
    }
  }, [isOpen, projectId, projectType, storageKey, initialData])

  // Auto-save every 10 seconds
  useEffect(() => {
    if (!isOpen) return

    draftTimerRef.current = setInterval(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(form))
        setDraftSaved(true)
        draftBadgeTimerRef.current = setTimeout(() => setDraftSaved(false), 3000)
      } catch {
        // localStorage full or unavailable
      }
    }, 10000)

    return () => {
      if (draftTimerRef.current) clearInterval(draftTimerRef.current)
      if (draftBadgeTimerRef.current) clearTimeout(draftBadgeTimerRef.current)
    }
  }, [isOpen, form, storageKey])

  const updateField = useCallback(<K extends keyof BriefingData>(key: K, value: BriefingData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const togglePlatform = useCallback((platform: string) => {
    setForm((prev) => {
      const current = prev.platforms || []
      const next = current.includes(platform)
        ? current.filter((p) => p !== platform)
        : [...current, platform]
      return { ...prev, platforms: next }
    })
  }, [])

  const handleSubmit = async () => {
    setSaving(true)
    try {
      onSave(form)
      localStorage.removeItem(storageKey)
    } finally {
      setSaving(false)
    }
  }

  const selectedType = form.project_type

  const showCampaignFields = selectedType === "campana_redes"
  const showRebrandingFields = selectedType === "rebranding"
  const showContentFields = selectedType === "contenido_marca" || selectedType === "campana_redes"

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-quepia-cyan" />
            <h2 className="text-base font-semibold text-white">Brief del Proyecto</h2>
            {draftSaved && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-quepia-cyan/10 border border-quepia-cyan/20 text-[11px] text-quepia-cyan animate-in fade-in">
                <CheckCircle className="w-3 h-3" />
                Borrador guardado
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Project Type Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              Tipo de Proyecto
            </label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {PROJECT_TYPES.map((type) => {
                const Icon = type.icon
                const active = selectedType === type.value
                return (
                  <button
                    key={type.value}
                    onClick={() => updateField("project_type", type.value)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-xs transition-all ${
                      active
                        ? "bg-quepia-cyan/10 border-quepia-cyan/40 text-quepia-cyan"
                        : "bg-[#1a1a1a] border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-center leading-tight">{type.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Common Fields */}
          <FormTextArea
            icon={<Target className="w-4 h-4" />}
            label="Objetivos del proyecto"
            placeholder="Describir los objetivos principales..."
            value={form.objectives}
            onChange={(v) => updateField("objectives", v)}
          />

          <FormTextArea
            icon={<Users className="w-4 h-4" />}
            label="Publico objetivo"
            placeholder="Describir el publico al que apunta..."
            value={form.target_audience}
            onChange={(v) => updateField("target_audience", v)}
          />

          <FormTextArea
            icon={<MessageCircle className="w-4 h-4" />}
            label="Tono de comunicacion"
            placeholder="Formal, casual, tecnico, cercano..."
            value={form.tone_of_voice}
            onChange={(v) => updateField("tone_of_voice", v)}
          />

          <FormTextArea
            icon={<Link2 className="w-4 h-4" />}
            label="Referencias"
            placeholder="Links, marcas, estilos de referencia..."
            value={form.references}
            onChange={(v) => updateField("references", v)}
          />

          <FormTextArea
            icon={<Megaphone className="w-4 h-4" />}
            label="Mensajes clave"
            placeholder="Ideas o mensajes principales a comunicar..."
            value={form.key_messages || ""}
            onChange={(v) => updateField("key_messages", v)}
          />

          {/* Campaign-specific fields */}
          {showCampaignFields && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Plataformas
                </label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_OPTIONS.map((platform) => {
                    const active = (form.platforms || []).includes(platform)
                    return (
                      <button
                        key={platform}
                        onClick={() => togglePlatform(platform)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                          active
                            ? "bg-quepia-cyan/10 border-quepia-cyan/40 text-quepia-cyan"
                            : "bg-[#1a1a1a] border-white/10 text-white/50 hover:border-white/20"
                        }`}
                      >
                        {platform}
                      </button>
                    )
                  })}
                </div>
              </div>

              <ToggleField
                label="Incluye pauta publicitaria?"
                value={!!form.includes_ads}
                onChange={(v) => updateField("includes_ads", v)}
              />

              {form.includes_ads && (
                <FormInput
                  icon={<DollarSign className="w-4 h-4" />}
                  label="Presupuesto de pauta"
                  placeholder="Ej: $50.000 ARS mensuales"
                  value={form.ad_budget || ""}
                  onChange={(v) => updateField("ad_budget", v)}
                />
              )}
            </>
          )}

          {/* Content frequency (campaigns + content) */}
          {showContentFields && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-white/30" />
                Frecuencia de contenido
              </label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCY_OPTIONS.map((freq) => {
                  const active = form.content_frequency === freq
                  return (
                    <button
                      key={freq}
                      onClick={() => updateField("content_frequency", freq)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                        active
                          ? "bg-quepia-cyan/10 border-quepia-cyan/40 text-quepia-cyan"
                          : "bg-[#1a1a1a] border-white/10 text-white/50 hover:border-white/20"
                      }`}
                    >
                      {freq}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Rebranding-specific fields */}
          {showRebrandingFields && (
            <>
              <ToggleField
                label="Mantener elementos de marca existente?"
                value={!!form.keep_existing_brand}
                onChange={(v) => updateField("keep_existing_brand", v)}
              />

              {form.keep_existing_brand && (
                <FormTextArea
                  icon={<Palette className="w-4 h-4" />}
                  label="Elementos a mantener"
                  placeholder="Logo, colores, tipografia, etc..."
                  value={form.existing_elements || ""}
                  onChange={(v) => updateField("existing_elements", v)}
                />
              )}
            </>
          )}

          {/* Budget & Timeline (all types) */}
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              icon={<DollarSign className="w-4 h-4" />}
              label="Presupuesto"
              placeholder="Ej: $200.000"
              value={form.budget || ""}
              onChange={(v) => updateField("budget", v)}
            />
            <FormInput
              icon={<Calendar className="w-4 h-4" />}
              label="Plazo estimado"
              placeholder="Ej: 3 semanas"
              value={form.timeline || ""}
              onChange={(v) => updateField("timeline", v)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-md bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.project_type}
            className="flex items-center gap-2 px-4 py-2 text-xs rounded-md bg-quepia-cyan text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar Brief
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Reusable sub-components ---

function FormTextArea({
  icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
        <span className="text-white/30">{icon}</span>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-sm rounded-lg bg-[#1a1a1a] border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-quepia-cyan/50 resize-none"
      />
    </div>
  )
}

function FormInput({
  icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
        <span className="text-white/30">{icon}</span>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg bg-[#1a1a1a] border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-quepia-cyan/50"
      />
    </div>
  )
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full px-4 py-3 rounded-lg bg-[#1a1a1a] border border-white/10 hover:border-white/20 transition-colors"
    >
      <span className="text-xs text-white/70">{label}</span>
      {value ? (
        <ToggleRight className="w-5 h-5 text-quepia-cyan" />
      ) : (
        <ToggleLeft className="w-5 h-5 text-white/30" />
      )}
    </button>
  )
}
