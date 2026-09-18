"use client"

import { useState } from "react"
import { Loader2, MapPin, Music2, Plus, RefreshCw, Trash2, Users } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

export type InstagramAudioAsset = {
  audioId: string
  title?: string
  displayArtist?: string
  igUsername?: string
  coverArtworkThumbnailUrl?: string
  onPlatformAudioPreviewLink?: string
}

export type InstagramTagDraft = {
  id: string
  username: string
  xPercent: number
  yPercent: number
  mediaIndex: number
}

export type InstagramOptionsDraft = {
  shareToFeed: boolean
  commentsEnabled: boolean
  isAiGenerated: boolean
  locationId: string
  collaborators: string
  userTags: InstagramTagDraft[]
  audioName: string
  muteAudio: boolean
  audio: InstagramAudioAsset | null
  audioVolume: number
  videoVolume: number
  trialReel: boolean
  trialGraduationStrategy: "MANUAL" | "SS_PERFORMANCE"
  isPaidPartnership: boolean
  brandedContentSponsors: string
}

export const DEFAULT_INSTAGRAM_OPTIONS: InstagramOptionsDraft = {
  shareToFeed: true,
  commentsEnabled: true,
  isAiGenerated: false,
  locationId: "",
  collaborators: "",
  userTags: [],
  audioName: "",
  muteAudio: false,
  audio: null,
  audioVolume: 100,
  videoVolume: 100,
  trialReel: false,
  trialGraduationStrategy: "MANUAL",
  isPaidPartnership: false,
  brandedContentSponsors: "",
}

const fieldClass = "w-full rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs text-white/75 outline-none placeholder:text-white/25 focus:border-quepia-cyan/40"

