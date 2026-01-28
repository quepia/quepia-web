"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, Users, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import type { SistemaUser } from "@/types/sistema"

interface WorkloadViewProps {
  tasks: TaskWithProject[]
  users: SistemaUser[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
}

export function WorkloadView({ tasks, users, loading, onTaskClick }: WorkloadViewProps) {
  const [weekOffset, setWeekOffset] = useState(0)

  // Compute the week's start (Monday) based on offset
  const weekStart = useMemo(() => {
    const today = new Date()
    const day = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7)
    monday.setHours(0, 0, 0, 0)
    return monday
  }, [weekOffset])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    })
  }, [weekStart])

  const todayStr = new Date().toISOString().split("T")[0]

  // Build workload matrix: userId -> dayStr -> hours
  const workload = useMemo(() => {
    const map = new Map<string, Map<string, { hours: number; tasks: TaskWithProject[] }>>()

    // Initialize for all users
    for (const user of users) {
      const dayMap = new Map<string, { hours: number; tasks: TaskWithProject[] }>()
      for (const day of weekDays) {
        dayMap.set(day.toISOString().split("T")[0], { hours: 0, tasks: [] })
      }
      map.set(user.id, dayMap)
    }

    // Distribute tasks: if a task has a due_date in this week and an assignee, add its hours
    for (const task of tasks) {
      if (task.completed || !task.assignee_id || !task.due_date) continue
      const dayStr = task.due_date
      const userId = task.assignee_id
      const userMap = map.get(userId)
      if (!userMap) continue
      const dayData = userMap.get(dayStr)
      if (!dayData) continue
      dayData.hours += task.estimated_hours || 1 // default 1h if no estimate
      dayData.tasks.push(task)
    }

    return map
  }, [tasks, users, weekDays])

  // Compute weekly totals per user
  const weeklyTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const [userId, dayMap] of workload) {
      let total = 0
      for (const [, data] of dayMap) {
        total += data.hours
      }
      totals.set(userId, total)
    }
    return totals
  }, [workload])

  const [selectedCell, setSelectedCell] = useState<{ userId: string; dayStr: string } | null>(null)

  const getHeatColor = (hours: number) => {
    if (hours === 0) return "bg-white/[0.02]"
    if (hours <= 3) return "bg-green-500/20"
    if (hours <= 6) return "bg-green-500/40"
    if (hours <= 8) return "bg-amber-500/30"
    return "bg-red-500/30"
  }

  const getHeatBorder = (hours: number) => {
    if (hours === 0) return "border-white/[0.04]"
    if (hours <= 6) return "border-green-500/20"
    if (hours <= 8) return "border-amber-500/20"
    return "border-red-500/30"
  }

  const formatWeekRange = () => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
    return `${weekStart.toLocaleDateString("es-AR", opts)} — ${end.toLocaleDateString("es-AR", opts)}`
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const selectedData = selectedCell
    ? workload.get(selectedCell.userId)?.get(selectedCell.dayStr)
    : null

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-quepia-cyan" />
          <h2 className="text-lg font-semibold text-white">Carga de trabajo</h2>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekOffset(0)} className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors">
            Esta semana
          </button>
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            <ChevronLeft className="h-4 w-4 text-white/40" />
          </button>
          <span className="text-sm text-white/60 min-w-[180px] text-center">{formatWeekRange()}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            <ChevronRight className="h-4 w-4 text-white/40" />
          </button>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/40 text-sm">No hay usuarios en el equipo</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Heatmap grid */}
          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs text-white/30 font-semibold uppercase tracking-wider pb-3 pr-4 w-40">
                    Miembro
                  </th>
                  {weekDays.map(day => {
                    const dayStr = day.toISOString().split("T")[0]
                    const isToday = dayStr === todayStr
                    return (
                      <th key={dayStr} className={cn("text-center pb-3 px-1", isToday && "text-quepia-cyan")}>
                        <div className="text-[10px] uppercase font-semibold text-white/25">
                          {day.toLocaleDateString("es-AR", { weekday: "short" })}
                        </div>
                        <div className={cn("text-xs font-medium", isToday ? "text-quepia-cyan" : "text-white/50")}>
                          {day.getDate()}
                        </div>
                      </th>
                    )
                  })}
                  <th className="text-center pb-3 px-2">
                    <div className="text-[10px] uppercase font-semibold text-white/25">Total</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const total = weeklyTotals.get(user.id) || 0
                  const isOverloaded = total > 40

                  return (
                    <tr key={user.id}>
                      <td className="pr-4 py-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-quepia-cyan/80 to-quepia-magenta/80 flex items-center justify-center text-[9px] text-white font-medium shrink-0">
                            {user.nombre.split(" ").map(n => n[0]).join("").toUpperCase()}
                          </div>
                          <span className="text-xs text-white/70 truncate">{user.nombre}</span>
                          {isOverloaded && (
                            <span title="Sobrecargado" className="shrink-0 flex">
                              <AlertTriangle className="h-3 w-3 text-red-400" />
                            </span>
                          )}
                        </div>
                      </td>
                      {weekDays.map(day => {
                        const dayStr = day.toISOString().split("T")[0]
                        const data = workload.get(user.id)?.get(dayStr)
                        const hours = data?.hours || 0
                        const isSelected = selectedCell?.userId === user.id && selectedCell?.dayStr === dayStr

                        return (
                          <td key={dayStr} className="px-1 py-1">
                            <button
                              onClick={() => setSelectedCell(isSelected ? null : { userId: user.id, dayStr })}
                              className={cn(
                                "w-full aspect-square min-w-[48px] rounded-lg border transition-all flex items-center justify-center",
                                getHeatColor(hours),
                                isSelected ? "border-quepia-cyan ring-1 ring-quepia-cyan/30" : getHeatBorder(hours),
                                hours > 0 && "cursor-pointer hover:scale-105"
                              )}
                            >
                              {hours > 0 && (
                                <span className={cn(
                                  "text-xs font-medium",
                                  hours > 8 ? "text-red-400" : hours > 6 ? "text-amber-400" : "text-green-400"
                                )}>
                                  {hours}h
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-2 py-1 text-center">
                        <span className={cn(
                          "text-xs font-semibold",
                          isOverloaded ? "text-red-400" : total > 30 ? "text-amber-400" : "text-white/50"
                        )}>
                          {total}h
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div className="mt-6 flex items-center gap-4 text-[10px] text-white/30">
              <span>Carga:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-green-500/20 border border-green-500/20" />
                <span>&lt; 6h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-amber-500/30 border border-amber-500/20" />
                <span>6-8h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-red-500/30 border border-red-500/30" />
                <span>&gt; 8h</span>
              </div>
            </div>
          </div>

          {/* Selected cell detail panel */}
          {selectedCell && selectedData && selectedData.tasks.length > 0 && (
            <div className="w-64 shrink-0 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                {users.find(u => u.id === selectedCell.userId)?.nombre} — {new Date(selectedCell.dayStr + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
              </h4>
              <div className="space-y-2">
                {selectedData.tasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className="w-full text-left p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <p className="text-xs text-white/80 truncate">{task.titulo}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/30">{task.estimated_hours || 1}h</span>
                      {task.project && (
                        <span className="text-[9px] px-1 rounded" style={{ backgroundColor: task.project.color + "20", color: task.project.color }}>
                          {task.project.nombre}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
