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
import { useToast } from "@/components/ui/toast-provider"
import { trackExperienceMetric } from "@/lib/sistema/experience-metrics"

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
  const { toast } = useToast()
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
  const headerActionButtonClass = "flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all duration-200"
  const selectedEventId = selectedEvent?.id ?? null

  // Sync selectedEvent with events prop when it changes (e.g. after adding a comment or refresh)
  useEffect(() => {
    if (selectedEventId && events.length > 0) {
      const updatedEvent = events.find((event) => event.id === selectedEventId)
      if (updatedEvent && updatedEvent !== selectedEvent) {
        setSelectedEvent(updatedEvent)
      }
    }
  }, [events, selectedEvent, selectedEventId])

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
  const monthEvents = useMemo(() => {
    return events.filter((event) => {
      const date = new Date(event.fecha_inicio)
      return date.getFullYear() === year && date.getMonth() === month
    })
  }, [events, month, year])

  const filteredMonthEvents = useMemo(() => {
    if (bulkDeleteProjectFilter === "all") return monthEvents
    return monthEvents.filter((event) => event.project_id === bulkDeleteProjectFilter)
  }, [bulkDeleteProjectFilter, monthEvents])

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
    <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row">
      {/* Calendar Grid */}
      <div className="flex-1 p-3 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-quepia-cyan" />
            <h2 className="text-lg font-semibold text-white capitalize">{monthName}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
            <button
              onClick={() => setShowManualModal(true)}
              className={cn(headerActionButtonClass, "bg-quepia-cyan font-medium text-black hover:bg-quepia-cyan/90")}
            >
              <Plus className="h-3.5 w-3.5" />
              Crear
            </button>
            <button
              onClick={() => setShowAIModal(true)}
              className={cn(headerActionButtonClass, "bg-quepia-cyan/10 text-quepia-cyan hover:bg-quepia-cyan/20")}
            >
              <Sparkles className="h-3.5 w-3.5" />
              IA Calendar
            </button>
            <button
              onClick={() => { setBulkDeleteProjectFilter("all"); setShowBulkDeleteModal(true) }}
              className={cn(headerActionButtonClass, "bg-red-500/10 text-red-400 hover:bg-red-500/20")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar mes
            </button>
            <button onClick={goToToday} className={cn(headerActionButtonClass, "bg-white/[0.05] text-white/60 hover:bg-white/[0.08] hover:text-white")}>
              Hoy
            </button>
            <button onClick={prevMonth} className="min-h-10 rounded-xl p-2 transition-all duration-200 hover:bg-white/[0.06]">
              <ChevronLeft className="h-4 w-4 text-white/40" />
            </button>
            <button onClick={nextMonth} className="min-h-10 rounded-xl p-2 transition-all duration-200 hover:bg-white/[0.06]">
              <ChevronRight className="h-4 w-4 text-white/40" />
            </button>
          </div>
        </div>

        {/* Week headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[9px] sm:text-[10px] font-semibold text-white/25 uppercase py-0.5 sm:py-1">
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
                  "aspect-square rounded-lg flex flex-col items-start justify-start p-1 sm:p-1.5 transition-all relative group/cell overflow-hidden",
                  isSelected
                    ? "bg-quepia-cyan/10 border border-quepia-cyan/30"
                    : isToday
                      ? "bg-white/[0.06] border border-white/[0.1]"
                      : "hover:bg-white/[0.04] border border-transparent"
                )}
              >
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1",
                  isToday ? "text-quepia-cyan" : isSelected ? "text-white" : "text-white/60"
                )}>
                  {cell.day}
                </span>

                {hasItems && (
                  <>
                    {/* Mobile: dots only */}
                    <div className="mt-auto flex flex-wrap gap-1 sm:hidden">
                      {[
                        ...items.tasks.map(t => ({ id: t.id, color: PRIORITY_COLORS[t.priority] })),
                        ...items.events.map(e => ({ id: e.id, color: e.color }))
                      ].slice(0, 4).map((item) => (
                        <span
                          key={item.id}
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                      ))}
                      {(items.tasks.length + items.events.length) > 4 && (
                        <span className="text-[9px] text-white/40 font-medium leading-none">+</span>
                      )}
                    </div>

                    {/* Desktop: detailed items */}
                    <div className="hidden sm:flex w-full flex-1 flex-col gap-1 overflow-hidden">
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
                      ].slice(0, 3).map((item) => (
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
                  </>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-2 sm:gap-4 text-[9px] sm:text-[10px] text-white/30">
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
        <div className="w-full overflow-y-auto border-t border-white/[0.06] bg-white/[0.01] p-4 lg:w-80 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06]">
              <X className="h-3.5 w-3.5 text-white/30" />
            </button>
          </div>

          {!selectedItems || (selectedItems.tasks.length === 0 && selectedItems.events.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-sm text-white/30 mb-3">Sin actividad para este día</p>
              <button
                onClick={() => setShowManualModal(true)}
                className="flex min-h-10 items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-white/60 transition-all duration-200 hover:bg-white/[0.08] hover:text-white"
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
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl p-2.5 text-left transition-all duration-200 hover:bg-white/[0.04]"
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
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl bg-white/[0.02] p-2.5 text-left transition-all duration-200 hover:bg-white/[0.06]"
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
            toast({
              title: "No hay clientes disponibles",
              description: "Crea o habilita un proyecto para importar eventos.",
              variant: "warning"
            })
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowProjectPicker(false); setPendingImport(null) }} />
          <div className="relative z-50 h-[100svh] w-full overflow-y-auto rounded-t-2xl border-0 bg-[#1a1a1a]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:h-auto sm:max-w-sm sm:rounded-2xl sm:border sm:border-white/10 sm:p-6">
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
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:bg-white/[0.06]"
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm text-white/80">{p.nombre}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowProjectPicker(false); setPendingImport(null) }}
              className="mt-4 min-h-11 w-full rounded-xl py-2 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.05] hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowBulkDeleteModal(false)} />
          <div className="relative z-50 h-[100svh] w-full overflow-y-auto rounded-t-2xl border-0 bg-[#1a1a1a]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:h-auto sm:max-w-sm sm:rounded-2xl sm:border sm:border-white/10 sm:p-6">
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
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white/80 outline-none transition-all duration-200 focus:border-quepia-cyan/30"
                >
                  <option value="all">Todos los clientes</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <span className="text-sm text-white/70">
                {filteredMonthEvents.length === 0
                  ? "No hay eventos para eliminar."
                  : <>Se eliminarán <span className="font-semibold text-red-400">{filteredMonthEvents.length}</span> evento{filteredMonthEvents.length !== 1 ? "s" : ""}.</>
                }
              </span>
            </div>
            {filteredMonthEvents.length > 0 && (
              <p className="mb-4 text-[10px] text-red-400/60">Esta acción no se puede deshacer.</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                className="min-h-11 flex-1 rounded-xl py-2 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.05] hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleBulkDelete()}
                disabled={bulkDeleting || filteredMonthEvents.length === 0}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/80 py-2 text-sm text-white transition-all duration-200 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
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
      if (filteredMonthEvents.length === 0) return

      const ids = filteredMonthEvents.map((event) => event.id)
      const supabase = createClient()
      const { error } = await supabase
        .from('sistema_calendar_events')
        .delete()
        .in('id', ids)

      if (error) {
        console.error("Error bulk deleting events:", error)
        trackExperienceMetric("errors_shown")
        toast({
          title: "No se pudieron eliminar eventos",
          description: error.message,
          variant: "error"
        })
      } else {
        onRefresh?.()
        setShowBulkDeleteModal(false)
        toast({
          title: "Mes limpiado",
          description: `Se eliminaron ${ids.length} eventos.`,
          variant: "success"
        })
      }
    } catch (err) {
      console.error("Error bulk deleting events:", err)
      trackExperienceMetric("errors_shown")
      toast({
        title: "Error inesperado",
        description: "No se pudieron eliminar los eventos.",
        variant: "error"
      })
    } finally {
      setBulkDeleting(false)
    }
  }

  async function handleImportToProject(imported: ImportedEvent[], projectId: string) {
    if (!userId) {
      trackExperienceMetric("errors_shown")
      toast({
        title: "Usuario no identificado",
        description: "Vuelve a iniciar sesión para importar.",
        variant: "error"
      })
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
        trackExperienceMetric("errors_shown")
        toast({
          title: "No se pudieron importar eventos",
          description: result.error || "Error desconocido",
          variant: "error"
        })
      } else {
        console.log("Successfully imported", result.count, "events")
        onRefresh?.()
        toast({
          title: "Importación completada",
          description: `Se importaron ${result.count} eventos.`,
          variant: "success"
        })
      }
    } catch (err) {
      console.error("Error importing events:", err)
      trackExperienceMetric("errors_shown")
      toast({
        title: "Error inesperado",
        description: "No se pudieron importar los eventos.",
        variant: "error"
      })
    } finally {
      setImporting(false)
    }
  }
}
