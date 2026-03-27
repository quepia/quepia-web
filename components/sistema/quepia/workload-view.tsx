"use client"

import { useState, useMemo } from "react"
import { AlertTriangle, BarChart3, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ListTodo, Users } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import type { SistemaUser } from "@/types/sistema"

interface WorkloadViewProps {
  tasks: TaskWithProject[]
  users: SistemaUser[]
  loading: boolean
  onTaskClick: (task: TaskWithProject) => void
}

type RangePreset = "7d" | "30d" | "90d"
type MetricKey = "pending_hours" | "assigned_count" | "completed_count" | "completed_hours" | "late_count"

type MetricBucket = {
  value: number
  tasks: TaskWithProject[]
}

type DayBuckets = Record<MetricKey, MetricBucket>

type UserSummary = {
  user: SistemaUser
  assignedCount: number
  pendingHours: number
  pendingCount: number
  completedCount: number
  completedHours: number
  lateCount: number
}

const RANGE_OPTIONS: { id: RangePreset; label: string; days: number }[] = [
  { id: "7d", label: "7 días", days: 7 },
  { id: "30d", label: "30 días", days: 30 },
  { id: "90d", label: "90 días", days: 90 },
]

const METRIC_OPTIONS: {
  id: MetricKey
  label: string
  shortLabel: string
  description: string
}[] = [
  {
    id: "pending_hours",
    label: "Horas pendientes",
    shortLabel: "Pendientes",
    description: "Horas abiertas con vencimiento dentro del rango",
  },
  {
    id: "assigned_count",
    label: "Tareas asignadas",
    shortLabel: "Asignadas",
    description: "Tareas con responsable y vencimiento dentro del rango",
  },
  {
    id: "completed_count",
    label: "Tareas completadas",
    shortLabel: "Completadas",
    description: "Tareas cerradas dentro del rango",
  },
  {
    id: "completed_hours",
    label: "Horas completadas",
    shortLabel: "Horas cerradas",
    description: "Horas estimadas de tareas completadas dentro del rango",
  },
  {
    id: "late_count",
    label: "Fuera de término",
    shortLabel: "Tarde",
    description: "Tareas que llegaron tarde respecto a su fecha",
  },
]

const DAY_MS = 24 * 60 * 60 * 1000

function pad(value: number) {
  return value.toString().padStart(2, "0")
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function shiftDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return startOfDay(next)
}

function parseDateKey(value: string) {
  return new Date(`${value}T12:00:00`)
}

function endOfDateKey(value: string) {
  const next = new Date(`${value}T23:59:59.999`)
  return next
}

