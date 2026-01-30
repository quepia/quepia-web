"use client"

import { useState, useEffect } from "react"
import { Search, Filter, Download, Copy, Check, Eye, FileIcon, ExternalLink } from "lucide-react"
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/types/sistema"
import type { ApprovalStatus } from "@/types/sistema"
import { cn } from "@/lib/sistema/utils"
import { ClientAssetViewer, type ClientAsset } from "./client-asset-viewer"

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

export function ClientAssetsView({ tasks, token, clientName, onUpdate }: ClientAssetsViewProps) {
    const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved">("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedAsset, setSelectedAsset] = useState<{ asset: ClientAsset, taskTitle: string } | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    // Re-sync selectedAsset when tasks prop updates (e.g. after approval/rating)
    useEffect(() => {
        if (selectedAsset) {
            const updatedAsset = tasks.flatMap(t => t.assets || []).find(a => a.id === selectedAsset.asset.id)
            if (updatedAsset) {
                setSelectedAsset({ asset: updatedAsset, taskTitle: selectedAsset.taskTitle })
            }
        }
    }, [tasks])

    // Flatten assets from tasks
    const allAssets = tasks.flatMap(task =>
        (task.assets || []).map(asset => ({
            ...asset,
            taskTitle: task.titulo,
            socialCopy: task.social_copy,
            taskId: task.id
        }))
    )

    // Filter logic
    const filteredAssets = allAssets.filter(item => {
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

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const handleDownload = (e: React.MouseEvent, url: string, filename: string) => {
        e.stopPropagation()
        // Create specific logic for download if needed, or just link
        const link = document.createElement("a")
        link.href = url
        link.download = filename
        link.target = "_blank"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
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

            {/* Grid */}
            {filteredAssets.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                    <p className="text-white/40">No se encontraron archivos</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredAssets.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => setSelectedAsset({ asset: item, taskTitle: item.taskTitle })}
                            className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden hover:border-quepia-cyan/30 transition-all cursor-pointer group flex flex-col"
                        >
                            {/* Preview Area */}
                            {/* Preview Area */}
                            <div className="aspect-video bg-black/40 relative flex items-center justify-center overflow-hidden">
                                {(() => {
                                    // Helper to determine type including fallback to extension
                                    const type = item.file_type || ""
                                    const ext = item.file_url.split('.').pop()?.toLowerCase() || ""
                                    const isImage = type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)
                                    const isVideo = type.startsWith("video/") || ["mp4", "webm", "ogg", "mov"].includes(ext)

                                    if (isImage) {
                                        return (
                                            <img
                                                src={item.file_url}
                                                alt={item.nombre}
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                            />
                                        )
                                    }
                                    if (isVideo) {
                                        return (
                                            <video
                                                src={item.file_url}
                                                className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                                muted
                                                playsInline
                                                loop
                                                onMouseOver={e => e.currentTarget.play()}
                                                onMouseOut={e => {
                                                    e.currentTarget.pause()
                                                    e.currentTarget.currentTime = 0
                                                }}
                                            />
                                        )
                                    }
                                    return <FileIcon className="h-10 w-10 text-white/20" />
                                })()}

                                <div className="absolute top-2 right-2 flex gap-2">
                                    <span
                                        className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10"
                                        style={{ color: APPROVAL_STATUS_COLORS[item.approval_status as ApprovalStatus] }}
                                    >
                                        {APPROVAL_STATUS_LABELS[item.approval_status as ApprovalStatus]}
                                    </span>
                                </div>

                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px] pointer-events-none">
                                    <button className="px-3 py-1.5 bg-white text-black text-xs font-bold rounded-full flex items-center gap-1.5 transform group-hover:scale-105 transition-transform">
                                        <Eye className="h-3.5 w-3.5" /> Ver
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-4 flex-1 flex flex-col">
                                <h3 className="text-sm font-medium text-white line-clamp-1 mb-1" title={item.nombre}>
                                    {item.nombre}
                                </h3>
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-xs text-white/40 truncate flex-1 pr-2" title={item.taskTitle}>
                                        {item.taskTitle}
                                    </p>
                                    <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">v{item.version_number}</span>
                                </div>

                                {/* Social Copy Section */}
                                {item.socialCopy && (
                                    <div className="mt-auto bg-black/30 rounded-lg p-2 border border-white/5 mb-3 group/copy relative">
                                        <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Social Copy</div>
                                        <p className="text-xs text-white/70 line-clamp-2 font-mono h-[32px] leading-tight">
                                            {item.socialCopy}
                                        </p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleCopy(item.socialCopy!, item.id)
                                            }}
                                            className="absolute top-2 right-2 text-white/30 hover:text-quepia-cyan transition-colors"
                                        >
                                            {copiedId === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                )}

                                {/* Actions Line */}
                                <div className="mt-auto flex items-center justify-between pt-3 border-t border-white/5">
                                    <span className="text-xs text-white/20">
                                        {item.file_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                                    </span>
                                    <button
                                        onClick={(e) => handleDownload(e, item.file_url, item.nombre)}
                                        className="text-white/40 hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-md"
                                        title="Descargar"
                                    >
                                        <Download className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail Viewer */}
            {selectedAsset && (
                <ClientAssetViewer
                    asset={selectedAsset.asset}
                    isOpen={!!selectedAsset}
                    onClose={() => setSelectedAsset(null)}
                    token={token}
                    clientName={clientName}
                    onUpdate={onUpdate}
                />
            )}
        </div>
    )
}
