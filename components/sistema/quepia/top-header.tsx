"use client"

import { useEffect, useRef, useState } from "react"
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

    useEffect(() => {
        if (!mobileActionsOpen) return
        const handleOutside = (event: MouseEvent) => {
            if (!actionsRef.current?.contains(event.target as Node)) {
                setMobileActionsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleOutside)
        return () => document.removeEventListener("mousedown", handleOutside)
    }, [mobileActionsOpen])

    return (
        <header className="h-12 sm:h-14 border-b border-white/[0.06] bg-[#0a0a0a] flex items-center justify-between px-3 sm:px-4">
            {/* Left: Navigation */}
            <div className="flex items-center gap-2 min-w-0">
                {/* Mobile Menu Button */}
                <button
                    onClick={onMenuClick}
                    className="md:hidden p-1.5 hover:bg-white/[0.06] rounded-md transition-colors mr-1"
                >
                    <Menu className="h-4 w-4 text-white/60" />
                </button>

                <button className="hidden md:block p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                    <ChevronLeft className="h-4 w-4 text-white/40" />
                </button>
                <button className="hidden sm:inline-flex p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
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
                <div className="hidden sm:flex items-center gap-1">
                    {onToggleTheme && (
                        <button
                            onClick={onToggleTheme}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors"
                            title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
                        >
                            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            <span>{theme === "light" ? "Oscuro" : "Claro"}</span>
                        </button>
                    )}
                    {onOpenBriefing && (
                        <button
                            onClick={onOpenBriefing}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors"
                            title="Briefing"
                        >
                            <FileText className="h-4 w-4" />
                            <span>Brief</span>
                        </button>
                    )}
                    {onOpenClientProfile && (
                        <button
                            onClick={onOpenClientProfile}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors"
                            title="Perfil del cliente"
                        >
                            <UserCircle className="h-4 w-4" />
                            <span>Cliente</span>
                        </button>
                    )}
                    <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors">
                        <Search className="h-4 w-4" />
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors">
                        <Users className="h-4 w-4" />
                        <span>Compartir</span>
                    </button>
                    <button className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                        <BarChart3 className="h-4 w-4 text-white/40" />
                    </button>
                    <button className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors relative">
                        <MessageSquare className="h-4 w-4 text-white/40" />
                    </button>
                    <button className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                        <MoreHorizontal className="h-4 w-4 text-white/40" />
                    </button>
                </div>

                {/* Mobile actions menu */}
                <div className="sm:hidden relative" ref={actionsRef}>
                    <button
                        onClick={() => setMobileActionsOpen((open) => !open)}
                        className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors"
                        title="Acciones"
                    >
                        <MoreHorizontal className="h-4 w-4 text-white/60" />
                    </button>
                    {mobileActionsOpen && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-[#111] border border-white/[0.08] rounded-lg shadow-xl py-1 z-50">
                            {onToggleTheme && (
                                <button
                                    onClick={() => { onToggleTheme(); setMobileActionsOpen(false) }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                                >
                                    {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                                    {theme === "light" ? "Modo oscuro" : "Modo claro"}
                                </button>
                            )}
                            {onOpenBriefing && (
                                <button
                                    onClick={() => { onOpenBriefing(); setMobileActionsOpen(false) }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                                >
                                    <FileText className="h-4 w-4" />
                                    Brief
                                </button>
                            )}
                            {onOpenClientProfile && (
                                <button
                                    onClick={() => { onOpenClientProfile(); setMobileActionsOpen(false) }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                                >
                                    <UserCircle className="h-4 w-4" />
                                    Cliente
                                </button>
                            )}
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors">
                                <Search className="h-4 w-4" />
                                Buscar
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors">
                                <Users className="h-4 w-4" />
                                Compartir
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors">
                                <BarChart3 className="h-4 w-4" />
                                Reportes
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors">
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