function formatHours(value: number) {
  if (value === 0) return "0h"
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}h`
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

function formatMetricValue(metric: MetricKey, value: number) {
  return metric === "pending_hours" || metric === "completed_hours"
    ? formatHours(value)
    : `${Math.round(value)}`
}

function createEmptyDayBuckets(): DayBuckets {
  return {
    pending_hours: { value: 0, tasks: [] },
    assigned_count: { value: 0, tasks: [] },
    completed_count: { value: 0, tasks: [] },
    completed_hours: { value: 0, tasks: [] },
    late_count: { value: 0, tasks: [] },
  }
}

function isTaskLate(task: TaskWithProject, referenceDate: Date) {
  if (!task.due_date) return false
  const dueEnd = endOfDateKey(task.due_date)
  if (task.completed_at) {
    return new Date(task.completed_at).getTime() > dueEnd.getTime()
  }
  return dueEnd.getTime() < referenceDate.getTime()
}

function getCellTone(metric: MetricKey, value: number) {
  if (value <= 0) {
    return {
      container: "bg-white/[0.02] border-white/[0.05]",
      text: "text-white/25",
    }
  }

  const ratio = metric === "pending_hours" || metric === "completed_hours"
    ? value / 8
    : metric === "late_count"
      ? value / 3
      : value / 4

  if (metric === "late_count") {
    if (ratio < 0.5) {
      return { container: "bg-amber-500/18 border-amber-400/25", text: "text-amber-300" }
    }
    return { container: "bg-red-500/22 border-red-400/35", text: "text-red-300" }
  }

  if (ratio < 0.4) {
    return { container: "bg-cyan-500/14 border-cyan-400/20", text: "text-cyan-200" }
  }
  if (ratio < 0.8) {
    return { container: "bg-cyan-500/24 border-cyan-400/30", text: "text-cyan-100" }
  }
  return { container: "bg-green-500/24 border-green-400/30", text: "text-green-200" }
}

export function WorkloadView({ tasks, users, loading, onTaskClick }: WorkloadViewProps) {
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d")
  const [rangeOffset, setRangeOffset] = useState(0)
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("pending_hours")
  const [selectedCell, setSelectedCell] = useState<{ userId: string; dayKey: string } | null>(null)

  const today = useMemo(() => startOfDay(new Date()), [])
  const activeRange = RANGE_OPTIONS.find((option) => option.id === rangePreset) ?? RANGE_OPTIONS[1]

  const { rangeStart, rangeEnd, rangeDays, rangeKeys, todayKey, lateReferenceDate } = useMemo(() => {
    const end = shiftDays(today, rangeOffset * activeRange.days)
    const start = shiftDays(end, -(activeRange.days - 1))
    const dates = Array.from({ length: activeRange.days }, (_, index) => shiftDays(start, index))

    return {
      rangeStart: start,
      rangeEnd: end,
      rangeDays: dates,
      rangeKeys: dates.map(toDateKey),
      todayKey: toDateKey(today),
      lateReferenceDate: end.getTime() < today.getTime()
        ? new Date(end.getTime() + DAY_MS - 1)
        : new Date(),
    }
  }, [activeRange.days, rangeOffset, today])

  const workload = useMemo(() => {
    const map = new Map<string, Map<string, DayBuckets>>()

    for (const user of users) {
      const dayMap = new Map<string, DayBuckets>()
      for (const key of rangeKeys) {
        dayMap.set(key, createEmptyDayBuckets())
      }
      map.set(user.id, dayMap)
    }

    for (const task of tasks) {
      if (!task.assignee_id) continue
      const userMap = map.get(task.assignee_id)
      if (!userMap) continue

      const hours = task.estimated_hours || 1

      if (task.due_date) {
        const dueBuckets = userMap.get(task.due_date)
        if (dueBuckets) {
          dueBuckets.assigned_count.value += 1
          dueBuckets.assigned_count.tasks.push(task)

          if (!task.completed) {
            dueBuckets.pending_hours.value += hours
            dueBuckets.pending_hours.tasks.push(task)
          }

          if (isTaskLate(task, lateReferenceDate)) {
            dueBuckets.late_count.value += 1
            dueBuckets.late_count.tasks.push(task)
          }
        }
      }

      if (task.completed && task.completed_at) {
        const completedKey = toDateKey(new Date(task.completed_at))
        const completedBuckets = userMap.get(completedKey)
        if (completedBuckets) {
          completedBuckets.completed_count.value += 1
          completedBuckets.completed_count.tasks.push(task)
          completedBuckets.completed_hours.value += hours
          completedBuckets.completed_hours.tasks.push(task)
        }
      }
    }

    return map
  }, [lateReferenceDate, rangeKeys, tasks, users])

  const summaries = useMemo<UserSummary[]>(() => {
    return users.map((user) => {
      const dayMap = workload.get(user.id)
      let assignedCount = 0
      let pendingHours = 0
      let pendingCount = 0
      let completedCount = 0
      let completedHours = 0
      let lateCount = 0

      if (dayMap) {
        for (const [, buckets] of dayMap) {
          assignedCount += buckets.assigned_count.value
          pendingHours += buckets.pending_hours.value
          pendingCount += buckets.pending_hours.tasks.length
          completedCount += buckets.completed_count.value
          completedHours += buckets.completed_hours.value
          lateCount += buckets.late_count.value
        }
      }

      return {
        user,
        assignedCount,
        pendingHours,
        pendingCount,
        completedCount,
        completedHours,
        lateCount,
      }
    })
  }, [users, workload])

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, item) => ({
        assignedCount: acc.assignedCount + item.assignedCount,
        pendingHours: acc.pendingHours + item.pendingHours,
        pendingCount: acc.pendingCount + item.pendingCount,
        completedCount: acc.completedCount + item.completedCount,
        completedHours: acc.completedHours + item.completedHours,
        lateCount: acc.lateCount + item.lateCount,
      }),
      {
        assignedCount: 0,
        pendingHours: 0,
        pendingCount: 0,
        completedCount: 0,
        completedHours: 0,
        lateCount: 0,
      }
    )
  }, [summaries])

  const leaderboard = useMemo(() => {
    const metricValue = (summary: UserSummary) => {
      switch (selectedMetric) {
        case "pending_hours":
          return summary.pendingHours
        case "assigned_count":
          return summary.assignedCount
        case "completed_count":
          return summary.completedCount
        case "completed_hours":
          return summary.completedHours
        case "late_count":
          return summary.lateCount
      }
    }

    return [...summaries].sort((a, b) => {
      const diff = metricValue(b) - metricValue(a)
      if (diff !== 0) return diff
      return a.user.nombre.localeCompare(b.user.nombre, "es")
    })
  }, [selectedMetric, summaries])

  const selectedDayData = selectedCell
    ? workload.get(selectedCell.userId)?.get(selectedCell.dayKey) ?? null
    : null

  const selectedMetricMeta = METRIC_OPTIONS.find((option) => option.id === selectedMetric) ?? METRIC_OPTIONS[0]
  const selectedMetricTasks = selectedDayData?.[selectedMetric].tasks ?? []
  const selectedMetricValue = selectedDayData?.[selectedMetric].value ?? 0

  const rangeLabel = `${rangeStart.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} — ${rangeEnd.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`
  const topPerformer = leaderboard[0]

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-quepia-cyan" />
              <h2 className="text-lg font-semibold text-white">Carga histórica</h2>
            </div>
            <p className="text-sm text-white/45">
              Compará carga, completitud y entregas tardías por usuario en distintos rangos.
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setRangePreset(option.id)
                    setRangeOffset(0)
                    setSelectedCell(null)
                  }}
                  className={cn(
                    "min-h-10 rounded-xl px-3 py-2 text-xs transition-all duration-200",
                    rangePreset === option.id
                      ? "bg-quepia-cyan/15 text-quepia-cyan ring-1 ring-quepia-cyan/30"
                      : "bg-white/[0.05] text-white/60 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
              <button
                onClick={() => setRangeOffset((current) => current - 1)}
                className="min-h-10 rounded-xl p-2 transition-all duration-200 hover:bg-white/[0.06]"
                aria-label="Periodo anterior"
              >
                <ChevronLeft className="h-4 w-4 text-white/40" />
              </button>
              <div className="flex min-h-10 items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
                <CalendarRange className="h-4 w-4 text-white/35" />
                <span className="text-xs sm:text-sm">{rangeLabel}</span>
              </div>
              <button
                onClick={() => setRangeOffset((current) => Math.min(current + 1, 0))}
                disabled={rangeOffset === 0}
                className="min-h-10 rounded-xl p-2 transition-all duration-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Periodo siguiente"
              >
                <ChevronRight className="h-4 w-4 text-white/40" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-white/35">
              <ListTodo className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-[0.16em]">Asignadas</span>
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{totals.assignedCount}</div>
            <p className="mt-1 text-xs text-white/40">Con responsable y vencimiento dentro del rango</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-white/35">
              <Clock3 className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-[0.16em]">Pendientes</span>
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{formatHours(totals.pendingHours)}</div>
            <p className="mt-1 text-xs text-white/40">{totals.pendingCount} tareas abiertas con fecha dentro del rango</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-white/35">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-[0.16em]">Completadas</span>
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{totals.completedCount}</div>
            <p className="mt-1 text-xs text-white/40">{formatHours(totals.completedHours)} cerradas en el periodo</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-white/35">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-[0.16em]">Fuera de término</span>
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{totals.lateCount}</div>
            <p className="mt-1 text-xs text-white/40">Vencidas o entregadas después de la fecha</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-white/35">
              <BarChart3 className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-[0.16em]">Lidera</span>
            </div>
            <div className="mt-3 text-base font-semibold text-white truncate">
              {topPerformer ? topPerformer.user.nombre : "Sin datos"}
            </div>
            <p className="mt-1 text-xs text-white/40">
              {topPerformer ? `${selectedMetricMeta.shortLabel}: ${formatMetricValue(selectedMetric, selectedMetric === "pending_hours" ? topPerformer.pendingHours : selectedMetric === "assigned_count" ? topPerformer.assignedCount : selectedMetric === "completed_count" ? topPerformer.completedCount : selectedMetric === "completed_hours" ? topPerformer.completedHours : topPerformer.lateCount)}` : "No hay movimientos en este periodo"}
            </p>
          </div>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/40 text-sm">No hay usuarios en el equipo</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 sm:p-4">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Ranking por KPI</h3>
                <p className="text-xs text-white/40">{selectedMetricMeta.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {METRIC_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setSelectedMetric(option.id)
                      setSelectedCell(null)
                    }}
                    className={cn(
                      "min-h-10 rounded-xl px-3 py-2 text-xs transition-all duration-200",
                      selectedMetric === option.id
                        ? "bg-quepia-cyan/15 text-quepia-cyan ring-1 ring-quepia-cyan/30"
                        : "bg-white/[0.05] text-white/60 hover:bg-white/[0.08] hover:text-white"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left">
                    <th className="pb-3 pr-3 text-[11px] uppercase tracking-[0.16em] text-white/30">Usuario</th>
                    <th className="pb-3 px-3 text-[11px] uppercase tracking-[0.16em] text-white/30">{selectedMetricMeta.shortLabel}</th>
                    <th className="pb-3 px-3 text-[11px] uppercase tracking-[0.16em] text-white/30">Asignadas</th>
                    <th className="pb-3 px-3 text-[11px] uppercase tracking-[0.16em] text-white/30">Pendientes</th>
                    <th className="pb-3 px-3 text-[11px] uppercase tracking-[0.16em] text-white/30">Completadas</th>
                    <th className="pb-3 px-3 text-[11px] uppercase tracking-[0.16em] text-white/30">Horas cerradas</th>
                    <th className="pb-3 pl-3 text-[11px] uppercase tracking-[0.16em] text-white/30">Tarde</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((item, index) => {
                    const selectedValue =
                      selectedMetric === "pending_hours"
                        ? item.pendingHours
                        : selectedMetric === "assigned_count"
                          ? item.assignedCount
                          : selectedMetric === "completed_count"
                            ? item.completedCount
                            : selectedMetric === "completed_hours"
                              ? item.completedHours
                              : item.lateCount

                    return (
                      <tr key={item.user.id} className="border-b border-white/[0.04] last:border-b-0">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-quepia-cyan/80 to-quepia-magenta/80 text-[10px] font-semibold text-white">
                              {getInitials(item.user.nombre)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-white">{item.user.nombre}</p>
                              <p className="text-xs text-white/35">#{index + 1} del ranking</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold text-quepia-cyan">
                          {formatMetricValue(selectedMetric, selectedValue)}
                        </td>
                        <td className="px-3 py-3 text-sm text-white/70">{item.assignedCount}</td>
                        <td className="px-3 py-3 text-sm text-white/70">{formatHours(item.pendingHours)}</td>
                        <td className="px-3 py-3 text-sm text-white/70">{item.completedCount}</td>
                        <td className="px-3 py-3 text-sm text-white/70">{formatHours(item.completedHours)}</td>
                        <td className="py-3 pl-3 text-sm text-white/70">{item.lateCount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="flex-1 overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2 sm:p-3">
              <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className="w-36 pb-3 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30 sm:w-44 sm:text-xs">
                    Miembro
                  </th>
                  {rangeDays.map((day) => {
                    const dayKey = toDateKey(day)
                    const isToday = dayKey === todayKey
                    return (
                      <th key={dayKey} className={cn("px-1 pb-3 text-center", isToday && "text-quepia-cyan")}>
                        <div className="text-[10px] font-semibold uppercase text-white/25">
                          {day.toLocaleDateString("es-AR", { weekday: "short" })}
                        </div>
                        <div className={cn("text-xs font-medium", isToday ? "text-quepia-cyan" : "text-white/50")}>
                          {day.getDate()}
                        </div>
                      </th>
                    )
                  })}
                  <th className="px-2 pb-3 text-center">
                    <div className="text-[10px] font-semibold uppercase text-white/25">Total</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((summary) => {
                  const user = summary.user
                  const total =
                    selectedMetric === "pending_hours"
                      ? summary.pendingHours
                      : selectedMetric === "assigned_count"
                        ? summary.assignedCount
                        : selectedMetric === "completed_count"
                          ? summary.completedCount
                          : selectedMetric === "completed_hours"
                            ? summary.completedHours
                            : summary.lateCount
                  const isWarningRow = selectedMetric === "pending_hours"
                    ? total > 40
                    : selectedMetric === "late_count"
                      ? total > 0
                      : false

                  return (
                    <tr key={user.id}>
                      <td className="pr-4 py-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-quepia-cyan/80 to-quepia-magenta/80 text-[9px] font-medium text-white">
                            {getInitials(user.nombre)}
                          </div>
                          <span className="truncate text-[11px] text-white/70 sm:text-xs">{user.nombre}</span>
                          {isWarningRow && (
                            <span title="Revisar" className="flex shrink-0">
                              <AlertTriangle className={cn("h-3 w-3", selectedMetric === "late_count" ? "text-amber-400" : "text-red-400")} />
                            </span>
                          )}
                        </div>
                      </td>
                      {rangeDays.map((day) => {
                        const dayKey = toDateKey(day)
                        const dayData = workload.get(user.id)?.get(dayKey)
                        const value = dayData?.[selectedMetric].value || 0
                        const isSelected = selectedCell?.userId === user.id && selectedCell?.dayKey === dayKey
                        const tone = getCellTone(selectedMetric, value)

                        return (
                          <td key={dayKey} className="px-1 py-1">
                            <button
                              onClick={() => setSelectedCell(isSelected ? null : { userId: user.id, dayKey })}
                              className={cn(
                                "flex aspect-square min-w-[34px] items-center justify-center rounded-lg border transition-all sm:min-w-[40px]",
                                tone.container,
                                isSelected ? "border-quepia-cyan ring-1 ring-quepia-cyan/30" : "",
                                value > 0 && "cursor-pointer hover:scale-[1.03]"
                              )}
                            >
                              {value > 0 && (
                                <span className={cn("text-[9px] font-medium sm:text-[10px]", tone.text)}>
                                  {selectedMetric === "pending_hours" || selectedMetric === "completed_hours"
                                    ? `${Math.round(value * 10) / 10}h`
                                    : value}
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-2 py-1 text-center">
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            isWarningRow
                              ? selectedMetric === "late_count"
                                ? "text-amber-300"
                                : "text-red-400"
                              : "text-white/55"
                          )}
                        >
                          {formatMetricValue(selectedMetric, total)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-[9px] text-white/30 sm:text-[10px]">
              <span>Intensidad:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-4 w-4 rounded border border-white/[0.05] bg-white/[0.02]" />
                <span>0</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn("h-4 w-4 rounded border", selectedMetric === "late_count" ? "border-amber-400/25 bg-amber-500/18" : "border-cyan-400/20 bg-cyan-500/14")} />
                <span>Media</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn("h-4 w-4 rounded border", selectedMetric === "late_count" ? "border-red-400/35 bg-red-500/22" : "border-green-400/30 bg-green-500/24")} />
                <span>Alta</span>
              </div>
            </div>
          </div>

            <div className="w-full shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 shadow-sm xl:w-80">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/40">
                {selectedCell
                  ? `${users.find((u) => u.id === selectedCell.userId)?.nombre ?? "Usuario"} — ${parseDateKey(selectedCell.dayKey).toLocaleDateString("es-AR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}`
                  : "Detalle diario"}
              </h4>
              <p className="mb-4 text-sm text-white/70">
                {selectedMetricMeta.label}: <span className="font-semibold text-white">{formatMetricValue(selectedMetric, selectedMetricValue)}</span>
              </p>

              {!selectedCell ? (
                <p className="text-sm text-white/35">Seleccioná una celda para ver qué tareas explican ese KPI.</p>
              ) : selectedMetricTasks.length === 0 ? (
                <p className="text-sm text-white/35">No hubo movimientos para esta métrica en esa fecha.</p>
              ) : (
                <div className="space-y-2">
                  {selectedMetricTasks.map((task) => (
                    <button
                      key={`${selectedMetric}-${task.id}`}
                      onClick={() => onTaskClick(task)}
                      className="w-full rounded-xl p-2 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <p className="truncate text-xs text-white/85">{task.titulo}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-white/30">{task.estimated_hours || 1}h</span>
                        {task.project && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[9px]"
                            style={{ backgroundColor: `${task.project.color}20`, color: task.project.color }}
                          >
                            {task.project.nombre}
                          </span>
                        )}
                        {task.due_date && (
                          <span className="text-[10px] text-white/30">
                            Vence {parseDateKey(task.due_date).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                          </span>
                        )}
                        {task.completed_at && (selectedMetric === "completed_count" || selectedMetric === "completed_hours") && (
                          <span className="text-[10px] text-white/30">
                            Cerrada {new Date(task.completed_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-white/32">
            Referencia: “Asignadas” usa la fecha de vencimiento como ancla histórica; “Fuera de término” cuenta tareas vencidas o cerradas después de su fecha.
          </p>
        </div>
      )}
    </div>
  )
}
