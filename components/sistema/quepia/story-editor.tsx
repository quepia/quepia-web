"use client"

import { useRef, useState } from "react"
import { Loader2, Sparkles, Upload, X, Save } from "lucide-react"
import type { ClientBrief, Task } from "@/types/sistema"
import { STORY_FORMATS, readStorySettings, type StorySettings } from "@/lib/ai/stories"
import { uploadAssetFile, compressStoryReference } from "@/lib/sistema/asset-upload"
import { cn } from "@/lib/sistema/utils"

import { StoryImageBank } from "./story-image-bank"

export const STORY_INPUT = "w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan/60"
export const STORY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/80 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
export async function storyRequest<T = Record<string, unknown>>(input: object): Promise<T> {
  const response = await fetch("/api/ai/stories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || "No se pudo completar el pedido")
  return data as T
}

export function StoryFields({ settings, onChange }: { settings: StorySettings; onChange: (settings: StorySettings) => void }) {
  const set = <K extends keyof StorySettings>(key: K, value: StorySettings[K]) => onChange({ ...settings, [key]: value, ...(["request","rules","headline","cta","kicker","supportingText","backgroundSource","format","includeLogo"].includes(key) ? {prompt:""} : {}), ...(["design","primaryColor","accentColor","panelColor"].includes(key) ? {autoDesign:false} : {}) })
  return <div className="space-y-4">
    <label className="block text-xs text-white/60">Descripción de la historia
      <textarea rows={3} className={cn(STORY_INPUT,"mt-1.5")} value={settings.request} onChange={e => set("request", e.target.value)} maxLength={4000} placeholder="Qué querés comunicar y qué debería verse" />
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-white/60">Fecha <input type="date" className={cn(STORY_INPUT,"mt-1.5")} value={settings.date} onChange={e => set("date", e.target.value)} /></label>
      <label className="text-xs text-white/60">Formato <select className={cn(STORY_INPUT,"mt-1.5")} value={settings.format} onChange={e => set("format", e.target.value as StorySettings["format"])}>{Object.entries(STORY_FORMATS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <label className="text-xs text-white/60">Producción <select className={cn(STORY_INPUT,"mt-1.5")} value={settings.backgroundSource} onChange={e => onChange({...settings,backgroundSource:e.target.value as StorySettings["backgroundSource"],mode:"creative",renderMode:e.target.value==="bank"?"ai-overlay":"full-ai",prompt:""})}><option value="bank">Foto original + diseño IA transparente</option><option value="ai">Generar toda la pieza, incluida la foto</option></select></label>
      <label className="text-xs text-white/60">Calidad <select className={cn(STORY_INPUT,"mt-1.5")} value={settings.quality} onChange={e => set("quality", e.target.value as StorySettings["quality"])}><option value="low">Borrador</option><option value="medium">Estándar</option><option value="high">Alta</option></select></label>
    </div>
    <p className="text-xs leading-5 text-white/45">OpenAI genera todos los textos, el logo y el diseño. Con fotos del banco, devuelve una capa transparente y el sistema la superpone a la foto original sin modificar sus colores ni texturas. Cada generación utiliza la API y tiene costo.</p>
    <label className="block text-xs text-white/60">Titular exacto <textarea rows={2} className={cn(STORY_INPUT,"mt-1.5")} value={settings.headline} onChange={e => set("headline", e.target.value)} maxLength={120} placeholder="Texto que aparecerá en la imagen" /></label>
    <label className="block text-xs text-white/60">Llamado a la acción <input className={cn(STORY_INPUT,"mt-1.5")} value={settings.cta} onChange={e => set("cta", e.target.value)} maxLength={70} placeholder="Consultanos por reservas" /></label>
    <details className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-xs text-white/60">Diseño y textos secundarios</summary><div className="mt-3 space-y-3">
      <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={settings.autoDesign} onChange={e=>set("autoDesign",e.target.checked)}/>Dejar que la IA interprete el estilo del brief y los diseños de referencia</label>

      {settings.backgroundSource === "bank" && <label className="block text-xs text-white/60">Encuadre de la foto original<select className={cn(STORY_INPUT,"mt-1.5")} value={settings.photoFit} onChange={e=>set("photoFit",e.target.value as StorySettings["photoFit"])}><option value="cover">Cubrir la historia · recortar bordes</option><option value="contain">Mostrar foto completa</option></select></label>}
      <label className="block text-xs text-white/60">Dirección sugerida<select className={cn(STORY_INPUT,"mt-1.5")} value={settings.design} onChange={e=>set("design",e.target.value as StorySettings["design"])}><option value="editorial">Editorial</option><option value="outdoor">Turismo</option></select></label>
      <label className="block text-xs text-white/60">Etiqueta superior<input className={cn(STORY_INPUT,"mt-1.5")} maxLength={60} value={settings.kicker} onChange={e=>set("kicker",e.target.value)}/></label>
      <label className="block text-xs text-white/60">Información secundaria<textarea className={cn(STORY_INPUT,"mt-1.5")} maxLength={180} value={settings.supportingText} onChange={e=>set("supportingText",e.target.value)}/></label>
      <div className="flex gap-4">{(["primaryColor","accentColor","panelColor"] as const).map((key,i)=><label key={key} className="text-xs text-white/60">{["Principal","Acento","Placas"][i]}<input type="color" className="mt-2 block h-8 w-12" value={settings[key]} onChange={e=>set(key,e.target.value)}/></label>)}</div>
    </div></details>
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-xs text-white/60">Texto <input type="color" className="mt-2 block h-8 w-12 rounded" value={settings.textColor} onChange={e => set("textColor",e.target.value)} /></label>
      <label className="text-xs text-white/60">Fondo <input type="color" className="mt-2 block h-8 w-12 rounded" value={settings.backgroundColor} onChange={e => set("backgroundColor",e.target.value)} /></label>
      <label className="text-xs text-white/60">Ubicación del texto <select className={cn(STORY_INPUT,"mt-1.5")} value={settings.headlinePosition} onChange={e => set("headlinePosition",e.target.value as "top" | "bottom")}><option value="bottom">Abajo</option><option value="top">Arriba</option></select></label>
      <label className="flex items-center gap-2 py-2 text-xs text-white/60"><input type="checkbox" checked={settings.includeLogo} onChange={e => set("includeLogo", e.target.checked)} />Incluir logo del brief</label>
    </div>
    <p className="text-[11px] text-white/35">Los textos exactos y el logo se envían a OpenAI para integrarlos en el diseño. El sistema no dibuja placas ni textos: solo coloca la capa generada por OpenAI sobre la foto original cuando corresponde.</p>
    <label className="block text-xs text-white/60">Reglas particulares de esta historia <textarea rows={2} className={cn(STORY_INPUT,"mt-1.5")} value={settings.rules} onChange={e => set("rules",e.target.value)} maxLength={3000} placeholder="Qué conservar, qué evitar y cómo usar las referencias" /></label>
  </div>
}

export function StoryEditor({ task, projectId, userId, brief, onClose, onSaved, onTaskClick }: {
  task: Task; projectId: string; userId: string; brief: ClientBrief | null; onClose: () => void; onSaved: () => void; onTaskClick?: (task: Task) => void
}) {
  const [title,setTitle] = useState(task.titulo)
  const [settings,setSettings] = useState(() => readStorySettings(task.type_metadata, task))
  const [referenceRevision,setReferenceRevision] = useState(0)
  const [busy,setBusy] = useState("")
  const [error,setError] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  async function save() {
    setBusy("save"); setError("")
    try { await storyRequest({ action: "save", projectId, taskId: task.id, title, settings }); onSaved(); onClose() }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar") }
    finally { setBusy("") }
  }
  async function prompt() {
    setBusy("prompt"); setError("")
    try {
      const result = await storyRequest<{ result: StorySettings }>({ action: "prompt", projectId, taskId: task.id, settings })
      setSettings(current => ({ ...current, ...result.result, headline: current.headline || result.result.headline, cta: current.cta || result.result.cta }))
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo preparar") }
    finally { setBusy("") }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy("upload"); setError("")
    try {
      for (const original of Array.from(files).slice(0, Math.max(0,(settings.backgroundSource === "bank" ? 1 : 4)-settings.referenceAssetIds.length-settings.referenceDriveFileIds.length))) {
        const file = await compressStoryReference(original)
        const result = await uploadAssetFile({ file, taskId: task.id, projectId, userId, notes: "Referencia de historia", assetName: file.name })
        setReferenceRevision(current=>current+1)
        setSettings(current => ({ ...current, prompt: "", referenceAssetIds: [...current.referenceAssetIds,result.assetId] }))
      }
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo subir") }
    finally { setBusy(""); if(fileInput.current) fileInput.current.value = "" }
  }
  return <div role="dialog" aria-modal="true" aria-label="Editar historia" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3" onClick={onClose}>
    <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101318]" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h2 className="font-medium text-white">Editar historia</h2><button aria-label="Cerrar editor" disabled={Boolean(busy)} onClick={onClose} className={STORY_BUTTON}><X size={16}/></button></div>
      <fieldset disabled={Boolean(busy)} className="space-y-5 overflow-y-auto p-5 disabled:opacity-60">
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        <label className="block text-xs text-white/60">Nombre <input className={cn(STORY_INPUT,"mt-1.5")} value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/></label>
        <p className="text-xs text-white/45">Partimos de la descripción de la tarjeta. El prompt se prepara al generar; ajustá solo lo que necesites.</p>
        <StoryFields settings={settings} onChange={setSettings}/>
        <div className="rounded-xl border border-white/10 p-4">
          <p className="mb-3 text-xs font-medium text-white/70">Referencias · {settings.referenceAssetIds.length+settings.referenceDriveFileIds.length}/{settings.backgroundSource === "bank" ? 1 : 4}</p>
          <StoryImageBank key={referenceRevision} projectId={projectId} maxSelected={settings.backgroundSource === "bank" ? 1 : 4} selected={[...settings.referenceAssetIds.map(id=>`asset:${id}`),...settings.referenceDriveFileIds.map(id=>`drive:${id}`)]} onToggle={(item,checked)=>setSettings(current=>{
            const key=item.source==="drive"?"referenceDriveFileIds":"referenceAssetIds"
            return {...current,prompt:"",[key]:checked?[...current[key],item.id]:current[key].filter(id=>id!==item.id)}
          })}/>
          <label className="mt-3 flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={settings.autoReferences} onChange={e=>setSettings(current=>({...current,autoReferences:e.target.checked}))}/>Elegir fotos pertinentes del banco con IA cuando no seleccione referencias</label>
          <button className={cn(STORY_BUTTON,"mt-3")} disabled={settings.referenceAssetIds.length+settings.referenceDriveFileIds.length>=(settings.backgroundSource === "bank" ? 1 : 4)} onClick={()=>fileInput.current?.click()}><Upload size={14}/>Subir referencias</button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={e=>void upload(e.target.files)}/>
          <p className="mt-2 text-[11px] text-white/35">Las fotos de más de 12 MB se comprimen automáticamente. En modo foto original, se utiliza una foto como fondo sin regenerarla; las referencias de diseño se cargan en el brief.</p>
        </div>
        {settings.mode === "creative" && <div>
          <div className="mb-2 flex items-center justify-between"><label htmlFor="story-prompt" className="text-xs text-white/60">Prompt de imagen · opcional</label><button className={STORY_BUTTON} disabled={!brief||!settings.request.trim()} onClick={()=>void prompt()}><Sparkles size={14}/>Preparar con IA</button></div>
          <textarea id="story-prompt" rows={7} className={STORY_INPUT} value={settings.prompt} onChange={e=>setSettings(current=>({...current,prompt:e.target.value}))} maxLength={16000}/>
          {!brief&&<p className="mt-2 text-xs text-amber-300">Completá el brief del cliente para usar IA.</p>}
        </div>}
      </fieldset>
      <div className="flex items-center justify-between border-t border-white/10 p-4">
        <button className={STORY_BUTTON} disabled={Boolean(busy)} onClick={()=>{onClose();onTaskClick?.(task)}}>Abrir tarea y assets</button>
        <button className={cn(STORY_BUTTON,"border-quepia-cyan/40 text-quepia-cyan")} disabled={Boolean(busy)||!title.trim()} onClick={()=>void save()}>{busy?<Loader2 size={14} className="animate-spin"/>:<Save size={14}/>} {busy==="upload"?"Subiendo referencias…":busy==="prompt"?"Preparando…":"Guardar historia"}</button>
      </div>
    </div>
  </div>
}
