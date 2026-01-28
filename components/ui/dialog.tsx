"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

const DialogContext = React.createContext<{
    isOpen: boolean
    onClose: () => void
} | null>(null)

interface DialogProps {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    return (
        <DialogContext.Provider value={{ isOpen: !!open, onClose: () => onOpenChange?.(false) }}>
            {children}
        </DialogContext.Provider>
    )
}

export function DialogContent({ children, className }: { children: React.ReactNode, className?: string }) {
    const context = React.useContext(DialogContext)
    if (!context?.isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={context.onClose}
            />

            {/* Content */}
            <div className={cn(
                "relative z-50 w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl transition-all p-6",
                className
            )}>
                <button
                    onClick={context.onClose}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                >
                    <X className="h-4 w-4 text-white" />
                    <span className="sr-only">Close</span>
                </button>
                {children}
            </div>
        </div>
    )
}

export function DialogHeader({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left mb-4", className)}>
            {children}
        </div>
    )
}

export function DialogFooter({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4", className)}>
            {children}
        </div>
    )
}

export function DialogTitle({ className, children }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2 className={cn("text-lg font-semibold leading-none tracking-tight text-white", className)}>
            {children}
        </h2>
    )
}
