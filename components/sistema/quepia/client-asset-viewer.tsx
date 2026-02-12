"use client"

import { createPortal } from "react-dom"
import { useState, useEffect } from "react"
import {
    X,
    MessageSquare,
    CheckCircle2,
    AlertCircle,
    Send,
    Maximize2,
    Minimize2,
    ThumbsUp,
    ThumbsDown,
    Star,
    Download,
    ChevronLeft,
    ChevronRight,
    Copy,
    Check,
    FileText,
    Hash,
    Layers,
    Film,
    Loader2,
    Archive,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import AnnotationCanvasWrapper from "./annotation-canvas-wrapper"
import { useToast } from "@/components/ui/toast-provider"
import {
    type Annotation,
    type FeedbackType,
    FEEDBACK_TYPE_LABELS,
    FEEDBACK_TYPE_COLORS,
    APPROVAL_STATUS_LABELS,
    APPROVAL_STATUS_COLORS,
    type ApprovalStatus
} from "@/types/sistema"
import { addPublicAnnotation, updatePublicAssetStatus } from "@/lib/sistema/hooks"
import { trackExperienceMetric } from "@/lib/sistema/experience-metrics"

export interface ClientAsset {
    id: string
    nombre: string
    approval_status: ApprovalStatus
    asset_type?: 'single' | 'carousel' | 'reel'
    group_id?: string | null
    group_order?: number
    client_rating?: number
    current_version_id: string
    file_url: string
    thumbnail_url?: string | null
    preview_url?: string | null
    file_type: string | null
    file_size?: number | null
    original_filename?: string | null
    version_number: number
    annotations: Annotation[]
    access_revoked?: boolean
}

interface ClientAssetViewerProps {
    asset: ClientAsset
    assets?: ClientAsset[]
    currentIndex?: number
    onNavigate?: (index: number) => void
    taskTitle?: string
    socialCopy?: string | null
    taskId?: string
    isOpen: boolean
    onClose: () => void
    token: string
    clientName: string
    onUpdate: () => void // to refresh data
}

export function ClientAssetViewer({
    asset,
    assets,
    currentIndex = 0,
    onNavigate,
    taskTitle,
    socialCopy,
    taskId,
    isOpen,
    onClose,
    token,
    clientName,
    onUpdate
}: ClientAssetViewerProps) {
    const { toast } = useToast()
    const activeAsset = assets && assets.length > 0 ? assets[currentIndex] : asset
    const [annotations, setAnnotations] = useState<Annotation[]>(activeAsset.annotations || [])
    const [localStatus, setLocalStatus] = useState<ApprovalStatus>(activeAsset.approval_status)
    const [localRating, setLocalRating] = useState<number | undefined>(activeAsset.client_rating)

    // New annotation state
    const [pendingAnnotation, setPendingAnnotation] = useState<{ x: number, y: number } | null>(null)
    const [feedbackType, setFeedbackType] = useState<FeedbackType>("correction_minor")
    const [feedbackContent, setFeedbackContent] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [updatingStatus, setUpdatingStatus] = useState(false)

    // Selected annotation state
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)

    // UI state - sidebar hidden by default on mobile for fullscreen experience
    const [showSidebar, setShowSidebar] = useState(false)
    const [copied, setCopied] = useState<"all" | "copy" | "hashtags" | null>(null)
    const [touchStartX, setTouchStartX] = useState<number | null>(null)

    useEffect(() => {
        setAnnotations(activeAsset.annotations || [])
        setLocalStatus(activeAsset.approval_status)
        setLocalRating(activeAsset.client_rating)
    }, [activeAsset])

    useEffect(() => {
        if (!isOpen) return
        fetch("/api/assets/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, versionId: activeAsset.current_version_id })
        }).catch(() => {
            // silent
        })
    }, [isOpen, activeAsset.current_version_id, token])

    const handleAddAnnotationClick = (x: number, y: number) => {
        setPendingAnnotation({ x, y })
        setSelectedAnnotationId(null)
        if (!showSidebar) setShowSidebar(true)
    }

    const handleGeneralComment = () => {
        setPendingAnnotation({ x: -1, y: -1 })
        setSelectedAnnotationId(null)
        if (!showSidebar) setShowSidebar(true)
    }

    const handleSaveAnnotation = async () => {
        if (!pendingAnnotation || !feedbackContent.trim()) return

        setSubmitting(true)
        try {
            const res = await addPublicAnnotation(
                token,
                activeAsset.current_version_id,
                feedbackContent.trim(),
                pendingAnnotation.x,
                pendingAnnotation.y,
                feedbackType,
                clientName
            )

            if (res.success && res.data) {
                // Optimistic update: add annotation to local state immediately
                const newAnnotation: Annotation = {
                    id: res.data.id,
                    asset_version_id: activeAsset.current_version_id,
                    author_id: null,
                    author_name: clientName,
                    x_percent: pendingAnnotation.x,
                    y_percent: pendingAnnotation.y,
                    feedback_type: feedbackType,
                    contenido: feedbackContent.trim(),
                    resolved: false,
                    resolved_by: null,
                    resolved_at: null,
                    created_at: new Date().toISOString()
                }
                setAnnotations(prev => [...prev, newAnnotation])

                // Also refresh parent data for consistency
                onUpdate()
                setPendingAnnotation(null)
                setFeedbackContent("")
                setFeedbackType("correction_minor")
            } else {
                console.error("Error saving annotation:", res.error)
                trackExperienceMetric("errors_shown")
                toast({
                    title: "No se pudo guardar la nota",
                    description: res.error || "Error desconocido",
                    variant: "error"
                })
            }
        } catch (e) {
            console.error("Exception saving annotation:", e)
            trackExperienceMetric("errors_shown")
            toast({
                title: "Error inesperado",
                description: "No se pudo guardar la nota.",
                variant: "error"
            })
        } finally {
            setSubmitting(false)
        }
    }

    const handleStatusUpdate = async (status: ApprovalStatus) => {
        if (updatingStatus) return
        setUpdatingStatus(true)
        const previousStatus = localStatus
        setLocalStatus(status) // Optimistic update
        try {
            const res = await updatePublicAssetStatus(token, activeAsset.id, status)
            if (res.success) {
                onUpdate()
                if (status === "approved_final") {
                    trackExperienceMetric("asset_approved")
                }
                if (status === "changes_requested") {
                    trackExperienceMetric("asset_changes_requested")
                }
            } else {
                setLocalStatus(previousStatus) // Revert on error
                console.error("Error updating status:", res.error)
                trackExperienceMetric("errors_shown")
                toast({
                    title: "No se pudo actualizar el estado",
                    description: res.error || "Intenta nuevamente",
                    variant: "error"
                })
            }
        } catch (e) {
            setLocalStatus(previousStatus) // Revert on error
            console.error("Exception updating status:", e)
            trackExperienceMetric("errors_shown")
            toast({
                title: "Error inesperado",
                description: "No se pudo actualizar el estado.",
                variant: "error"
            })
        } finally {
            setUpdatingStatus(false)
        }
    }

    const handleRating = async (rating: number) => {
        if (updatingStatus) return
        setUpdatingStatus(true)
        const previousRating = localRating
        setLocalRating(rating) // Optimistic update
        try {
            const res = await updatePublicAssetStatus(token, activeAsset.id, localStatus, rating)
            if (res.success) {
                onUpdate()
            } else {
                setLocalRating(previousRating) // Revert on error
                console.error("Error updating rating:", res.error)
                trackExperienceMetric("errors_shown")
                toast({
                    title: "No se pudo enviar la calificación",
                    description: res.error || "Intenta nuevamente",
                    variant: "error"
                })
            }
        } catch (e) {
            setLocalRating(previousRating) // Revert on error
            console.error("Exception updating rating:", e)
            trackExperienceMetric("errors_shown")
            toast({
                title: "Error inesperado",
                description: "No se pudo guardar tu calificación.",
                variant: "error"
            })
        } finally {
            setUpdatingStatus(false)
        }
    }

    const hasMultiple = !!assets && assets.length > 1
    const canPrev = hasMultiple && currentIndex > 0
    const canNext = hasMultiple && currentIndex < (assets?.length || 0) - 1

    // Carousel group context
    const isCarouselItem = activeAsset.asset_type === 'carousel' && !!activeAsset.group_id
    const carouselGroup = isCarouselItem && assets
        ? assets
            .map((a, i) => ({ asset: a, globalIndex: i }))
            .filter(({ asset }) => asset.group_id === activeAsset.group_id)
            .sort((a, b) => (a.asset.group_order ?? 0) - (b.asset.group_order ?? 0))
        : null
    const carouselIndex = carouselGroup
        ? carouselGroup.findIndex(({ asset }) => asset.id === activeAsset.id)
        : -1

    const handlePrev = () => {
        if (!onNavigate || !canPrev) return
        onNavigate(currentIndex - 1)
    }

    const handleNext = () => {
        if (!onNavigate || !canNext) return
        onNavigate(currentIndex + 1)
    }

    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
            if (e.key === "ArrowLeft") handlePrev()
            if (e.key === "ArrowRight") handleNext()
        }
        if (isOpen) window.addEventListener("keydown", handleKeys)
        return () => window.removeEventListener("keydown", handleKeys)
    }, [isOpen, onClose, currentIndex, canPrev, canNext])

    const [downloadingAll, setDownloadingAll] = useState(false)

    // Download single asset
    const handleDownloadSingle = async () => {
        const res = await fetch("/api/assets/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, versionId: activeAsset.current_version_id })
        })
        const data = await res.json()
        if (data?.url) {
            // For videos on iOS Safari, window.open works better than programmatic link click
            const isVideoAsset = isVideo || activeAsset.asset_type === 'reel'
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

            if (isVideoAsset && isMobile) {
                // On mobile, open in new tab - user can then long-press to save
                window.open(data.url, '_blank')
            } else {
                // Desktop: use download attribute
                const link = document.createElement("a")
                link.href = data.url
                link.download = activeAsset.original_filename || activeAsset.nombre
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
            }
        }
    }

    // Download all carousel images as ZIP
    const handleDownloadCarousel = async () => {
        if (!carouselGroup || carouselGroup.length === 0) return

        setDownloadingAll(true)
        try {
            const versionIds = carouselGroup.map(({ asset }) => asset.current_version_id)
            const carouselName = activeAsset.nombre.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim() || "carousel"

            const res = await fetch("/api/assets/zip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, versionIds, zipName: carouselName })
            })

            if (!res.ok) {
                throw new Error("Error generando ZIP")
            }

            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = `${carouselName}.zip`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (e) {
            console.error("Error downloading carousel:", e)
            trackExperienceMetric("errors_shown")
            toast({
                title: "No se pudo descargar el carrusel",
                description: "Prueba descargar cada imagen de forma individual.",
                variant: "error"
            })
        } finally {
            setDownloadingAll(false)
        }
    }

    // Download handler - decides single or carousel
    const handleDownload = () => {
        if (isCarouselItem && carouselGroup && carouselGroup.length > 1) {
            handleDownloadCarousel()
        } else {
            handleDownloadSingle()
        }
    }

    const handleCopy = (type: "all" | "copy" | "hashtags") => {
        const full = socialCopy || ""
        const tags = (full.match(/#\\w+/g) || []).join(" ")
        const onlyCopy = full.replace(/#\\w+/g, "").replace(/\\s+/g, " ").trim()

        const text = type === "hashtags" ? tags : type === "copy" ? onlyCopy : full
        if (!text) return

        navigator.clipboard.writeText(text)
        setCopied(type)
        setTimeout(() => setCopied(null), 1500)
    }

    const formatFileSize = (bytes?: number | null) => {
        if (!bytes) return "—"
        const units = ["B", "KB", "MB", "GB"]
        let size = bytes
        let idx = 0
        while (size >= 1024 && idx < units.length - 1) {
            size /= 1024
            idx++
        }
        return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`
    }

    const hashtags = (socialCopy || "").match(/#\w+/g) || []

    // Mounted check for portal
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    // File Logic
    const originalUrl = activeAsset.file_url || ""
    const fileUrl = activeAsset.preview_url || activeAsset.file_url || ""
    const fileExt = (activeAsset.original_filename || originalUrl).split(".").pop()?.toLowerCase() || ""
    const isImage = (activeAsset.file_type || "").startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(fileExt)
    const isVideo = (activeAsset.file_type || "").startsWith("video/") || ["mp4", "mov", "webm", "ogg"].includes(fileExt)
    const isGoogleDrive = originalUrl.includes("drive.google.com") || originalUrl.includes("docs.google.com")

    let embedUrl = originalUrl
    if (isGoogleDrive) {
        const idMatch = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
        if (idMatch && idMatch[1]) {
            embedUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`
        } else if (fileUrl.includes("view")) {
            embedUrl = fileUrl.replace(/\/view.*/, "/preview")
        }
    }

    const viewerContent = (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
            onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
                if (touchStartX === null) return
                const endX = e.changedTouches[0]?.clientX ?? touchStartX
                const delta = endX - touchStartX
                if (delta > 60) handlePrev()
                if (delta < -60) handleNext()
                setTouchStartX(null)
            }}
        >
            <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden">

                {/* Main Canvas Area */}
                <div className="flex-1 relative bg-[#050505] flex flex-col">
                    {/* Header Overlay - Mobile Optimized */}
                    <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/90 via-black/60 to-transparent pointer-events-none">
                        {/* Top Row: Close + Title + Download */}
                        <div className="p-3 md:p-4 flex items-start md:items-center justify-between gap-2">
                            <div className="pointer-events-auto flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                                <button onClick={onClose} className="p-1.5 md:p-2 bg-black/50 hover:bg-white/10 rounded-full text-white transition-colors shrink-0">
                                    <X className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <h2 className="text-white font-medium text-sm md:text-lg drop-shadow-md truncate max-w-[150px] md:max-w-none">{activeAsset.nombre}</h2>
                                        {isCarouselItem && (
                                            <span className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold flex items-center gap-0.5 shrink-0">
                                                <Layers className="h-2.5 w-2.5 md:h-3 md:w-3" />
                                                {(carouselIndex ?? 0) + 1}/{carouselGroup?.length || 0}
                                            </span>
                                        )}
                                        {activeAsset.asset_type === 'reel' && (
                                            <span className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-bold flex items-center gap-0.5 shrink-0">
                                                <Film className="h-2.5 w-2.5 md:h-3 md:w-3" />
                                                Reel
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span
                                            className="text-[9px] md:text-[10px] px-1.5 py-0.5 rounded font-medium"
                                            style={{
                                                backgroundColor: APPROVAL_STATUS_COLORS[localStatus] + '30',
                                                color: APPROVAL_STATUS_COLORS[localStatus]
                                            }}
                                        >
                                            {APPROVAL_STATUS_LABELS[localStatus]}
                                        </span>
                                        {taskTitle && (
                                            <p className="text-[10px] text-white/40 truncate hidden md:block">{taskTitle}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Desktop: Full controls */}
                            <div className="pointer-events-auto hidden md:flex items-center gap-2">
                                {hasMultiple && (
                                    <div className="flex items-center gap-1 bg-black/50 rounded-lg p-1 border border-white/10">
                                        <button
                                            onClick={handlePrev}
                                            disabled={!canPrev}
                                            className={cn("p-1 rounded hover:bg-white/10 transition-colors", canPrev ? "text-white/70" : "text-white/20")}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={handleNext}
                                            disabled={!canNext}
                                            className={cn("p-1 rounded hover:bg-white/10 transition-colors", canNext ? "text-white/70" : "text-white/20")}
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}

                                {/* Download buttons */}
                                {isCarouselItem && carouselGroup && carouselGroup.length > 1 ? (
                                    <>
                                        <button
                                            onClick={handleDownloadSingle}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-black/50 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                                            title="Descargar imagen actual"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Esta
                                        </button>
                                        <button
                                            onClick={handleDownloadCarousel}
                                            disabled={downloadingAll}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-black/50 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 disabled:opacity-50"
                                            title={`Descargar ${carouselGroup.length} imágenes como ZIP`}
                                        >
                                            {downloadingAll ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Archive className="w-3.5 h-3.5" />
                                            )}
                                            Todas
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={handleDownloadSingle}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-black/50 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Descargar
                                    </button>
                                )}

                                {/* Rating - Desktop only */}
                                <div className="flex items-center gap-0.5 bg-black/50 rounded-lg p-1 border border-white/10">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            onClick={() => handleRating(star)}
                                            className={cn(
                                                "p-1 hover:scale-110 transition-transform",
                                                (localRating || 0) >= star ? "text-yellow-400" : "text-white/20 hover:text-yellow-400/50"
                                            )}
                                        >
                                            <Star className="w-4 h-4 fill-current" />
                                        </button>
                                    ))}
                                </div>

                                {/* Approval Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleStatusUpdate('approved_final')}
                                        disabled={updatingStatus}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors",
                                            localStatus === 'approved_final'
                                                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                                : "bg-black/50 text-white/70 hover:text-green-400 hover:bg-green-500/10 border border-white/10"
                                        )}
                                    >
                                        <ThumbsUp className="w-3.5 h-3.5" />
                                        Aprobar
                                    </button>
                                    <button
                                        onClick={() => handleStatusUpdate('changes_requested')}
                                        disabled={updatingStatus}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors",
                                            localStatus === 'changes_requested'
                                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                                : "bg-black/50 text-white/70 hover:text-red-400 hover:bg-red-500/10 border border-white/10"
                                        )}
                                    >
                                        <ThumbsDown className="w-3.5 h-3.5" />
                                        Cambios
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowSidebar(!showSidebar)}
                                    className="p-2 bg-black/50 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors border border-white/10"
                                    title={showSidebar ? "Ocultar panel" : "Ver panel"}
                                >
                                    {showSidebar ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Mobile: Just download button - always downloads current image (ZIP inconvenient on mobile) */}
                            <div className="pointer-events-auto flex md:hidden items-center gap-1.5 shrink-0">
                                <button
                                    onClick={handleDownloadSingle}
                                    className="p-2 rounded-lg bg-black/50 text-white/70 hover:text-white border border-white/10"
                                    title="Descargar imagen actual"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setShowSidebar(!showSidebar)}
                                    className="p-2 bg-black/50 hover:bg-white/10 rounded-lg text-white/70 hover:text-white border border-white/10"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>



                    {/* Canvas */}
                    <div className="flex-1 w-full h-full relative bg-black flex flex-col">
                        <div className="flex-1 relative flex items-center justify-center">
                            {(() => {
                                if (isImage) {
                                    return (
                                        <AnnotationCanvasWrapper
                                            imageUrl={fileUrl}
                                            annotations={annotations}
                                            onAddAnnotation={handleAddAnnotationClick}
                                            onSelectAnnotation={(ann) => {
                                                setSelectedAnnotationId(ann.id)
                                                if (!showSidebar) setShowSidebar(true)
                                            }}
                                            selectedAnnotationId={selectedAnnotationId}
                                        />
                                    )
                                }

                                if (isVideo) {
                                    const isReel = activeAsset.asset_type === 'reel'
                                    return (
                                        <div className={cn(
                                            "flex items-center justify-center w-full h-full",
                                            isReel && "md:px-4"
                                        )}>
                                            <video
                                                src={activeAsset.preview_url || originalUrl}
                                                poster={activeAsset.thumbnail_url || undefined}
                                                controls
                                                playsInline
                                                className={cn(
                                                    "bg-black",
                                                    isReel
                                                        ? "h-full max-w-full object-contain"
                                                        : "w-full h-full object-contain"
                                                )}
                                                style={isReel ? { aspectRatio: '9/16' } : undefined}
                                            />
                                        </div>
                                    )
                                }

                                if (isGoogleDrive) {
                                    return (
                                        <div className="w-full h-full">
                                            <iframe
                                                src={embedUrl}
                                                className="w-full h-full border-0"
                                                allow="autoplay; fullscreen"
                                                title="Asset Preview"
                                            />
                                        </div>
                                    )
                                }

                                return (
                                    <div className="w-full h-full flex items-center justify-center flex-col gap-4">
                                        <p className="text-white/50">Vista previa no disponible para este formato</p>
                                        <a
                                            href={originalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-quepia-cyan hover:underline"
                                        >
                                            Abrir archivo original
                                        </a>
                                    </div>
                                )
                            })()}
                        </div>

                        {/* Mobile Bottom Section: Thumbnails + Actions - NOT overlapping */}
                        <div className="md:hidden flex-shrink-0 bg-black border-t border-white/10">
                            {/* Carousel thumbnails on mobile */}
                            {isCarouselItem && carouselGroup && carouselGroup.length > 1 && (
                                <div className="px-3 py-2 border-b border-white/[0.06]">
                                    <div className="flex gap-2 overflow-x-auto scrollbar-thin justify-center">
                                        {carouselGroup.map(({ asset: slide, globalIndex }) => {
                                            const thumbSrc = slide.thumbnail_url || slide.preview_url || slide.file_url
                                            const isCurrent = slide.id === activeAsset.id
                                            return (
                                                <button
                                                    key={slide.id}
                                                    onClick={() => onNavigate?.(globalIndex)}
                                                    className={cn(
                                                        "shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all",
                                                        isCurrent
                                                            ? "border-quepia-cyan ring-1 ring-quepia-cyan/30"
                                                            : "border-white/10 opacity-60 hover:opacity-100"
                                                    )}
                                                >
                                                    <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Action buttons - always visible on mobile */}
                            <div className="px-3 py-3 flex items-center justify-between gap-2 safe-area-inset-bottom">
                                {/* Left side: Navigation (for non-carousel or general nav) */}
                                {hasMultiple && !isCarouselItem && (
                                    <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
                                        <button
                                            onClick={handlePrev}
                                            disabled={!canPrev}
                                            className={cn("p-1.5 rounded transition-colors", canPrev ? "text-white/70" : "text-white/20")}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-[10px] text-white/50 px-1">{currentIndex + 1}/{assets?.length || 1}</span>
                                        <button
                                            onClick={handleNext}
                                            disabled={!canNext}
                                            className={cn("p-1.5 rounded transition-colors", canNext ? "text-white/70" : "text-white/20")}
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}

                                {/* Right side: Approval Actions */}
                                <div className={cn("flex items-center gap-2", (!hasMultiple || isCarouselItem) && "flex-1 justify-center")}>
                                    <button
                                        onClick={() => handleStatusUpdate('approved_final')}
                                        disabled={updatingStatus}
                                        className={cn(
                                            "px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                                            localStatus === 'approved_final'
                                                ? "bg-green-500/30 text-green-400 border border-green-500/40"
                                                : "bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30"
                                        )}
                                    >
                                        <ThumbsUp className="w-4 h-4" />
                                        Aprobar
                                    </button>
                                    <button
                                        onClick={() => handleStatusUpdate('changes_requested')}
                                        disabled={updatingStatus}
                                        className={cn(
                                            "px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                                            localStatus === 'changes_requested'
                                                ? "bg-red-500/30 text-red-400 border border-red-500/40"
                                                : "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
                                        )}
                                    >
                                        <ThumbsDown className="w-4 h-4" />
                                        Cambios
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Carousel thumbnail strip */}
                        {isCarouselItem && carouselGroup && carouselGroup.length > 1 && (
                            <div className="hidden md:block flex-shrink-0 bg-black/80 border-t border-white/10 px-4 py-2">
                                <div className="flex gap-2 overflow-x-auto scrollbar-thin justify-center">
                                    {carouselGroup.map(({ asset: slide, globalIndex }, idx) => {
                                        const thumbSrc = slide.thumbnail_url || slide.preview_url || slide.file_url
                                        const isCurrent = slide.id === activeAsset.id
                                        return (
                                            <button
                                                key={slide.id}
                                                onClick={() => onNavigate?.(globalIndex)}
                                                className={cn(
                                                    "shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all",
                                                    isCurrent
                                                        ? "border-quepia-cyan scale-105 ring-1 ring-quepia-cyan/30"
                                                        : "border-white/10 opacity-60 hover:opacity-100"
                                                )}
                                            >
                                                <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar - Full screen overlay on mobile, side panel on desktop */}
                {showSidebar && (
                    <>
                        {/* Mobile: Full screen overlay with backdrop */}
                        <div
                            className="md:hidden fixed inset-0 bg-black/60 z-30"
                            onClick={() => setShowSidebar(false)}
                        />
                        <div className="fixed md:relative inset-x-0 bottom-0 md:inset-auto md:w-[350px] bg-[#111] md:border-l border-white/10 flex flex-col max-h-[85vh] md:max-h-none md:h-full shadow-2xl z-40 rounded-t-2xl md:rounded-none">
                            {/* Mobile drag handle */}
                            <div className="md:hidden flex justify-center py-2">
                                <div className="w-10 h-1 bg-white/20 rounded-full" />
                            </div>
                            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                                <h3 className="text-white font-medium flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-quepia-cyan" />
                                    Comentarios
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleGeneralComment}
                                        className="text-[10px] bg-white/10 hover:bg-quepia-cyan/20 text-white/70 hover:text-quepia-cyan px-2 py-1 rounded transition-colors flex items-center gap-1"
                                    >
                                        <MessageSquare className="w-3 h-3" />
                                        Agregar
                                    </button>
                                    <span className="text-xs text-white/30">{annotations.length} notas</span>
                                    {/* Mobile close button */}
                                    <button
                                        onClick={() => setShowSidebar(false)}
                                        className="md:hidden p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white/70"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {/* Copy / File Info */}
                                <div className="space-y-3">
                                    {socialCopy && (
                                        <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-1">
                                                    <FileText className="h-3 w-3 text-quepia-cyan" />
                                                    Copy para publicación
                                                </span>
                                                <button
                                                    onClick={() => handleCopy("all")}
                                                    className="text-[10px] text-white/50 hover:text-quepia-cyan flex items-center gap-1"
                                                >
                                                    {copied === "all" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                                    Copiar todo
                                                </button>
                                            </div>
                                            <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed">
                                                {socialCopy}
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                <button
                                                    onClick={() => handleCopy("copy")}
                                                    className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:text-white"
                                                >
                                                    Copiar solo texto
                                                </button>
                                                {hashtags.length > 0 && (
                                                    <button
                                                        onClick={() => handleCopy("hashtags")}
                                                        className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:text-white flex items-center gap-1"
                                                    >
                                                        <Hash className="h-3 w-3" />
                                                        Copiar hashtags
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                                        <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Archivo</div>
                                        <p className="text-xs text-white/70 truncate">{activeAsset.original_filename || activeAsset.nombre}</p>
                                        <div className="text-[10px] text-white/40 mt-1">
                                            {formatFileSize(activeAsset.file_size)} · {activeAsset.file_type?.toUpperCase() || "FILE"}
                                        </div>
                                    </div>
                                </div>

                                {/* Creation Form */}
                                {pendingAnnotation && (
                                    <div className="bg-white/[0.05] border border-quepia-cyan/50 rounded-lg p-3 animate-in slide-in-from-right-2 fade-in duration-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-quepia-cyan uppercase tracking-wider">
                                                {pendingAnnotation.x === -1 ? "Comentario General" : "Nueva Nota"}
                                            </span>
                                            <button onClick={() => setPendingAnnotation(null)} className="text-white/30 hover:text-white">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] text-white/40 mb-1 block">Tipo de feedback</label>
                                                <select
                                                    value={feedbackType}
                                                    onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
                                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 outline-none focus:border-quepia-cyan"
                                                >
                                                    {(Object.entries(FEEDBACK_TYPE_LABELS) as [FeedbackType, string][]).map(([key, label]) => (
                                                        <option key={key} value={key}>{label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <textarea
                                                value={feedbackContent}
                                                onChange={(e) => setFeedbackContent(e.target.value)}
                                                placeholder="Describe el feedback..."
                                                autoFocus
                                                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/20 min-h-[80px] outline-none focus:border-quepia-cyan resize-none"
                                            />

                                            <div className="flex justify-end pt-1">
                                                <button
                                                    onClick={handleSaveAnnotation}
                                                    disabled={!feedbackContent.trim() || submitting}
                                                    className="bg-quepia-cyan text-black text-xs font-semibold px-4 py-2 rounded-md hover:bg-quepia-cyan/90 disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {submitting ? "Guardando..." : "Guardar nota"}
                                                    {!submitting && <Send className="w-3 h-3" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* List */}
                                <div className="space-y-3">
                                    {annotations.map(ann => (
                                        <div
                                            key={ann.id}
                                            onClick={() => setSelectedAnnotationId(ann.id)}
                                            className={cn(
                                                "p-3 rounded-lg border transition-all cursor-pointer group relative",
                                                selectedAnnotationId === ann.id
                                                    ? "bg-white/[0.08] border-quepia-cyan/30"
                                                    : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]",
                                                ann.resolved && "opacity-50"
                                            )}
                                            style={{ borderLeft: `3px solid ${FEEDBACK_TYPE_COLORS[ann.feedback_type]}` }}
                                        >
                                            <div className="flex items-start gap-2 mb-1">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-medium text-white/90 truncate">
                                                            {FEEDBACK_TYPE_LABELS[ann.feedback_type]}
                                                        </span>
                                                        <span className="text-[10px] text-white/30">
                                                            {new Date(ann.created_at).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-white/40 block">
                                                        {ann.author_name}
                                                    </span>
                                                </div>
                                            </div>

                                            <p className="text-sm text-white/70 pl-2 break-words leading-relaxed">
                                                {ann.contenido}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                {/* Empty State */}
                                {!pendingAnnotation && annotations.length === 0 && (
                                    <div className="text-center py-10 text-white/20">
                                        <div className="w-12 h-12 rounded-full bg-white/5 mx-auto flex items-center justify-center mb-3">
                                            <AlertCircle className="w-6 h-6 opacity-30" />
                                        </div>
                                        <p className="text-sm">Sin comentarios</p>
                                        <p className="text-xs mt-1 max-w-[200px] mx-auto opacity-60">
                                            {isImage ? "Haz clic en la imagen para agregar una nota." : "Usa notas para dejar feedback."}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )

    return createPortal(viewerContent, document.body)
}
