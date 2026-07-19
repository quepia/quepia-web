"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import {
  AlertCircle,
  Check,
  CheckCircle,
  Copy,
  FileImage,
  FileText,
  Link2,
  Loader2,
  Megaphone,
  Palette,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { createClient } from "@/lib/sistema/supabase/client"
import type { BriefColor, BriefReference } from "@/types/sistema"

export interface BriefingData {
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
  brand_name?: string
  industry?: string
  brand_description?: string
  value_proposition?: string
  brand_personality?: string[]
  visual_style_keywords?: string[]
  color_palette?: BriefColor[]
  typography?: string
  logo_storage_path?: string
  logo_file_name?: string
  image_direction?: string
  photography_style?: string
  composition_guidelines?: string
  must_include?: string
  avoid_elements?: string
  reference_links?: BriefReference[]
  output_formats?: string[]
  ai_generation_notes?: string
}

interface BriefingFormProps {
  projectId: string
  projectType?: string
  initialData?: BriefingData | null
  isOpen: boolean
  onClose: () => void
  onSave: (data: BriefingData) => Promise<boolean | void> | boolean | void
}

const PROJECT_TYPES = [
  ["campana_redes", "Campaña de redes"],
  ["rebranding", "Rebranding"],
  ["web_corporativa", "Web corporativa"],
  ["contenido_marca", "Contenido de marca"],
  ["otro", "Otro"],
] as const

const PERSONALITY_OPTIONS = ["Cercana", "Audaz", "Elegante", "Innovadora", "Humana", "Premium", "Minimalista", "Divertida"]
const STYLE_OPTIONS = ["Editorial", "Minimalista", "Orgánico", "Tecnológico", "Retro", "Cinematográfico", "3D", "Ilustrado"]
const OUTPUT_OPTIONS = ["Post 1:1", "Story 9:16", "Horizontal 16:9", "Banner web", "Impresión", "Fondo transparente"]
const PLATFORM_OPTIONS = ["Instagram", "Facebook", "TikTok", "LinkedIn", "X", "YouTube", "Pinterest"]
const STEPS = [
  { id: "context", label: "Contexto", icon: Target },
  { id: "brand", label: "Marca", icon: FileImage },
  { id: "visual", label: "Dirección visual", icon: Palette },
  { id: "delivery", label: "Entregables", icon: Megaphone },
  { id: "ai", label: "Contexto IA", icon: Sparkles },
] as const

type StepId = (typeof STEPS)[number]["id"]

const EMPTY_FORM: BriefingData = {
  project_type: "", objectives: "", target_audience: "", tone_of_voice: "", references: "",
  budget: "", timeline: "", includes_ads: false, ad_budget: "", platforms: [],
  keep_existing_brand: false, existing_elements: "", content_frequency: "", key_messages: "",
  brand_name: "", industry: "", brand_description: "", value_proposition: "", brand_personality: [],
  visual_style_keywords: [], color_palette: [{ name: "Principal", hex: "#22D3D1", usage: "Color dominante" }],
  typography: "", logo_storage_path: "", logo_file_name: "", image_direction: "", photography_style: "",
  composition_guidelines: "", must_include: "", avoid_elements: "", reference_links: [{ url: "", note: "" }],
  output_formats: [], ai_generation_notes: "",
}

