"use client"

import { useMemo, useState, useEffect } from "react"
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FolderOpen,
  TrendingUp,
  Calendar,
  ArrowRight,
  Eye,
  Activity,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import type { CalendarEvent } from "@/types/sistema"
import type { ProjectWithChildren } from "@/types/sistema"
import { PRIORITY_COLORS } from "@/types/sistema"

interface DashboardOverviewProps {
  tasks: TaskWithProject[]
  events: (CalendarEvent & { project?: { id: string; nombre: string; color: string } })[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
  onViewChange: (view: string) => void
  onProjectOpen: (projectId: string) => void
  projects: ProjectWithChildren[]
  mostVisitedProjectId?: string | null
  userRole?: string
}

interface PendingAsset {
  id: string
  nombre: string
  approval_status: string
  updated_at: string
  task?: {
    titulo: string
  }
  versions?: {
    file_url: string
  }[]
}

export function DashboardOverview({ tasks, events, loading, onTaskClick, onViewChange, onProjectOpen, projects, mostVisitedProjectId, userRole }: DashboardOverviewProps) {
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([])

  const todayStr = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split("T")[0]
  }, [])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  useEffect(() => {
    const loadPending = async () => {
      const { getPendingAssets } = await import("@/lib/sistema/actions/assets")
      const res = await getPendingAssets()
      if (res.success && res.data) {
        setPendingAssets(res.data)
      }
    }
    loadPending()
  }, [])

  const todayTasks = useMemo(() => {
    return tasks
      .filter(t => !t.completed && t.due_date === todayStr)
      .sort((a, b) => {
        const pOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 }
        return (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3)
      })
  }, [tasks, todayStr])

  const overdueTasks = useMemo(() => {
    return tasks
      .filter(t => !t.completed && t.due_date && t.due_date < todayStr)
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
  }, [tasks, todayStr])

  const upcomingTasks = useMemo(() => {
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekStr = nextWeek.toISOString().split("T")[0]
    return tasks
      .filter(t => !t.completed && t.due_date && t.due_date > todayStr && t.due_date <= nextWeekStr)
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
      .slice(0, 5)
  }, [tasks, today, todayStr])

  const upcomingEvents = useMemo(() => {
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekStr = nextWeek.toISOString().split("T")[0]
    return events
      .filter(e => e.fecha_inicio >= todayStr && e.fecha_inicio <= nextWeekStr)
      .slice(0, 5)
  }, [events, today, todayStr])

  const flatProjects = useMemo(() => {
    const result: ProjectWithChildren[] = []
    const walk = (list: ProjectWithChildren[]) => {
      list.forEach(project => {
        result.push(project)
        if (project.children && project.children.length > 0) {
          walk(project.children)
        }
      })
    }
    walk(projects)
    return result
  }, [projects])

  const mostVisitedProject = useMemo(() => {
    if (!mostVisitedProjectId) return null
    return flatProjects.find(project => project.id === mostVisitedProjectId) || null
  }, [flatProjects, mostVisitedProjectId])

  const recentActivity = useMemo(() => {
    return tasks
      .map(task => {
        const activityDate = task.completed_at || task.updated_at || task.created_at
        return {
          task,
          activityDate,
          type: task.completed && task.completed_at ? "completed" : "updated",
        }
      })
      .filter(
        (item): item is { task: TaskWithProject; activityDate: string; type: "completed" | "updated" } =>
          Boolean(item.activityDate)
      )
      .sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())
      .slice(0, 6)
  }, [tasks])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const formatDate = (dateStr: string) => {
    // If it's a full ISO string (e.g. 2023-10-27T10:00:00), calculate date from it
    if (dateStr.includes('T')) {
      const date = new Date(dateStr)
      return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })
    }
    const date = new Date(dateStr + "T12:00:00")
    return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })
  }

  const daysUntil = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00")
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return "Hoy"
    if (diff === 1) return "Mañana"
    if (diff < 0) return `Hace ${Math.abs(diff)}d`
    return `En ${diff}d`
  }

  const formatActivityDate = (dateStr: string) => {
    const date = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T12:00:00")
    date.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "Hoy"
    if (diffDays === 1) return "Ayer"
    if (diffDays < 0) return `En ${Math.abs(diffDays)}d`
    return `Hace ${diffDays}d`
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Quick Access */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-quepia-cyan" />
            Acceso rápido
          </h3>
          <button
            onClick={() => onViewChange("portfolio")}
            className="text-xs text-quepia-cyan hover:underline flex items-center gap-1"
          >
            Ver proyectos <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        {mostVisitedProject ? (
          <button
            onClick={() => onProjectOpen(mostVisitedProject.id)}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: mostVisitedProject.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/90 truncate">{mostVisitedProject.nombre}</p>
              <p className="text-xs text-white/40">Proyecto más visitado</p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/40" />
          </button>
        ) : (
          <p className="text-sm text-white/30 py-4 text-center">
            Todavía no hay historial de visitas. Abrí un proyecto y aparecerá acá.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-quepia-cyan" />
              Hoy ({todayTasks.length})
            </h3>
            <button onClick={() => onViewChange("today")} className="text-xs text-quepia-cyan hover:underline flex items-center gap-1">
              Ver todo <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-white/30 py-4 text-center">No hay tareas para hoy</p>
          ) : (
            <div className="space-y-2">
              {todayTasks.slice(0, 5).map(task => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[task.priority] }} />
                  <span className="text-sm text-white/80 truncate flex-1">{task.titulo}</span>
                  {task.project && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 shrink-0">{task.project.nombre}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Tasks */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className={cn("h-4 w-4", overdueTasks.length > 0 ? "text-red-400" : "text-white/30")} />
              Vencidas ({overdueTasks.length})
            </h3>
          </div>
          {overdueTasks.length === 0 ? (
            <p className="text-sm text-white/30 py-4 text-center">Sin tareas vencidas</p>
          ) : (
            <div className="space-y-2">
              {overdueTasks.slice(0, 5).map(task => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="w-2 h-2 rounded-full shrink-0 bg-red-400" />
                  <span className="text-sm text-white/80 truncate flex-1">{task.titulo}</span>
                  <span className="text-[10px] text-red-400 shrink-0">{daysUntil(task.due_date!)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Tasks */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              Próximas tareas
            </h3>
            <button onClick={() => onViewChange("upcoming")} className="text-xs text-quepia-cyan hover:underline flex items-center gap-1">
              Ver todo <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {upcomingTasks.length === 0 ? (
            <p className="text-sm text-white/30 py-4 text-center">Sin tareas próximas</p>
          ) : (
            <div className="space-y-2">
              {upcomingTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[task.priority] }} />
                  <span className="text-sm text-white/80 truncate flex-1">{task.titulo}</span>
                  <span className="text-[10px] text-white/40 shrink-0">{formatDate(task.due_date!)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" />
              Eventos próximos
            </h3>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-white/30 py-4 text-center">Sin eventos próximos</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map(event => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02]"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                  <span className="text-sm text-white/80 truncate flex-1">{event.titulo}</span>
                  <span className="text-[10px] text-white/40 shrink-0">{formatDate(event.fecha_inicio)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending Reviews Section */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Eye className="h-4 w-4 text-orange-400" />
            Revisiones Pendientes
          </h3>
        </div>
        {pendingAssets.length === 0 ? (
          <p className="text-sm text-white/30 py-4 text-center">No hay revisiones pendientes</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingAssets.map((asset) => (
              <div key={asset.id} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                onClick={() => asset.task && onTaskClick(asset.task as unknown as TaskWithProject)}
              >
                <div className="flex items-center gap-3 mb-2">
                  {asset.versions?.[0]?.file_url && /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(asset.versions[0].file_url) ? (
                    <div className="w-10 h-10 rounded bg-white/5 overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.versions[0].file_url} className="w-full h-full object-cover" alt={asset.nombre} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-5 h-5 text-white/20" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white/90 truncate">{asset.nombre}</p>
                    <p className="text-xs text-white/40 truncate">{asset.task?.titulo}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">
                    {asset.approval_status === 'changes_requested' ? 'Cambios solicitados' : 'Pendiente revisión'}
                  </span>
                  <span className="text-[10px] text-white/30">
                    {daysUntil(asset.updated_at.split('T')[0])}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Team Activity (Admin) */}
      {userRole === 'admin' && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Actividad reciente del equipo
            </h3>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-white/30 py-4 text-center">Sin actividad reciente</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map(({ task, activityDate, type }) => (
                <div
                  key={`${task.id}-${activityDate}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02]"
                >
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                    type === "completed" ? "bg-green-500/10 text-green-400" : "bg-white/10 text-white/50"
                  )}>
                    {type === "completed" ? "Completó" : "Actualizó"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/85 truncate">{task.titulo}</p>
                    <p className="text-xs text-white/40 truncate">
                      {task.project?.nombre || "Proyecto sin nombre"}
                      {task.assignee?.nombre ? ` · ${task.assignee.nombre}` : ""}
                    </p>
                  </div>
                  <span className="text-[10px] text-white/40 shrink-0">{formatActivityDate(activityDate)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Panel Quick Access */}
      {userRole === 'admin' && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-pink-400" />
              Panel de Administración
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <button
              onClick={() => onViewChange("admin-users")}
              className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-all flex flex-col items-center gap-2 group"
            >
              <div className="p-2 rounded-full bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                <FolderOpen className="h-5 w-5" />
              </div>
              <span className="text-sm text-white/80 font-medium">Usuarios</span>
            </button>

            <button
              onClick={() => onViewChange("admin-projects")}
              className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-all flex flex-col items-center gap-2 group"
            >
              <div className="p-2 rounded-full bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                <FolderOpen className="h-5 w-5" />
              </div>
              <span className="text-sm text-white/80 font-medium">Portfolio</span>
            </button>

            <button
              onClick={() => onViewChange("admin-services")}
              className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-all flex flex-col items-center gap-2 group"
            >
              <div className="p-2 rounded-full bg-green-500/10 text-green-400 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <span className="text-sm text-white/80 font-medium">Servicios</span>
            </button>

            <button
              onClick={() => onViewChange("admin-team")}
              className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-all flex flex-col items-center gap-2 group"
            >
              <div className="p-2 rounded-full bg-orange-500/10 text-orange-400 group-hover:scale-110 transition-transform">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span className="text-sm text-white/80 font-medium">Equipo</span>
            </button>

            <button
              onClick={() => onViewChange("admin-config")}
              className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-all flex flex-col items-center gap-2 group"
            >
              <div className="p-2 rounded-full bg-gray-500/10 text-gray-400 group-hover:scale-110 transition-transform">
                <Eye className="h-5 w-5" />
              </div>
              <span className="text-sm text-white/80 font-medium">Config</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