export function InstagramPublishingOptions({
  taskId,
  accountId,
  isReel,
  mediaCount,
  value,
  onChange,
  onReconnect,
  reconnecting,
}: {
  taskId: string
  accountId: string
  isReel: boolean
  mediaCount: number
  value: InstagramOptionsDraft
  onChange: (next: InstagramOptionsDraft) => void
  onReconnect: () => void
  reconnecting: boolean
}) {
  const [audioQuery, setAudioQuery] = useState("")
  const [audioResults, setAudioResults] = useState<InstagramAudioAsset[]>([])
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState("")

  const update = <K extends keyof InstagramOptionsDraft>(key: K, next: InstagramOptionsDraft[K]) => {
    onChange({ ...value, [key]: next })
  }

  const searchAudio = async () => {
    setAudioLoading(true)
    setAudioError("")
    try {
      const params = new URLSearchParams({ taskId, accountId })
      if (audioQuery.trim()) params.set("q", audioQuery.trim())
      const response = await fetch(`/api/zernio/instagram/audio?${params.toString()}`, { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "No se pudo buscar música en Instagram")
      setAudioResults(Array.isArray(data?.audio) ? data.audio : [])
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "No se pudo buscar música en Instagram")
      setAudioResults([])
    } finally {
      setAudioLoading(false)
    }
  }

  const addTag = () => {
    update("userTags", [...value.userTags, {
      id: crypto.randomUUID(),
      username: "",
      xPercent: 50,
      yPercent: 50,
      mediaIndex: 0,
    }])
  }

  const changeTag = (id: string, patch: Partial<InstagramTagDraft>) => {
    update("userTags", value.userTags.map((tag) => tag.id === id ? { ...tag, ...patch } : tag))
  }

  return (
    <details open className="rounded-xl border border-pink-300/12 bg-pink-300/[0.025]">
      <summary className="cursor-pointer list-none px-3 py-3 text-xs font-medium text-white/70">
        Opciones de Instagram
      </summary>
      <div className="space-y-4 border-t border-white/[0.06] px-3 py-3">
        {isReel ? (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-xs text-white/65">Mostrar también en el feed</span>
                <span className="block text-[10px] text-white/30">El Reel también aparecerá en el feed principal.</span>
              </span>
              <input type="checkbox" checked={value.shareToFeed} onChange={(event) => update("shareToFeed", event.target.checked)} className="accent-[#2ae7e4]" />
            </label>

            <div className="rounded-lg border border-white/[0.07] bg-black/10 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Music2 className="h-3.5 w-3.5 text-pink-200/70" />
                <p className="text-xs font-medium text-white/60">Música de Instagram</p>
              </div>
              <div className="flex gap-2">
                <input value={audioQuery} onChange={(event) => setAudioQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchAudio() } }} placeholder="Canción o artista; vacío muestra tendencias" className={fieldClass} />
                <button type="button" onClick={() => void searchAudio()} disabled={audioLoading} className="rounded-lg border border-white/10 px-3 text-xs text-white/60 hover:text-white disabled:opacity-40">
                  {audioLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Buscar"}
                </button>
              </div>
              {audioError ? (
                <div className="mt-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.04] p-2 text-[11px] text-amber-200/70">
                  <p>{audioError}</p>
                  <button type="button" onClick={onReconnect} disabled={reconnecting} className="mt-1.5 inline-flex items-center gap-1 text-quepia-cyan hover:underline disabled:opacity-40">
                    {reconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Reconectar Instagram con Facebook
                  </button>
                </div>
              ) : null}
              {audioResults.length > 0 ? (
                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                  {audioResults.map((audio) => (
                    <button key={audio.audioId} type="button" onClick={() => update("audio", audio)} className={cn("flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left", value.audio?.audioId === audio.audioId ? "border-quepia-cyan/35 bg-quepia-cyan/[0.07]" : "border-white/[0.07] hover:border-white/15")}>
                      {audio.coverArtworkThumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={audio.coverArtworkThumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : <Music2 className="h-5 w-5 text-white/25" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-white/70">{audio.title || "Audio de Instagram"}</span>
                        <span className="block truncate text-[10px] text-white/30">{audio.displayArtist || (audio.igUsername ? `@${audio.igUsername}` : "Instagram")}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {value.audio ? (
                <div className="mt-3 space-y-2 rounded-lg bg-white/[0.025] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-quepia-cyan">{value.audio.title || "Audio seleccionado"}</span>
                    <button type="button" onClick={() => update("audio", null)} className="text-white/35 hover:text-white">Quitar</button>
                  </div>
                  <label className="block text-[10px] text-white/35">Volumen de música: {value.audioVolume}%<input type="range" min="0" max="100" value={value.audioVolume} onChange={(event) => update("audioVolume", Number(event.target.value))} className="mt-1 w-full accent-[#2ae7e4]" /></label>
                  <label className="block text-[10px] text-white/35">Volumen original del video: {value.videoVolume}%<input type="range" min="0" max="100" value={value.videoVolume} onChange={(event) => update("videoVolume", Number(event.target.value))} className="mt-1 w-full accent-[#2ae7e4]" /></label>
                </div>
              ) : null}
              <p className="mt-2 text-[10px] text-white/25">El catálogo de música y las colaboraciones pagadas requieren conexión mediante Facebook.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-white/40">Nombre del audio original<input value={value.audioName} onChange={(event) => update("audioName", event.target.value)} maxLength={100} placeholder="Ej. Sonido original Quepia" className={cn(fieldClass, "mt-1")} /></label>
              <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-white/55"><input type="checkbox" checked={value.muteAudio} onChange={(event) => update("muteAudio", event.target.checked)} className="accent-[#2ae7e4]" />Silenciar audio original</label>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/[0.07] px-3 py-2">
              <span><span className="block text-xs text-white/60">Reel de prueba</span><span className="block text-[10px] text-white/28">Se muestra primero a personas que no siguen la cuenta.</span></span>
              <input type="checkbox" checked={value.trialReel} onChange={(event) => update("trialReel", event.target.checked)} className="accent-[#2ae7e4]" />
            </label>
            {value.trialReel ? <select value={value.trialGraduationStrategy} onChange={(event) => update("trialGraduationStrategy", event.target.value as InstagramOptionsDraft["trialGraduationStrategy"])} className={fieldClass}><option value="MANUAL">Pasar al feed manualmente</option><option value="SS_PERFORMANCE">Pasar automáticamente si funciona bien</option></select> : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] text-white/40"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />Ubicación</span><input inputMode="numeric" value={value.locationId} onChange={(event) => update("locationId", event.target.value.replace(/\D/g, ""))} placeholder="ID de página de Facebook" className={cn(fieldClass, "mt-1")} /><span className="mt-1 block text-[9px] text-white/22">Debe ser una página con dirección cargada.</span></label>
          <label className="text-[11px] text-white/40"><span className="flex items-center gap-1"><Users className="h-3 w-3" />Colaboradores</span><input value={value.collaborators} onChange={(event) => update("collaborators", event.target.value)} placeholder="@cuenta1, @cuenta2 (máx. 3)" className={cn(fieldClass, "mt-1")} /></label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-medium text-white/55">Etiquetar personas</p><button type="button" onClick={addTag} disabled={value.userTags.length >= 20} className="inline-flex items-center gap-1 text-[11px] text-quepia-cyan disabled:opacity-40"><Plus className="h-3 w-3" />Agregar</button></div>
          <div className="space-y-2">
            {value.userTags.map((tag) => (
              <div key={tag.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-white/[0.07] p-2">
                <div className={cn("grid gap-2", !isReel && "sm:grid-cols-4")}>
                  <input value={tag.username} onChange={(event) => changeTag(tag.id, { username: event.target.value })} placeholder="@usuario" className={fieldClass} />
                  {!isReel ? <><label className="text-[9px] text-white/30">X %<input type="number" min="0" max="100" value={tag.xPercent} onChange={(event) => changeTag(tag.id, { xPercent: Number(event.target.value) })} className={cn(fieldClass, "mt-0.5")} /></label><label className="text-[9px] text-white/30">Y %<input type="number" min="0" max="100" value={tag.yPercent} onChange={(event) => changeTag(tag.id, { yPercent: Number(event.target.value) })} className={cn(fieldClass, "mt-0.5")} /></label><label className="text-[9px] text-white/30">Asset<input type="number" min="1" max={Math.max(1, mediaCount)} value={tag.mediaIndex + 1} onChange={(event) => changeTag(tag.id, { mediaIndex: Math.max(0, Number(event.target.value) - 1) })} className={cn(fieldClass, "mt-0.5")} /></label></> : null}
                </div>
                <button type="button" onClick={() => update("userTags", value.userTags.filter((item) => item.id !== tag.id))} className="self-center rounded p-1.5 text-white/25 hover:bg-white/5 hover:text-red-300" aria-label={`Quitar etiqueta ${tag.username || "vacía"}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-white/55"><input type="checkbox" checked={value.commentsEnabled} onChange={(event) => update("commentsEnabled", event.target.checked)} className="accent-[#2ae7e4]" />Permitir comentarios</label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-white/55"><input type="checkbox" checked={value.isAiGenerated} onChange={(event) => update("isAiGenerated", event.target.checked)} className="accent-[#2ae7e4]" />Etiquetar contenido generado con IA</label>
        </div>

        <div className="rounded-lg border border-white/[0.07] p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3"><span><span className="block text-xs text-white/60">Colaboración pagada</span><span className="block text-[10px] text-white/28">Muestra la etiqueta de partnership de Instagram.</span></span><input type="checkbox" checked={value.isPaidPartnership} onChange={(event) => update("isPaidPartnership", event.target.checked)} className="accent-[#2ae7e4]" /></label>
          {value.isPaidPartnership ? <input value={value.brandedContentSponsors} onChange={(event) => update("brandedContentSponsors", event.target.value)} placeholder="@marca1, @marca2 (opcional)" className={cn(fieldClass, "mt-2")} /> : null}
        </div>
      </div>
    </details>
  )
}
