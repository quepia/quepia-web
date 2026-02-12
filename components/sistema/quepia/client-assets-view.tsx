"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import {
    Search,
    CheckSquare2,
    Square,
    Eye,
    FileIcon,
    Layers,
    Film,
    ChevronLeft,
    ChevronRight,
    Download,
} from "lucide-react"
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/types/sistema"
import type { ApprovalStatus } from "@/types/sistema"
import { cn } from "@/lib/sistema/utils"
import { ClientAssetViewer, type ClientAsset } from "./client-asset-viewer"
import { updatePublicAssetStatus } from "@/lib/sistema/hooks"

interface AssetTask {
    id: string
    titulo: string
    social_copy?: string | null
    assets?: ClientAsset[]
}

interface ClientAssetsViewProps {
    tasks: AssetTask[]
    token: string
    clientName: string
    onUpdate: () => void
}

type TaskAssetItem = ClientAsset & {
    taskTitle: string
    socialCopy?: string | null
    taskId: string
}

// ---- Sub-components for asset cards ----

function AssetPreview({ item, className }: { item: ClientAsset; className?: string }) {
    const type = item.file_type || ""
    const ext = (item.original_filename || item.file_url).split(".").pop()?.toLowerCase() || ""
    const isImage = type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)
    const isVideo = type.startsWith("video/") || ["mp4", "webm", "ogg", "mov"].includes(ext)
    const previewSrc = item.thumbnail_url || item.preview_url || item.file_url

    if (isImage) {
        return (
            <img
                src={previewSrc}
                alt={item.nombre}
                className={cn("w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity", className)}
            />
        )
    }
    if (isVideo) {
        return (
            <video
                src={item.preview_url || item.file_url}
                poster={item.thumbnail_url || undefined}
                className={cn("w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity", className)}
                muted
                playsInline
                loop
                preload="metadata"
                onMouseOver={e => e.currentTarget.play()}
                onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
            />
        )
    }
    return <FileIcon className="h-10 w-10 text-white/20" />
}

function SingleAssetCard({
    item,
    index,
    isReel,
    isSelected,
    onToggleSelect,
    onClick,
}: {
    item: ClientAsset
    index: number
    isReel: boolean
    isSelected: boolean
    onToggleSelect: () => void
    onClick: () => void
}) {
    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (item.file_url) {
            window.open(item.file_url, "_blank")
        }
    }

    return (
        <div
            onClick={onClick}
            className={cn(
                "bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden hover:border-quepia-cyan/30 transition-all cursor-pointer group flex flex-col",
                isReel && "border-l-2 border-l-pink-400/40"
            )}
        >
            <div className="aspect-video bg-black/40 relative flex items-center justify-center overflow-hidden">
                <AssetPreview item={item} />

                {isReel && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-pink-500/20 backdrop-blur-sm text-pink-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-pink-500/30">
                        <Film className="h-3 w-3" />
                        Reel
                    </div>
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
                    className="absolute top-2 left-2 text-white/70 hover:text-white z-10"
                >
                    {isSelected ? (
                        <CheckSquare2 className="h-4 w-4 text-quepia-cyan" />
                    ) : (
                        <Square className="h-4 w-4" />
                    )}
                </button>

                <div className="absolute top-2 right-2 flex gap-2 z-10">
                    <span
                        className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10"
                        style={{ color: APPROVAL_STATUS_COLORS[item.approval_status as ApprovalStatus] }}
                    >
                        {APPROVAL_STATUS_LABELS[item.approval_status as ApprovalStatus]}
                    </span>
                </div>

                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                    <button className="px-3 py-1.5 s-btn-solid text-xs font-bold rounded-full flex items-center gap-1.5 pointer-events-auto">
                        <Eye className="h-3.5 w-3.5" /> Ver
                    </button>
                    <button
                        onClick={handleDownload}
                        className="px-3 py-1.5 bg-white/10 border border-white/20 text-white text-xs font-bold rounded-full flex items-center gap-1.5 hover:bg-white/20 transition-colors pointer-events-auto"
                    >
                        <Download className="h-3.5 w-3.5" /> Descargar
                    </button>
                </div>
            </div>

            <div className="p-3">
                <h3 className="text-sm font-medium text-white line-clamp-1 mb-2" title={item.nombre}>
                    {item.nombre}
                </h3>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">v{item.version_number}</span>
                    <span className="text-[10px] text-white/40">
                        {item.file_type?.split("/")[1]?.toUpperCase() || "FILE"}
                    </span>
                </div>
            </div>
        </div>
    )
}

