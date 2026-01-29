"use client"

import React, { useState } from "react"
import { Calendar, X, Check, Loader2, AlignLeft, Flag, Tag, Clock } from "lucide-react"
import { createClient } from "@/lib/sistema/supabase/client"
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, type CalendarEventType } from "@/types/sistema"

interface ProjectOption {
  id: string
  nombre: string
  color: string
}

interface ManualEventModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projects: ProjectOption[]
  userId: string
  preselectedDate?: string
}

const EVENT_TYPES: CalendarEventType[] = ["publicacion", "reunion", "deadline", "entrega", "otro"]

export function ManualEventModal({
  isOpen,
  onClose,
  onSuccess,
  projects,
  userId,
  preselectedDate,
}: ManualEventModalProps) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [projectId, setProjectId] = useState("")
  const [type, setType] = useState<CalendarEventType>("publicacion")
  const [date, setDate] = useState(preselectedDate || new Date().toISOString().split("T")[0])
  const [time, setTime] = useState("09:00")
  const [allDay, setAllDay] = useState(true)

  // Reset form when opening
  React.useEffect(() => {
    if (isOpen) {
      setTitle("")
      setDescription("")
      setProjectId(projects.length > 0 ? projects[0].id : "")
      setType("publicacion")
      setDate(preselectedDate || new Date().toISOString().split("T")[0])
      setTime("09:00")
      setAllDay(true)
    }
  }, [isOpen, preselectedDate, projects])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !projectId || !date) return

    setLoading(true)
    try {
      const supabase = createClient()
      
      const fechaInicio = allDay ? date : `${date}T${time}:00`
      const project = projects.find(p => p.id === projectId)
      const color = EVENT_TYPE_COLORS[type] || project?.color || "#22c55e"

      const { error } = await supabase
        .from("sistema_calendar_events")
        .insert({
          titulo: title.trim(),
          descripcion: description.trim() || null,
          project_id: projectId,
          tipo: type,
          fecha_inicio: fechaInicio,
          todo_el_dia: allDay,
          color: color,
          created_by: userId,
        })

      if (error) throw error

      onSuccess()
      onClose()
    } catch (err) {
      console.error("Error creating event:", err)
      alert("Error al crear el evento")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      <div className="relative z-50 w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Nuevo Evento</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wide">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Publicación Instagram"
              autoFocus
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan/50 transition-all placeholder:text-white/20"
            />
          </div>

          {/* Project */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wide">Proyecto</label>
            <div className="relative">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white appearance-none focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan/50 transition-all"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: projects.find(p => p.id === projectId)?.color }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/60 uppercase tracking-wide">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEventType)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white appearance-none focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan/50 transition-all"
              >
                {EVENT_TYPES.map(t => (
                  <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/60 uppercase tracking-wide">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan/50 transition-all calendar-picker-indicator-invert"
              />
            </div>
          </div>

          {/* Time & All Day */}
          <div className="flex items-center gap-4">
             <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${allDay ? 'bg-quepia-cyan border-quepia-cyan' : 'border-white/30 bg-transparent'}`}>
                {allDay && <Check className="h-3 w-3 text-black" />}
              </div>
              <input 
                type="checkbox" 
                checked={allDay} 
                onChange={(e) => setAllDay(e.target.checked)} 
                className="hidden" 
              />
              <span className="text-sm text-white/80">Todo el día</span>
            </label>

            {!allDay && (
              <div className="flex-1">
                 <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan/50 transition-all"
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wide">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detalles del evento..."
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan/50 transition-all placeholder:text-white/20 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !title.trim() || !projectId}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-quepia-cyan text-black hover:bg-quepia-cyan/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear Evento
          </button>
        </div>
      </div>
    </div>
  )
}
