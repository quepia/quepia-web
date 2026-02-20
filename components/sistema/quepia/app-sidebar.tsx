"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Image from "next/image"
import {
    Plus,
    Search,
    Inbox,
    Calendar,
    CalendarDays,
    LayoutGrid,
    CheckCircle2,
    LayoutDashboard,
    Users,
    ChevronDown,
    ChevronRight,
    Folder,
    Hash,
    Bell,
    Star,
    Loader2,
    MoreHorizontal,
    Pencil,
    Trash2,
    LogOut,
    Settings,
    Book,
    Briefcase,
    Building2,
    Store,
    Globe,
    Laptop,
    Megaphone,
    Camera,
    PenTool,
    Music,
    Video,
    Code,
    Type,
    Calculator,
    Shield,
    FileText,
    CalendarHeart,
    type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useFavorites } from "@/lib/sistema/hooks"
import type { ProjectWithChildren } from "@/types/sistema"

const PROJECT_ICON_MAP: Record<string, LucideIcon> = {
    briefcase: Briefcase,
    "building-2": Building2,
    store: Store,
    globe: Globe,
    laptop: Laptop,
    megaphone: Megaphone,
    camera: Camera,
    "pen-tool": PenTool,
    music: Music,
    video: Video,
    code: Code,
    type: Type,
    folder: Folder,
}

interface AppSidebarProps {
    userId?: string
    userName?: string
    userEmail?: string
    userAvatar?: string | null
    userRole?: string
    activeView: string
    onViewChange: (view: string) => void
    activeProject?: string
    onProjectChange?: (projectId: string) => void
    onAddProject?: () => void
    onEditProject?: (projectId: string) => void
    onDeleteProject?: (projectId: string) => void
    onManageMembers?: (projectId: string) => void
    onSignOut?: () => void
    onOpenSettings?: () => void
    projects: ProjectWithChildren[]
    projectsLoading: boolean
    className?: string
    onClose?: () => void
}

