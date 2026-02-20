"use client"

import { useState, useMemo, useCallback } from "react"
import {
  CalendarHeart,
  Plus,
  Pencil,
  Trash2,
  Upload,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Image as ImageIcon,
  Filter,
  Eye,
  Sparkles,
  FileJson,
  Copy,
  Check,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useEfemerides, useEfemeridesProyectos } from "@/lib/sistema/hooks"
import { subirAssetEfemeride } from "@/lib/sistema/actions/efemerides"
import type {
  ProjectWithChildren,
  Efemeride,
  EfemerideCategoria,
  EfemerideProyectoEstado,
  EfemerideInsert,
} from "@/types/sistema"
import {
  EFEMERIDE_CATEGORIA_LABELS,
  EFEMERIDE_CATEGORIA_COLORS,
  EFEMERIDE_ESTADO_LABELS,
  EFEMERIDE_ESTADO_COLORS,
} from "@/types/sistema"
import { createClient } from "@/lib/sistema/supabase/client"

interface EfemeridesViewProps {
  projects: ProjectWithChildren[]
  userId?: string
  isAdmin?: boolean
}

function flattenProjects(projects: ProjectWithChildren[]): { id: string; nombre: string; color: string }[] {
  const result: { id: string; nombre: string; color: string }[] = []
  const walk = (list: ProjectWithChildren[]) => {
    list.forEach((p) => {
      if (p.icon !== "folder") {
        result.push({ id: p.id, nombre: p.nombre, color: p.color })
      }
      if (p.children?.length) walk(p.children)
    })
  }
  walk(projects)
  return result
}

function formatDaysLeft(days: number): string {
  if (days === 0) return "Hoy"
  if (days === 1) return "Mañana"
  if (days < 7) return `En ${days} días`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `En ${weeks} ${weeks === 1 ? "semana" : "semanas"}`
  }
  const months = Math.floor(days / 30)
  return `En ${months} ${months === 1 ? "mes" : "meses"}`
}

function getDaysLeftColor(days: number): string {
  if (days <= 3) return "text-red-400 bg-red-500/10 border-red-500/20"
  if (days <= 7) return "text-orange-400 bg-orange-500/10 border-orange-500/20"
  if (days <= 14) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
  return "text-white/60 bg-white/5 border-white/10"
}

const CATEGORIAS: EfemerideCategoria[] = ["patria", "comercial", "conmemorativa", "otro", "general"]

