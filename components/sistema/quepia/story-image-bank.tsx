"use client"
import Image from "next/image"
import { useEffect, useState } from "react"
import type { StoryReference } from "@/lib/ai/story-references"

export function StoryImageBank({ projectId, selected = [], maxSelected = 4, onToggle }: {
  projectId: string; selected?: string[]; maxSelected?: number; onToggle?: (reference: StoryReference, checked: boolean) => void
}) {
  const [items,setItems]=useState<StoryReference[]>([])
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    const abort=new AbortController()
    setLoading(true);setError("")
    fetch(`/api/ai/stories/references?projectId=${projectId}`,{signal:abort.signal}).then(async response=>{
      const data=await response.json()
      if(!response.ok) throw new Error(data.error)
      setItems(data.references)
    }).catch(err=>{if(!abort.signal.aborted)setError(err.message)}).finally(()=>{if(!abort.signal.aborted)setLoading(false)})
    return ()=>abort.abort()
  },[projectId])
  return <div className="space-y-3">
    {loading&&<p className="text-xs text-white/40">Cargando banco de imágenes…</p>}
    {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
    {!loading&&!error&&!items.length&&<p className="text-xs text-white/40">Agregá fotos a las tareas o vinculá una carpeta de Drive en las referencias del brief con la nota «Banco de imágenes».</p>}
    <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">{items.map(item=>{
      const key=`${item.source}:${item.id}`,checked=selected.includes(key)
      return <label key={key} className="relative overflow-hidden rounded-lg border border-white/10 bg-white/5 p-2">
        <div className="relative aspect-square"><Image unoptimized fill sizes="120px" loading="lazy" className="object-contain" src={item.previewUrl || `/api/ai/stories/references?projectId=${projectId}&source=${item.source}&id=${item.id}`} alt={item.name}/></div>
        <p className="mt-1 truncate text-[11px] text-white/60" title={item.name}>{item.name}</p>
        <span className="text-[10px] text-white/35">{item.source==="drive"?"Drive":"Proyecto"}</span>
        {onToggle&&<input aria-label={`Usar ${item.name}`} type="checkbox" className="absolute left-2 top-2" checked={checked} disabled={!checked&&selected.length>=maxSelected} onChange={e=>onToggle(item,e.target.checked)}/>}
      </label>
    })}</div>
  </div>
}
