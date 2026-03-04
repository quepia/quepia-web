"use client"

import { Bell, CheckCheck, Loader2 } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { SistemaNotification } from "@/lib/sistema/hooks/useNotifications"

interface NotificationsPanelProps {
    isOpen: boolean
    onClose: () => void
    notifications: SistemaNotification[]
    loading: boolean
    unreadCount: number
    onMarkAsRead: (notificationId: string) => void | Promise<void>
    onMarkAllAsRead: () => void | Promise<void>
    onOpenSettings: () => void
    onNotificationClick: (notification: SistemaNotification) => void
}

function formatRelativeTime(dateIso: string) {
    const now = Date.now()
    const date = new Date(dateIso).getTime()
    const diffMs = date - now

    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    const week = 7 * day

    const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" })

    if (Math.abs(diffMs) < hour) return rtf.format(Math.round(diffMs / minute), "minute")
    if (Math.abs(diffMs) < day) return rtf.format(Math.round(diffMs / hour), "hour")
    if (Math.abs(diffMs) < week) return rtf.format(Math.round(diffMs / day), "day")
    return new Date(dateIso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
}

export function NotificationsPanel({
    isOpen,
    onClose,
    notifications,
    loading,
    unreadCount,
    onMarkAsRead,
    onMarkAllAsRead,
    onOpenSettings,
    onNotificationClick,
}: NotificationsPanelProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 h-[100svh] w-full overflow-hidden rounded-t-2xl border-0 border-white/10 bg-[#1a1a1a]/95 shadow-2xl sm:h-auto sm:max-h-[80vh] sm:max-w-lg sm:rounded-2xl sm:border">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-3">
                        <div className="relative rounded-lg bg-quepia-cyan/10 p-2 text-quepia-cyan">
                            <Bell className="h-4 w-4" />
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-quepia-cyan px-1 text-[10px] font-semibold text-[#042423]">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                            )}
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-white">Notificaciones</h2>
                            <p className="text-xs text-white/45">
                                {unreadCount > 0 ? `${unreadCount} sin leer` : "Todo al día"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onOpenSettings}
                            className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white"
                        >
                            Ajustes
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>

                <div className="flex h-[calc(100%-57px)] flex-col">
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 sm:px-5">
                        <p className="text-xs text-white/40">Últimas {notifications.length} notificaciones</p>
                        <button
                            onClick={onMarkAllAsRead}
                            disabled={unreadCount === 0}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Marcar todas
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
                        {loading && (
                            <div className="flex h-44 items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                            </div>
                        )}

                        {!loading && notifications.length === 0 && (
                            <div className="flex h-44 flex-col items-center justify-center text-center">
                                <Bell className="mb-3 h-10 w-10 text-white/15" />
                                <p className="text-sm font-medium text-white/60">Sin notificaciones</p>
                                <p className="mt-1 text-xs text-white/40">Cuando haya novedades, las verás acá.</p>
                            </div>
                        )}

                        {!loading && notifications.length > 0 && (
                            <div className="space-y-1.5">
                                {notifications.map((notification) => (
                                    <button
                                        key={notification.id}
                                        type="button"
                                        onClick={async () => {
                                            if (!notification.read) {
                                                await onMarkAsRead(notification.id)
                                            }
                                            onNotificationClick(notification)
                                        }}
                                        className={cn(
                                            "w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                                            notification.read
                                                ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]"
                                                : "border-quepia-cyan/35 bg-quepia-cyan/[0.08] hover:bg-quepia-cyan/[0.14]"
                                        )}
                                    >
                                        <div className="mb-1 flex items-start justify-between gap-3">
                                            <p className={cn("text-sm font-medium", notification.read ? "text-white/80" : "text-white")}>
                                                {notification.title}
                                            </p>
                                            <span className="shrink-0 pt-0.5 text-[11px] text-white/45">
                                                {formatRelativeTime(notification.created_at)}
                                            </span>
                                        </div>
                                        {notification.content && (
                                            <p className="line-clamp-2 text-xs text-white/55">
                                                {notification.content}
                                            </p>
                                        )}
                                        {!notification.read && (
                                            <div className="mt-2 flex items-center gap-1 text-[11px] text-quepia-cyan">
                                                <span className="h-1.5 w-1.5 rounded-full bg-quepia-cyan" />
                                                Nueva
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
