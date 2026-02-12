"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ChevronLeft, ChevronRight, Users, BarChart3, MessageSquare, MoreHorizontal, Search, UserCircle, FileText, Menu, Sun, Moon } from "lucide-react"

interface TopHeaderProps {
    breadcrumb: string[]
    onOpenClientProfile?: () => void
    onOpenBriefing?: () => void
    onMenuClick?: () => void
    theme?: "light" | "dark"
    onToggleTheme?: () => void
}

export function TopHeader({ breadcrumb, onOpenClientProfile, onOpenBriefing, onMenuClick, theme = "dark", onToggleTheme }: TopHeaderProps) {
    const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
    const actionsRef = useRef<HTMLDivElement | null>(null)

    const closeMobileActions = useCallback(() => {
        setMobileActionsOpen(false)
    }, [])

    useEffect(() => {
        if (!mobileActionsOpen) return
        const handleOutside = (event: MouseEvent) => {
            if (!actionsRef.current?.contains(event.target as Node)) {
                closeMobileActions()
            }
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeMobileActions()
            }
        }
        document.addEventListener("mousedown", handleOutside)
        document.addEventListener("keydown", handleEscape)
        return () => {
            document.removeEventListener("mousedown", handleOutside)
            document.removeEventListener("keydown", handleEscape)
        }
    }, [closeMobileActions, mobileActionsOpen])

    return (
        <header className="flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#0a0a0a]/95 px-3 backdrop-blur-sm sm:px-4">
            {/* Left: Navigation */}
            <div className="flex items-center gap-2 min-w-0">
                {/* Mobile Menu Button */}
                <button
                    onClick={onMenuClick}
                    className="mr-1 rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06] md:hidden"
                    aria-label="Abrir menú"
                >
                    <Menu className="h-5 w-5 text-white/60" />
                </button>

                <button className="hidden rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06] md:block" aria-label="Anterior">
                    <ChevronLeft className="h-4 w-4 text-white/40" />
                </button>
                <button className="hidden rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06] sm:inline-flex" aria-label="Siguiente">
                    <ChevronRight className="h-4 w-4 text-white/40" />
                </button>

                <div className="flex items-center gap-1 text-sm text-white/40 ml-2 min-w-0 overflow-hidden">
                    {breadcrumb.map((item, i) => (
                        <span
                            key={i}
                            className={i < breadcrumb.length - 2 ? "hidden sm:flex items-center gap-1" : "flex items-center gap-1"}
                        >
                            {i > 0 && <span className="text-white/20">/</span>}
                            <span className={i === breadcrumb.length - 1 ? "text-white/80 truncate max-w-[140px] sm:max-w-none" : "hover:text-white/60 cursor-pointer transition-colors truncate max-w-[120px] sm:max-w-none"}>
                                {item}
                            </span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
                {/* Mobile: Direct theme toggle button (always visible) */}
                {onToggleTheme && (
                    <button
                        onClick={onToggleTheme}
                        className="rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06] sm:hidden"
                        title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
                    >
                        {theme === "light" ? (
                            <Moon className="h-5 w-5 text-slate-600" />
                        ) : (
                            <Sun className="h-5 w-5 text-white/60" />
                        )}
                    </button>
                )}

                <div className="hidden sm:flex items-center gap-1">
                    {onToggleTheme && (
                        <button
                            onClick={onToggleTheme}
                            className="flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06]"
                            title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
                        >
                            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            <span>{theme === "light" ? "Oscuro" : "Claro"}</span>
                        </button>
                    )}
                    {onOpenBriefing && (
                        <button
                            onClick={onOpenBriefing}
                            className="flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06]"
                            title="Briefing"
                        >
                            <FileText className="h-4 w-4" />
                            <span>Brief</span>
                        </button>
                    )}
                    {onOpenClientProfile && (
                        <button
                            onClick={onOpenClientProfile}
                            className="flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06]"
                            title="Perfil del cliente"
                        >
                            <UserCircle className="h-4 w-4" />
                            <span>Cliente</span>
                        </button>
                    )}
                    <button className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06]">
                        <Search className="h-4 w-4" />
                    </button>
                    <button className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06]">
                        <Users className="h-4 w-4" />
                        <span>Compartir</span>
                    </button>
                    <button className="rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06]">
                        <BarChart3 className="h-4 w-4 text-white/40" />
                    </button>
                    <button className="relative rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06]">
                        <MessageSquare className="h-4 w-4 text-white/40" />
                    </button>
                    <button className="rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06]">
                        <MoreHorizontal className="h-4 w-4 text-white/40" />
                    </button>
                </div>

                {/* Mobile actions menu */}
                <div className="sm:hidden relative" ref={actionsRef}>
                    <button
                        onClick={() => setMobileActionsOpen((open) => !open)}
                        className="rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06]"
                        title="Acciones"
                    >
                        <MoreHorizontal className="h-5 w-5 text-white/60" />
                    </button>
                    {mobileActionsOpen && (
                        <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-white/[0.08] bg-[#111]/95 py-1 shadow-xl backdrop-blur-sm">
                            {onToggleTheme && (
                                <button
                                    onClick={() => { onToggleTheme(); closeMobileActions() }}
                                    className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
                                >
                                    {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                                    {theme === "light" ? "Modo oscuro" : "Modo claro"}
                                </button>
                            )}
                            {onOpenBriefing && (
                                <button
                                    onClick={() => { onOpenBriefing(); closeMobileActions() }}
                                    className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
                                >
                                    <FileText className="h-4 w-4" />
                                    Brief
                                </button>
                            )}
                            {onOpenClientProfile && (
                                <button
                                    onClick={() => { onOpenClientProfile(); closeMobileActions() }}
                                    className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
                                >
                                    <UserCircle className="h-4 w-4" />
                                    Cliente
                                </button>
                            )}
                            <button className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]">
                                <Search className="h-4 w-4" />
                                Buscar
                            </button>
                            <button className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]">
                                <Users className="h-4 w-4" />
                                Compartir
                            </button>
                            <button className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]">
                                <BarChart3 className="h-4 w-4" />
                                Reportes
                            </button>
                            <button className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]">
                                <MessageSquare className="h-4 w-4" />
                                Mensajes
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
