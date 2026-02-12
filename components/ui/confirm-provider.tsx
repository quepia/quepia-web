"use client"

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, CheckCircle2, X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

type ConfirmTone = "default" | "danger" | "success"

interface ConfirmOptions {
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    tone?: ConfirmTone
}

interface ConfirmState extends ConfirmOptions {
    open: boolean
}

interface ConfirmContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

const TONE_STYLES: Record<ConfirmTone, string> = {
    default: "bg-white/10 text-white hover:bg-white/20",
    danger: "bg-red-500/80 text-white hover:bg-red-500",
    success: "bg-emerald-500/80 text-white hover:bg-emerald-500",
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const isMounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    )
    const [state, setState] = useState<ConfirmState>({
        open: false,
        title: "",
        description: "",
        confirmText: "Confirmar",
        cancelText: "Cancelar",
        tone: "default",
    })
    const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

    const close = useCallback((value: boolean) => {
        setState((prev) => ({ ...prev, open: false }))
        if (resolver) resolver(value)
        setResolver(null)
    }, [resolver])

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setResolver(() => resolve)
            setState({
                open: true,
                title: options.title,
                description: options.description,
                confirmText: options.confirmText || "Confirmar",
                cancelText: options.cancelText || "Cancelar",
                tone: options.tone || "default",
            })
        })
    }, [])

    const value = useMemo(() => ({ confirm }), [confirm])

    return (
        <ConfirmContext.Provider value={value}>
            {children}
            {isMounted && state.open && createPortal(
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                        onClick={() => close(false)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#111]/95 p-5 shadow-2xl">
                        <button
                            onClick={() => close(false)}
                            className="absolute right-3 top-3 rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                            aria-label="Cerrar"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <div className="mb-4 flex items-start gap-2.5 pr-8">
                            {state.tone === "success" ? (
                                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                            ) : (
                                <AlertTriangle className={cn("mt-0.5 h-5 w-5", state.tone === "danger" ? "text-red-400" : "text-amber-400")} />
                            )}
                            <div>
                                <h3 className="text-base font-semibold text-white">{state.title}</h3>
                                {state.description && (
                                    <p className="mt-1 text-sm text-white/60">{state.description}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => close(false)}
                                className="min-h-10 rounded-xl px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                {state.cancelText}
                            </button>
                            <button
                                onClick={() => close(true)}
                                className={cn(
                                    "min-h-10 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                    TONE_STYLES[state.tone || "default"]
                                )}
                            >
                                {state.confirmText}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </ConfirmContext.Provider>
    )
}

export function useConfirm() {
    const context = useContext(ConfirmContext)
    if (!context) {
        throw new Error("useConfirm must be used within ConfirmProvider")
    }
    return context
}
