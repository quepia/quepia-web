"use client"

import { useState, useEffect } from "react"
import {
    X,
    MessageSquare,
    CheckCircle2,
    AlertCircle,
    Send,
    Trash2,
    ChevronRight,
    Maximize2,
    Minimize2,
    Columns2,
    GitCompare,
    Download,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import {
    isExternalAssetSource,
    isGoogleDriveUrl,
    isLikelyImageAsset,
    isLikelyVideoAsset,
    toGoogleDrivePreviewUrl,
} from "@/lib/sistema/asset-link-utils"
// Use the wrapper to avoid SSR issues
import AnnotationCanvasWrapper from "./annotation-canvas-wrapper"
import VersionComparison from "./version-comparison"
import { getAnnotations, createAnnotation, resolveAnnotation } from "@/lib/sistema/actions/assets"
import {
    type AssetWithVersions,
    type AssetVersion,
    type Annotation,
    type FeedbackType,
    FEEDBACK_TYPE_LABELS,
    FEEDBACK_TYPE_COLORS,
    APPROVAL_STATUS_LABELS,
    APPROVAL_STATUS_COLORS
} from "@/types/sistema"

interface AssetDetailModalProps {
    asset: AssetWithVersions
    initialVersionId?: string
    isOpen: boolean
    onClose: () => void
    onUpdate?: () => void
}

export function AssetDetailModal({
    asset,
    initialVersionId,
    isOpen,
    onClose,
    onUpdate
}: AssetDetailModalProps) {
    const [activeVersionId, setActiveVersionId] = useState<string>(initialVersionId || asset.versions?.[0]?.id || "")
    const [annotations, setAnnotations] = useState<Annotation[]>([])
    const [loadingAnnotations, setLoadingAnnotations] = useState(false)

    // New annotation state
    const [pendingAnnotation, setPendingAnnotation] = useState<{ x: number, y: number } | null>(null)
    const [feedbackType, setFeedbackType] = useState<FeedbackType>("correction_minor")
    const [feedbackContent, setFeedbackContent] = useState("")
    const [submitting, setSubmitting] = useState(false)

    // Selected annotation state
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)

    // UI state
    const [showSidebar, setShowSidebar] = useState(true)
    const [showComparison, setShowComparison] = useState(false)

    const activeVersion = asset.versions?.find(v => v.id === activeVersionId)

    useEffect(() => {
        setActiveVersionId(initialVersionId || asset.versions?.[0]?.id || "")
    }, [initialVersionId, asset])

    useEffect(() => {
        if (isOpen && activeVersionId) {
            fetchAnnotations()
        }
    }, [isOpen, activeVersionId])

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        if (isOpen) window.addEventListener("keydown", handleEsc)
        return () => window.removeEventListener("keydown", handleEsc)
    }, [isOpen, onClose])

    const fetchAnnotations = async () => {
        if (!activeVersionId) return
        setLoadingAnnotations(true)
        const res = await getAnnotations(activeVersionId)
        if (res.success && res.data) {
            setAnnotations(res.data)
        }
        setLoadingAnnotations(false)
    }

    const handleAddAnnotationClick = (x: number, y: number) => {
        setPendingAnnotation({ x, y })
        setSelectedAnnotationId(null) // clear selection to focus on creating
        if (!showSidebar) setShowSidebar(true)
    }

    const handleSaveAnnotation = async () => {
        if (!pendingAnnotation || !feedbackContent.trim() || !activeVersionId) return

        setSubmitting(true)
        const res = await createAnnotation({
            asset_version_id: activeVersionId,
            x_percent: pendingAnnotation.x,
            y_percent: pendingAnnotation.y,
            feedback_type: feedbackType,
            contenido: feedbackContent.trim()
        })

        if (res.success && res.data) {
            setAnnotations([...annotations, res.data])
            setPendingAnnotation(null)
            setFeedbackContent("")
            setFeedbackType("correction_minor") // reset to default
        }
        setSubmitting(false)
    }

    const handleResolveToggle = async (ann: Annotation) => {
        // Optimistic update
        const newStatus = !ann.resolved
        setAnnotations(annotations.map(a => a.id === ann.id ? { ...a, resolved: newStatus } : a))

        const res = await resolveAnnotation(ann.id, newStatus)
        if (!res.success) {
            // Revert on error
            setAnnotations(annotations.map(a => a.id === ann.id ? { ...a, resolved: !newStatus } : a))
            alert("Error al actualizar estado")
        }
    }

    if (!isOpen || !activeVersion) return null

    const sourcePath = activeVersion.storage_path || activeVersion.file_url
    const originalUrl = activeVersion.file_url || sourcePath || ""
    const previewUrl = activeVersion.preview_url || activeVersion.file_url || sourcePath || ""
    const fileNameOrUrl = activeVersion.original_filename || sourcePath || originalUrl
    const isImage = isLikelyImageAsset(activeVersion.file_type, fileNameOrUrl)
    const isGoogleDrive = isGoogleDriveUrl(sourcePath || originalUrl)
    const isVideo = !isGoogleDrive && isLikelyVideoAsset(activeVersion.file_type, fileNameOrUrl)
    const isExternalSource = isExternalAssetSource(sourcePath)
    const shouldUseIframePreview = isGoogleDrive || (asset.asset_type === "reel" && isExternalSource && !isImage && !isVideo)
    const iframeUrl = isGoogleDrive
        ? toGoogleDrivePreviewUrl(sourcePath || originalUrl) || originalUrl
        : (sourcePath || originalUrl)

    // Group annotations
    const activeAnnotations = annotations
    const pendingReview = activeAnnotations.filter(a => !a.resolved)
    const resolved = activeAnnotations.filter(a => a.resolved)

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm">
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
                                    <span className="text-xs text-white/60 bg-black/40 px-2 py-0.5 rounded">v{activeVersion.version_number}</span>
                                    <span
                                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                        style={{
                                            backgroundColor: APPROVAL_STATUS_COLORS[asset.approval_status] + '30',
                                            color: APPROVAL_STATUS_COLORS[asset.approval_status] // Use 100% opacity color for text
                                        }}
                                    >
                                        {APPROVAL_STATUS_LABELS[asset.approval_status]}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pointer-events-auto flex items-center gap-2">
                            {asset.versions && asset.versions.length > 1 && (
                                <>
                                    <button
                                        onClick={() => setShowComparison(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors border border-white/10 text-xs"
                                        title="Comparar versiones"
                                    >
                                        <GitCompare className="w-3.5 h-3.5" />
                                        Comparar
                                    </button>
                                    <div className="bg-black/50 rounded-lg p-1 flex items-center gap-1 border border-white/10">
                                        {asset.versions.map(v => (
                                            <button
                                                key={v.id}
                                                onClick={() => setActiveVersionId(v.id)}
                                                className={cn(
                                                    "px-2 py-1 text-xs rounded hover:bg-white/10 transition-colors",
                                                    v.id === activeVersionId ? "bg-quepia-cyan/20 text-quepia-cyan font-medium" : "text-white/60"
                                                )}
                                            >
                                                v{v.version_number}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            <button
                                onClick={() => {
                                    if (!originalUrl) return

                                    if (isExternalSource) {
                                        window.open(sourcePath || originalUrl, "_blank", "noopener,noreferrer")
                                        return
                                    }

                                    const link = document.createElement("a")
                                    link.href = originalUrl
                                    link.download = activeVersion.original_filename || asset.nombre
                                    link.target = "_blank"
                                    document.body.appendChild(link)
                                    link.click()
                                    document.body.removeChild(link)
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors border border-white/10 text-xs"
                                title="Descargar"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Descargar
                            </button>
                            <button
                                onClick={() => setShowSidebar(!showSidebar)}
                                className="p-2 bg-black/50 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors border border-white/10"
                                title={showSidebar ? "Ocultar panel" : "Ver panel"}
                            >
                                {showSidebar ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 w-full h-full relative bg-black flex items-center justify-center">
                        {isImage ? (
                            <AnnotationCanvasWrapper
                                imageUrl={previewUrl}
                                annotations={annotations}
                                onAddAnnotation={handleAddAnnotationClick}
                                onSelectAnnotation={(ann) => {
                                    setSelectedAnnotationId(ann.id)
                                    if (!showSidebar) setShowSidebar(true)
                                }}
                                selectedAnnotationId={selectedAnnotationId}
                            />
                        ) : isVideo ? (
                            <video
                                src={previewUrl}
                                poster={activeVersion.thumbnail_url || undefined}
                                controls
                                playsInline
                                className="w-full h-full object-contain bg-black"
                            />
                        ) : shouldUseIframePreview && iframeUrl ? (
                            <div className="w-full h-full">
                                <iframe
                                    src={iframeUrl}
                                    className="w-full h-full border-0"
                                    allow="autoplay; fullscreen"
                                    title="Asset Preview"
                                />
                            </div>
                        ) : (
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
                        )}
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
                            <span className="text-xs text-white/30">{annotations.length} notas</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* Creation Form */}
                            {pendingAnnotation && (
                                <div className="bg-white/[0.05] border border-quepia-cyan/50 rounded-lg p-3 animate-in slide-in-from-right-2 fade-in duration-200">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-quepia-cyan uppercase tracking-wider">Nueva Nota</span>
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

                            {/* List - Pending */}
                            {pendingReview.length > 0 && (
                                <div className="space-y-3">
                                    {pendingReview.map(ann => (
                                        <AnnotationItem
                                            key={ann.id}
                                            annotation={ann}
                                            isSelected={selectedAnnotationId === ann.id}
                                            onSelect={() => setSelectedAnnotationId(ann.id)}
                                            onResolve={() => handleResolveToggle(ann)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* List - Resolved */}
                            {resolved.length > 0 && (
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <h4 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">Resueltos</h4>
                                    {resolved.map(ann => (
                                        <AnnotationItem
                                            key={ann.id}
                                            annotation={ann}
                                            isSelected={selectedAnnotationId === ann.id}
                                            onSelect={() => setSelectedAnnotationId(ann.id)}
                                            onResolve={() => handleResolveToggle(ann)}
                                        />
                                    ))}
                                </div>
                            )}

                            {!pendingAnnotation && annotations.length === 0 && !loadingAnnotations && (
                                <div className="text-center py-10 text-white/20">
                                    <div className="w-12 h-12 rounded-full bg-white/5 mx-auto flex items-center justify-center mb-3">
                                        <AlertCircle className="w-6 h-6 opacity-30" />
                                    </div>
                                    <p className="text-sm">Sin anotaciones</p>
                                    <p className="text-xs mt-1 max-w-[200px] mx-auto opacity-60">Haz clic en cualquier parte de la imagen para agregar una nota.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Version Comparison Modal */}
            <VersionComparison
                isOpen={showComparison}
                onClose={() => setShowComparison(false)}
                versions={asset.versions || []}
                assetName={asset.nombre}
                annotations={annotations.reduce((acc, ann) => {
                    const versionId = ann.asset_version_id
                    if (!acc[versionId]) acc[versionId] = []
                    acc[versionId].push(ann)
                    return acc
                }, {} as Record<string, Annotation[]>)}
            />
        </div>
    )
}

function AnnotationItem({
    annotation,
    isSelected,
    onSelect,
    onResolve
}: {
    annotation: Annotation,
    isSelected: boolean,
    onSelect: () => void,
    onResolve: () => void
}) {
    const color = FEEDBACK_TYPE_COLORS[annotation.feedback_type]

    return (
        <div
            onClick={onSelect}
            className={cn(
                "p-3 rounded-lg border transition-all cursor-pointer group relative",
                isSelected
                    ? "bg-white/[0.08] border-quepia-cyan/30"
                    : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]",
                annotation.resolved && "opacity-50 hover:opacity-100"
            )}
            style={isSelected ? { borderLeft: `3px solid ${color}` } : { borderLeft: `3px solid transparent` }}
        >
            <div className="flex items-start gap-2 mb-1">
                <span
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white/90 truncate">
                            {FEEDBACK_TYPE_LABELS[annotation.feedback_type]}
                        </span>
                        <span className="text-[10px] text-white/30">
                            {new Date(annotation.created_at).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>
            </div>

            <p className="text-sm text-white/70 pl-4 break-words leading-relaxed">
                {annotation.contenido}
            </p>

            <div className="flex items-center justify-end mt-2 pt-2 border-t border-white/[0.03] gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onResolve() }}
                    className={cn(
                        "text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-colors",
                        annotation.resolved
                            ? "bg-white/10 text-white/60 hover:text-white"
                            : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    )}
                >
                    <CheckCircle2 className="w-3 h-3" />
                    {annotation.resolved ? "Reabrir" : "Resolver"}
                </button>
            </div>
        </div>
    )
}
