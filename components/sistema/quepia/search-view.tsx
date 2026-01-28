"use client"

import { useState, useMemo } from "react"
import { Search, CheckCircle2, Circle, Filter, X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { createClient } from "@/lib/sistema/supabase/client"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import { PRIORITY_COLORS, PRIORITY_LABELS, type Priority } from "@/types/sistema"

interface SearchViewProps {
  tasks: TaskWithProject[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
  onRefresh: () => void
}

export function SearchView({ tasks, loading, onTaskClick, onRefresh }: SearchViewProps) {
  const [query, setQuery] = useState("")
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all")
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed">("all")
  const [filterProject, setFilterProject] = useState<string>("all")
  const [showFilters, setShowFilters] = useState(false)

  const projects = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; color: string }>()
    for (const t of tasks) {
      if (t.project) map.set(t.project.id, t.project)
    }
    return Array.from(map.values())
  }, [tasks])

  const results = useMemo(() => {
    let filtered = tasks

    if (query.trim()) {
      const q = query.toLowerCase()
      filtered = filtered.filter(
        t =>
          t.titulo.toLowerCase().includes(q) ||
          t.descripcion?.toLowerCase().includes(q) ||
          t.labels.some(l => l.toLowerCase().includes(q))
      )
    }

    if (filterPriority !== "all") {
      filtered = filtered.filter(t => t.priority === filterPriority)
    }

    if (filterStatus === "pending") {
      filtered = filtered.filter(t => !t.completed)
    } else if (filterStatus === "completed") {
      filtered = filtered.filter(t => t.completed)
    }

    if (filterProject !== "all") {
      filtered = filtered.filter(t => t.project_id === filterProject)
    }

    return filtered.sort((a, b) => {
      const pOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 }
      return (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3)
    })
  }, [tasks, query, filterPriority, filterStatus, filterProject])

  const toggleComplete = async (e: React.MouseEvent, task: TaskWithProject) => {
    e.stopPropagation()
    const supabase = createClient()
    await supabase
      .from("sistema_tasks")
      .update({
        completed: !task.completed,
        completed_at: !task.completed ? new Date().toISOString() : null,
      })
      .eq("id", task.id)
    onRefresh()
  }

  const hasActiveFilters = filterPriority !== "all" || filterStatus !== "all" || filterProject !== "all"

  const clearFilters = () => {
    setFilterPriority("all")
    setFilterStatus("all")
    setFilterProject("all")
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto py-6 px-4">
        {/* Search bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tareas..."
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan/50 transition-colors text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2.5 rounded-xl border transition-colors",
              showFilters || hasActiveFilters
                ? "bg-quepia-cyan/10 border-quepia-cyan/30 text-quepia-cyan"
                : "bg-white/[0.05] border-white/[0.08] text-white/40 hover:text-white/60"
            )}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Filtros</span>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-quepia-cyan hover:underline flex items-center gap-1">
                  <X className="h-3 w-3" /> Limpiar
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-white/40 py-1">Prioridad:</span>
              {(["all", "P1", "P2", "P3", "P4"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                    filterPriority === p
                      ? "bg-quepia-cyan/10 border-quepia-cyan/30 text-quepia-cyan"
                      : "border-white/[0.08] text-white/40 hover:text-white/60"
                  )}
                >
                  {p === "all" ? "Todas" : PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-white/40 py-1">Estado:</span>
              {(["all", "pending", "completed"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                    filterStatus === s
                      ? "bg-quepia-cyan/10 border-quepia-cyan/30 text-quepia-cyan"
                      : "border-white/[0.08] text-white/40 hover:text-white/60"
                  )}
                >
                  {s === "all" ? "Todos" : s === "pending" ? "Pendiente" : "Completado"}
                </button>
              ))}
            </div>

            {projects.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-white/40 py-1">Proyecto:</span>
                <button
                  onClick={() => setFilterProject("all")}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                    filterProject === "all"
                      ? "bg-quepia-cyan/10 border-quepia-cyan/30 text-quepia-cyan"
                      : "border-white/[0.08] text-white/40 hover:text-white/60"
                  )}
                >
                  Todos
                </button>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setFilterProject(p.id)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                      filterProject === p.id
                        ? "border-quepia-cyan/30 text-quepia-cyan"
                        : "border-white/[0.08] text-white/40 hover:text-white/60"
                    )}
                    style={filterProject === p.id ? { backgroundColor: p.color + "15" } : {}}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        <div className="text-xs text-white/30 mb-3 px-1">
          {results.length} {results.length === 1 ? "resultado" : "resultados"}
        </div>

        {results.length === 0 ? (
          <div className="text-center py-16">
            <Search className="h-12 w-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40 text-sm">
              {query ? "Sin resultados" : "Busca tareas por nombre, descripción o etiqueta"}
            </p>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            {results.map(task => (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left border-b border-white/[0.04] last:border-0 cursor-pointer"
              >
                <button onClick={(e) => toggleComplete(e, task)} className="shrink-0">
                  {task.completed ? (
                    <CheckCircle2 className="h-4.5 w-4.5 text-green-400" />
                  ) : (
                    <Circle className="h-4.5 w-4.5 text-white/20 hover:text-white/40" />
                  )}
                </button>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[task.priority] }} />
                <span className={cn("text-sm truncate flex-1", task.completed ? "text-white/30 line-through" : "text-white/80")}>
                  {task.titulo}
                </span>
                {task.project && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: task.project.color + "20", color: task.project.color }}>
                    {task.project.nombre}
                  </span>
                )}
                {task.due_date && (
                  <span className="text-[10px] text-white/25 shrink-0">
                    {new Date(task.due_date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