export function AppSidebar({
    userId,
    userName,
    userEmail,
    userAvatar,
    userRole,
    activeView,
    onViewChange,
    activeProject,
    onProjectChange,
    onAddProject,
    onEditProject,
    onDeleteProject,
    onManageMembers,
    onSignOut,
    onOpenSettings,
    projects,
    projectsLoading,
    className,
    onClose
}: AppSidebarProps) {
    const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites(userId)
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null)

    const openContextMenu = useCallback((event: React.MouseEvent, projectId: string) => {
        event.preventDefault()
        event.stopPropagation()

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const menuWidth = 180
        const menuHeight = 176
        const x = Math.min(event.clientX, viewportWidth - menuWidth - 8)
        const y = Math.min(event.clientY, viewportHeight - menuHeight - 8)

        setContextMenu({
            x: Math.max(8, x),
            y: Math.max(8, y),
            projectId,
        })
    }, [])

    useEffect(() => {
        if (!contextMenu) return

        const close = () => setContextMenu(null)
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") close()
        }

        document.addEventListener("click", close)
        document.addEventListener("keydown", handleEscape)
        window.addEventListener("resize", close)

        return () => {
            document.removeEventListener("click", close)
            document.removeEventListener("keydown", handleEscape)
            window.removeEventListener("resize", close)
        }
    }, [contextMenu])

    // Helper to toggle project expansion
    const toggleProjectExpansion = (projectId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation()
        setExpandedProjects((prev) => {
            const next = new Set(prev)
            if (next.has(projectId)) {
                next.delete(projectId)
            } else {
                next.add(projectId)
            }
            return next
        })
    }

    const handleFavoriteToggle = async (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation()
        if (isFavorite(projectId)) {
            await removeFavorite(projectId)
        } else {
            await addFavorite(projectId)
        }
    }

    const renderProject = (project: ProjectWithChildren, depth = 0) => {
        const hasChildren = project.children && project.children.length > 0
        const isExpanded = expandedProjects.has(project.id)
        const isSelected = activeProject === project.id
        const IconComponent = PROJECT_ICON_MAP[project.icon] || Hash

        return (
            <div key={project.id}>
                <div
                    className={cn(
                        "group relative flex w-full items-center gap-2 rounded-lg py-2 text-sm transition-all duration-200 pr-2",
                        isSelected ? "bg-white/[0.08] text-white" : "text-white/60 hover:bg-white/[0.04]"
                    )}
                    style={{ paddingLeft: `${(depth * 12) + 8}px` }}
                    onContextMenu={(e) => openContextMenu(e, project.id)}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => toggleProjectExpansion(project.id, e)}
                            className="rounded p-1 transition-colors duration-200 hover:bg-white/[0.1] shrink-0"
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-3 w-3 text-white/40" />
                            ) : (
                                <ChevronRight className="h-3 w-3 text-white/40" />
                            )}
                        </button>
                    ) : (
                        <div className="w-4 shrink-0" />
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            onProjectChange?.(project.id)
                            onClose?.()
                        }}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left overflow-hidden"
                    >
                        {project.logo_url ? (
                            <img
                                src={project.logo_url}
                                alt=""
                                className="h-4 w-4 rounded-full object-cover shrink-0"
                            />
                        ) : (
                            <IconComponent className="h-3.5 w-3.5 text-white/40 shrink-0" style={{ color: project.color }} />
                        )}
                        <span className="truncate">{project.nombre}</span>
                    </button>

                    {project.task_count !== undefined && project.task_count > 0 && (
                        <span className="text-[11px] text-white/25 shrink-0 tabular-nums">{project.task_count}</span>
                    )}

                    <div className="ml-1 flex items-center">
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                openContextMenu(e, project.id)
                            }}
                            className="rounded p-1 opacity-70 transition-all duration-200 hover:bg-white/[0.1] hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            aria-label={`Más acciones para ${project.nombre}`}
                        >
                            <MoreHorizontal className="h-3 w-3 text-white/40" />
                        </button>
                    </div>
                </div>

                {hasChildren && isExpanded && (
                    <div className="mt-0.5">
                        {project.children!.map(child => renderProject(child, depth + 1))}
                    </div>
                )}
            </div>
        )
    }



    const menuItems = useMemo(() => {
        const items: { id: string; icon: typeof LayoutDashboard; label: string; isAdmin?: boolean }[] = [
            { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
            { id: "search", icon: Search, label: "Buscar" },
            { id: "inbox", icon: Inbox, label: "Inbox" },
            { id: "today", icon: Calendar, label: "Hoy" },
            { id: "upcoming", icon: CalendarDays, label: "Próximo" },
            { id: "calendar", icon: CalendarDays, label: "Calendario" },
            { id: "workload", icon: Users, label: "Carga" },
            { id: "filters", icon: LayoutGrid, label: "Filtros" },
            { id: "completed", icon: CheckCircle2, label: "Completado" },
            { id: "portfolio", icon: Folder, label: "Portafolios" },
        ]

        if (userRole === "admin") {
            items.push(
                { id: "crm", icon: Briefcase, label: "CRM", isAdmin: true },
                { id: "proposals", icon: FileText, label: "Propuestas", isAdmin: true },
                { id: "efemerides", icon: CalendarHeart, label: "Efemérides", isAdmin: true },
                { id: "accounting", icon: Calculator, label: "Contabilidad", isAdmin: true },
                { id: "admin-users", icon: Users, label: "Usuarios", isAdmin: true },
                { id: "admin-projects", icon: Folder, label: "Portfolio", isAdmin: true },
                { id: "admin-services", icon: CheckCircle2, label: "Servicios", isAdmin: true },
                { id: "admin-team", icon: Users, label: "Equipo", isAdmin: true },
                { id: "admin-config", icon: Settings, label: "Configuración", isAdmin: true }
            )
        }

        return items
    }, [userRole])

    return (
        <aside className={cn("flex h-[100svh] w-[84vw] max-w-[340px] flex-col border-r border-white/[0.06] bg-[#0d0d0d]/95 shadow-xl sm:w-[272px]", className)}>
            {/* Header */}
            <div className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 relative bg-white/10">
                        {userAvatar ? (
                            <Image
                                src={userAvatar}
                                alt={userName || "Usuario"}
                                fill
                                className="object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/50 text-xs font-medium">
                                {userName?.charAt(0).toUpperCase() || "U"}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="font-semibold text-white text-sm truncate" title={userName || "Usuario"}>
                            {userName || "Usuario"}
                        </span>
                        {userEmail && (
                            <span className="text-[10px] text-white/40 truncate" title={userEmail}>
                                {userEmail}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={onOpenSettings}
                        className="rounded-md p-2 transition-all duration-200 hover:bg-white/[0.06]"
                        title="Configuración"
                    >
                        <Settings className="h-4 w-4 text-white/40" />
                    </button>
                    <button
                        onClick={() => onViewChange("docs")}
                        className={cn(
                            "rounded-md p-2 transition-all duration-200 hover:bg-white/[0.06]",
                            activeView === "docs" ? "bg-white/[0.1] text-quepia-cyan" : ""
                        )}
                        title="Documentación"
                    >
                        <Book className={cn("h-4 w-4", activeView === "docs" ? "text-quepia-cyan" : "text-white/40")} />
                    </button>
                    <button
                        onClick={() => onViewChange("inbox")}
                        className={cn(
                            "rounded-md p-2 transition-all duration-200 hover:bg-white/[0.06]",
                            activeView === "inbox" ? "bg-white/[0.1] text-quepia-cyan" : ""
                        )}
                    >
                        <Bell className={cn("h-4 w-4", activeView === "inbox" ? "text-quepia-cyan" : "text-white/40")} />
                    </button>
                    {onSignOut && (
                        <button onClick={onSignOut} className="rounded-md p-2 transition-all duration-200 hover:bg-white/[0.06]" title="Cerrar sesión">
                            <LogOut className="h-4 w-4 text-white/40" />
                        </button>
                    )}
                </div>
            </div>

            <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-8"
                style={{ WebkitOverflowScrolling: "touch" }}
            >
                {/* Main Menu */}
                <nav className="px-2 space-y-0.5 mb-4">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={cn(
                                "min-h-11 w-full rounded-lg px-3 py-2 text-sm transition-all duration-200 flex items-center gap-3",
                                activeView === item.id
                                    ? item.isAdmin
                                        ? "bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent text-white shadow-[inset_2px_0_0_0_rgba(251,191,36,0.5)]"
                                        : "bg-white/[0.08] text-white"
                                    : item.isAdmin
                                        ? "bg-gradient-to-r from-amber-500/[0.08] to-transparent text-white/60 hover:from-amber-500/[0.15] hover:via-amber-500/[0.05] hover:to-transparent hover:text-white/80 hover:shadow-[inset_2px_0_0_0_rgba(251,191,36,0.3)]"
                                        : "text-white/60 hover:bg-white/[0.04] hover:text-white/80"
                            )}
                        >
                            <item.icon className={cn(
                                "h-4 w-4",
                                activeView === item.id
                                    ? item.isAdmin ? "text-amber-400" : "text-quepia-cyan"
                                    : "text-white/40"
                            )} />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.isAdmin && (
                                <Shield className="h-3 w-3 text-amber-500/50" />
                            )}
                        </button>
                    ))}
                </nav>

                {/* Favorites Section */}
                {favorites.length > 0 && (
                    <div className="px-3 mb-4">
                        <h3 className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-1.5 px-2">
                            Favoritos
                        </h3>
                        <div className="space-y-0.5">
                            {favorites.map((fav) => (
                                <button
                                    key={fav.id}
                                    type="button"
                                    onClick={() => onProjectChange?.(fav.id)}
                                    className={cn(
                                        "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-all duration-200 hover:bg-white/[0.04]",
                                        activeProject === fav.id ? "bg-white/[0.08] text-white" : "text-white/60"
                                    )}
                                >
                                    <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                                    <span className="truncate flex-1 text-left">{fav.nombre}</span>
                                    {fav.task_count !== undefined && fav.task_count > 0 && (
                                        <span className="text-[11px] text-white/25">{fav.task_count}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* My Projects Section */}
                <div className="px-3">
                    <div className="flex items-center justify-between mb-1.5 px-2">
                        <h3 className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">
                            Proyectos
                        </h3>
                        {onAddProject && (
                            <button onClick={onAddProject} className="rounded p-1 transition-all duration-200 hover:bg-white/[0.06]">
                                <Plus className="h-3.5 w-3.5 text-white/30" />
                            </button>
                        )}
                    </div>

                    {projectsLoading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-6">
                            <p className="text-xs text-white/30 mb-2">Sin proyectos</p>
                            {onAddProject && (
                                <button onClick={onAddProject} className="text-xs text-quepia-cyan hover:underline">
                                    Crear primer proyecto
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {projects.map(project => renderProject(project))}
                        </div>
                    )}
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-[#1a1a1a] border border-white/[0.08] rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        onClick={() => { onEditProject?.(contextMenu.projectId); setContextMenu(null) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar proyecto
                    </button>
                    <button
                        onClick={() => { onManageMembers?.(contextMenu.projectId); setContextMenu(null) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                    >
                        <Users className="h-3.5 w-3.5" />
                        Miembros
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            handleFavoriteToggle(e, contextMenu.projectId)
                            setContextMenu(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                    >
                        <Star className={cn("h-3.5 w-3.5", isFavorite(contextMenu.projectId) ? "text-yellow-400 fill-yellow-400" : "")} />
                        {isFavorite(contextMenu.projectId) ? "Quitar de favoritos" : "Agregar a favoritos"}
                    </button>
                    <div className="border-t border-white/[0.06] my-1" />
                    <button
                        onClick={() => {
                            if (confirm("¿Eliminar este proyecto y todas sus tareas?")) {
                                onDeleteProject?.(contextMenu.projectId)
                            }
                            setContextMenu(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar proyecto
                    </button>
                </div>
            )}
        </aside>
    )
}
