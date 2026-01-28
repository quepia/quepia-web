"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Circle, Calendar } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { createClient } from "@/lib/sistema/supabase/client"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import { PRIORITY_COLORS, PRIORITY_LABELS, type Priority } from "@/types/sistema"

interface TodayViewProps {
  tasks: TaskWithProject[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
  onRefresh: () => void
}

export function TodayView({ tasks, loading, onTaskClick, onRefresh }: TodayViewProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split("T")[0]

  const { overdue, dueToday, noDueDate } = useMemo(() => {
    const incomplete = tasks.filter(t => !t.completed)
    return {
      overdue: incomplete.filter(t => t.due_date && t.due_date < todayStr)
        .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")),
      dueToday: incomplete.filter(t => t.due_date === todayStr)
        .sort((a, b) => {
          const pOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 }
          return (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3)
        }),
      noDueDate: [] as TaskWithProject[],
    }
  }, [tasks, todayStr])

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00")
    return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const renderTask = (task: TaskWithProject, showDate = false) => (
    <button
      key={task.id}
      onClick={() => onTaskClick(task)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left border-b border-white/[0.04] last:border-0"
    >
      <button
        onClick={(e) => toggleComplete(e, task)}
        className="shrink-0"
      >
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
      {showDate && task.due_date && (
        <span className="text-[10px] text-red-400 shrink-0">{formatDate(task.due_date)}</span>
      )}
    </button>
  )

  const totalCount = overdue.length + dueToday.length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto py-6 px-4">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="h-5 w-5 text-quepia-cyan" />
          <h2 className="text-lg font-semibold text-white">Hoy</h2>
          <span className="text-sm text-white/30">
            {today.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="h-12 w-12 text-green-400/30 mx-auto mb-4" />
            <p className="text-white/40 text-sm">No hay tareas para hoy</p>
            <p className="text-white/20 text-xs mt-1">Todo al día</p>
          </div>
        ) : (
          <div className="space-y-6">
            {overdue.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 px-4">
                  Vencidas ({overdue.length})
                </h3>
                <div className="bg-red-500/[0.04] border border-red-500/10 rounded-xl overflow-hidden">
                  {overdue.map(task => renderTask(task, true))}
                </div>
              </div>
            )}

            {dueToday.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-4">
                  Para hoy ({dueToday.length})
                </h3>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                  {dueToday.map(task => renderTask(task))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