export function BriefingForm({ projectId, projectType, initialData, isOpen, onClose, onSave }: BriefingFormProps) {
  const [form, setForm] = useState<BriefingData>({ ...EMPTY_FORM })
  const [activeStep, setActiveStep] = useState<StepId>("context")
  const [saving, setSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState("")
  const [saveError, setSaveError] = useState("")
  const [copied, setCopied] = useState(false)
  const draftBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const storageKey = `briefing_draft_${projectId}`

  useEffect(() => {
    if (!isOpen) return
    const base = { ...EMPTY_FORM, ...(initialData || {}), project_type: initialData?.project_type || projectType || "" }
    try {
      const saved = localStorage.getItem(storageKey)
      setForm(saved ? { ...base, ...JSON.parse(saved) } : base)
    } catch { setForm(base) }
    setActiveStep("context")
    setSaveError("")
  }, [isOpen, initialData, projectType, storageKey])

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(form))
        setDraftSaved(true)
        if (draftBadgeTimerRef.current) clearTimeout(draftBadgeTimerRef.current)
        draftBadgeTimerRef.current = setTimeout(() => setDraftSaved(false), 2200)
      } catch { /* Storage can be unavailable. */ }
    }, 900)
    return () => clearTimeout(timer)
  }, [form, isOpen, storageKey])

  useEffect(() => {
    if (!isOpen || !form.logo_storage_path || logoFile) return
    let cancelled = false
    createClient().storage.from("sistema-assets").createSignedUrl(form.logo_storage_path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setLogoPreview(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [form.logo_storage_path, isOpen, logoFile])

  useEffect(() => () => {
    if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview)
  }, [logoPreview])

  const updateField = useCallback(<K extends keyof BriefingData>(key: K, value: BriefingData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleListValue = (key: "brand_personality" | "visual_style_keywords" | "output_formats" | "platforms", value: string) => {
    setForm((prev) => {
      const values = prev[key] || []
      return { ...prev, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
    })
  }

  const promptContext = useMemo(() => buildPromptContext(form), [form])

  const handleLogo = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      setSaveError("El logotipo debe ser una imagen de hasta 8 MB.")
      return
    }
    setSaveError("")
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    updateField("logo_file_name", file.name)
  }

  const handleSubmit = async () => {
    if (!form.project_type) { setSaveError("Elegí el tipo de proyecto para guardar el brief."); return }
    setSaving(true)
    setSaveError("")
    try {
      let data = form
      if (logoFile) {
        const safeName = logoFile.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase()
        const path = `briefs/${projectId}/logo-${Date.now()}-${safeName}`
        const { error } = await createClient().storage.from("sistema-assets").upload(path, logoFile, { contentType: logoFile.type })
        if (error) throw error
        data = { ...form, logo_storage_path: path, logo_file_name: logoFile.name }
      }
      const result = await onSave(data)
      if (result === false) throw new Error("No se pudo guardar el brief.")
      localStorage.removeItem(storageKey)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el brief.")
    } finally { setSaving(false) }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[100svh] w-full flex-col overflow-hidden bg-[#0a0a0a] shadow-2xl sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-white/10">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-quepia-cyan/10 p-2"><FileText className="h-4 w-4 text-quepia-cyan" /></div>
            <div><h2 className="text-sm font-semibold text-white sm:text-base">Brief creativo para IA</h2><p className="hidden text-xs text-white/40 sm:block">Identidad, dirección visual y reglas listas para generar imágenes</p></div>
            {draftSaved && <span className="hidden items-center gap-1 text-[11px] text-quepia-cyan sm:flex"><CheckCircle className="h-3 w-3" /> Guardado local</span>}
          </div>
          <button onClick={onClose} aria-label="Cerrar brief" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-white/[0.02] p-2 sm:w-52 sm:flex-col sm:border-b-0 sm:border-r sm:p-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              const active = activeStep === step.id
              return <button key={step.id} onClick={() => setActiveStep(step.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition ${active ? "bg-quepia-cyan/10 text-quepia-cyan" : "text-white/50 hover:bg-white/5 hover:text-white/80"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-quepia-cyan text-black" : "bg-white/10"}`}>{index + 1}</span><Icon className="h-3.5 w-3.5" /><span>{step.label}</span></button>
            })}
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
            {activeStep === "context" && <Section title="Contexto del proyecto" description="Qué se necesita crear, para quién y con qué objetivo.">
              <FieldLabel label="Tipo de proyecto" required><div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{PROJECT_TYPES.map(([value, label]) => <Choice key={value} active={form.project_type === value} onClick={() => updateField("project_type", value)}>{label}</Choice>)}</div></FieldLabel>
              <div className="grid gap-4 sm:grid-cols-2"><FormInput label="Nombre de la marca" value={form.brand_name || ""} onChange={(v) => updateField("brand_name", v)} placeholder="Ej. Quepia" /><FormInput label="Rubro / industria" value={form.industry || ""} onChange={(v) => updateField("industry", v)} placeholder="Ej. Gastronomía, tecnología, turismo" /></div>
              <FormTextArea label="Objetivo de estas piezas" value={form.objectives} onChange={(v) => updateField("objectives", v)} placeholder="Qué resultado deben conseguir las imágenes y qué acción deberían provocar" />
              <FormTextArea label="Público objetivo" value={form.target_audience} onChange={(v) => updateField("target_audience", v)} placeholder="Edad, ubicación, intereses, contexto, necesidades y nivel de conocimiento" />
              <FormTextArea label="Mensajes clave" value={form.key_messages || ""} onChange={(v) => updateField("key_messages", v)} placeholder="Ideas, beneficios o frases que deben quedar claras" />
            </Section>}

            {activeStep === "brand" && <Section title="Identidad de marca" description="La base estable que debe respetarse en cualquier generación.">
              <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                <FieldLabel label="Logotipo"><label className="group flex h-44 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-center hover:border-quepia-cyan/50">{logoPreview ? <Image src={logoPreview} alt="Vista previa del logotipo" width={180} height={120} unoptimized className="h-full w-full object-contain p-4" /> : <><Upload className="mb-2 h-5 w-5 text-white/40" /><span className="text-xs text-white/60">Subir logotipo</span><span className="mt-1 text-[10px] text-white/30">PNG, JPG, WEBP o SVG · máx. 8 MB</span></>}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} /></label>{form.logo_file_name && <p className="mt-2 truncate text-[11px] text-white/40">{form.logo_file_name}</p>}</FieldLabel>
                <div className="space-y-4"><FormTextArea label="Descripción de la marca" value={form.brand_description || ""} onChange={(v) => updateField("brand_description", v)} placeholder="Qué hace, qué historia tiene y qué lugar ocupa en la vida de sus clientes" /><FormTextArea label="Propuesta de valor" value={form.value_proposition || ""} onChange={(v) => updateField("value_proposition", v)} placeholder="Qué la hace diferente y por qué deberían elegirla" /></div>
              </div>
              <TagSelector label="Personalidad de marca" hint="Elegí los rasgos que la imagen debería transmitir." options={PERSONALITY_OPTIONS} values={form.brand_personality || []} onToggle={(v) => toggleListValue("brand_personality", v)} />
              <FormTextArea label="Tono de comunicación" value={form.tone_of_voice} onChange={(v) => updateField("tone_of_voice", v)} placeholder="Cómo habla la marca. Ej.: directa, optimista y experta, sin tecnicismos" />
              <FormTextArea label="Tipografías y reglas de uso" value={form.typography || ""} onChange={(v) => updateField("typography", v)} placeholder="Familias tipográficas, pesos, jerarquías o alternativas permitidas" />
              <ToggleField label="Conservar elementos de la identidad actual" value={!!form.keep_existing_brand} onChange={(value) => updateField("keep_existing_brand", value)} />
              {form.keep_existing_brand && <FormTextArea label="Elementos existentes que deben conservarse" value={form.existing_elements || ""} onChange={(v) => updateField("existing_elements", v)} placeholder="Símbolos, recursos gráficos, slogans, patrones o decisiones reconocibles" />}
            </Section>}

            {activeStep === "visual" && <Section title="Dirección visual" description="Traducí la identidad en decisiones visuales concretas para el modelo.">
              <ColorEditor colors={form.color_palette || []} onChange={(colors) => updateField("color_palette", colors)} />
              <TagSelector label="Estilos visuales" hint="Funcionan como palabras clave de dirección de arte." options={STYLE_OPTIONS} values={form.visual_style_keywords || []} onToggle={(v) => toggleListValue("visual_style_keywords", v)} />
              <FormTextArea label="Dirección de arte" value={form.image_direction || ""} onChange={(v) => updateField("image_direction", v)} placeholder="Iluminación, materiales, texturas, nivel de realismo, ambiente, época y emoción" />
              <div className="grid gap-4 sm:grid-cols-2"><FormTextArea label="Fotografía / ilustración" value={form.photography_style || ""} onChange={(v) => updateField("photography_style", v)} placeholder="Lente, encuadre, tratamiento, técnica o estilo de ilustración" /><FormTextArea label="Composición" value={form.composition_guidelines || ""} onChange={(v) => updateField("composition_guidelines", v)} placeholder="Jerarquía, espacio negativo, ubicación del producto, personas o texto" /></div>
              <div className="grid gap-4 sm:grid-cols-2"><FormTextArea label="Siempre incluir" value={form.must_include || ""} onChange={(v) => updateField("must_include", v)} placeholder="Logo, producto, gesto, contexto, elementos de marca" /><FormTextArea label="Evitar" value={form.avoid_elements || ""} onChange={(v) => updateField("avoid_elements", v)} placeholder="Colores, clichés, objetos, estilos o errores que no deben aparecer" /></div>
            </Section>}

            {activeStep === "delivery" && <Section title="Referencias y entregables" description="Definí dónde se publicará y qué referencias sí representan la intención.">
              <TagSelector label="Formatos de salida" options={OUTPUT_OPTIONS} values={form.output_formats || []} onToggle={(v) => toggleListValue("output_formats", v)} />
              <TagSelector label="Plataformas" options={PLATFORM_OPTIONS} values={form.platforms || []} onToggle={(v) => toggleListValue("platforms", v)} />
              {(form.project_type === "campana_redes" || form.project_type === "contenido_marca") && <FormInput label="Frecuencia de contenido" value={form.content_frequency || ""} onChange={(v) => updateField("content_frequency", v)} placeholder="Ej. 3 veces por semana" />}
              {form.project_type === "campana_redes" && <><ToggleField label="Incluye pauta publicitaria" value={!!form.includes_ads} onChange={(value) => updateField("includes_ads", value)} />{form.includes_ads && <FormInput label="Presupuesto de pauta" value={form.ad_budget || ""} onChange={(v) => updateField("ad_budget", v)} placeholder="Ej. $50.000 ARS mensuales" />}</>}
              <ReferenceEditor references={form.reference_links || []} onChange={(refs) => updateField("reference_links", refs)} />
              <FormTextArea label="Lectura general de referencias" value={form.references} onChange={(v) => updateField("references", v)} placeholder="Qué tienen en común, qué tomar de ellas y qué no copiar" />
              <div className="grid gap-4 sm:grid-cols-2"><FormInput label="Plazo estimado" value={form.timeline || ""} onChange={(v) => updateField("timeline", v)} placeholder="Ej. 3 semanas" /><FormInput label="Presupuesto" value={form.budget || ""} onChange={(v) => updateField("budget", v)} placeholder="Ej. $200.000" /></div>
            </Section>}

            {activeStep === "ai" && <Section title="Contexto listo para IA" description="Resumen estructurado de la información que recibirá el generador de imágenes.">
              <div className="rounded-xl border border-quepia-cyan/20 bg-quepia-cyan/[0.04] p-4"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-medium text-quepia-cyan"><Sparkles className="h-4 w-4" /> Base de prompt</span><button onClick={async () => { await navigator.clipboard.writeText(promptContext); setCopied(true); setTimeout(() => setCopied(false), 1800) }} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/5">{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? "Copiado" : "Copiar"}</button></div><pre className="max-h-96 whitespace-pre-wrap font-sans text-xs leading-6 text-white/60">{promptContext}</pre></div>
              <FormTextArea label="Instrucciones adicionales para IA" value={form.ai_generation_notes || ""} onChange={(v) => updateField("ai_generation_notes", v)} placeholder="Reglas técnicas, consistencia entre piezas, variantes deseadas o cualquier indicación especial" rows={4} />
              <p className="flex gap-2 text-xs leading-5 text-white/35"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Este bloque es una base de contexto. Más adelante se puede combinar con el objetivo de cada pieza para producir prompts específicos y consistentes.</p>
            </Section>}
          </main>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-6">
          <div className="min-w-0">{saveError && <p className="truncate text-xs text-red-400">{saveError}</p>}</div>
          <div className="flex shrink-0 gap-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-white/60 hover:bg-white/5">Cancelar</button><button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Guardar brief</button></div>
        </footer>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl space-y-6"><div><h3 className="text-lg font-semibold text-white">{title}</h3><p className="mt-1 text-sm text-white/40">{description}</p></div>{children}</div>
}

function FieldLabel({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-2"><label className="text-xs font-medium text-white/65">{label}{required && <span className="text-quepia-cyan"> *</span>}</label>{hint && <p className="text-[11px] text-white/30">{hint}</p>}{children}</div>
}

function FormInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <FieldLabel label={label}><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-white/10 bg-[#181818] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-quepia-cyan/50" /></FieldLabel>
}

function FormTextArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return <FieldLabel label={label}><textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full resize-y rounded-lg border border-white/10 bg-[#181818] px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-white/20 focus:border-quepia-cyan/50" /></FieldLabel>
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-lg border px-2 py-3 text-xs transition ${active ? "border-quepia-cyan/50 bg-quepia-cyan/10 text-quepia-cyan" : "border-white/10 bg-[#181818] text-white/50 hover:border-white/20"}`}>{children}</button>
}

function TagSelector({ label, hint, options, values, onToggle }: { label: string; hint?: string; options: string[]; values: string[]; onToggle: (value: string) => void }) {
  return <FieldLabel label={label} hint={hint}><div className="flex flex-wrap gap-2">{options.map((option) => <button key={option} onClick={() => onToggle(option)} className={`rounded-full border px-3 py-1.5 text-xs ${values.includes(option) ? "border-quepia-cyan/40 bg-quepia-cyan/10 text-quepia-cyan" : "border-white/10 bg-[#181818] text-white/45 hover:text-white/70"}`}>{option}</button>)}</div></FieldLabel>
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#181818] px-3 py-3 text-left text-xs text-white/65 hover:border-white/20"><span>{label}</span><span className={`relative h-5 w-9 rounded-full transition ${value ? "bg-quepia-cyan" : "bg-white/15"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${value ? "left-[18px]" : "left-0.5"}`} /></span></button>
}

function ColorEditor({ colors, onChange }: { colors: BriefColor[]; onChange: (colors: BriefColor[]) => void }) {
  const update = (index: number, patch: Partial<BriefColor>) => onChange(colors.map((color, i) => i === index ? { ...color, ...patch } : color))
  return <FieldLabel label="Paleta de colores" hint="Agregá el nombre, HEX y uso de cada color para que la IA entienda su jerarquía."><div className="space-y-2">{colors.map((color, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input value={color.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="Nombre" className="min-w-0 rounded-lg border border-white/10 bg-[#181818] px-3 text-xs text-white outline-none" /><input aria-label={`HEX del color ${index + 1}`} value={color.hex} onChange={(e) => update(index, { hex: e.target.value.toUpperCase() })} placeholder="#000000" title={color.usage} className="min-w-0 rounded-lg border border-white/10 bg-[#181818] px-3 text-xs text-white outline-none" /><button aria-label="Eliminar color" onClick={() => onChange(colors.filter((_, i) => i !== index))} className="p-2 text-white/25 hover:text-red-400"><Trash2 className="h-4 w-4" /></button><input value={color.usage} onChange={(e) => update(index, { usage: e.target.value })} placeholder="Uso: fondos, acentos, texto…" className="col-span-2 rounded-lg border border-white/10 bg-[#181818] px-3 py-2 text-xs text-white outline-none" /></div>)}<button onClick={() => onChange([...colors, { name: "", hex: "#000000", usage: "" }])} className="flex items-center gap-1.5 text-xs text-quepia-cyan"><Plus className="h-3.5 w-3.5" />Agregar color</button></div></FieldLabel>
}

function ReferenceEditor({ references, onChange }: { references: BriefReference[]; onChange: (references: BriefReference[]) => void }) {
  const update = (index: number, patch: Partial<BriefReference>) => onChange(references.map((ref, i) => i === index ? { ...ref, ...patch } : ref))
  return <FieldLabel label="Referencias visuales" hint="Además del link, explicá qué aspecto sirve como referencia; eso vuelve el dato accionable."><div className="space-y-2">{references.map((ref, index) => <div key={index} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3"><div className="space-y-2"><div className="relative"><Link2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-white/25" /><input type="url" value={ref.url} onChange={(e) => update(index, { url: e.target.value })} placeholder="https://..." className="w-full rounded-md border border-white/10 bg-[#181818] py-2 pl-9 pr-3 text-xs text-white outline-none" /></div><input value={ref.note} onChange={(e) => update(index, { note: e.target.value })} placeholder="Qué tomar de esta referencia: luz, composición, textura, paleta…" className="w-full rounded-md border border-white/10 bg-[#181818] px-3 py-2 text-xs text-white outline-none" /></div><button aria-label="Eliminar referencia" onClick={() => onChange(references.filter((_, i) => i !== index))} className="text-white/25 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div>)}<button onClick={() => onChange([...references, { url: "", note: "" }])} className="flex items-center gap-1.5 text-xs text-quepia-cyan"><Plus className="h-3.5 w-3.5" />Agregar referencia</button></div></FieldLabel>
}

function buildPromptContext(form: BriefingData) {
  const colors = (form.color_palette || []).filter((c) => c.hex || c.name).map((c) => `${c.name || "Color"} ${c.hex}${c.usage ? ` (${c.usage})` : ""}`).join(", ")
  const refs = (form.reference_links || []).filter((r) => r.url).map((r) => `${r.url}${r.note ? ` — ${r.note}` : ""}`).join("\n")
  return [
    `MARCA: ${form.brand_name || "Sin definir"}`,
    `RUBRO: ${form.industry || "Sin definir"}`,
    `DESCRIPCIÓN: ${form.brand_description || "Sin definir"}`,
    `PROPUESTA DE VALOR: ${form.value_proposition || "Sin definir"}`,
    `OBJETIVO: ${form.objectives || "Sin definir"}`,
    `PÚBLICO: ${form.target_audience || "Sin definir"}`,
    `PERSONALIDAD: ${(form.brand_personality || []).join(", ") || "Sin definir"}`,
    `TONO: ${form.tone_of_voice || "Sin definir"}`,
    `MENSAJES CLAVE: ${form.key_messages || "Sin definir"}`,
    `ELEMENTOS DE IDENTIDAD A CONSERVAR: ${form.keep_existing_brand ? form.existing_elements || "Indicados, sin detalle" : "No aplica"}`,
    `PALETA: ${colors || "Sin definir"}`,
    `TIPOGRAFÍA: ${form.typography || "Sin definir"}`,
    `ESTILO VISUAL: ${(form.visual_style_keywords || []).join(", ") || "Sin definir"}`,
    `DIRECCIÓN DE ARTE: ${form.image_direction || "Sin definir"}`,
    `FOTOGRAFÍA / ILUSTRACIÓN: ${form.photography_style || "Sin definir"}`,
    `COMPOSICIÓN: ${form.composition_guidelines || "Sin definir"}`,
    `INCLUIR: ${form.must_include || "Sin definir"}`,
    `EVITAR: ${form.avoid_elements || "Sin definir"}`,
    `FORMATOS: ${(form.output_formats || []).join(", ") || "Sin definir"}`,
    `REFERENCIAS:\n${refs || "Sin definir"}`,
    `NOTAS PARA IA: ${form.ai_generation_notes || "Sin definir"}`,
  ].join("\n")
}
