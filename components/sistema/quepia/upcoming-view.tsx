"use client"

import { useMemo } from "react"
import { CheckCircle2, Circle, CalendarDays } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { createClient } from "@/lib/sistema/supabase/client"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import { PRIORITY_COLORS } from "@/types/sistema"

interface UpcomingViewProps {
  tasks: TaskWithProject[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
  onRefresh: () => void
}

export function UpcomingView({ tasks, loading, onTaskClick, onRefresh }: UpcomingViewProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split("T")[0]

  const grouped = useMemo(() => {
    const upcoming = tasks
      .filter(t => !t.completed && t.due_date && t.due_date >= todayStr)
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))

    const groups: { label: string; key: string; tasks: TaskWithProject[] }[] = []
    const dateMap = new Map<string, TaskWithProject[]>()

    for (const task of upcoming) {
      const d = task.due_date!
      if (!dateMap.has(d)) dateMap.set(d, [])
      dateMap.get(d)!.push(task)
    }

    for (const [dateStr, dateTasks] of dateMap) {
      const date = new Date(dateStr + "T12:00:00")
      const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      let label: string
      if (diff === 0) label = "Hoy"
      else if (diff === 1) label = "Mañana"
      else label = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })

      groups.push({ label, key: dateStr, tasks: dateTasks })
    }

    // Also add tasks with no due date at the end
    const noDue = tasks.filter(t => !t.completed && !t.due_date)
    if (noDue.length > 0) {
      groups.push({ label: "Sin fecha", key: "no-date", tasks: noDue })
    }

    return groups
  }, [tasks, todayStr, today])

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
        <div className="flex items-center gap-3 mb-6">
          <CalendarDays className="h-5 w-5 text-quepia-cyan" />
          <h2 className="text-lg font-semibold text-white">Próximo</h2>
        </div>

        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="h-12 w-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40 text-sm">No hay tareas próximas</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.key}>
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-4">
                  {group.label} ({group.tasks.length})
                </h3>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                  {group.tasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left border-b border-white/[0.04] last:border-0"
                    >
                      <span onClick={(e) => toggleComplete(e, task)} className="shrink-0 cursor-pointer">
                        {task.completed ? (
                          <CheckCircle2 className="h-4.5 w-4.5 text-green-400" />
                        ) : (
                          <Circle className="h-4.5 w-4.5 text-white/20 hover:text-white/40" />
                        )}
                      </span>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[task.priority] }} />
                      <span className="text-sm text-white/80 truncate flex-1">{task.titulo}</span>
                      {task.project && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: task.project.color + "20", color: task.project.color }}>
                          {task.project.nombre}
                        </span>
                      )}
                      {task.column && (
                        <span className="text-[10px] text-white/25 shrink-0">{task.column.nombre}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
