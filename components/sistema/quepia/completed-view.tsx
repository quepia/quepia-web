"use client"

import { useMemo } from "react"
import { CheckCircle2, RotateCcw } from "lucide-react"
import { createClient } from "@/lib/sistema/supabase/client"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"

interface CompletedViewProps {
  tasks: TaskWithProject[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
  onRefresh: () => void
}

export function CompletedView({ tasks, loading, onTaskClick, onRefresh }: CompletedViewProps) {
  const grouped = useMemo(() => {
    const completed = tasks
      .filter(t => t.completed)
      .sort((a, b) => {
        const dateA = a.completed_at || a.updated_at
        const dateB = b.completed_at || b.updated_at
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const yesterdayMs = todayMs - 86400000
    const weekAgoMs = todayMs - 7 * 86400000

    const groups: { label: string; tasks: TaskWithProject[] }[] = []
    const todayTasks: TaskWithProject[] = []
    const yesterdayTasks: TaskWithProject[] = []
    const thisWeekTasks: TaskWithProject[] = []
    const olderTasks: TaskWithProject[] = []

    for (const task of completed) {
      const d = new Date(task.completed_at || task.updated_at).getTime()
      if (d >= todayMs) todayTasks.push(task)
      else if (d >= yesterdayMs) yesterdayTasks.push(task)
      else if (d >= weekAgoMs) thisWeekTasks.push(task)
      else olderTasks.push(task)
    }

    if (todayTasks.length) groups.push({ label: "Hoy", tasks: todayTasks })
    if (yesterdayTasks.length) groups.push({ label: "Ayer", tasks: yesterdayTasks })
    if (thisWeekTasks.length) groups.push({ label: "Esta semana", tasks: thisWeekTasks })
    if (olderTasks.length) groups.push({ label: "Anteriores", tasks: olderTasks })

    return groups
  }, [tasks])

  const uncomplete = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    const supabase = createClient()
    await supabase
      .from("sistema_tasks")
      .update({ completed: false, completed_at: null })
      .eq("id", taskId)
    onRefresh()
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const totalCompleted = tasks.filter(t => t.completed).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto py-6 px-4">
        <div className="flex items-center gap-3 mb-6">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          <h2 className="text-lg font-semibold text-white">Completado</h2>
          <span className="text-sm text-white/30">{totalCompleted} tareas</span>
        </div>

        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="h-12 w-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40 text-sm">No hay tareas completadas</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.label}>
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-4">
                  {group.label} ({group.tasks.length})
                </h3>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                  {group.tasks.map(task => (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left border-b border-white/[0.04] last:border-0 group cursor-pointer"
                    >
                      <CheckCircle2 className="h-4.5 w-4.5 text-green-400 shrink-0" />
                      <span className="text-sm text-white/40 line-through truncate flex-1">{task.titulo}</span>
                      {task.project && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: task.project.color + "20", color: task.project.color }}>
                          {task.project.nombre}
                        </span>
                      )}
                      <button
                        onClick={(e) => uncomplete(e, task.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.08] transition-all shrink-0"
                        title="Marcar como pendiente"
                      >
                        <RotateCcw className="h-3 w-3 text-white/30" />
                      </button>
                    </div>
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
