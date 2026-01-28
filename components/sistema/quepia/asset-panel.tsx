"use client"

import { useState } from "react"
import {
  Plus,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Trash2,
  Check,
  X,
  ExternalLink,
  Clock,
  Loader2,
  Eye,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useAssets } from "@/lib/sistema/hooks"
import type { AssetWithVersions, ApprovalStatus, AssetVersion } from "@/types/sistema"
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS } from "@/types/sistema"
import { AssetDetailModal } from "./asset-detail-modal"

interface AssetPanelProps {
  taskId: string
  projectId: string
  userId: string
  // Optional: keep it if parent wants to know, but we use local state for modal
  onOpenAssetDetail?: (asset: AssetWithVersions, versionId?: string) => void
}

export function AssetPanel({ taskId, projectId, userId, onOpenAssetDetail }: AssetPanelProps) {
  const { assets, loading, createAsset, addVersion, updateApprovalStatus, deleteAsset } = useAssets(taskId)
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null)
  const [uploadingVersion, setUploadingVersion] = useState<string | null>(null)
  const [versionUrl, setVersionUrl] = useState("")
  const [versionNotes, setVersionNotes] = useState("")

  // Asset Detail Modal State
  const [selectedAssetForDetail, setSelectedAssetForDetail] = useState<AssetWithVersions | null>(null)
  const [selectedVersionForDetail, setSelectedVersionForDetail] = useState<string | undefined>(undefined)

  const handleOpenAssetDetail = (asset: AssetWithVersions, versionId?: string) => {
    setSelectedAssetForDetail(asset)
    setSelectedVersionForDetail(versionId)
    onOpenAssetDetail?.(asset, versionId)
  }

  const handleCreateAsset = async () => {
    try {
      if (!newName.trim() || !newUrl.trim()) {
        return;
      }

      console.log("Creating asset...", { taskId, projectId, userId, newName })

      const asset = await createAsset({
        task_id: taskId,
        project_id: projectId,
        nombre: newName.trim(),
        created_by: userId,
      })

      if (!asset) {
        alert("Error: No se pudo crear el asset. Revisa la consola.")
        return
      }

      // Create first version
      const version = await addVersion({
        asset_id: asset.id,
        version_number: 1,
        file_url: newUrl.trim(),
        uploaded_by: userId,
      })

      if (!version) {
        alert("Advertencia: Asset creado pero falló la versión inicial.")
      }

      setNewName("")
      setNewUrl("")
      setIsAdding(false)
    } catch (e: any) {
      console.error("HandleCreateAsset unexpected error:", e)
      alert(`Error inesperado: ${e.message}`)
    }
  }

  const handleAddVersion = async (assetId: string, currentVersion: number) => {
    if (!versionUrl.trim()) return
    await addVersion({
      asset_id: assetId,
      version_number: currentVersion + 1,
      file_url: versionUrl.trim(),
      notes: versionNotes.trim() || null,
      uploaded_by: userId,
    })
    setVersionUrl("")
    setVersionNotes("")
    setUploadingVersion(null)
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
          onClick={() => setIsAdding(true)}
          className="text-xs text-quepia-cyan hover:underline flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Agregar
        </button>
      </div>

      {/* Add asset form */}
      {isAdding && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del asset"
            autoFocus
            className="w-full text-sm bg-transparent border-b border-white/10 pb-1 text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan"
          />
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL del archivo (imagen, video, PDF...)"
            className="w-full text-sm bg-transparent border-b border-white/10 pb-1 text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateAsset() }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                // alert("DEBUG: Click detected on button");
                handleCreateAsset();
              }}
              // disabled={!newName.trim() || !newUrl.trim()} // Commented out for debugging
              className="px-3 py-1 text-xs rounded bg-quepia-cyan text-black font-medium hover:opacity-90"
            >
              Crear
            </button>
            <button onClick={() => { setIsAdding(false); setNewName(""); setNewUrl("") }} className="text-xs text-white/40 hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Asset list */}
      {assets.length === 0 && !isAdding ? (
        <p className="text-xs text-white/25 text-center py-3">Sin assets</p>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => {
            const isExpanded = expandedAsset === asset.id
            const latestVersion = asset.versions?.[0]
            const nextStatuses = statusTransitions[asset.approval_status]

            return (
              <div key={asset.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
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
                  {latestVersion && isImageUrl(latestVersion.file_url) ? (
                    <div className="w-8 h-8 rounded overflow-hidden shrink-0 bg-white/5">
                      <img src={latestVersion.file_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center shrink-0">
                      <ImageIcon className="h-4 w-4 text-white/20" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate">{asset.nombre}</p>
                    <p className="text-[10px] text-white/30">v{asset.current_version}</p>
                  </div>

                  {/* Status badge */}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                    style={{
                      backgroundColor: APPROVAL_STATUS_COLORS[asset.approval_status] + '1a',
                      color: APPROVAL_STATUS_COLORS[asset.approval_status],
                    }}
                  >
                    {APPROVAL_STATUS_LABELS[asset.approval_status]}
                  </span>

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

                    {/* Versions list */}
                    <div>
                      <p className="text-[10px] text-white/25 uppercase font-semibold tracking-wider mb-1.5">Versiones</p>
                      <div className="space-y-1">
                        {(asset.versions || []).map((v) => (
                          <div key={v.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-white/[0.03] group">
                            <span className="text-[10px] text-white/30 w-6">v{v.version_number}</span>
                            {isImageUrl(v.file_url) && (
                              <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-white/5">
                                <img src={v.file_url} alt="" className="w-full h-full object-cover" />
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
                          type="url"
                          value={versionUrl}
                          onChange={(e) => setVersionUrl(e.target.value)}
                          placeholder="URL de la nueva versión"
                          autoFocus
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
                            disabled={!versionUrl.trim()}
                            className="px-2 py-1 text-[10px] rounded bg-quepia-cyan text-black font-medium disabled:opacity-50"
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
          })}
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
