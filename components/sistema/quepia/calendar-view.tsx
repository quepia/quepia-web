"use client"

import { useState, useMemo, useEffect } from "react"
import { ChevronLeft, ChevronRight, Calendar, Plus, X, Sparkles, Loader2, Trash2 } from "lucide-react"
import { createClient } from "@/lib/sistema/supabase/client"
import { cn } from "@/lib/sistema/utils"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import type { CalendarEvent } from "@/types/sistema"
import { PRIORITY_COLORS, EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from "@/types/sistema"
import AICalendarModal, { type ImportedEvent } from "./ai-calendar-modal"
import { EventDetailModal } from "./event-detail-modal"

import { ManualEventModal } from "./manual-event-modal"

interface ProjectOption {
  id: string
  nombre: string
  color: string
}

interface ProjectWithLogo {
  id: string
  nombre: string
  color: string
  logo_url?: string | null
}

interface CalendarViewProps {
  tasks: TaskWithProject[]
  events: (CalendarEvent & { project?: ProjectWithLogo })[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
  userId?: string
  projects?: ProjectOption[]
  onRefresh?: () => void
}

export function CalendarView({ tasks, events, loading, onTaskClick, userId, projects = [], onRefresh }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAIModal, setShowAIModal] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [pendingImport, setPendingImport] = useState<ImportedEvent[] | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<(CalendarEvent & { project?: ProjectWithLogo }) | null>(null)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteProjectFilter, setBulkDeleteProjectFilter] = useState<string>("all")

  // Sync selectedEvent with events prop when it changes (e.g. after adding a comment or refresh)
  useEffect(() => {
    if (selectedEvent && events) {
      const updatedEvent = events.find(e => e.id === selectedEvent.id)
      if (updatedEvent) {
        setSelectedEvent(updatedEvent)
      }
    }
  }, [events, selectedEvent])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const monthName = currentDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" })

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => {
    setCurrentDate(new Date())
    const todayStr = new Date().toISOString().split("T")[0]
    setSelectedDate(todayStr)
  }

  // Build map of date -> items
  const dateItems = useMemo(() => {
    const map = new Map<string, { tasks: TaskWithProject[]; events: (CalendarEvent & { project?: ProjectWithLogo })[] }>()

    for (const task of tasks) {
      if (!task.completed && task.due_date) {
        const d = task.due_date
        if (!map.has(d)) map.set(d, { tasks: [], events: [] })
        map.get(d)!.tasks.push(task)
      }
    }

    for (const event of events) {
      const d = event.fecha_inicio.split("T")[0]
      if (!map.has(d)) map.set(d, { tasks: [], events: [] })
      map.get(d)!.events.push(event)
    }

    return map
  }, [tasks, events])

  const todayStr = new Date().toISOString().split("T")[0]

  const selectedItems = selectedDate ? dateItems.get(selectedDate) : null

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const weekDays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

  // Generate calendar cells
  const cells: { day: number | null; dateStr: string | null }[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    cells.push({ day: d, dateStr })
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
      {/* Calendar Grid */}
      <div className="flex-1 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-quepia-cyan" />
            <h2 className="text-lg font-semibold text-white capitalize">{monthName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManualModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-quepia-cyan text-black hover:bg-quepia-cyan/90 transition-colors flex items-center gap-1.5 font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Crear
            </button>
            <button
              onClick={() => setShowAIModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-quepia-cyan/10 text-quepia-cyan hover:bg-quepia-cyan/20 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              IA Calendar
            </button>
            <button
              onClick={() => { setBulkDeleteProjectFilter("all"); setShowBulkDeleteModal(true) }}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar mes
            </button>
            <button onClick={goToToday} className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors">
              Hoy
            </button>
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
              <ChevronLeft className="h-4 w-4 text-white/40" />
            </button>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
              <ChevronRight className="h-4 w-4 text-white/40" />
            </button>
          </div>
        </div>

        {/* Week headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-white/25 uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell.day || !cell.dateStr) {
              return <div key={`empty-${i}`} className="aspect-square" />
            }

            const items = dateItems.get(cell.dateStr)
            const isToday = cell.dateStr === todayStr
            const isSelected = cell.dateStr === selectedDate
            const hasItems = items && (items.tasks.length > 0 || items.events.length > 0)

            return (
              <button
                key={cell.dateStr}
                onClick={() => setSelectedDate(isSelected ? null : cell.dateStr)}
                className={cn(
                  "aspect-square rounded-lg flex flex-col items-start justify-start p-1.5 transition-all relative group/cell overflow-hidden",
                  isSelected
                    ? "bg-quepia-cyan/10 border border-quepia-cyan/30"
                    : isToday
                      ? "bg-white/[0.06] border border-white/[0.1]"
                      : "hover:bg-white/[0.04] border border-transparent"
                )}
              >
                <span className={cn(
                  "text-xs font-medium mb-1",
                  isToday ? "text-quepia-cyan" : isSelected ? "text-white" : "text-white/60"
                )}>
                  {cell.day}
                </span>

                {hasItems && (
                  <div className="w-full flex-1 flex flex-col gap-1 overflow-hidden">
                    {/* Combine tasks and events, prioritize items with project */}
                    {[
                      ...items.tasks.map(t => ({
                        id: t.id,
                        color: PRIORITY_COLORS[t.priority],
                        label: t.project?.nombre || t.titulo,
                        title: t.titulo,
                        projectC: t.project?.color,
                        logo: t.project?.logo_url,
                        isTask: true
                      })),
                      ...items.events.map(e => ({
                        id: e.id,
                        color: e.color,
                        label: e.project?.nombre || e.titulo,
                        title: e.titulo,
                        projectC: e.project?.color,
                        logo: e.project?.logo_url,
                        isTask: false
                      }))
                    ].slice(0, 3).map((item, j) => (
                      <div key={item.id} className="flex items-center gap-1.5 w-full bg-white/[0.03] border border-white/5 px-1.5 py-1 rounded hover:bg-white/10 transition-colors">
                        {item.logo ? (
                          <img src={item.logo} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0 bg-white/5" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.projectC || item.color }} />
                        )}
                        <span className="text-[9px] text-white/80 truncate font-medium leading-none">
                          {item.title}
                        </span>
                      </div>
                    ))}
                    {(items.tasks.length + items.events.length) > 3 && (
                      <div className="px-1 pt-0.5">
                        <span className="text-[9px] text-white/40 font-medium">
                          +{(items.tasks.length + items.events.length) - 3} más
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 text-[10px] text-white/30">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>Urgente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span>Alta</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span>Media</span>
          </div>
          {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLORS[key as keyof typeof EVENT_TYPE_COLORS] }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Side panel for selected date */}
      {selectedDate && (
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/[0.06] p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="p-1 rounded hover:bg-white/[0.06]">
              <X className="h-3.5 w-3.5 text-white/30" />
            </button>
          </div>

          {!selectedItems || (selectedItems.tasks.length === 0 && selectedItems.events.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-sm text-white/30 mb-3">Sin actividad para este día</p>
              <button
                onClick={() => setShowManualModal(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear Evento
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedItems.tasks.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-2">
                    Tareas ({selectedItems.tasks.length})
                  </h4>
                  <div className="space-y-1">
                    {selectedItems.tasks.map(task => (
                      <button
                        key={task.id}
                        onClick={() => onTaskClick(task)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[task.priority] }} />
                        <span className="text-xs text-white/70 truncate flex-1">{task.titulo}</span>
                        {task.project && (
                          <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded shrink-0 bg-white/5 border border-white/5">
                            {task.project.logo_url ? (
                              <img src={task.project.logo_url} alt="" className="w-3 h-3 rounded-full object-cover" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.project.color }} />
                            )}
                            <span className="text-[9px] text-white/60">
                              {task.project.nombre}
                            </span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedItems.events.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-2">
                    Eventos ({selectedItems.events.length})
                  </h4>
                  <div className="space-y-1">
                    {selectedItems.events.map(event => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] transition-colors text-left"
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-white/70 truncate block">{event.titulo}</span>
                          <span className="text-[9px] text-white/30">
                            {EVENT_TYPE_LABELS[event.tipo]}
                          </span>
                        </div>
                        {event.project && (
                          <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded shrink-0 bg-white/5 border border-white/5">
                            {event.project.logo_url ? (
                              <img src={event.project.logo_url} alt="" className="w-3 h-3 rounded-full object-cover" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: event.project.color }} />
                            )}
                            <span className="text-[9px] text-white/60">
                              {event.project.nombre}
                            </span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Event Details Modal */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onUpdate={() => {
          onRefresh?.()
          setSelectedEvent(null)
        }}
        userId={userId}
      />

      <AICalendarModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        onImport={(imported) => {
          setShowAIModal(false)
          // If only one hash project, import directly; otherwise show picker
          const hashProjects = projects.filter(p => p.id) // all projects passed should be valid
          if (hashProjects.length === 1) {
            handleImportToProject(imported, hashProjects[0].id)
          } else if (hashProjects.length > 1) {
            setPendingImport(imported)
            setShowProjectPicker(true)
          } else {
            alert("No hay clientes disponibles para importar eventos.")
          }
        }}
      />

      {/* Manual Event Modal */}
      <ManualEventModal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onSuccess={() => {
          onRefresh?.()
        }}
        projects={projects}
        userId={userId || ""}
        preselectedDate={selectedDate || undefined}
      />

      {/* Project picker for import */}
      {showProjectPicker && pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowProjectPicker(false); setPendingImport(null) }} />
          <div className="relative z-50 w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl p-6">
            <h3 className="text-white font-semibold mb-1">Seleccionar cliente</h3>
            <p className="text-xs text-white/40 mb-4">Elegí en qué cliente importar los {pendingImport.length} eventos.</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setShowProjectPicker(false)
                    handleImportToProject(pendingImport!, p.id)
                    setPendingImport(null)
                  }}
                  disabled={importing}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm text-white/80">{p.nombre}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowProjectPicker(false); setPendingImport(null) }}
              className="mt-4 w-full text-sm text-white/50 hover:text-white py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowBulkDeleteModal(false)} />
          <div className="relative z-50 w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl p-6">
            <h3 className="text-white font-semibold mb-1">Limpiar mes</h3>
            <p className="text-xs text-white/40 mb-4">
              Eliminar eventos del calendario de <span className="text-white/60 capitalize">{monthName}</span>.
            </p>

            {/* Project filter */}
            {projects.length > 1 && (
              <div className="mb-4">
                <label className="text-[10px] font-semibold text-white/25 uppercase tracking-wider block mb-1.5">
                  Filtrar por cliente
                </label>
                <select
                  value={bulkDeleteProjectFilter}
                  onChange={(e) => setBulkDeleteProjectFilter(e.target.value)}
                  className="w-full text-sm bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-white/80 outline-none focus:border-quepia-cyan/30"
                >
                  <option value="all">Todos los clientes</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            {(() => {
              const monthEvents = events.filter(e => {
                const d = new Date(e.fecha_inicio)
                return d.getFullYear() === year && d.getMonth() === month
              })
              const filtered = bulkDeleteProjectFilter === "all"
                ? monthEvents
                : monthEvents.filter(e => e.project_id === bulkDeleteProjectFilter)
              return (
                <>
                  <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-sm text-white/70">
                      {filtered.length === 0
                        ? "No hay eventos para eliminar."
                        : <>Se eliminarán <span className="text-red-400 font-semibold">{filtered.length}</span> evento{filtered.length !== 1 ? "s" : ""}.</>
                      }
                    </span>
                  </div>
                  {filtered.length > 0 && (
                    <p className="text-[10px] text-red-400/60 mb-4">Esta acción no se puede deshacer.</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowBulkDeleteModal(false)}
                      className="flex-1 text-sm text-white/50 hover:text-white py-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleBulkDelete()}
                      disabled={bulkDeleting || filtered.length === 0}
                      className="flex-1 text-sm text-white py-2 rounded-lg bg-red-500/80 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {bulkDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </>
                      )}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Importing overlay */}
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 bg-[#1a1a1a] border border-white/10 rounded-xl px-6 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-quepia-cyan" />
            <span className="text-sm text-white/80">Importando eventos al calendario...</span>
          </div>
        </div>
      )}
    </div>
  )

  async function handleBulkDelete() {
    setBulkDeleting(true)
    try {
      const monthEvents = events.filter(e => {
        const d = new Date(e.fecha_inicio)
        return d.getFullYear() === year && d.getMonth() === month
      })
      const filtered = bulkDeleteProjectFilter === "all"
        ? monthEvents
        : monthEvents.filter(e => e.project_id === bulkDeleteProjectFilter)

      if (filtered.length === 0) return

      const ids = filtered.map(e => e.id)
      const supabase = createClient()
      const { error } = await supabase
        .from('sistema_calendar_events')
        .delete()
        .in('id', ids)

      if (error) {
        console.error("Error bulk deleting events:", error)
        alert(`Error al eliminar eventos: ${error.message}`)
      } else {
        onRefresh?.()
        setShowBulkDeleteModal(false)
      }
    } catch (err) {
      console.error("Error bulk deleting events:", err)
      alert("Error inesperado al eliminar eventos.")
    } finally {
      setBulkDeleting(false)
    }
  }

  async function handleImportToProject(imported: ImportedEvent[], projectId: string) {
    if (!userId) {
      alert("Error: usuario no identificado.")
      return
    }

    setImporting(true)
    try {
      const eventsJson = imported.map(ev => {
        const fecha = ev.date.includes("T") ? ev.date : `${ev.date}T00:00:00`
        return {
          titulo: ev.topic,
          descripcion: `**${ev.pillar}** — ${ev.format}\n\n${ev.copy_suggestion}`,
          tipo: "publicacion",
          fecha_inicio: fecha,
          todo_el_dia: true,
          color: "#22c55e",
        }
      })

      console.log("Importing", eventsJson.length, "events via API route to project", projectId)

      const res = await fetch("/api/calendar-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: eventsJson, projectId, userId }),
      })

      const result = await res.json()

      if (!res.ok) {
        console.error("Error importing events:", result.error)
        alert(`Error al importar: ${result.error}`)
      } else {
        console.log("Successfully imported", result.count, "events")
        onRefresh?.()
      }
    } catch (err) {
      console.error("Error importing events:", err)
      alert("Error inesperado al importar eventos.")
    } finally {
      setImporting(false)
    }
  }
}
