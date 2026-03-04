"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
    ChevronLeft,
    ChevronRight,
    Users,
    BarChart3,
    MessageSquare,
    MoreHorizontal,
    Search,
    UserCircle,
    FileText,
    Menu,
    Sun,
    Moon,
    BookOpen,
    Bell,
    Settings,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"

interface TopHeaderProps {
    breadcrumb: string[]
    onOpenClientProfile?: () => void
    onOpenBriefing?: () => void
    onOpenDocs?: () => void
    onOpenSearch?: () => void
    onOpenShare?: () => void
    onOpenInsights?: () => void
    onOpenInbox?: () => void
    onOpenNotifications?: () => void
    onOpenSettings?: () => void
    onMenuClick?: () => void
    theme?: "light" | "dark"
    onToggleTheme?: () => void
    canShare?: boolean
    unreadNotifications?: number
}

export function TopHeader({
    breadcrumb,
    onOpenClientProfile,
    onOpenBriefing,
    onOpenDocs,
    onOpenSearch,
    onOpenShare,
    onOpenInsights,
    onOpenInbox,
    onOpenNotifications,
    onOpenSettings,
    onMenuClick,
    theme = "dark",
    onToggleTheme,
    canShare = false,
    unreadNotifications = 0,
}: TopHeaderProps) {
    const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
    const [desktopMoreOpen, setDesktopMoreOpen] = useState(false)
    const mobileActionsRef = useRef<HTMLDivElement | null>(null)
    const desktopMoreRef = useRef<HTMLDivElement | null>(null)

    const closeMobileActions = useCallback(() => {
        setMobileActionsOpen(false)
    }, [])

    const closeDesktopMore = useCallback(() => {
        setDesktopMoreOpen(false)
    }, [])

    useEffect(() => {
        if (!mobileActionsOpen && !desktopMoreOpen) return

        const handleOutside = (event: MouseEvent) => {
            const target = event.target as Node
            if (mobileActionsOpen && !mobileActionsRef.current?.contains(target)) {
                closeMobileActions()
            }
            if (desktopMoreOpen && !desktopMoreRef.current?.contains(target)) {
                closeDesktopMore()
            }
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeMobileActions()
                closeDesktopMore()
            }
        }

        document.addEventListener("mousedown", handleOutside)
        document.addEventListener("keydown", handleEscape)
        return () => {
            document.removeEventListener("mousedown", handleOutside)
            document.removeEventListener("keydown", handleEscape)
        }
    }, [closeDesktopMore, closeMobileActions, desktopMoreOpen, mobileActionsOpen])

    const headerActionClass =
        "rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"

    const desktopTextActionClass =
        "flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"

    return (
        <header className="flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#0a0a0a]/95 px-3 backdrop-blur-sm sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
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

                <div className="ml-2 flex min-w-0 items-center gap-1 overflow-hidden text-sm text-white/40">
                    {breadcrumb.map((item, i) => (
                        <span
                            key={i}
                            className={i < breadcrumb.length - 2 ? "hidden items-center gap-1 sm:flex" : "flex items-center gap-1"}
                        >
                            {i > 0 && <span className="text-white/20">/</span>}
                            <span className={i === breadcrumb.length - 1 ? "max-w-[140px] truncate text-white/80 sm:max-w-none" : "max-w-[120px] truncate cursor-pointer transition-colors hover:text-white/60 sm:max-w-none"}>
                                {item}
                            </span>
                        </span>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-1">
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

                <div className="hidden items-center gap-1 sm:flex">
                    {onOpenDocs && (
                        <button
                            onClick={onOpenDocs}
                            className={desktopTextActionClass}
                            title="Ayuda de esta pestaña"
                        >
                            <BookOpen className="h-4 w-4" />
                            <span>Ayuda</span>
                        </button>
                    )}
                    {onToggleTheme && (
                        <button
                            onClick={onToggleTheme}
                            className={desktopTextActionClass}
                            title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
                        >
                            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            <span>{theme === "light" ? "Oscuro" : "Claro"}</span>
                        </button>
                    )}
                    {onOpenBriefing && (
                        <button
                            onClick={onOpenBriefing}
                            className={desktopTextActionClass}
                            title="Briefing"
                        >
                            <FileText className="h-4 w-4" />
                            <span>Brief</span>
                        </button>
                    )}
                    {onOpenClientProfile && (
                        <button
                            onClick={onOpenClientProfile}
                            className={desktopTextActionClass}
                            title="Perfil del cliente"
                        >
                            <UserCircle className="h-4 w-4" />
                            <span>Cliente</span>
                        </button>
                    )}
                    <button
                        onClick={onOpenSearch}
                        disabled={!onOpenSearch}
                        className={cn("flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06]", !onOpenSearch && "cursor-not-allowed opacity-40")}
                        title="Buscar"
                    >
                        <Search className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onOpenShare}
                        disabled={!onOpenShare || !canShare}
                        className={cn("flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/50 transition-all duration-200 hover:bg-white/[0.06]", (!onOpenShare || !canShare) && "cursor-not-allowed opacity-40")}
                        title={canShare ? "Compartir proyecto" : "Selecciona un proyecto para compartir"}
                    >
                        <Users className="h-4 w-4" />
                        <span>Compartir</span>
                    </button>
                    <button
                        onClick={onOpenInsights}
                        disabled={!onOpenInsights}
                        className={headerActionClass}
                        title="Dashboard / Reportes"
                    >
                        <BarChart3 className="h-4 w-4 text-white/40" />
                    </button>
                    <button
                        onClick={onOpenInbox}
                        disabled={!onOpenInbox}
                        className={cn("relative rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06]", !onOpenInbox && "cursor-not-allowed opacity-40")}
                        title="Inbox"
                    >
                        <MessageSquare className="h-4 w-4 text-white/40" />
                        {unreadNotifications > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-quepia-cyan" />
                        )}
                    </button>

                    <div className="relative" ref={desktopMoreRef}>
                        <button
                            onClick={() => setDesktopMoreOpen((open) => !open)}
                            className={headerActionClass}
                            title="Más opciones"
                            aria-expanded={desktopMoreOpen}
                            aria-haspopup="menu"
                        >
                            <MoreHorizontal className="h-4 w-4 text-white/40" />
                        </button>

                        {desktopMoreOpen && (
                            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-white/[0.08] bg-[#111]/95 p-1.5 shadow-xl backdrop-blur-sm">
                                <button
                                    onClick={() => { onOpenNotifications?.(); closeDesktopMore() }}
                                    disabled={!onOpenNotifications}
                                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <Bell className="h-4 w-4" />
                                    Notificaciones
                                    {unreadNotifications > 0 && (
                                        <span className="ml-auto rounded-full bg-quepia-cyan/20 px-2 py-0.5 text-[10px] text-quepia-cyan">
                                            {unreadNotifications > 99 ? "99+" : unreadNotifications}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => { onOpenInbox?.(); closeDesktopMore() }}
                                    disabled={!onOpenInbox}
                                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <MessageSquare className="h-4 w-4" />
                                    Inbox
                                </button>
                                <button
                                    onClick={() => { onOpenSettings?.(); closeDesktopMore() }}
                                    disabled={!onOpenSettings}
                                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <Settings className="h-4 w-4" />
                                    Ajustes
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="relative sm:hidden" ref={mobileActionsRef}>
                    <button
                        onClick={() => setMobileActionsOpen((open) => !open)}
                        className="rounded-lg p-2 transition-all duration-200 hover:bg-white/[0.06]"
                        title="Acciones"
                    >
                        <MoreHorizontal className="h-5 w-5 text-white/60" />
                    </button>
                    {mobileActionsOpen && (
                        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-white/[0.08] bg-[#111]/95 py-1 shadow-xl backdrop-blur-sm">
                            {onToggleTheme && (
                                <button
                                    onClick={() => { onToggleTheme(); closeMobileActions() }}
                                    className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
                                >
                                    {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                                    {theme === "light" ? "Modo oscuro" : "Modo claro"}
                                </button>
                            )}
                            {onOpenDocs && (
                                <button
                                    onClick={() => { onOpenDocs(); closeMobileActions() }}
                                    className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
                                >
                                    <BookOpen className="h-4 w-4" />
                                    Ayuda
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
                            <button
                                onClick={() => { onOpenSearch?.(); closeMobileActions() }}
                                disabled={!onOpenSearch}
                                className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Search className="h-4 w-4" />
                                Buscar
                            </button>
                            <button
                                onClick={() => { onOpenShare?.(); closeMobileActions() }}
                                disabled={!onOpenShare || !canShare}
                                className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Users className="h-4 w-4" />
                                Compartir
                            </button>
                            <button
                                onClick={() => { onOpenInsights?.(); closeMobileActions() }}
                                disabled={!onOpenInsights}
                                className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <BarChart3 className="h-4 w-4" />
                                Reportes
                            </button>
                            <button
                                onClick={() => { onOpenInbox?.(); closeMobileActions() }}
                                disabled={!onOpenInbox}
                                className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <MessageSquare className="h-4 w-4" />
                                Inbox
                            </button>
                            <button
                                onClick={() => { onOpenNotifications?.(); closeMobileActions() }}
                                disabled={!onOpenNotifications}
                                className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Bell className="h-4 w-4" />
                                Notificaciones
                                {unreadNotifications > 0 && (
                                    <span className="ml-auto rounded-full bg-quepia-cyan/20 px-2 py-0.5 text-[10px] text-quepia-cyan">
                                        {unreadNotifications > 99 ? "99+" : unreadNotifications}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}

