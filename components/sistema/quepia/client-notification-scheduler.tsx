"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Bell, CalendarPlus, CheckCircle2, Clock3, Loader2, Send, X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import {
  cancelClientTelegramNotification,
  getTaskClientNotificationSchedules,
  scheduleClientTelegramNotification,
} from "@/lib/sistema/actions/notifications"
import { useToast } from "@/components/ui/toast-provider"
import type { AssetWithVersions, ClientNotificationSchedule, ClientNotificationScheduleStatus } from "@/types/sistema"

interface ClientNotificationSchedulerProps {
  taskId: string
  projectId: string
  userId: string
  assets: AssetWithVersions[]
}

const STATUS_LABELS: Record<ClientNotificationScheduleStatus, string> = {
  pending: "Pendiente",
  processing: "En proceso",
  sent: "Enviado",
  failed: "Fallido",
  cancelled: "Cancelado",
}

const STATUS_STYLES: Record<ClientNotificationScheduleStatus, string> = {
  pending: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
  processing: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  sent: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  failed: "border-red-400/25 bg-red-400/10 text-red-200",
  cancelled: "border-white/10 bg-white/[0.03] text-white/35",
}

function toDatetimeLocalValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function getDefaultScheduledValue() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(10, 0, 0, 0)
  return toDatetimeLocalValue(date)
}

function formatScheduleDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Fecha invalida"

  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getEligibleAssetIds(assets: AssetWithVersions[]) {
  return Array.from(
    new Set(
      assets
        .filter((asset) => !asset.access_revoked && (asset.versions?.length || 0) > 0)
        .map((asset) => asset.id)
    )
  )
}

export function ClientNotificationScheduler({ taskId, projectId, userId, assets }: ClientNotificationSchedulerProps) {
  const { toast } = useToast()
  const [schedules, setSchedules] = useState<ClientNotificationSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(getDefaultScheduledValue)
  const [saving, setSaving] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const eligibleAssetIds = useMemo(() => getEligibleAssetIds(assets), [assets])
  const minScheduledAt = useMemo(() => toDatetimeLocalValue(new Date()), [])

  const pendingSchedules = useMemo(
    () =>
      schedules
        .filter((schedule) => schedule.status === "pending")
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [schedules]
  )

  const latestCompletedSchedule = useMemo(
    () => schedules.find((schedule) => schedule.status === "sent" || schedule.status === "failed") || null,
    [schedules]
  )

  const nextSchedule = pendingSchedules[0] || null

  const loadSchedules = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const result = await getTaskClientNotificationSchedules({ taskId, limit: 8 })
      if (result.success) {
        setSchedules(result.schedules)
      }
    } catch (error) {
      console.error("Error loading scheduled client notifications:", error)
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void loadSchedules()
  }, [loadSchedules])

  const handleSchedule = async () => {
    const scheduledDate = new Date(scheduledAt)

    if (eligibleAssetIds.length === 0) {
      toast({
        title: "No hay assets para programar",
        description: "Subi al menos un asset con version disponible.",
        variant: "warning",
      })
      return
    }

    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      toast({
        title: "Fecha invalida",
        description: "Elegí una fecha y hora futuras.",
        variant: "warning",
      })
      return
    }

    setSaving(true)
    try {
      const result = await scheduleClientTelegramNotification({
        projectId,
        taskId,
        actorUserId: userId,
        assetIds: eligibleAssetIds,
        scheduledAt: scheduledDate.toISOString(),
      })

      if (!result.success) {
        toast({
          title: "No se pudo programar",
          description: result.error || "Ocurrio un error inesperado.",
          variant: "error",
        })
        return
      }

      toast({
        title: "Aviso programado",
        description: `${eligibleAssetIds.length} asset(s) para ${formatScheduleDate(result.schedule?.scheduled_at || scheduledDate.toISOString())}.`,
        variant: "success",
      })
      setShowForm(false)
      setScheduledAt(getDefaultScheduledValue())
      await loadSchedules()
    } catch (error) {
      toast({
        title: "No se pudo programar",
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
        variant: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (scheduleId: string) => {
    if (!confirm("¿Cancelar este aviso programado?")) return

    setCancellingId(scheduleId)
    try {
      const result = await cancelClientTelegramNotification({ scheduleId, actorUserId: userId })

      if (!result.success) {
        toast({
          title: "No se pudo cancelar",
          description: result.error || "El aviso ya no esta pendiente.",
          variant: "error",
        })
        return
      }

      toast({
        title: "Aviso cancelado",
        variant: "success",
      })
      await loadSchedules()
    } catch (error) {
      toast({
        title: "No se pudo cancelar",
        description: error instanceof Error ? error.message : "Ocurrio un error inesperado.",
        variant: "error",
      })
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10">
            <Bell className="h-4 w-4 text-cyan-200" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/80">Telegram para WhatsApp</p>
            <p className="truncate text-[11px] text-white/35">
              {loading
                ? "Cargando..."
                : nextSchedule
                  ? `Proximo ${formatScheduleDate(nextSchedule.scheduled_at)}`
                  : "Sin avisos programados"}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowForm((value) => !value)}
          disabled={eligibleAssetIds.length === 0}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
            eligibleAssetIds.length === 0
              ? "cursor-not-allowed border-white/10 text-white/25"
              : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15"
          )}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Programar
        </button>
      </div>

      {showForm && (
        <div className="mt-3 grid gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-white/35">
              Fecha y hora
            </span>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={minScheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white outline-none [color-scheme:dark] focus:border-quepia-cyan"
            />
          </label>
          <button
            onClick={handleSchedule}
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-quepia-cyan px-3 py-2 text-xs font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Guardar
          </button>
          <button
            onClick={() => setShowForm(false)}
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Cerrar
          </button>
          <p className="text-[10px] text-white/30 sm:col-span-3">
            {eligibleAssetIds.length} asset(s) disponibles para Telegram.
          </p>
        </div>
      )}

      {pendingSchedules.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {pendingSchedules.slice(0, 3).map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/10 px-2.5 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Clock3 className="h-3.5 w-3.5 shrink-0 text-cyan-200/70" />
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-white/70">{formatScheduleDate(schedule.scheduled_at)}</p>
                  <p className="text-[10px] text-white/30">{schedule.asset_ids.length} asset(s)</p>
                </div>
              </div>
              <button
                onClick={() => void handleCancel(schedule.id)}
                disabled={cancellingId === schedule.id}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
                title="Cancelar aviso"
                aria-label="Cancelar aviso programado"
              >
                {cancellingId === schedule.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {latestCompletedSchedule && pendingSchedules.length === 0 && (
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
            STATUS_STYLES[latestCompletedSchedule.status]
          )}
        >
          {latestCompletedSchedule.status === "sent" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p>
              {STATUS_LABELS[latestCompletedSchedule.status]} · {formatScheduleDate(latestCompletedSchedule.scheduled_at)}
            </p>
            {latestCompletedSchedule.error_message && (
              <p className="mt-1 truncate text-white/55">{latestCompletedSchedule.error_message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
