"use client"

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ComponentType } from "react"
import { createPortal } from "react-dom"
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

type ToastVariant = "success" | "error" | "warning" | "info"

interface ToastOptions {
    title: string
    description?: string
    variant?: ToastVariant
    duration?: number
}

interface ToastItem extends ToastOptions {
    id: string
}

interface ToastContextValue {
    toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, { icon: ComponentType<{ className?: string }>; className: string }> = {
    success: { icon: CheckCircle2, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
    error: { icon: XCircle, className: "border-red-500/30 bg-red-500/10 text-red-200" },
    warning: { icon: AlertTriangle, className: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
    info: { icon: Info, className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([])
    const isMounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    )

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, [])

    const toast = useCallback((options: ToastOptions) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const item: ToastItem = {
            id,
            variant: options.variant || "info",
            duration: options.duration ?? 3600,
            title: options.title,
            description: options.description,
        }

        setToasts((prev) => [...prev, item])

        window.setTimeout(() => {
            removeToast(id)
        }, item.duration)
    }, [removeToast])

    const value = useMemo(() => ({ toast }), [toast])

    return (
        <ToastContext.Provider value={value}>
            {children}
            {isMounted && toasts.length > 0 && createPortal(
                <div className="pointer-events-none fixed right-3 top-3 z-[120] flex w-[min(420px,calc(100vw-1.5rem))] flex-col gap-2 sm:right-4 sm:top-4">
                    {toasts.map((item) => {
                        const variant = item.variant || "info"
                        const Icon = VARIANT_STYLES[variant].icon
                        return (
                            <div
                                key={item.id}
                                className={cn(
                                    "pointer-events-auto rounded-xl border px-3 py-2.5 shadow-xl backdrop-blur",
                                    VARIANT_STYLES[variant].className
                                )}
                                role="status"
                                aria-live="polite"
                            >
                                <div className="flex items-start gap-2.5">
                                    <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold leading-tight">{item.title}</p>
                                        {item.description && (
                                            <p className="mt-1 text-xs text-white/75">{item.description}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => removeToast(item.id)}
                                        className="rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                                        aria-label="Cerrar"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error("useToast must be used within ToastProvider")
    }
    return context
}