function CarouselCard({
    items,
    firstIndex,
    allAssets,
    taskTitle,
    socialCopy,
    taskId,
    selectedIds,
    onToggleSelect,
    onOpenViewer,
}: {
    items: (ClientAsset & { taskTitle: string; socialCopy?: string | null; taskId: string })[]
    firstIndex: number
    allAssets: (ClientAsset & { taskTitle: string; socialCopy?: string | null; taskId: string })[]
    taskTitle: string
    socialCopy?: string | null
    taskId: string
    selectedIds: Set<string>
    onToggleSelect: (id: string) => void
    onOpenViewer: (index: number) => void
}) {
    const [activeSlide, setActiveSlide] = useState(0)
    const scrollRef = useRef<HTMLDivElement>(null)

    const scrollTo = (idx: number) => {
        const clamped = Math.max(0, Math.min(items.length - 1, idx))
        setActiveSlide(clamped)
        if (scrollRef.current) {
            const child = scrollRef.current.children[clamped] as HTMLElement
            child?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        }
    }

    const allSelected = items.every(i => selectedIds.has(i.id))
    const carouselName = items[0]?.nombre?.replace(/\s*\(\d+\/\d+\)\s*$/, '') || "Carrusel"

    return (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden hover:border-purple-400/30 transition-all border-l-2 border-l-purple-400/40">
            {/* Carousel preview area */}
            <div className="relative aspect-video bg-black/40 overflow-hidden">
                {/* Horizontal scroll of slides */}
                <div
                    ref={scrollRef}
                    className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none"
                    onScroll={(e) => {
                        const el = e.currentTarget
                        const slideWidth = el.clientWidth
                        const idx = Math.round(el.scrollLeft / slideWidth)
                        if (idx !== activeSlide) setActiveSlide(idx)
                    }}
                >
                    {items.map((item, idx) => (
                        <div
                            key={item.id}
                            className="w-full h-full flex-shrink-0 snap-center relative cursor-pointer group"
                            onClick={() => {
                                const globalIdx = allAssets.findIndex(a => a.id === item.id)
                                if (globalIdx !== -1) onOpenViewer(globalIdx)
                            }}
                        >
                            <AssetPreview item={item} />

                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                                <button className="px-3 py-1.5 s-btn-solid text-xs font-bold rounded-full flex items-center gap-1.5 pointer-events-auto">
                                    <Eye className="h-3.5 w-3.5" /> Ver
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        if (item.file_url) window.open(item.file_url, "_blank")
                                    }}
                                    className="px-3 py-1.5 bg-white/10 border border-white/20 text-white text-xs font-bold rounded-full flex items-center gap-1.5 hover:bg-white/20 transition-colors pointer-events-auto"
                                >
                                    <Download className="h-3.5 w-3.5" /> Descargar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Navigation arrows */}
                {items.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); scrollTo(activeSlide - 1) }}
                            className={cn(
                                "absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:text-white transition-all z-10",
                                activeSlide === 0 && "opacity-30 pointer-events-none"
                            )}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); scrollTo(activeSlide + 1) }}
                            className={cn(
                                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:text-white transition-all z-10",
                                activeSlide === items.length - 1 && "opacity-30 pointer-events-none"
                            )}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </>
                )}

                {/* Dots indicator */}
                {items.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                        {items.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={(e) => { e.stopPropagation(); scrollTo(idx) }}
                                className={cn(
                                    "w-1.5 h-1.5 rounded-full transition-all",
                                    idx === activeSlide ? "bg-white w-3" : "bg-white/40 hover:bg-white/60"
                                )}
                            />
                        ))}
                    </div>
                )}

                {/* Type badge */}
                <div className="absolute top-2 left-10 flex items-center gap-1 bg-purple-500/20 backdrop-blur-sm text-purple-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-500/30 z-10">
                    <Layers className="h-3 w-3" />
                    {items.length} slides
                </div>

                {/* Select all toggle */}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        items.forEach(i => {
                            if (allSelected) {
                                if (selectedIds.has(i.id)) onToggleSelect(i.id)
                            } else {
                                if (!selectedIds.has(i.id)) onToggleSelect(i.id)
                            }
                        })
                    }}
                    className="absolute top-2 left-2 text-white/70 hover:text-white z-10"
                >
                    {allSelected ? (
                        <CheckSquare2 className="h-4 w-4 text-quepia-cyan" />
                    ) : (
                        <Square className="h-4 w-4" />
                    )}
                </button>

                {/* Status */}
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <span
                        className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10"
                        style={{ color: APPROVAL_STATUS_COLORS[items[activeSlide]?.approval_status as ApprovalStatus] }}
                    >
                        {APPROVAL_STATUS_LABELS[items[activeSlide]?.approval_status as ApprovalStatus]}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-4">
                <h3 className="text-sm font-medium text-white line-clamp-1 mb-1">{carouselName}</h3>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">Carrusel · {items.length} slides</span>
                </div>
            </div>
        </div>
    )
}

