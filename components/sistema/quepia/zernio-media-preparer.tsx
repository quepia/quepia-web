"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crop,
  Film,
  ImageIcon,
  RotateCcw,
  X,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import {
  defaultZernioMediaEdit,
  ZERNIO_MEDIA_FORMATS,
  type ZernioMediaEdit,
  type ZernioMediaFormat,
} from "@/lib/zernio/media-formats"

export type ZernioPreviewAsset = {
  id: string
  name: string
  previewUrl: string | null
  fileType: string | null
  editable: boolean
  assetType: string
}

type Props = {
  open: boolean
  assets: ZernioPreviewAsset[]
  content: string
  accountLabel: string
  edits: Record<string, ZernioMediaEdit>
  onEditChange: (assetId: string, edit: ZernioMediaEdit) => void
  onOrderChange: (assetIds: string[]) => void
  onClose: () => void
}

const FORMAT_ORDER: ZernioMediaFormat[] = ["original", "portrait", "square", "landscape"]

type VideoMetadata = {
  duration: number
  width: number
  height: number
}

function MediaFrame({
  asset,
  edit,
  onVideoMetadata,
}: {
  asset: ZernioPreviewAsset
  edit: ZernioMediaEdit
  onVideoMetadata?: (metadata: VideoMetadata) => void
}) {
  const preset = ZERNIO_MEDIA_FORMATS[edit.format]
  const cropped = Boolean(preset.width && preset.height && asset.editable)

  if (!asset.previewUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/30">
        <ImageIcon className="h-8 w-8" />
        <span className="text-xs">Vista previa no disponible</span>
      </div>
    )
  }

  if (asset.fileType?.startsWith("video/")) {
    return (
      <video
        src={asset.previewUrl}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          onVideoMetadata?.({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
          })
        }}
      />
    )
  }

  return (
    <Image
      src={asset.previewUrl}
      alt={asset.name}
      fill
      unoptimized
      sizes="(max-width: 768px) 92vw, 520px"
      className="transition-transform duration-150"
      style={cropped
        ? {
            objectFit: "cover",
            objectPosition: `${edit.positionX}% ${edit.positionY}%`,
            transform: `scale(${edit.zoom})`,
            transformOrigin: `${edit.positionX}% ${edit.positionY}%`,
          }
        : { objectFit: "contain" }}
    />
  )
}

