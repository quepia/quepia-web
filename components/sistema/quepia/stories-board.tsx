"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ImageIcon, Loader2, Plus, RefreshCw, Send, Sparkles, X } from "lucide-react"
import type { ClientBrief, ColumnWithTasks, Task } from "@/types/sistema"
import { EMPTY_STORY, readStorySettings, storyReservation, STORY_JOB_LABELS, type StoryJob, type StorySettings } from "@/lib/ai/stories"
import { StoryEditor, StoryFields, storyRequest, STORY_BUTTON, STORY_INPUT } from "./story-editor"
import { ZernioPublishingPanel } from "./zernio-publishing-panel"
import { cn } from "@/lib/sistema/utils"

type BoardJob = StoryJob & { recoverable: boolean; approved: boolean }
type StoriesData = { tasks: Task[]; jobs: BoardJob[]; brief: ClientBrief | null; configured: boolean; model: string; userId: string; canPublish: boolean }
type Draft = { title: string; settings: StorySettings }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date())

export function StoriesBoard({ projectId, columns, onTaskClick, onChanged }: {
  projectId: string; columns: ColumnWithTasks[]; onTaskClick?: (task: Task) => void; onChanged: () => void
}) {
  const [data,setData] = useState<StoriesData | null>(null)
  const [error,setError] = useState("")
  const [busy,setBusy] = useState("")
  const [selected,setSelected] = useState<string[]>([])
  const [editor,setEditor] = useState<Task | null>(null)
  const [publishing,setPublishing] = useState<{ task: Task; job: BoardJob } | null>(null)
  const [creating,setCreating] = useState(false)
  const [drafts,setDrafts] = useState<Draft[]>([])
  const [request,setRequest] = useState("")
  const [count,setCount] = useState(5)
  const [date,setDate] = useState(today)
  const [columnId,setColumnId] = useState(columns[0]?.id || "")
  const [budget,setBudget] = useState(5)
  const [rulesOpen,setRulesOpen] = useState(false)
  const [rules,setRules] = useState("")
  const [filter,setFilter] = useState("all")
  const mounted = useRef(true)
  const loadingRef = useRef(false)
  const generationKey = useRef<string | null>(null)
  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const response = await fetch(`/api/ai/stories?projectId=${projectId}`, { cache:"no-store" })
      const next = await response.json()
      if (!response.ok) throw new Error(next.error || "No se pudieron cargar las historias")
      if (!mounted.current) return
      setData(next)
      setSelected(current=>current.filter(id=>next.tasks.some((task: Task)=>task.id===id)))
      setError("")
    } catch(err) { if(mounted.current) setError(err instanceof Error?err.message:"No se pudo cargar") }
    finally { loadingRef.current = false }
  },[projectId])
  useEffect(()=>{ mounted.current=true; void load(); return ()=>{mounted.current=false} },[load])
  const pending = data?.jobs.some(job=>["queued","running"].includes(job.status)) || false
  useEffect(()=>{
    if(!pending) return
    const timer = setInterval(()=>void load(),6000)
    return ()=>clearInterval(timer)
  },[pending,load])
  // The persisted queue can resume after reload. Atomic claims cap concurrency.
  const queueAvailable = data?.jobs.some(job=>job.status==="queued") && (data?.jobs.filter(job=>job.status==="running").length || 0)<2
  useEffect(()=>{
    if(!queueAvailable) return
    void storyRequest({action:"process",projectId}).catch(()=>{})
  },[queueAvailable,projectId,data?.jobs])

  async function action(name: string, operation: () => Promise<unknown>, refresh = true) {
    if(busy) return
    setBusy(name); setError("")
    try { await operation(); if(refresh) { await load(); onChanged() } }
    catch(err){ setError(err instanceof Error?err.message:"No se pudo completar") }
    finally{ setBusy("") }
  }
  const latest = (taskId: string) => data?.jobs.find(job=>job.task_id===taskId)
  const selectedTasks = data?.tasks.filter(task=>selected.includes(task.id)) || []
  const reservation = selectedTasks.reduce((sum,task)=>sum+storyReservation(readStorySettings(task.type_metadata, task)),0)
  const selectedReady = selectedTasks.length>0 && selectedTasks.every(task=>{
    const settings=readStorySettings(task.type_metadata, task)
    return !["queued","running"].includes(latest(task.id)?.status || "") && Boolean(data?.configured && data?.brief) && (settings.backgroundSource !== "bank" || settings.autoReferences || settings.referenceAssetIds.length + settings.referenceDriveFileIds.length > 0)
  })
  const visibleTasks = data?.tasks.filter(task=>filter==="all" || (filter==="today"?readStorySettings(task.type_metadata, task).date===today():latest(task.id)?.status===filter)) || []

  function updateDraft(index: number, update: Partial<Draft>) { setDrafts(current=>current.map((draft,i)=>i===index?{...draft,...update}:draft)) }
  async function plan() {
    const result=await storyRequest<{ drafts:Draft[] }>({action:"plan",projectId,request,count,date})
    setDrafts(result.drafts)
  }
  async function createDrafts(){
    await storyRequest({action:"create",projectId,columnId,drafts})
    setCreating(false); setDrafts([]); setRequest("")
  }
  async function generate(){
    const batchKey=generationKey.current || crypto.randomUUID(); generationKey.current=batchKey
    await storyRequest({action:"generate",projectId,taskIds:selected,batchKey,budget})
    generationKey.current=null; setSelected([])
  }

  return <div className="flex-1 overflow-y-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-lg font-semibold text-white">Historias</h2><p className="mt-1 text-xs text-white/40">Usamos la descripción de cada tarea y el brief. Seleccioná historias y generá; podés ajustar las opciones antes.</p></div>
      <div className="flex gap-2"><button className={STORY_BUTTON} onClick={()=>void load()} disabled={Boolean(busy)} aria-label="Actualizar historias"><RefreshCw size={14}/></button><button className={STORY_BUTTON} onClick={()=>{setRules(data?.brief?.ai_generation_notes || "");setRulesOpen(true)}}>Reglas del cliente</button><button className={cn(STORY_BUTTON,"border-quepia-cyan/40 text-quepia-cyan")} disabled={!data||!columns.length} onClick={()=>{setCreating(true);setColumnId(columns[0]?.id || "");setDrafts([])}}><Plus size={14}/>Crear historias</button></div>
    </div>
    {error&&<p role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {!data&&!error&&<div className="flex justify-center py-20"><Loader2 className="animate-spin text-quepia-cyan"/></div>}
    {data&&!data.configured&&<p className="mb-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">La generación con IA está pendiente de configuración. Podés preparar historias; para generar la pieza completa hace falta configurar OpenAI.</p>}
    {data&&!data.brief&&<p className="mb-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">Este cliente necesita un brief para preparar prompts y generar imágenes con su identidad.</p>}
    {data&&<>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2"><select aria-label="Filtrar historias" className={cn(STORY_INPUT,"w-auto")} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas las historias</option><option value="today">Hoy</option><option value="queued">En cola</option><option value="running">Generando</option><option value="succeeded">Para revisar</option><option value="failed">Fallidas</option><option value="needs_attention">Requieren revisión</option></select><button className={STORY_BUTTON} disabled={Boolean(busy)} onClick={()=>{setSelected(visibleTasks.slice(0,20).map(task=>task.id));generationKey.current=null}}>Seleccionar hasta 20</button></div>
        {pending&&<span className="flex items-center gap-2 text-xs text-quepia-cyan"><Loader2 size={13} className="animate-spin"/>Procesando historias</span>}
      </div>
      {selected.length>0&&<div className="mb-5 rounded-xl border border-quepia-cyan/20 bg-quepia-cyan/5 p-4">
        <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-white/80">{selected.length} seleccionadas</span><label className="flex items-center gap-2 text-xs text-white/60">Presupuesto del lote (USD)<input type="number" min={0} max={100} step={0.5} value={budget} className={cn(STORY_INPUT,"w-20")} onChange={e=>setBudget(Number(e.target.value))}/></label><button disabled={Boolean(busy)||!selectedReady||budget<reservation||selected.length>20} className={cn(STORY_BUTTON,"border-quepia-cyan/40 text-quepia-cyan")} onClick={()=>void action("generate",generate)}>{busy==="generate"?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>}Generar seleccionadas</button><button className={STORY_BUTTON} onClick={()=>{setSelected([]);generationKey.current=null}}>Limpiar selección</button></div>
        <p className="mt-2 text-[11px] text-white/45">OpenAI genera toda la pieza —textos, logo, composición y fotografía— usando el brief, las fotos de Drive y los diseños de referencia. Reserva de imágenes: USD {reservation.toFixed(2)}. El costo real depende del consumo de OpenAI; no es una cotización ni un tope garantizado. Cada regeneración es un nuevo intento.</p>
        {!selectedReady&&<p className="mt-2 text-xs text-amber-200">Completá el brief para generar con IA, o elegí una foto para composición fiel. Esperá a que terminen las historias que ya están generando.</p>}
      </div>}
      {visibleTasks.length===0?<div className="rounded-2xl border border-dashed border-white/10 p-14 text-center"><ImageIcon className="mx-auto mb-3 text-white/20" size={32}/><p className="text-sm text-white/60">Todavía no hay historias en esta vista.</p><p className="mt-2 text-xs text-white/35">Creá una historia o prepará un lote desde una descripción.</p></div>:<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{visibleTasks.map(task=>{
        const settings=readStorySettings(task.type_metadata, task),job=latest(task.id)
        const blocked=job&&["queued","running"].includes(job.status)
        return <article key={task.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#101318]">
          <div className="relative aspect-[9/16] overflow-hidden bg-white/[0.025]">
            {job?.previewUrl?<Image unoptimized fill sizes="(max-width:768px) 45vw, 240px" className="object-contain" src={job.previewUrl} alt={task.titulo}/>:<div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">{blocked?<Loader2 className="animate-spin text-quepia-cyan"/>:<ImageIcon className="text-white/20"/>}<span className="text-xs text-white/40">{job?STORY_JOB_LABELS[job.status]:"Borrador"}</span></div>}
            <label className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70"><input type="checkbox" aria-label={`Seleccionar ${task.titulo}`} disabled={Boolean(busy)||Boolean(blocked)} checked={selected.includes(task.id)} onChange={e=>{generationKey.current=null;setSelected(current=>e.target.checked?[...current,task.id]:current.filter(id=>id!==task.id))}}/></label>
            <span className="absolute right-2 top-2 rounded bg-black/75 px-2 py-1 text-[10px] text-white/80">{job?.approved?"Aprobada":job?STORY_JOB_LABELS[job.status]:"Borrador"}</span>
          </div>
          <div className="space-y-2 p-3"><p className="truncate text-sm font-medium text-white/85" title={task.titulo}>{task.titulo}</p><p className="text-[11px] text-white/40">{settings.date||"Sin fecha"} · {job && job.settings.renderMode!=="full-ai" ? (job.settings.mode==="faithful"?"Foto original · anterior":"IA · anterior") : "OpenAI · pieza completa"}{job?.cost_usd!=null?` · USD ${Number(job.cost_usd).toFixed(3)}`:""}</p>
            {job?.error_message&&<p className="text-[11px] text-red-300">{job.error_message}</p>}
            <div className="flex flex-wrap gap-1.5"><button className={STORY_BUTTON} disabled={Boolean(busy)} onClick={()=>setEditor(task)}>Editar</button>
              {job?.status==="queued"&&<button className={STORY_BUTTON} disabled={Boolean(busy)} onClick={()=>void action("cancel",()=>storyRequest({action:"cancel",projectId,jobId:job.id}))}>Cancelar</button>}
              {job?.recoverable&&["failed","needs_attention"].includes(job.status)&&<button className={STORY_BUTTON} disabled={Boolean(busy)} onClick={()=>void action("recover",()=>storyRequest({action:"recover",projectId,jobId:job.id}))}>Recuperar sin regenerar</button>}
              {job?.status==="succeeded"&&!job.approved&&<button className={cn(STORY_BUTTON,"text-quepia-cyan")} disabled={Boolean(busy)} onClick={()=>void action("approve",()=>storyRequest({action:"approve",projectId,jobId:job.id}))}><Check size={12}/>Aprobar</button>}
              {job?.approved&&data.canPublish&&<button className={cn(STORY_BUTTON,"text-quepia-cyan")} onClick={()=>setPublishing({task,job})}><Send size={12}/>Publicar</button>}
              {job?.previewUrl&&<a className={STORY_BUTTON} href={job.previewUrl} target="_blank" rel="noreferrer">Ver imagen</a>}
              {data.jobs.filter(j=>j.task_id===task.id).length>1&&<button className={STORY_BUTTON} onClick={()=>onTaskClick?.(task)}>Ver versiones</button>}
            </div>
          </div>
        </article>
      })}</div>}
    </>}
    {editor&&data&&<StoryEditor key={editor.id} task={editor} projectId={projectId} userId={data.userId} brief={data.brief} onClose={()=>setEditor(null)} onSaved={()=>{void load();onChanged()}} onTaskClick={onTaskClick}/>}
    {creating&&<div role="dialog" aria-modal="true" aria-label="Crear historias" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#101318]">
        <div className="flex items-center justify-between border-b border-white/10 p-5"><h2 className="font-medium text-white">Crear historias</h2><button className={STORY_BUTTON} aria-label="Cerrar creación" disabled={Boolean(busy)} onClick={()=>setCreating(false)}><X size={16}/></button></div>
        <fieldset disabled={Boolean(busy)} className="space-y-4 overflow-y-auto p-5">
          {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
          <label className="block text-xs text-white/60">Qué querés comunicar <textarea className={cn(STORY_INPUT,"mt-2")} rows={3} value={request} onChange={e=>setRequest(e.target.value)} maxLength={4000} placeholder="Cinco historias para esta semana, destacando las reservas y la experiencia del camping"/></label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><label className="text-xs text-white/60">Cantidad<input type="number" min={1} max={20} className={cn(STORY_INPUT,"mt-2")} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><label className="text-xs text-white/60">Desde<input type="date" className={cn(STORY_INPUT,"mt-2")} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="text-xs text-white/60">Columna<select className={cn(STORY_INPUT,"mt-2")} value={columnId} onChange={e=>setColumnId(e.target.value)}>{columns.map(column=><option key={column.id} value={column.id}>{column.nombre}</option>)}</select></label></div>
          <div className="flex flex-wrap gap-2"><button className={STORY_BUTTON} disabled={!request.trim()||!data?.brief||count<1||count>20||!date} onClick={()=>void action("plan",plan,false)}><Sparkles size={14}/>Preparar lote con IA</button><button className={STORY_BUTTON} onClick={()=>setDrafts([{title:request.slice(0,100)||"Nueva historia",settings:{...EMPTY_STORY,request,date,referenceAssetIds:[]}}])}>Crear una manualmente</button></div>
          {busy==="plan"&&<p className="flex items-center gap-2 text-xs text-quepia-cyan"><Loader2 size={14} className="animate-spin"/>Preparando propuestas…</p>}
          {drafts.map((draft,i)=><details key={i} className="rounded-xl border border-white/10 p-4" open={drafts.length===1}><summary className="cursor-pointer text-sm text-white/75">{i+1}. {draft.title}</summary><div className="mt-4 space-y-4"><input aria-label={`Nombre de historia ${i+1}`} className={STORY_INPUT} value={draft.title} onChange={e=>updateDraft(i,{title:e.target.value})}/><StoryFields settings={draft.settings} onChange={settings=>updateDraft(i,{settings})}/><label className="block text-xs text-white/60">Prompt<textarea className={cn(STORY_INPUT,"mt-2")} rows={5} value={draft.settings.prompt} onChange={e=>updateDraft(i,{settings:{...draft.settings,prompt:e.target.value}})}/></label></div></details>)}
          {drafts.length>0&&<p className="text-xs text-white/40">Guardá las historias y luego agregá sus referencias. Las imágenes se generan al seleccionar las piezas y tocar Generar.</p>}
        </fieldset><div className="flex justify-end border-t border-white/10 p-4"><button className={cn(STORY_BUTTON,"text-quepia-cyan")} disabled={Boolean(busy)||!drafts.length||!columnId||drafts.some(d=>!d.title.trim())} onClick={()=>void action("create",createDrafts)}>{busy==="create"&&<Loader2 className="animate-spin" size={14}/>}Guardar {drafts.length||""} historias</button></div>
      </div>
    </div>}
    {rulesOpen&&<div role="dialog" aria-modal="true" aria-label="Reglas del cliente" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3"><div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#101318] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-medium text-white">Reglas visuales del cliente</h2><button className={STORY_BUTTON} aria-label="Cerrar reglas" disabled={Boolean(busy)} onClick={()=>setRulesOpen(false)}><X size={16}/></button></div><p className="mb-3 text-xs text-white/45">Se guardan en las notas de IA del brief y se aplican a las nuevas generaciones junto con la paleta, el logo y la dirección visual.</p><textarea rows={9} className={STORY_INPUT} maxLength={8000} value={rules} onChange={e=>setRules(e.target.value)} placeholder="Estética, restricciones y ejemplos de lo que esta marca debe conservar"/>{error&&<p className="mt-2 text-xs text-red-300">{error}</p>}<button className={cn(STORY_BUTTON,"mt-4 text-quepia-cyan")} disabled={Boolean(busy)||!data?.brief} onClick={()=>void action("profile",async()=>{await storyRequest({action:"profile",projectId,rules});setRulesOpen(false)})}>Guardar reglas</button></div></div>}
    {publishing&&<div role="dialog" aria-modal="true" aria-label="Publicar historia" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3"><div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#101318]"><div className="flex items-center justify-between border-b border-white/10 p-4"><h2 className="text-white">Publicar · {publishing.task.titulo}</h2><button className={STORY_BUTTON} aria-label="Cerrar publicación" onClick={()=>setPublishing(null)}><X size={16}/></button></div><div className="overflow-y-auto p-5"><ZernioPublishingPanel key={publishing.job.id} taskId={publishing.task.id} projectId={projectId} socialCopy={publishing.task.social_copy||""} initialAssetId={publishing.job.asset_id || undefined} initialPublicationType={publishing.job.settings.format==="story"?"story":"feed"} onPublished={()=>{void load();onChanged()}}/></div></div></div>}
  </div>
}
