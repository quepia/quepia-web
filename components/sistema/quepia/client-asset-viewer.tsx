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
    Star
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import AnnotationCanvasWrapper from "./annotation-canvas-wrapper"
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

export interface ClientAsset {
    id: string
    nombre: string
    approval_status: ApprovalStatus
    client_rating?: number
    current_version_id: string
    file_url: string
    file_type: string | null
    version_number: number
    annotations: Annotation[]
}

interface ClientAssetViewerProps {
    asset: ClientAsset
    isOpen: boolean
    onClose: () => void
    token: string
    clientName: string
    onUpdate: () => void // to refresh data
}

export function ClientAssetViewer({
    asset,
    isOpen,
    onClose,
    token,
    clientName,
    onUpdate
}: ClientAssetViewerProps) {
    const [annotations, setAnnotations] = useState<Annotation[]>(asset.annotations || [])
    const [localStatus, setLocalStatus] = useState<ApprovalStatus>(asset.approval_status)
    const [localRating, setLocalRating] = useState<number | undefined>(asset.client_rating)

    // New annotation state
    const [pendingAnnotation, setPendingAnnotation] = useState<{ x: number, y: number } | null>(null)
    const [feedbackType, setFeedbackType] = useState<FeedbackType>("correction_minor")
    const [feedbackContent, setFeedbackContent] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [updatingStatus, setUpdatingStatus] = useState(false)

    // Selected annotation state
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)

    // UI state
    const [showSidebar, setShowSidebar] = useState(true)

    useEffect(() => {
        setAnnotations(asset.annotations || [])
        setLocalStatus(asset.approval_status)
        setLocalRating(asset.client_rating)
    }, [asset])

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        if (isOpen) window.addEventListener("keydown", handleEsc)
        return () => window.removeEventListener("keydown", handleEsc)
    }, [isOpen, onClose])

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
                asset.current_version_id,
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
                    asset_version_id: asset.current_version_id,
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
                alert("Error al guardar la nota: " + (res.error || "Error desconocido"))
            }
        } catch (e) {
            console.error("Exception saving annotation:", e)
            alert("Error inesperado al guardar la nota")
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
            const res = await updatePublicAssetStatus(token, asset.id, status)
            if (res.success) {
                onUpdate()
            } else {
                setLocalStatus(previousStatus) // Revert on error
                console.error("Error updating status:", res.error)
                alert("Error al actualizar estado: " + (res.error || "Intente nuevamente"))
            }
        } catch (e) {
            setLocalStatus(previousStatus) // Revert on error
            console.error("Exception updating status:", e)
            alert("Error inesperado al actualizar estado")
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
            const res = await updatePublicAssetStatus(token, asset.id, localStatus, rating)
            if (res.success) {
                onUpdate()
            } else {
                setLocalRating(previousRating) // Revert on error
                console.error("Error updating rating:", res.error)
                alert("Error al enviar calificación: " + (res.error || "Intente nuevamente"))
            }
        } catch (e) {
            setLocalRating(previousRating) // Revert on error
            console.error("Exception updating rating:", e)
            alert("Error inesperado al calificar")
        } finally {
            setUpdatingStatus(false)
        }
    }

    // Mounted check for portal
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    // Drive Link Logic
    const fileUrl = asset.file_url || ""
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].some(ext => fileUrl.toLowerCase().includes(ext))
    const isGoogleDrive = fileUrl.includes("drive.google.com") || fileUrl.includes("docs.google.com")

    let embedUrl = fileUrl
    if (isGoogleDrive) {
        const idMatch = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
        if (idMatch && idMatch[1]) {
            embedUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`
        } else if (fileUrl.includes("view")) {
            embedUrl = fileUrl.replace(/\/view.*/, "/preview")
        }
    }

    const viewerContent = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm">
            <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden">

                {/* Main Canvas Area */}
                <div className="flex-1 relative bg-[#050505] flex flex-col">
                    {/* Header Overlay */}
                    <div className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                        <div className="pointer-events-auto flex items-center gap-3">
                            <button onClick={onClose} className="p-2 bg-black/50 hover:bg-white/10 rounded-full text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                            <div>
                                <h2 className="text-white font-medium text-lg drop-shadow-md">{asset.nombre}</h2>
                                <div className="flex items-center gap-2">
                                    <span
                                        className="text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors"
                                        style={{
                                            backgroundColor: APPROVAL_STATUS_COLORS[localStatus] + '30',
                                            color: APPROVAL_STATUS_COLORS[localStatus]
                                        }}
                                    >
                                        {APPROVAL_STATUS_LABELS[localStatus]}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pointer-events-auto flex items-center gap-2">
                            {/* Rating */}
                            <div className="flex items-center gap-0.5 bg-black/50 rounded-lg p-1 border border-white/10 mr-2">
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
                                    Solicitar cambios
                                </button>
                            </div>

                            <button
                                onClick={() => setShowSidebar(!showSidebar)}
                                className="p-2 bg-black/50 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors border border-white/10 ml-2"
                                title={showSidebar ? "Ocultar panel" : "Ver panel"}
                            >
                                {showSidebar ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 w-full h-full relative bg-black flex items-center justify-center">
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
                                        href={fileUrl}
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
                </div>

                {/* Right Sidebar */}
                {showSidebar && (
                    <div className="w-full md:w-[350px] bg-[#111] border-l border-white/10 flex flex-col h-[50vh] md:h-full shadow-2xl z-20">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-medium flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-quepia-cyan" />
                                Comentarios
                            </h3>
                            <button
                                onClick={handleGeneralComment}
                                className="text-[10px] bg-white/10 hover:bg-quepia-cyan/20 text-white/70 hover:text-quepia-cyan px-2 py-1 rounded transition-colors flex items-center gap-1"
                            >
                                <MessageSquare className="w-3 h-3" />
                                Agregar
                            </button>
                            <span className="text-xs text-white/30">{annotations.length} notas</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                )}
            </div>
        </div>
    )

    return createPortal(viewerContent, document.body)
}