export function ZernioMediaPreparer({
  open,
  assets,
  content,
  accountLabel,
  edits,
  onEditChange,
  onOrderChange,
  onClose,
}: Props) {
  const [activeAssetId, setActiveAssetId] = useState<string | null>(assets[0]?.id || null)
  const [videoMetadata, setVideoMetadata] = useState<Record<string, VideoMetadata>>({})

  useEffect(() => {
    if (!assets.some((asset) => asset.id === activeAssetId)) setActiveAssetId(assets[0]?.id || null)
  }, [activeAssetId, assets])

  const activeIndex = Math.max(0, assets.findIndex((asset) => asset.id === activeAssetId))
  const activeAsset = assets[activeIndex] || null
  const activeEdit = activeAsset
    ? edits[activeAsset.id] || defaultZernioMediaEdit(activeAsset.id)
    : null
  const isReel = assets.length === 1 && assets[0]?.assetType === "reel"
  const activeVideoMetadata = activeAsset ? videoMetadata[activeAsset.id] : null
  const reelFileTypeValid = Boolean(activeAsset?.fileType && ["video/mp4", "video/quicktime"].includes(activeAsset.fileType))
  const reelDurationValid = activeVideoMetadata
    ? activeVideoMetadata.duration >= 3 && activeVideoMetadata.duration <= 90
    : null
  const reelAspectValid = activeVideoMetadata
    ? Math.abs((activeVideoMetadata.width / activeVideoMetadata.height) - (9 / 16)) < 0.02
    : null
  const commonFormat = useMemo(() => {
    const firstEditable = assets.find((asset) => asset.editable)
    return firstEditable
      ? (edits[firstEditable.id]?.format || "original")
      : "original"
  }, [assets, edits])

  if (!open) return null

  const applyFormat = (format: ZernioMediaFormat) => {
    assets.forEach((asset) => {
      if (!asset.editable) return
      const current = edits[asset.id] || defaultZernioMediaEdit(asset.id)
      onEditChange(asset.id, { ...current, format })
    })
  }

  const moveActive = (direction: -1 | 1) => {
    if (!activeAsset) return
    const nextIndex = activeIndex + direction
    if (nextIndex < 0 || nextIndex >= assets.length) return
    const order = assets.map((asset) => asset.id)
    const [moved] = order.splice(activeIndex, 1)
    order.splice(nextIndex, 0, moved)
    onOrderChange(order)
  }

  const showAsset = (index: number) => {
    const normalized = (index + assets.length) % assets.length
    setActiveAssetId(assets[normalized]?.id || null)
  }

  const preset = activeEdit ? ZERNIO_MEDIA_FORMATS[activeEdit.format] : ZERNIO_MEDIA_FORMATS.original
  const aspectRatio = isReel
    ? "9 / 16"
    : preset.width && preset.height
      ? `${preset.width} / ${preset.height}`
      : "4 / 5"

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Cerrar preparación de contenido" className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 grid max-h-[94svh] w-full overflow-hidden rounded-t-2xl border border-white/10 bg-[#151515] shadow-2xl sm:max-w-5xl sm:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] sm:rounded-2xl">
        <section className="max-h-[58svh] overflow-y-auto border-b border-white/8 p-4 sm:max-h-[90svh] sm:border-b-0 sm:border-r sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {isReel ? <Film className="h-4 w-4 text-quepia-cyan" /> : <Crop className="h-4 w-4 text-quepia-cyan" />}
                <h2 className="text-sm font-semibold text-white">Previsualización del {isReel ? "Reel" : "post"}</h2>
              </div>
              <p className="mt-1 text-[11px] text-white/35">
                {isReel ? "Vista 9:16 sin recorte; al publicar se normaliza a MP4/H.264." : "El original no se modifica. El recorte se genera al publicar."}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/8">
              <X className="h-4 w-4 text-white/50" />
            </button>
          </div>

          <div className={cn("mx-auto overflow-hidden rounded-xl border border-white/10 bg-[#0e0e0e] shadow-xl", isReel ? "max-w-[360px]" : "max-w-[520px]")}>
            <div className="flex items-center gap-2.5 px-3 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-quepia-cyan/80 to-fuchsia-500/70 text-[10px] font-bold text-black">Q</div>
              <div>
                <p className="text-xs font-medium text-white/85">{accountLabel || "Cuenta seleccionada"}</p>
                <p className="text-[10px] text-white/30">Vista previa aproximada del {isReel ? "Reel · 9:16" : "feed"}</p>
              </div>
            </div>

            <div className="relative overflow-hidden bg-black" style={{ aspectRatio }}>
              {activeAsset && activeEdit ? (
                <MediaFrame
                  asset={activeAsset}
                  edit={activeEdit}
                  onVideoMetadata={(metadata) => setVideoMetadata((current) => (
                    current[activeAsset.id]?.duration === metadata.duration
                      && current[activeAsset.id]?.width === metadata.width
                      && current[activeAsset.id]?.height === metadata.height
                      ? current
                      : { ...current, [activeAsset.id]: metadata }
                  ))}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-white/25">Seleccioná al menos un asset</div>
              )}
              {assets.length > 1 && (
                <>
                  <button type="button" aria-label="Placa anterior" onClick={() => showAsset(activeIndex - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/65 p-1.5 text-white/80 backdrop-blur-sm">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Placa siguiente" onClick={() => showAsset(activeIndex + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/65 p-1.5 text-white/80 backdrop-blur-sm">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white/75">{activeIndex + 1}/{assets.length}</span>
                </>
              )}
            </div>

            {assets.length > 1 && (
              <div className="flex justify-center gap-1 py-2.5">
                {assets.map((asset, index) => (
                  <button key={asset.id} type="button" aria-label={`Ver placa ${index + 1}`} onClick={() => setActiveAssetId(asset.id)} className={cn("h-1.5 rounded-full transition-all", index === activeIndex ? "w-4 bg-quepia-cyan" : "w-1.5 bg-white/20")} />
                ))}
              </div>
            )}

            <div className="border-t border-white/6 px-3 py-3">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/72">{content || "Sin copy"}</p>
            </div>
          </div>
        </section>

        <aside className="max-h-[36svh] overflow-y-auto p-4 sm:max-h-[90svh] sm:p-6">
          <div className="space-y-5">
            {isReel ? (
              <div className="rounded-xl border border-quepia-cyan/20 bg-quepia-cyan/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-quepia-cyan/10 text-quepia-cyan"><Film className="h-4 w-4" /></div>
                  <div>
                    <p className="text-xs font-medium text-white/75">Reel vertical · 9:16</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/38">Instagram publicará este único video como Reel. No se aplican recortes de carrusel.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-[11px] text-white/45">
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-quepia-cyan/70" />Un único archivo de video</span>
                  <span className="flex items-center gap-2">
                    {reelFileTypeValid ? <CheckCircle2 className="h-3.5 w-3.5 text-quepia-cyan/70" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300/75" />}
                    {reelFileTypeValid ? "Formato MP4 o MOV compatible" : "El archivo debe ser MP4 o MOV"}
                  </span>
                  <span className="flex items-center gap-2">
                    {reelDurationValid === false
                      ? <AlertTriangle className="h-3.5 w-3.5 text-amber-300/75" />
                      : reelDurationValid
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-quepia-cyan/70" />
                        : <span className="h-3.5 w-3.5 rounded-full border border-white/25" />}
                    {activeVideoMetadata
                      ? `${activeVideoMetadata.duration.toFixed(1)} s · ${reelDurationValid ? "duración compatible" : "debe durar entre 3 y 90 s"}`
                      : "Duración: se verificará al cargar el video"}
                  </span>
                  <span className="flex items-center gap-2">
                    {reelAspectValid === false
                      ? <AlertTriangle className="h-3.5 w-3.5 text-amber-300/75" />
                      : reelAspectValid
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-quepia-cyan/70" />
                        : <span className="h-3.5 w-3.5 rounded-full border border-white/25" />}
                    {activeVideoMetadata
                      ? `${activeVideoMetadata.width} × ${activeVideoMetadata.height} · ${reelAspectValid ? "vertical 9:16" : "se adaptará a 1080 × 1920"}`
                      : "Resolución: se verificará al cargar el video"}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs font-medium text-white/60">Formato común del carrusel</p>
                <div className="grid grid-cols-2 gap-2">
                  {FORMAT_ORDER.map((format) => {
                    const item = ZERNIO_MEDIA_FORMATS[format]
                    return (
                      <button key={format} type="button" onClick={() => applyFormat(format)} className={cn(
                        "rounded-lg border px-3 py-2 text-left transition-colors",
                        commonFormat === format ? "border-quepia-cyan/45 bg-quepia-cyan/8" : "border-white/8 bg-white/[0.02] hover:border-white/15",
                      )}>
                        <span className={cn("block text-xs", commonFormat === format ? "text-quepia-cyan" : "text-white/65")}>{item.label}</span>
                        <span className="mt-0.5 block text-[10px] text-white/28">{item.hint}</span>
                      </button>
                    )
                  })}
                </div>
                {assets.length > 1 && commonFormat === "original" && (
                  <p className="mt-2 text-[10px] leading-relaxed text-amber-200/60">En Instagram, la primera placa define la proporción de todo el carrusel. Elegí un formato común para evitar recortes automáticos.</p>
                )}
              </div>
            )}

            {activeAsset && activeEdit && (
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-white/75">{isReel ? "Video" : `Placa ${activeIndex + 1}`}: {activeAsset.name}</p>
                    <p className="mt-0.5 text-[10px] text-white/30">{isReel ? "Archivo original del Reel" : "Ajustes individuales de encuadre"}</p>
                  </div>
                  {!isReel && (
                    <button type="button" onClick={() => onEditChange(activeAsset.id, { ...defaultZernioMediaEdit(activeAsset.id), format: commonFormat })} className="rounded-md p-1.5 text-white/35 hover:bg-white/8 hover:text-white/65" title="Restablecer encuadre">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {isReel ? (
                  <p className="text-[11px] leading-relaxed text-white/35">El contenido completo se conserva dentro del marco 9:16. Antes de enviarlo, el sistema lo convierte a MP4/H.264, 1080 × 1920 y 30 fps.</p>
                ) : !activeAsset.editable ? (
                  <p className="text-[11px] text-white/35">Este archivo puede previsualizarse, pero el recorte de esta fase está disponible para imágenes almacenadas en el sistema.</p>
                ) : activeEdit.format === "original" ? (
                  <p className="text-[11px] text-white/35">Elegí 4:5, 1:1 o 1.91:1 para habilitar zoom y posición.</p>
                ) : (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 flex justify-between text-[10px] text-white/40"><span>Zoom</span><span>{activeEdit.zoom.toFixed(2)}×</span></span>
                      <input type="range" min="1" max="3" step="0.01" value={activeEdit.zoom} onChange={(event) => onEditChange(activeAsset.id, { ...activeEdit, zoom: Number(event.target.value) })} className="w-full accent-[#2ae7e4]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 flex justify-between text-[10px] text-white/40"><span>Posición horizontal</span><span>{Math.round(activeEdit.positionX)}%</span></span>
                      <input type="range" min="0" max="100" step="1" value={activeEdit.positionX} onChange={(event) => onEditChange(activeAsset.id, { ...activeEdit, positionX: Number(event.target.value) })} className="w-full accent-[#2ae7e4]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 flex justify-between text-[10px] text-white/40"><span>Posición vertical</span><span>{Math.round(activeEdit.positionY)}%</span></span>
                      <input type="range" min="0" max="100" step="1" value={activeEdit.positionY} onChange={(event) => onEditChange(activeAsset.id, { ...activeEdit, positionY: Number(event.target.value) })} className="w-full accent-[#2ae7e4]" />
                    </label>
                  </div>
                )}
              </div>
            )}

            {!isReel && assets.length > 1 && <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-white/60">Orden de placas</p>
                <span className="text-[10px] text-white/25">{assets.length} seleccionadas</span>
              </div>
              <div className="space-y-1.5">
                {assets.map((asset, index) => (
                  <div key={asset.id} className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left",
                    asset.id === activeAssetId ? "border-quepia-cyan/30 bg-quepia-cyan/[0.05]" : "border-white/7 bg-white/[0.015]",
                  )}>
                    <button type="button" onClick={() => setActiveAssetId(asset.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="w-5 text-center text-[10px] text-white/30">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-white/60">{asset.name}</span>
                    </button>
                    <span className="flex gap-1">
                      <button type="button" aria-label="Mover placa hacia atrás" disabled={index === 0} onClick={() => { if (asset.id !== activeAssetId) setActiveAssetId(asset.id); const order = assets.map((item) => item.id); [order[index - 1], order[index]] = [order[index], order[index - 1]]; onOrderChange(order) }} className="rounded p-1 hover:bg-white/8 disabled:pointer-events-none disabled:opacity-20"><ArrowLeft className="h-3 w-3" /></button>
                      <button type="button" aria-label="Mover placa hacia adelante" disabled={index === assets.length - 1} onClick={() => { if (asset.id !== activeAssetId) setActiveAssetId(asset.id); const order = assets.map((item) => item.id); [order[index], order[index + 1]] = [order[index + 1], order[index]]; onOrderChange(order) }} className="rounded p-1 hover:bg-white/8 disabled:pointer-events-none disabled:opacity-20"><ArrowRight className="h-3 w-3" /></button>
                    </span>
                  </div>
                ))}
              </div>
            </div>}

            {!isReel && assets.length > 1 && <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => moveActive(-1)} disabled={activeIndex === 0 || assets.length < 2} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 disabled:opacity-25"><ArrowLeft className="h-3.5 w-3.5" />Mover</button>
              <button type="button" onClick={() => moveActive(1)} disabled={activeIndex === assets.length - 1 || assets.length < 2} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 disabled:opacity-25">Mover<ArrowRight className="h-3.5 w-3.5" /></button>
            </div>}

            <button type="button" onClick={onClose} className="w-full rounded-lg bg-quepia-cyan px-4 py-2.5 text-sm font-semibold text-black">Usar esta {isReel ? "previsualización" : "preparación"}</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
