"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Film, ImageUp, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

/**
 * Cover art for reel tasks. The cover lives on the asset version's thumbnail,
 * which is what the publishing panel previews and what travels with the asset,
 * so a frame picked here is the same image everywhere downstream.
 */

type ReelAsset = {
    id: string
    nombre: string
    versionId: string
    videoUrl: string | null
    coverUrl: string | null
    coverPath: string | null
}

type RawVersion = {
    id: string
    version_number: number
    file_url: string | null
    file_type: string | null
    storage_path: string | null
    thumbnail_path: string | null
    thumbnail_url: string | null
}

type RawAsset = {
    id: string
    nombre: string
    current_version: number
    asset_type: string | null
    versions: RawVersion[]
}

function pickVersion(asset: RawAsset): RawVersion | null {
    if (!Array.isArray(asset.versions) || asset.versions.length === 0) return null
    return asset.versions.find((v) => v.version_number === asset.current_version)
        || [...asset.versions].sort((a, b) => b.version_number - a.version_number)[0]
        || null
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return "0:00"
    const total = Math.max(0, Math.floor(seconds))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

export function ReelCoverPanel({
    taskId,
    projectId,
    onCoverChanged,
}: {
    taskId: string
    projectId: string
    onCoverChanged?: () => void
}) {
    const [assets, setAssets] = useState<ReelAsset[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [error, setError] = useState("")
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const videoRef = useRef<HTMLVideoElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const { data, error: queryError } = await supabase
                .from("sistema_assets")
                .select(`
                    id,
                    nombre,
                    current_version,
                    asset_type,
                    versions:sistema_asset_versions(id, version_number, file_url, file_type, storage_path, thumbnail_path, thumbnail_url)
                `)
                .eq("task_id", taskId)
                .eq("asset_type", "reel")
                .order("created_at", { ascending: false })

            if (queryError) throw new Error(queryError.message)

            const rows = (data || []) as unknown as RawAsset[]
            const references: string[] = []
            const prepared = rows.map((asset) => {
                const version = pickVersion(asset)
                const videoRef = version?.storage_path || version?.file_url || null
                const coverRef = version?.thumbnail_path || version?.thumbnail_url || null
                if (videoRef) references.push(videoRef)
                if (coverRef) references.push(coverRef)
                return {
                    id: asset.id,
                    nombre: asset.nombre,
                    versionId: version?.id || "",
                    videoRef,
                    coverRef,
                }
            }).filter((asset) => Boolean(asset.versionId))

            let signed: Record<string, string | null> = {}
            if (references.length > 0) {
                const response = await fetch("/api/assets/sign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paths: Array.from(new Set(references)) }),
                })
                const payload = await response.json()
                signed = payload?.urls || {}
            }

            const resolved: ReelAsset[] = prepared.map((asset) => ({
                id: asset.id,
                nombre: asset.nombre,
                versionId: asset.versionId,
                videoUrl: asset.videoRef ? signed[asset.videoRef] || asset.videoRef : null,
                coverUrl: asset.coverRef ? signed[asset.coverRef] || asset.coverRef : null,
                coverPath: asset.coverRef,
            }))

            setAssets(resolved)
            setSelectedId((current) => (current && resolved.some((a) => a.id === current)) ? current : resolved[0]?.id || null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudieron cargar los reels")
        } finally {
            setLoading(false)
        }
    }, [taskId])

    useEffect(() => { void load() }, [load])

    const selected = assets.find((asset) => asset.id === selectedId) || null

    useEffect(() => {
        setCurrentTime(0)
        setDuration(0)
    }, [selectedId])

    const applyCover = async (payload: Record<string, unknown>) => {
        if (!selected) return
        setWorking(true)
        setError("")
        try {
            const response = await fetch("/api/assets/reel-cover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId: selected.id, ...payload }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data?.error || "No se pudo actualizar la portada")

            setAssets((current) => current.map((asset) => asset.id === selected.id
                ? { ...asset, coverUrl: data.coverUrl || asset.coverUrl, coverPath: data.coverPath || asset.coverPath }
                : asset))
            onCoverChanged?.()
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo actualizar la portada")
        } finally {
            setWorking(false)
        }
    }

    const handleUploadCover = async (file: File) => {
        if (!selected) return
        setWorking(true)
        setError("")
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const safeName = file.name
                .normalize("NFKD")
                .replace(/[^a-zA-Z0-9._-]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^[-.]+|[-.]+$/g, "")
                .toLowerCase() || `portada-${Date.now()}.jpg`
            const coverPath = `${projectId}/${taskId}/covers/reel-cover-${Date.now()}-${safeName}`

            const { error: uploadError } = await supabase.storage
                .from("sistema-assets")
                .upload(coverPath, file, { upsert: true, contentType: file.type || "image/jpeg" })
            if (uploadError) throw new Error(uploadError.message)

            await applyCover({ coverPath })
        } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo subir la portada")
            setWorking(false)
        }
    }

    if (loading) {
        return (
            <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#242a32] bg-[#12161b] px-4 py-3 text-xs text-white/35">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando reels de la tarea…
            </div>
        )
    }

    return (
        <div className="mb-5 rounded-2xl border border-[#242a32] bg-[#12161b] p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Film className="h-4 w-4 text-[#fb7185]" />
                        <h3 className="text-sm font-semibold text-white/90">Portada del Reel</h3>
                    </div>
                    <p className="mt-1 text-xs text-white/35">
                        Elegí un frame del video o subí una imagen. Es la portada que viaja con el asset a la publicación.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => { void load() }}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/5"
                    title="Actualizar"
                    aria-label="Actualizar reels"
                >
                    <RefreshCw className="h-3.5 w-3.5 text-white/40" />
                </button>
            </div>

            {assets.length === 0 ? (
                <p className="rounded-lg border border-white/[0.08] bg-black/10 p-3 text-xs text-white/35">
                    Subí el video como asset de tipo Reel para poder elegir su portada.
                </p>
            ) : (
                <>
                    {assets.length > 1 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                            {assets.map((asset) => (
                                <button
                                    key={asset.id}
                                    type="button"
                                    onClick={() => setSelectedId(asset.id)}
                                    className={cn(
                                        "max-w-[180px] truncate rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                                        asset.id === selectedId
                                            ? "border-[#fb7185]/40 bg-[#fb7185]/10 text-white/85"
                                            : "border-white/[0.08] text-white/40 hover:text-white/70"
                                    )}
                                >
                                    {asset.nombre}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col gap-4 sm:flex-row">
                        <div className="min-w-0 flex-1">
                            {selected?.videoUrl ? (
                                <video
                                    ref={videoRef}
                                    src={selected.videoUrl}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
                                    className="max-h-64 w-full rounded-lg border border-white/[0.08] bg-black object-contain"
                                />
                            ) : (
                                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-white/30">
                                    El video no está disponible para previsualizar
                                </div>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => { void applyCover({ timeSeconds: videoRef.current?.currentTime ?? currentTime }) }}
                                    disabled={working || !selected?.videoUrl}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-quepia-cyan px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
                                >
                                    {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                                    Usar este frame
                                </button>
                                <span className="font-mono text-[11px] tabular-nums text-white/30">
                                    {formatTime(currentTime)}{duration ? ` / ${formatTime(duration)}` : ""}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={working}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-white/25 hover:text-white/85 disabled:opacity-40"
                                >
                                    <ImageUp className="h-3.5 w-3.5" />
                                    Subir portada
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) void handleUploadCover(file)
                                        e.currentTarget.value = ""
                                    }}
                                />
                            </div>
                        </div>

                        <div className="shrink-0 sm:w-32">
                            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/35">Portada</p>
                            {selected?.coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={selected.coverUrl}
                                    alt="Portada del reel"
                                    className="aspect-[9/16] w-full rounded-lg border border-white/[0.08] object-cover"
                                />
                            ) : (
                                <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-dashed border-white/15 px-2 text-center text-[11px] text-white/30">
                                    Sin portada
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </div>
    )
}
