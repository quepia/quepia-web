"use client"

import { useState, useRef } from "react"
import {
  Plus,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Trash2,
  ExternalLink,
  Loader2,
  Eye,
  CloudUpload,
  Ban,
  RotateCcw,
  Layers,
  Film,
  GripVertical,
  Pencil,
  PlusCircle,
  Check,
  X,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useAssets } from "@/lib/sistema/hooks"
import type { AssetWithVersions, ApprovalStatus, AssetVersion, AssetType } from "@/types/sistema"
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS, ASSET_TYPE_LABELS } from "@/types/sistema"
import { AssetDetailModal } from "./asset-detail-modal"
import { uploadAssetFile, uploadCarouselFiles, uploadReelFile, type UploadProgressUpdate } from "@/lib/sistema/asset-upload"
import { toggleAssetAccess, reorderCarouselAssets, renameCarouselAssets, deleteCarouselGroup, getNextGroupOrder } from "@/lib/sistema/actions/assets"

interface AssetPanelProps {
  taskId: string
  projectId: string
  userId: string
  // Optional: keep it if parent wants to know, but we use local state for modal
  onOpenAssetDetail?: (asset: AssetWithVersions, versionId?: string) => void
}

export function AssetPanel({ taskId, projectId, userId, onOpenAssetDetail }: AssetPanelProps) {
  const { assets, loading, updateApprovalStatus, deleteAsset, refresh, optimisticReorder } = useAssets(taskId)
  const [isAdding, setIsAdding] = useState(false)
  const [uploadMode, setUploadMode] = useState<'single' | 'carousel' | 'reel'>('single')
  const [carouselName, setCarouselName] = useState("")
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null)
  const [uploadingVersion, setUploadingVersion] = useState<string | null>(null)
  const [versionNotes, setVersionNotes] = useState("")
  const [uploadQueue, setUploadQueue] = useState<UploadProgressUpdate[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [editingCarouselId, setEditingCarouselId] = useState<string | null>(null)
  const [editingCarouselName, setEditingCarouselName] = useState("")
  const [addingSlidesToGroup, setAddingSlidesToGroup] = useState<string | null>(null)
  const carouselFileInputRef = useRef<HTMLInputElement>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const versionFileRef = useRef<HTMLInputElement>(null)

  // Asset Detail Modal State
  const [selectedAssetForDetail, setSelectedAssetForDetail] = useState<AssetWithVersions | null>(null)
  const [selectedVersionForDetail, setSelectedVersionForDetail] = useState<string | undefined>(undefined)

  const handleOpenAssetDetail = (asset: AssetWithVersions, versionId?: string) => {
    setSelectedAssetForDetail(asset)
    setSelectedVersionForDetail(versionId)
    onOpenAssetDetail?.(asset, versionId)
  }

  const updateUploadQueue = (update: UploadProgressUpdate) => {
    setUploadQueue((prev) => {
      const idx = prev.findIndex((u) => u.id === update.id)
      if (idx === -1) return [...prev, update]
      const next = [...prev]
      next[idx] = { ...next[idx], ...update }
      return next
    })
  }

  const handleFilesUpload = async (files: FileList | File[]) => {
    const list = Array.from(files || [])
    if (list.length === 0) return

    const mode = uploadMode
    setIsAdding(false)

    if (mode === 'carousel' && list.length >= 2) {
      try {
        await uploadCarouselFiles({
          files: list,
          taskId,
          projectId,
          userId,
          carouselName: carouselName.trim() || undefined,
          onProgress: updateUploadQueue,
        })
      } catch (err: any) {
        updateUploadQueue({
          id: `carousel-${Date.now()}`,
          fileName: "Carrusel",
          percent: 0,
          stage: "error",
          message: err?.message || "Error subiendo carrusel",
        })
      }
      setCarouselName("")
    } else if (mode === 'reel') {
      // Only use first video file
      const videoFile = list.find(f => f.type.startsWith('video/'))
      if (videoFile) {
        try {
          await uploadReelFile({
            file: videoFile,
            taskId,
            projectId,
            userId,
            reelName: carouselName.trim() || undefined,
            onProgress: updateUploadQueue,
          })
        } catch (err: any) {
          updateUploadQueue({
            id: `reel-${Date.now()}`,
            fileName: videoFile.name,
            percent: 0,
            stage: "error",
            message: err?.message || "Error subiendo reel",
          })
        }
      }
      setCarouselName("")
    } else {
      for (const file of list) {
        try {
          await uploadAssetFile({
            file,
            taskId,
            projectId,
            userId,
            onProgress: updateUploadQueue,
          })
        } catch (err: any) {
          updateUploadQueue({
            id: `${file.name}-${Date.now()}`,
            fileName: file.name,
            percent: 0,
            stage: "error",
            message: err?.message || "Error subiendo archivo",
          })
        }
      }
    }

    await refresh()
  }

  const handleAddVersion = async (assetId: string, currentVersion: number) => {
    const file = versionFileRef.current?.files?.[0]
    if (!file) return
    await uploadAssetFile({
      file,
      taskId,
      projectId,
      userId,
      assetId,
      currentVersion,
      notes: versionNotes.trim() || null,
      onProgress: updateUploadQueue,
    })
    await refresh()
    setVersionNotes("")
    setUploadingVersion(null)
    if (versionFileRef.current) versionFileRef.current.value = ""
  }

  // Add slides to an existing carousel
  const handleAddSlidesToCarousel = async (files: FileList | File[], groupId: string) => {
    const list = Array.from(files || [])
    if (list.length === 0) return

    const startOrder = await getNextGroupOrder(groupId)

    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      try {
        await uploadAssetFile({
          file,
          taskId,
          projectId,
          userId,
          assetType: "carousel",
          groupId,
          groupOrder: startOrder + i,
          onProgress: updateUploadQueue,
        })
      } catch (err: any) {
        updateUploadQueue({
          id: `${file.name}-${Date.now()}`,
          fileName: file.name,
          percent: 0,
          stage: "error",
          message: err?.message || "Error subiendo archivo",
        })
      }
    }

    setAddingSlidesToGroup(null)
    await refresh()
  }

  const statusTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
    pending_review: ['changes_requested', 'approved_internal'],
    changes_requested: ['pending_review', 'approved_internal'],
    approved_internal: ['changes_requested', 'approved_final'],
    approved_final: ['changes_requested', 'published'],
    published: [],
  }

  if (loading) {
    return (
      <div className="py-4 flex justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
          Assets ({assets.length})
        </h3>
        <button
          onClick={() => {
            setIsAdding(true)
            fileInputRef.current?.click()
          }}
          className="text-xs text-quepia-cyan hover:underline flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Agregar
        </button>
      </div>

      {/* Hidden input for adding slides to existing carousel */}
      <input
        ref={carouselFileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && addingSlidesToGroup) {
            handleAddSlidesToCarousel(e.target.files, addingSlidesToGroup)
          }
          if (carouselFileInputRef.current) carouselFileInputRef.current.value = ""
        }}
      />

      {/* Add asset form */}
      {isAdding && (
        <div
          className={cn(
            "bg-white/[0.03] border border-dashed rounded-lg p-4 space-y-3 transition-colors",
            isDragOver ? "border-quepia-cyan/60 bg-quepia-cyan/5" : "border-white/[0.12]"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            handleFilesUpload(e.dataTransfer.files)
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple={uploadMode !== 'reel'}
            accept={uploadMode === 'reel'
              ? "video/mp4,video/quicktime,video/webm"
              : "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            }
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFilesUpload(e.target.files)
            }}
          />

          {/* Upload mode selector */}
          <div className="flex gap-1 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06]">
            {([
              { key: 'single' as const, label: 'Individual', icon: <ImageIcon className="h-3 w-3" /> },
              { key: 'carousel' as const, label: 'Carrusel', icon: <Layers className="h-3 w-3" /> },
              { key: 'reel' as const, label: 'Reel', icon: <Film className="h-3 w-3" /> },
            ]).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setUploadMode(key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-medium rounded-md transition-colors",
                  uploadMode === key
                    ? "bg-quepia-cyan/20 text-quepia-cyan border border-quepia-cyan/30"
                    : "text-white/40 hover:text-white/70"
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Name input for carousel / reel */}
          {(uploadMode === 'carousel' || uploadMode === 'reel') && (
            <input
              type="text"
              value={carouselName}
              onChange={(e) => setCarouselName(e.target.value)}
              placeholder={uploadMode === 'carousel' ? "Nombre del carrusel (opcional)" : "Nombre del reel (opcional)"}
              className="w-full text-xs bg-white/[0.03] border border-white/10 rounded px-2 py-1.5 text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan"
            />
          )}

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <CloudUpload className="h-4 w-4 text-quepia-cyan" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-white/80">
                {uploadMode === 'carousel'
                  ? "Arrastrá las imágenes del carrusel"
                  : uploadMode === 'reel'
                    ? "Arrastrá el video del reel"
                    : "Arrastrá archivos aquí"}
              </p>
              <p className="text-[11px] text-white/40">
                {uploadMode === 'reel'
                  ? "MP4, MOV, WEBM (máx 100MB)"
                  : uploadMode === 'carousel'
                    ? "2+ imágenes · JPG, PNG, WEBP, GIF (máx 100MB c/u)"
                    : "JPG, PNG, WEBP, GIF, MP4, MOV, WEBM (máx 100MB)"}
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 text-xs rounded bg-quepia-cyan text-black font-medium hover:opacity-90"
            >
              Seleccionar
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => { setIsAdding(false); setUploadMode('single'); setCarouselName("") }}
              className="text-[11px] text-white/40 hover:text-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          {uploadQueue.map((u) => (
            <div key={u.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2">
              <div className="flex items-center justify-between text-[11px] text-white/60 mb-1">
                <span className="truncate">{u.fileName || u.id}</span>
                <span>{u.stage === "error" ? "Error" : `${u.percent}%`}</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    u.stage === "error" ? "bg-red-400/70" : "bg-quepia-cyan"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, u.percent))}%` }}
                />
              </div>
              {u.message && (
                <p className="text-[10px] text-red-300/80 mt-1">{u.message}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Asset list */}
      {assets.length === 0 && !isAdding ? (
        <p className="text-xs text-white/25 text-center py-3">Sin assets</p>
      ) : (
        <div className="space-y-2">
          {(() => {
            // Group carousel items together
            const groups: { groupId: string | null; items: AssetWithVersions[] }[] = []
            const seen = new Set<string>()

            for (const asset of assets) {
              if (seen.has(asset.id)) continue

              if (asset.asset_type === 'carousel' && asset.group_id) {
                if (!seen.has(asset.group_id)) {
                  const groupItems = assets
                    .filter(a => a.group_id === asset.group_id)
                    .sort((a, b) => (a.group_order ?? 0) - (b.group_order ?? 0))
                  groupItems.forEach(a => seen.add(a.id))
                  seen.add(asset.group_id)
                  groups.push({ groupId: asset.group_id, items: groupItems })
                }
              } else {
                seen.add(asset.id)
                groups.push({ groupId: null, items: [asset] })
              }
            }

            return groups.map(({ groupId, items }) => {
              const isCarouselGroup = groupId && items.length > 1 && items[0]?.asset_type === 'carousel'

              if (isCarouselGroup) {
                // Render carousel group
                const firstAsset = items[0]
                const isGroupExpanded = expandedAsset === groupId
                return (
                  <div key={groupId} className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden border-l-2 border-l-purple-400/40">
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
                      onClick={() => setExpandedAsset(isGroupExpanded ? null : groupId)}
                    >
                      {isGroupExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-white/30 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-white/30 shrink-0" />
                      )}

                      {/* Stacked thumbnails */}
                      <div className="relative w-10 h-8 shrink-0">
                        {items.slice(0, 3).map((item, idx) => {
                          const v = item.versions?.[0]
                          return (
                            <div
                              key={item.id}
                              className="absolute rounded overflow-hidden bg-white/5 border border-white/10"
                              style={{
                                width: 28, height: 28,
                                left: idx * 5,
                                top: 0,
                                zIndex: 3 - idx,
                              }}
                            >
                              {v?.thumbnail_url ? (
                                <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon className="h-3 w-3 text-white/20" />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Layers className="h-3 w-3 text-purple-400 shrink-0" />
                          <p className="text-xs text-white/80 truncate">
                            {firstAsset.nombre.replace(/\s*\(\d+\/\d+\)\s*$/, '') || "Carrusel"}
                          </p>
                        </div>
                        <p className="text-[10px] text-white/30">{items.length} slides</p>
                      </div>

                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 bg-purple-500/10 text-purple-300">
                        Carrusel
                      </span>

                      {/* Carousel action buttons */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setEditingCarouselId(groupId)
                            setEditingCarouselName(firstAsset.nombre.replace(/\s*\(\d+\/\d+\)\s*$/, '') || '')
                          }}
                          className="p-1 hover:bg-white/[0.06] rounded transition-colors text-white/40 hover:text-white"
                          title="Editar nombre"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => {
                            setAddingSlidesToGroup(groupId)
                            setTimeout(() => carouselFileInputRef.current?.click(), 0)
                          }}
                          className="p-1 hover:bg-white/[0.06] rounded transition-colors text-white/40 hover:text-white"
                          title="Agregar slides"
                        >
                          <PlusCircle className="h-3 w-3" />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`¿Eliminar este carrusel con ${items.length} slides?`)) {
                              await deleteCarouselGroup(groupId)
                              await refresh()
                            }
                          }}
                          className="p-1 hover:bg-red-500/10 rounded transition-colors text-white/40 hover:text-red-400"
                          title="Eliminar carrusel"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Inline edit name form */}
                    {editingCarouselId === groupId && (
                      <div className="px-3 py-2 border-t border-white/[0.04] flex items-center gap-2">
                        <input
                          type="text"
                          value={editingCarouselName}
                          onChange={(e) => setEditingCarouselName(e.target.value)}
                          className="flex-1 text-xs bg-white/[0.03] border border-white/10 rounded px-2 py-1.5 text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan"
                          placeholder="Nombre del carrusel"
                          autoFocus
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && editingCarouselName.trim()) {
                              await renameCarouselAssets(groupId, editingCarouselName.trim())
                              setEditingCarouselId(null)
                              await refresh()
                            }
                            if (e.key === 'Escape') setEditingCarouselId(null)
                          }}
                        />
                        <button
                          onClick={async () => {
                            if (editingCarouselName.trim()) {
                              await renameCarouselAssets(groupId, editingCarouselName.trim())
                              setEditingCarouselId(null)
                              await refresh()
                            }
                          }}
                          className="p-1.5 bg-quepia-cyan/20 hover:bg-quepia-cyan/30 rounded text-quepia-cyan"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setEditingCarouselId(null)}
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-white/40"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {isGroupExpanded && (
                      <div className="border-t border-white/[0.04] px-3 py-3">
                        <p className="text-[10px] text-white/30 mb-2 flex items-center gap-1">
                          <GripVertical className="h-3 w-3" /> Arrastrá para reordenar
                        </p>
                        {/* Horizontal carousel preview */}
                        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
                          {items.map((item, idx) => {
                            const v = item.versions?.[0]
                            const thumbSrc = v?.thumbnail_url || v?.file_url
                            const isDragging = draggedItemId === item.id
                            const isDragTarget = dragOverItemId === item.id
                            return (
                              <div
                                key={item.id}
                                draggable
                                onDragStart={() => setDraggedItemId(item.id)}
                                onDragEnd={async () => {
                                  if (draggedItemId && dragOverItemId && draggedItemId !== dragOverItemId) {
                                    const currentOrder = items.map(i => i.id)
                                    const fromIdx = currentOrder.indexOf(draggedItemId)
                                    const toIdx = currentOrder.indexOf(dragOverItemId)
                                    if (fromIdx !== -1 && toIdx !== -1) {
                                      const newOrder = [...currentOrder]
                                      newOrder.splice(fromIdx, 1)
                                      newOrder.splice(toIdx, 0, draggedItemId)
                                      // Optimistic update - instant visual feedback
                                      optimisticReorder(newOrder)
                                      // Save to server in background (no await)
                                      reorderCarouselAssets(newOrder)
                                    }
                                  }
                                  setDraggedItemId(null)
                                  setDragOverItemId(null)
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  if (draggedItemId !== item.id) {
                                    setDragOverItemId(item.id)
                                  }
                                }}
                                onDragLeave={() => {
                                  if (dragOverItemId === item.id) setDragOverItemId(null)
                                }}
                                className={cn(
                                  "shrink-0 w-20 group cursor-grab active:cursor-grabbing transition-all",
                                  isDragging && "opacity-50 scale-95",
                                  isDragTarget && "border-l-2 border-quepia-cyan"
                                )}
                                onClick={() => handleOpenAssetDetail(item)}
                              >
                                <div className={cn(
                                  "w-20 h-20 rounded-lg overflow-hidden bg-white/5 border border-white/10 group-hover:border-quepia-cyan/40 transition-colors relative",
                                  isDragTarget && "ring-2 ring-quepia-cyan"
                                )}>
                                  {thumbSrc ? (
                                    <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <ImageIcon className="h-5 w-5 text-white/20" />
                                    </div>
                                  )}
                                  <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 text-white/70 px-1 rounded">
                                    {idx + 1}
                                  </span>
                                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <GripVertical className="h-3 w-3 text-white/60" />
                                  </div>
                                </div>
                                <div className="mt-1">
                                  <span
                                    className="text-[9px] px-1 py-0.5 rounded font-medium"
                                    style={{
                                      backgroundColor: APPROVAL_STATUS_COLORS[item.approval_status] + "1a",
                                      color: APPROVAL_STATUS_COLORS[item.approval_status],
                                    }}
                                  >
                                    {APPROVAL_STATUS_LABELS[item.approval_status]}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              }

              // Regular single asset or reel
              const asset = items[0]
              const isExpanded = expandedAsset === asset.id
              const latestVersion = asset.versions?.[0]
              const nextStatuses = statusTransitions[asset.approval_status]
              const isReel = asset.asset_type === 'reel'

              return (
                <div key={asset.id} className={cn(
                  "bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden",
                  isReel && "border-l-2 border-l-pink-400/40"
                )}>
                  {/* Asset header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
                    onClick={() => setExpandedAsset(isExpanded ? null : asset.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-white/30 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-white/30 shrink-0" />
                    )}

                    {/* Thumbnail */}
                    {latestVersion?.thumbnail_url || (latestVersion && isImageUrl(latestVersion.file_url)) ? (
                      <div className="w-8 h-8 rounded overflow-hidden shrink-0 bg-white/5 relative">
                        <img
                          src={latestVersion?.thumbnail_url || latestVersion?.file_url || ""}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {isReel && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Film className="h-3 w-3 text-white/80" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center shrink-0">
                        {isReel ? <Film className="h-4 w-4 text-pink-400/60" /> : <ImageIcon className="h-4 w-4 text-white/20" />}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/80 truncate">{asset.nombre}</p>
                      <p className="text-[10px] text-white/30">v{asset.current_version}</p>
                    </div>

                    {isReel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 bg-pink-500/10 text-pink-300">
                        Reel
                      </span>
                    )}

                    {/* Status badge */}
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                      style={{
                        backgroundColor: APPROVAL_STATUS_COLORS[asset.approval_status] + "1a",
                        color: APPROVAL_STATUS_COLORS[asset.approval_status],
                      }}
                    >
                      {APPROVAL_STATUS_LABELS[asset.approval_status]}
                    </span>

                    {asset.access_revoked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 bg-red-500/10 text-red-400">
                        Acceso revocado
                      </span>
                    )}

                    {asset.iteration_count > 0 && (
                      <span className="text-[9px] text-red-400/60 shrink-0">
                        ×{asset.iteration_count}
                      </span>
                    )}
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-white/[0.04] px-3 py-3 space-y-3">
                      {/* Status transitions */}
                      {nextStatuses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {nextStatuses.map((status) => (
                            <button
                              key={status}
                              onClick={() => updateApprovalStatus(asset.id, status)}
                              className="text-[10px] px-2 py-1 rounded-lg border transition-colors hover:opacity-80"
                              style={{
                                borderColor: APPROVAL_STATUS_COLORS[status] + '40',
                                color: APPROVAL_STATUS_COLORS[status],
                                backgroundColor: APPROVAL_STATUS_COLORS[status] + '10',
                              }}
                            >
                              → {APPROVAL_STATUS_LABELS[status]}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await toggleAssetAccess(asset.id, !asset.access_revoked)
                            await refresh()
                          }}
                          className={cn(
                            "text-[10px] px-2 py-1 rounded-lg border transition-colors flex items-center gap-1",
                            asset.access_revoked
                              ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                              : "border-red-500/30 text-red-300 bg-red-500/10"
                          )}
                        >
                          {asset.access_revoked ? (
                            <>
                              <RotateCcw className="h-3 w-3" /> Restaurar acceso
                            </>
                          ) : (
                            <>
                              <Ban className="h-3 w-3" /> Revocar acceso
                            </>
                          )}
                        </button>
                      </div>

                      {/* Versions list */}
                      <div>
                        <p className="text-[10px] text-white/25 uppercase font-semibold tracking-wider mb-1.5">Versiones</p>
                        <div className="space-y-1">
                          {(asset.versions || []).map((v) => (
                            <div key={v.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-white/[0.03] group">
                              <span className="text-[10px] text-white/30 w-6">v{v.version_number}</span>
                              {(v.thumbnail_url || isImageUrl(v.file_url)) && (
                                <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-white/5">
                                  <img src={v.thumbnail_url || v.file_url} alt="" className="w-full h-full object-cover" />
                                </div>
                              )}
                              <span className="text-xs text-white/60 flex-1 truncate">
                                {v.notes || v.file_url.split('/').pop()}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleOpenAssetDetail(asset, v.id) }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/[0.06] rounded transition-all"
                                title="Ver y anotar"
                              >
                                <Eye className="h-3 w-3 text-quepia-cyan" />
                              </button>
                              <a
                                href={v.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/[0.06] rounded transition-all"
                              >
                                <ExternalLink className="h-3 w-3 text-white/30" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Upload new version */}
                      {uploadingVersion === asset.id ? (
                        <div className="space-y-2 pt-1">
                          <input
                            ref={versionFileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                            className="w-full text-xs bg-white/[0.03] border border-white/10 rounded px-2 py-1.5 text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan"
                          />
                          <input
                            type="text"
                            value={versionNotes}
                            onChange={(e) => setVersionNotes(e.target.value)}
                            placeholder="Notas (opcional)"
                            className="w-full text-xs bg-white/[0.03] border border-white/10 rounded px-2 py-1.5 text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan"
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddVersion(asset.id, asset.current_version) }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAddVersion(asset.id, asset.current_version)}
                              className="px-2 py-1 text-[10px] rounded bg-quepia-cyan text-black font-medium"
                            >
                              Subir v{asset.current_version + 1}
                            </button>
                            <button onClick={() => setUploadingVersion(null)} className="text-[10px] text-white/40">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setUploadingVersion(asset.id)}
                          className="text-[10px] text-quepia-cyan hover:underline flex items-center gap-1"
                        >
                          <Upload className="h-3 w-3" /> Nueva versión
                        </button>
                      )}

                      {/* Open detail view (annotations) */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                        <button
                          onClick={() => handleOpenAssetDetail(asset)}
                          className="text-[10px] text-quepia-cyan hover:underline flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" /> Ver y anotar
                        </button>
                        <button
                          onClick={() => { if (confirm("¿Eliminar este asset?")) deleteAsset(asset.id) }}
                          className="text-[10px] text-red-400/50 hover:text-red-400 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* Detail Modal */}
      {selectedAssetForDetail && (
        <AssetDetailModal
          asset={selectedAssetForDetail}
          initialVersionId={selectedVersionForDetail}
          isOpen={true}
          onClose={() => {
            setSelectedAssetForDetail(null)
            setSelectedVersionForDetail(undefined)
          }}
          onUpdate={() => {
            // trigger refresh if needed
          }}
        />
      )}
    </div>
  )
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(url)
}
