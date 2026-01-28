"use client"

import { useMemo } from "react"
import { Inbox, CheckCircle2, MessageSquare, AlertCircle } from "lucide-react"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import { PRIORITY_COLORS } from "@/types/sistema"

interface InboxViewProps {
  tasks: TaskWithProject[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
}

export function InboxView({ tasks, loading, onTaskClick }: InboxViewProps) {
  // Show recently updated tasks as "inbox" items (last 7 days)
  const recentTasks = useMemo(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoStr = weekAgo.toISOString()

    return tasks
      .filter(t => t.updated_at > weekAgoStr)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 30)
  }, [tasks])

  const formatRelative = (dateStr: string) => {
    const now = new Date()
    const date = new Date(dateStr)
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "Ahora"
    if (mins < 60) return `Hace ${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `Hace ${hours}h`
    const days = Math.floor(hours / 24)
    return `Hace ${days}d`
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
          <Inbox className="h-5 w-5 text-quepia-cyan" />
          <h2 className="text-lg font-semibold text-white">Inbox</h2>
          <span className="text-sm text-white/30">Actividad reciente</span>
        </div>

        {recentTasks.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="h-12 w-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40 text-sm">Sin actividad reciente</p>
            <p className="text-white/20 text-xs mt-1">Las tareas actualizadas recientemente aparecerán aquí</p>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            {recentTasks.map(task => (
              <button
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left border-b border-white/[0.04] last:border-0"
              >
                <div className="shrink-0">
                  {task.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4" style={{ color: PRIORITY_COLORS[task.priority] }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white/80 truncate block">{task.titulo}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.project && (
                      <span className="text-[10px]" style={{ color: task.project.color }}>
                        {task.project.nombre}
                      </span>
                    )}
                    {task.column && (
                      <span className="text-[10px] text-white/25">{task.column.nombre}</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-white/25 shrink-0">{formatRelative(task.updated_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