export function EfemeridesView({ projects, userId, isAdmin }: EfemeridesViewProps) {
  const {
    efemerides,
    loading,
    proximasEfemerides,
    createEfemeride,
    updateEfemeride,
    deleteEfemeride,
    fetchEfemerides,
  } = useEfemerides()

  const flatProjects = useMemo(() => flattenProjects(projects), [projects])
  const projectIds = useMemo(() => flatProjects.map((p) => p.id), [flatProjects])
  const { asignaciones, fetchAsignaciones } = useEfemeridesProyectos(projectIds)

  const [selectedEfemeride, setSelectedEfemeride] = useState<string | null>(null)
  const [filterCategoria, setFilterCategoria] = useState<EfemerideCategoria | "all">("all")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadProjectId, setUploadProjectId] = useState<string>("")
  const [editingEfemeride, setEditingEfemeride] = useState<Efemeride | null>(null)

  // Create/edit form state
  const [formNombre, setFormNombre] = useState("")
  const [formDescripcion, setFormDescripcion] = useState("")
  const [formMes, setFormMes] = useState(1)
  const [formDia, setFormDia] = useState(1)
  const [formCategoria, setFormCategoria] = useState<EfemerideCategoria>("general")
  const [formDiasAnticipacion, setFormDiasAnticipacion] = useState(7)
  const [formSaving, setFormSaving] = useState(false)

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadNotas, setUploadNotas] = useState("")
  const [uploading, setUploading] = useState(false)

  // AI / JSON import state
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiJson, setAiJson] = useState("")
  const [aiImporting, setAiImporting] = useState(false)
  const [aiCopied, setAiCopied] = useState(false)
  const [aiInputs, setAiInputs] = useState({
    pais: "Argentina",
    industria: "",
    anio: String(new Date().getFullYear()),
    extras: "",
  })

  const currentYear = new Date().getFullYear()

  const filteredEfemerides = useMemo(() => {
    if (filterCategoria === "all") return proximasEfemerides
    return proximasEfemerides.filter((e) => e.categoria === filterCategoria)
  }, [proximasEfemerides, filterCategoria])

  const selectedEf = useMemo(() => {
    return proximasEfemerides.find((e) => e.id === selectedEfemeride) || null
  }, [proximasEfemerides, selectedEfemeride])

  const getProjectStatus = useCallback(
    (efemerideId: string, projectId: string): EfemerideProyectoEstado => {
      const a = asignaciones.find(
        (x) => x.efemeride_id === efemerideId && x.project_id === projectId && x.anio === currentYear
      )
      return a?.estado || "pendiente"
    },
    [asignaciones, currentYear]
  )

  const getProjectAsignacion = useCallback(
    (efemerideId: string, projectId: string) => {
      return asignaciones.find(
        (x) => x.efemeride_id === efemerideId && x.project_id === projectId && x.anio === currentYear
      )
    },
    [asignaciones, currentYear]
  )

  const resetForm = () => {
    setFormNombre("")
    setFormDescripcion("")
    setFormMes(1)
    setFormDia(1)
    setFormCategoria("general")
    setFormDiasAnticipacion(7)
    setEditingEfemeride(null)
  }

  const openCreateModal = () => {
    resetForm()
    setShowCreateModal(true)
  }

  const openEditModal = (ef: Efemeride) => {
    setFormNombre(ef.nombre)
    setFormDescripcion(ef.descripcion || "")
    setFormMes(ef.fecha_mes)
    setFormDia(ef.fecha_dia)
    setFormCategoria(ef.categoria)
    setFormDiasAnticipacion(ef.dias_anticipacion)
    setEditingEfemeride(ef)
    setShowCreateModal(true)
  }

  const handleSaveEfemeride = async () => {
    if (!formNombre.trim()) return
    setFormSaving(true)
    try {
      if (editingEfemeride) {
        await updateEfemeride(editingEfemeride.id, {
          nombre: formNombre.trim(),
          descripcion: formDescripcion.trim() || null,
          fecha_mes: formMes,
          fecha_dia: formDia,
          categoria: formCategoria,
          dias_anticipacion: formDiasAnticipacion,
        })
      } else {
        await createEfemeride({
          nombre: formNombre.trim(),
          descripcion: formDescripcion.trim() || null,
          fecha_mes: formMes,
          fecha_dia: formDia,
          categoria: formCategoria,
          dias_anticipacion: formDiasAnticipacion,
          global: true,
          created_by: userId,
        })
      }
      setShowCreateModal(false)
      resetForm()
    } catch (err) {
      console.error("Error saving efemeride:", err)
    }
    setFormSaving(false)
  }

  const handleDeleteEfemeride = async (id: string) => {
    if (!confirm("¿Eliminar esta efeméride?")) return
    await deleteEfemeride(id)
    if (selectedEfemeride === id) setSelectedEfemeride(null)
  }

  const openUploadModal = (efemerideId: string, projectId?: string) => {
    setSelectedEfemeride(efemerideId)
    setUploadProjectId(projectId || "")
    setUploadFile(null)
    setUploadPreview(null)
    setUploadNotas("")
    setShowUploadModal(true)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file)
      setUploadPreview(url)
    } else {
      setUploadPreview(null)
    }
  }

  const handleUploadAsset = async () => {
    if (!uploadFile || !selectedEfemeride || !uploadProjectId) return
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = uploadFile.name.split(".").pop() || "file"
      const path = `efemerides/${uploadProjectId}/${selectedEfemeride}/${Date.now()}.${ext}`

      const { error: storageError } = await supabase.storage
        .from("sistema-assets")
        .upload(path, uploadFile, { upsert: true })

      if (storageError) throw storageError

      const { data: urlData } = supabase.storage
        .from("sistema-assets")
        .getPublicUrl(path)

      const result = await subirAssetEfemeride({
        efemeride_id: selectedEfemeride,
        project_id: uploadProjectId,
        anio: currentYear,
        asset_url: urlData.publicUrl,
        asset_storage_path: path,
        notas: uploadNotas.trim() || undefined,
      })

      if (!result.success) {
        throw new Error(result.error || "Error subiendo asset")
      }

      setShowUploadModal(false)
      await fetchAsignaciones()
      await fetchEfemerides()
    } catch (err) {
      console.error("Error uploading:", err)
      alert(err instanceof Error ? err.message : "Error subiendo asset")
    }
    setUploading(false)
  }

  const buildAIPrompt = () => {
    return `Actuá como un community manager senior de una agencia creativa. Necesito que generes un JSON con efemérides y fechas importantes para planificar contenido en redes sociales.

Contexto:
- País: ${aiInputs.pais || "Argentina"}
- Industria / rubro del cliente: ${aiInputs.industria || "[general, todas las industrias]"}
- Año: ${aiInputs.anio || new Date().getFullYear()}
- Notas adicionales: ${aiInputs.extras || "[ninguna]"}

Requisitos:
- Incluir fechas patrias, comerciales (Día de la Madre, San Valentín, etc.), conmemorativas y de la industria indicada.
- Cada efeméride debe tener: nombre, descripción breve, día, mes, categoría y días de anticipación sugeridos para preparar el contenido.
- Las categorías válidas son: "patria", "comercial", "conmemorativa", "otro".
- Los días de anticipación deben ser realistas (7-21 días según importancia).
- No incluir efemérides que ya existan comúnmente (Año Nuevo, Navidad, etc.) a menos que sean relevantes para la industria.
- Generar entre 15 y 40 efemérides.

Devuelve SOLO JSON válido, sin texto extra. Usar este formato exacto:
{
  "efemerides": [
    {
      "nombre": "Día del Trabajador",
      "descripcion": "Día Internacional del Trabajador",
      "fecha_dia": 1,
      "fecha_mes": 5,
      "categoria": "patria",
      "dias_anticipacion": 7
    }
  ]
}`
  }

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(buildAIPrompt())
    setAiCopied(true)
    setTimeout(() => setAiCopied(false), 2000)
  }

  const applyAIJson = async () => {
    if (!aiJson.trim()) return
    setAiImporting(true)
    try {
      // Try to extract JSON from markdown code blocks if present
      let jsonStr = aiJson.trim()
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim()
      }

      const parsed = JSON.parse(jsonStr)
      const items = parsed.efemerides || parsed
      if (!Array.isArray(items)) {
        alert("El JSON no tiene el formato esperado. Debe contener un array 'efemerides'.")
        setAiImporting(false)
        return
      }

      const validCategorias = ["patria", "comercial", "conmemorativa", "otro", "general"]
      let created = 0
      let skipped = 0

      for (const item of items) {
        if (!item.nombre || !item.fecha_dia || !item.fecha_mes) {
          skipped++
          continue
        }

        const categoria = validCategorias.includes(item.categoria) ? item.categoria : "otro"

        try {
          await createEfemeride({
            nombre: item.nombre,
            descripcion: item.descripcion || null,
            fecha_dia: Number(item.fecha_dia),
            fecha_mes: Number(item.fecha_mes),
            categoria,
            dias_anticipacion: Number(item.dias_anticipacion) || 7,
            global: true,
            created_by: userId,
          })
          created++
        } catch {
          skipped++
        }
      }

      alert(`Importación completada: ${created} creadas, ${skipped} omitidas.`)
      setShowAIModal(false)
      setAiJson("")
      await fetchEfemerides()
    } catch {
      alert("No se pudo leer el JSON. Revisá el formato.")
    }
    setAiImporting(false)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-white/50" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Panel: Timeline */}
      <div className="w-full md:w-[400px] lg:w-[440px] border-r border-white/[0.06] flex flex-col overflow-hidden shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarHeart className="h-5 w-5 text-quepia-cyan" />
              <h2 className="text-lg font-semibold text-white">Efemérides</h2>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowAIModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-all hover:bg-white/10 hover:text-white"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  Importar
                </button>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-all hover:bg-white/10 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva
                </button>
              </div>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterCategoria("all")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs transition-all border",
                filterCategoria === "all"
                  ? "bg-white/10 text-white border-white/20"
                  : "text-white/40 border-transparent hover:text-white/60"
              )}
            >
              Todas
            </button>
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategoria(cat)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs transition-all border",
                  filterCategoria === cat
                    ? "text-white border-white/20"
                    : "text-white/40 border-transparent hover:text-white/60"
                )}
                style={
                  filterCategoria === cat
                    ? { backgroundColor: `${EFEMERIDE_CATEGORIA_COLORS[cat]}20` }
                    : undefined
                }
              >
                {EFEMERIDE_CATEGORIA_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredEfemerides.length === 0 ? (
            <div className="text-center py-12">
              <CalendarHeart className="h-8 w-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/40">No hay efemérides</p>
            </div>
          ) : (
            filteredEfemerides.map((ef) => {
              const isSelected = selectedEfemeride === ef.id
              // Count project statuses
              const statusCounts = { pendiente: 0, en_progreso: 0, lista: 0, publicada: 0 }
              for (const p of flatProjects) {
                const st = getProjectStatus(ef.id, p.id)
                statusCounts[st]++
              }

              return (
                <button
                  key={ef.id}
                  onClick={() => setSelectedEfemeride(ef.id)}
                  className={cn(
                    "w-full text-left rounded-xl p-3 transition-all",
                    isSelected
                      ? "bg-white/[0.08] border border-white/[0.12]"
                      : "hover:bg-white/[0.04] border border-transparent"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: EFEMERIDE_CATEGORIA_COLORS[ef.categoria] }}
                        />
                        <span className="text-sm font-medium text-white truncate">{ef.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <span>{ef.fecha_dia}/{ef.fecha_mes}</span>
                        <span className="text-white/20">·</span>
                        <span>{EFEMERIDE_CATEGORIA_LABELS[ef.categoria]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-md border",
                          getDaysLeftColor(ef.daysUntil)
                        )}
                      >
                        {formatDaysLeft(ef.daysUntil)}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                    </div>
                  </div>

                  {/* Status dots */}
                  {flatProjects.length > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      {statusCounts.lista > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          {statusCounts.lista}
                        </span>
                      )}
                      {statusCounts.en_progreso > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                          {statusCounts.en_progreso}
                        </span>
                      )}
                      {statusCounts.pendiente > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          {statusCounts.pendiente}
                        </span>
                      )}
                      {statusCounts.publicada > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-white/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                          {statusCounts.publicada}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel: Detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedEf ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <CalendarHeart className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-white/40 text-sm">Selecciona una efeméride para ver detalles</p>
          </div>
        ) : (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-semibold text-white">{selectedEf.nombre}</h2>
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{
                      backgroundColor: `${EFEMERIDE_CATEGORIA_COLORS[selectedEf.categoria]}20`,
                      color: EFEMERIDE_CATEGORIA_COLORS[selectedEf.categoria],
                    }}
                  >
                    {EFEMERIDE_CATEGORIA_LABELS[selectedEf.categoria]}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-white/50">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedEf.fecha_dia}/{selectedEf.fecha_mes}
                  </span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-md border text-xs font-medium",
                      getDaysLeftColor(selectedEf.daysUntil)
                    )}
                  >
                    {formatDaysLeft(selectedEf.daysUntil)}
                  </span>
                  <span className="text-white/30">
                    Anticipación: {selectedEf.dias_anticipacion} días
                  </span>
                </div>
                {selectedEf.descripcion && (
                  <p className="text-sm text-white/40 mt-2">{selectedEf.descripcion}</p>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(selectedEf)}
                    className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white/70 transition-all"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteEfemeride(selectedEf.id)}
                    className="rounded-lg p-2 text-white/40 hover:bg-red-500/10 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Projects Grid */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white/70 mb-3">
                Estado por proyecto ({flatProjects.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {flatProjects.map((project) => {
                const estado = getProjectStatus(selectedEf.id, project.id)
                const asig = getProjectAsignacion(selectedEf.id, project.id)

                return (
                  <div
                    key={project.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="text-sm font-medium text-white truncate">
                          {project.nombre}
                        </span>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
                        style={{
                          backgroundColor: `${EFEMERIDE_ESTADO_COLORS[estado]}20`,
                          color: EFEMERIDE_ESTADO_COLORS[estado],
                        }}
                      >
                        {EFEMERIDE_ESTADO_LABELS[estado]}
                      </span>
                    </div>

                    {asig?.asset_url ? (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/5 shrink-0">
                          <img
                            src={asig.thumbnail_url || asig.asset_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          {asig.notas && (
                            <p className="text-xs text-white/40 truncate mb-1">{asig.notas}</p>
                          )}
                          <a
                            href={asig.asset_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-quepia-cyan hover:underline"
                          >
                            <Eye className="h-3 w-3" />
                            Ver asset
                          </a>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => openUploadModal(selectedEf.id, project.id)}
                        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 py-3 text-xs text-white/40 transition-all hover:border-quepia-cyan/30 hover:text-quepia-cyan hover:bg-quepia-cyan/5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Subir asset
                      </button>
                    )}
                  </div>
                )
              })}

              {flatProjects.length === 0 && (
                <div className="col-span-2 text-center py-8">
                  <p className="text-sm text-white/30">No hay proyectos activos</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative h-[100svh] w-full overflow-y-auto rounded-t-2xl border-0 border-white/10 bg-[#1a1a1a]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:h-auto sm:max-w-md sm:rounded-2xl sm:border sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingEfemeride ? "Editar Efeméride" : "Nueva Efeméride"}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="Ej: Día de la Madre"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-quepia-cyan"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Descripción</label>
                <textarea
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  placeholder="Opcional"
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-quepia-cyan resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Día</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={formDia}
                    onChange={(e) => setFormDia(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-quepia-cyan"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Mes</label>
                  <select
                    value={formMes}
                    onChange={(e) => setFormMes(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-quepia-cyan"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2024, i, 1).toLocaleDateString("es-AR", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Categoría</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFormCategoria(cat)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs border transition-all",
                        formCategoria === cat
                          ? "text-white border-white/20"
                          : "text-white/40 border-white/5 hover:border-white/10"
                      )}
                      style={
                        formCategoria === cat
                          ? { backgroundColor: `${EFEMERIDE_CATEGORIA_COLORS[cat]}20` }
                          : undefined
                      }
                    >
                      {EFEMERIDE_CATEGORIA_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Días de anticipación para notificación
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={formDiasAnticipacion}
                  onChange={(e) => setFormDiasAnticipacion(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-quepia-cyan"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-10 flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEfemeride}
                  disabled={!formNombre.trim() || formSaving}
                  className="min-h-10 flex-1 rounded-xl bg-gradient-to-r from-quepia-cyan to-quepia-magenta px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {formSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : editingEfemeride ? (
                    "Guardar"
                  ) : (
                    "Crear"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI / JSON Import Modal */}
      {showAIModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAIModal(false)} />
          <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-3xl bg-[#0a0a0a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl sm:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-quepia-cyan" />
                <h3 className="text-lg font-semibold text-white">Importar efemérides con IA</h3>
              </div>
              <button onClick={() => setShowAIModal(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Context inputs */}
              <div>
                <label className="text-xs uppercase tracking-wider text-white/40 mb-2 block">Contexto para el prompt</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={aiInputs.pais}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, pais: e.target.value }))}
                    placeholder="País (ej: Argentina)"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  <input
                    value={aiInputs.industria}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, industria: e.target.value }))}
                    placeholder="Industria (ej: Gastronomía, Moda...)"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  <input
                    value={aiInputs.anio}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, anio: e.target.value }))}
                    placeholder="Año"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  <input
                    value={aiInputs.extras}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, extras: e.target.value }))}
                    placeholder="Notas adicionales (opcional)"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                </div>
              </div>

              {/* Prompt */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-wider text-white/40">Prompt sugerido</label>
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-quepia-cyan transition-colors"
                  >
                    {aiCopied ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copiar prompt
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={buildAIPrompt()}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 min-h-[140px] resize-none cursor-text"
                />
              </div>

              {/* JSON paste */}
              <div>
                <label className="text-xs uppercase tracking-wider text-white/40 mb-2 block">
                  Pegar JSON devuelto por la IA
                </label>
                <textarea
                  value={aiJson}
                  onChange={(e) => setAiJson(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 min-h-[160px] resize-none font-mono"
                  placeholder='{"efemerides": [{"nombre": "...", "fecha_dia": 1, "fecha_mes": 1, "categoria": "comercial", "dias_anticipacion": 7}]}'
                />
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAIModal(false)}
                className="px-4 py-2 rounded-lg text-sm bg-white/5 text-white/60 hover:text-white transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={applyAIJson}
                disabled={!aiJson.trim() || aiImporting}
                className="px-4 py-2 rounded-lg text-sm bg-quepia-cyan text-black font-semibold hover:bg-quepia-cyan/90 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {aiImporting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <FileJson className="h-3.5 w-3.5" />
                    Importar efemérides
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Asset Modal */}
      {showUploadModal && selectedEfemeride && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUploadModal(false)} />
          <div className="relative h-[100svh] w-full overflow-y-auto rounded-t-2xl border-0 border-white/10 bg-[#1a1a1a]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:h-auto sm:max-w-md sm:rounded-2xl sm:border sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Subir Asset</h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Project Selector */}
              {!uploadProjectId && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Proyecto</label>
                  <select
                    value={uploadProjectId}
                    onChange={(e) => setUploadProjectId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-quepia-cyan"
                  >
                    <option value="">Seleccionar proyecto</option>
                    {flatProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Archivo</label>
                {uploadPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/10 mb-2">
                    <img src={uploadPreview} alt="Preview" className="w-full h-48 object-cover" />
                    <button
                      onClick={() => {
                        setUploadFile(null)
                        setUploadPreview(null)
                      }}
                      className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white/80 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-8 cursor-pointer hover:border-quepia-cyan/30 hover:bg-quepia-cyan/5 transition-all">
                    <ImageIcon className="h-8 w-8 text-white/20 mb-2" />
                    <span className="text-xs text-white/40">
                      {uploadFile ? uploadFile.name : "Click para seleccionar archivo"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">Notas (opcional)</label>
                <textarea
                  value={uploadNotas}
                  onChange={(e) => setUploadNotas(e.target.value)}
                  placeholder="Notas sobre el asset..."
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-quepia-cyan resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="min-h-10 flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUploadAsset}
                  disabled={!uploadFile || !uploadProjectId || uploading}
                  className="min-h-10 flex-1 rounded-xl bg-gradient-to-r from-quepia-cyan to-quepia-magenta px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "Subir y Crear Tarea"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