// ---- Main component ----

export function ClientAssetsView({ tasks, token, clientName, onUpdate }: ClientAssetsViewProps) {
    const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved">("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [viewer, setViewer] = useState<{
        assets: TaskAssetItem[]
        index: number
        taskTitle: string
        socialCopy?: string | null
        taskId: string
    } | null>(null)

    const tasksWithAssets = useMemo(() => {
        return tasks.map(task => {
            const assets = (task.assets || [])
                .filter(asset => !asset.access_revoked)
                .map(asset => ({
                    ...asset,
                    taskTitle: task.titulo,
                    socialCopy: task.social_copy,
                    taskId: task.id
                }))
                .filter(item => {
                    const matchesSearch = item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.taskTitle.toLowerCase().includes(searchQuery.toLowerCase())

                    if (!matchesSearch) return false

                    if (filterStatus === "pending") {
                        return item.approval_status === "pending_review" || item.approval_status === "changes_requested"
                    }
                    if (filterStatus === "approved") {
                        return item.approval_status === "approved_internal" || item.approval_status === "approved_final" || item.approval_status === "published"
                    }
                    return true
                })

            return {
                ...task,
                assets
            }
        }).filter(task => task.assets && task.assets.length > 0)
    }, [tasks, searchQuery, filterStatus])

    const flatAssets = useMemo(() => tasksWithAssets.flatMap(task => task.assets || []), [tasksWithAssets])

    useEffect(() => {
        if (!viewer) return
        const updatedTask = tasksWithAssets.find(t => t.id === viewer.taskId)
        if (!updatedTask || !updatedTask.assets) {
            setViewer(null)
            return
        }
        const currentId = viewer.assets[viewer.index]?.id
        const newIndex = updatedTask.assets.findIndex(a => a.id === currentId)
        if (newIndex === -1) {
            setViewer(null)
        } else {
            setViewer({
                ...viewer,
                assets: updatedTask.assets,
                index: newIndex
            })
        }
    }, [tasksWithAssets])

    const toggleSelected = (assetId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(assetId)) next.delete(assetId)
            else next.add(assetId)
            return next
        })
    }

    const handleDownloadSelected = async () => {
        const versionIds = flatAssets
            .filter(a => selectedIds.has(a.id))
            .map(a => a.current_version_id)

        if (versionIds.length === 0) return

        const res = await fetch("/api/assets/zip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, versionIds, scope: "selected" })
        })
        const data = await res.json()
        if (data?.url) window.open(data.url, "_blank")
    }

    const handleDownloadAll = async (taskId: string) => {
        const res = await fetch("/api/assets/zip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, taskId, scope: "all" })
        })
        const data = await res.json()
        if (data?.url) window.open(data.url, "_blank")
    }

    const handleApproveAll = async (taskId: string) => {
        const task = tasksWithAssets.find(t => t.id === taskId)
        if (!task?.assets) return
        for (const asset of task.assets) {
            if (asset.approval_status !== "approved_final") {
                await updatePublicAssetStatus(token, asset.id, "approved_final")
            }
        }
        onUpdate()
    }

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Buscar archivo..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-quepia-cyan outline-none"
                    />
                </div>

                <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                    {(["all", "pending", "approved"] as const).map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                                filterStatus === status
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-white/50 hover:text-white/80"
                            )}
                        >
                            {status === "all" ? "Todos" : status === "pending" ? "Pendientes" : "Aprobados"}
                        </button>
                    ))}
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 bg-white/[0.03] border border-white/[0.08] rounded-lg p-3">
                    <div className="text-xs text-white/60 flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-quepia-cyan" />
                        {selectedIds.size} seleccionados
                    </div>
                    <button
                        onClick={handleDownloadSelected}
                        className="px-3 py-1.5 text-xs rounded bg-quepia-cyan text-black font-medium hover:opacity-90"
                    >
                        Descargar seleccionados
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-white/40 hover:text-white"
                    >
                        Limpiar selección
                    </button>
                </div>
            )}

            {/* Task Sections */}
            {tasksWithAssets.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                    <p className="text-white/40">No se encontraron archivos</p>
                    {(searchQuery.trim() || filterStatus !== "all") && (
                        <button
                            onClick={() => {
                                setSearchQuery("")
                                setFilterStatus("all")
                            }}
                            className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/70 transition-all duration-200 hover:bg-white/[0.1]"
                        >
                            Limpiar filtros
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-8">
                    {tasksWithAssets.map(task => (
                        <div key={task.id} className="space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                <div>
                                    <h3 className="text-base font-semibold text-white">{task.titulo}</h3>
                                    <p className="text-xs text-white/40">{task.assets?.length || 0} assets</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {(() => {
                                    const taskAssets = task.assets || []
                                    // Group carousel items
                                    const rendered: React.ReactNode[] = []
                                    const seenGroups = new Set<string>()

                                    taskAssets.forEach((item, index) => {
                                        // Carousel group
                                        if (item.asset_type === 'carousel' && item.group_id) {
                                            if (seenGroups.has(item.group_id)) return
                                            seenGroups.add(item.group_id)

                                            const groupItems = taskAssets
                                                .filter(a => a.group_id === item.group_id)
                                                .sort((a, b) => (a.group_order ?? 0) - (b.group_order ?? 0))
                                            const firstIdx = taskAssets.indexOf(groupItems[0])

                                            rendered.push(
                                                <CarouselCard
                                                    key={`carousel-${item.group_id}`}
                                                    items={groupItems}
                                                    firstIndex={firstIdx}
                                                    allAssets={taskAssets}
                                                    taskTitle={task.titulo}
                                                    socialCopy={task.social_copy}
                                                    taskId={task.id}
                                                    selectedIds={selectedIds}
                                                    onToggleSelect={toggleSelected}
                                                    onOpenViewer={(idx) => setViewer({
                                                        assets: taskAssets as TaskAssetItem[],
                                                        index: idx,
                                                        taskTitle: task.titulo,
                                                        socialCopy: task.social_copy,
                                                        taskId: task.id
                                                    })}
                                                />
                                            )
                                            return
                                        }

                                        // Reel or single
                                        const isReel = item.asset_type === 'reel'
                                        rendered.push(
                                            <SingleAssetCard
                                                key={item.id}
                                                item={item}
                                                index={index}
                                                isReel={isReel}
                                                isSelected={selectedIds.has(item.id)}
                                                onToggleSelect={() => toggleSelected(item.id)}
                                                onClick={() => setViewer({
                                                    assets: taskAssets as TaskAssetItem[],
                                                    index,
                                                    taskTitle: task.titulo,
                                                    socialCopy: task.social_copy,
                                                    taskId: task.id
                                                })}
                                            />
                                        )
                                    })

                                    return rendered
                                })()}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail Viewer */}
            {viewer && (
                <ClientAssetViewer
                    asset={viewer.assets[viewer.index]}
                    assets={viewer.assets}
                    currentIndex={viewer.index}
                    taskTitle={viewer.taskTitle}
                    socialCopy={viewer.socialCopy}
                    taskId={viewer.taskId}
                    isOpen={!!viewer}
                    onClose={() => setViewer(null)}
                    onNavigate={(idx) => setViewer(prev => prev ? { ...prev, index: idx } : prev)}
                    token={token}
                    clientName={clientName}
                    onUpdate={onUpdate}
                />
            )}
        </div>
    )
}
