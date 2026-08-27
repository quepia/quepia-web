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
    PanelLeftClose,
    PanelLeftOpen,
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

const GROUPS_STORAGE_KEY = "quepia:sistema:sidebar-groups"

interface NavItem {
    id: string
    icon: LucideIcon
    label: string
}

interface NavGroup {
    id: string
    label: string
    icon: LucideIcon
    items: NavItem[]
    isAdmin?: boolean
}

/** Accesos que se usan a diario: siempre visibles, sin agrupar. */
const PRIMARY_ITEMS: NavItem[] = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "inbox", icon: Inbox, label: "Inbox" },
    { id: "today", icon: Calendar, label: "Hoy" },
]

const PLANNING_GROUP: NavGroup = {
    id: "planning",
    label: "Planificación",
    icon: CalendarDays,
    items: [
        { id: "upcoming", icon: CalendarDays, label: "Próximo" },
        { id: "calendar", icon: Calendar, label: "Calendario" },
        { id: "workload", icon: Users, label: "Carga" },
        { id: "filters", icon: LayoutGrid, label: "Filtros" },
        { id: "completed", icon: CheckCircle2, label: "Completado" },
        { id: "portfolio", icon: Folder, label: "Portafolios" },
    ],
}

const BUSINESS_GROUP: NavGroup = {
    id: "business",
    label: "Negocio",
    icon: Briefcase,
    isAdmin: true,
    items: [
        { id: "crm", icon: Briefcase, label: "CRM" },
        { id: "proposals", icon: FileText, label: "Propuestas" },
        { id: "accounting", icon: Calculator, label: "Contabilidad" },
        { id: "efemerides", icon: CalendarHeart, label: "Efemérides" },
    ],
}

const ADMIN_GROUP: NavGroup = {
    id: "admin",
    label: "Administración",
    icon: Shield,
    isAdmin: true,
    items: [
        { id: "admin-users", icon: Users, label: "Usuarios" },
        { id: "admin-projects", icon: Folder, label: "Portfolio" },
        { id: "admin-services", icon: CheckCircle2, label: "Servicios" },
        { id: "admin-team", icon: Users, label: "Equipo" },
        { id: "admin-config", icon: Settings, label: "Configuración" },
    ],
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
    onOpenNotifications?: () => void
    unreadNotifications?: number
    projects: ProjectWithChildren[]
    projectsLoading: boolean
    className?: string
    onClose?: () => void
    collapsed?: boolean
    onToggleCollapse?: () => void
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
    onOpenNotifications,
    unreadNotifications = 0,
    projects,
    projectsLoading,
    className,
    onClose,
    collapsed = false,
    onToggleCollapse,
}: AppSidebarProps) {
    const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites(userId)
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null)
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
    const [avatarFailed, setAvatarFailed] = useState(false)

    // Una URL nueva merece otro intento aunque la anterior haya fallado.
    useEffect(() => {
        setAvatarFailed(false)
    }, [userAvatar])

    const avatarNode = (
        <div
            className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-white/10"
            title={userName || "Usuario"}
        >
            {userAvatar && !avatarFailed ? (
                <Image
                    src={userAvatar}
                    alt={userName || "Usuario"}
                    fill
                    sizes="28px"
                    className="object-cover"
                    onError={() => setAvatarFailed(true)}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-white/50">
                    {userName?.charAt(0).toUpperCase() || "U"}
                </div>
            )}
        </div>
    )

    const groups = useMemo(() => {
        const list: NavGroup[] = [PLANNING_GROUP]
        if (userRole === "admin") {
            list.push(BUSINESS_GROUP, ADMIN_GROUP)
        }
        return list
    }, [userRole])

    const groupOfView = useCallback(
        (view: string) => groups.find((group) => group.items.some((item) => item.id === view))?.id,
        [groups]
    )

    // Preferencia de grupos desplegados (persistida entre sesiones).
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY)
            if (raw) setOpenGroups(JSON.parse(raw) as Record<string, boolean>)
        } catch {
            // preferencia corrupta: se ignora y se usa el estado por defecto
        }
    }, [])

    const setGroupOpen = useCallback((groupId: string, open: boolean) => {
        setOpenGroups((prev) => {
            if (prev[groupId] === open) return prev
            const next = { ...prev, [groupId]: open }
            if (typeof window !== "undefined") {
                try {
                    window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next))
                } catch {
                    // almacenamiento no disponible: la preferencia solo dura la sesión
                }
            }
            return next
        })
    }, [])

    // Si la vista activa vive dentro de un grupo plegado, lo abrimos.
    useEffect(() => {
        const groupId = groupOfView(activeView)
        if (groupId) setGroupOpen(groupId, true)
    }, [activeView, groupOfView, setGroupOpen])

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

    const handleGroupClick = (group: NavGroup) => {
        if (collapsed) {
            // En modo franja el grupo no cabe: expandimos la barra y lo abrimos.
            onToggleCollapse?.()
            setGroupOpen(group.id, true)
            return
        }
        setGroupOpen(group.id, !openGroups[group.id])
    }

    const iconButtonClass =
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/70"

    const renderNavItem = (item: NavItem, options?: { isAdmin?: boolean; nested?: boolean }) => {
        const isActive = activeView === item.id
        const isAdmin = options?.isAdmin

        if (collapsed) {
            return (
                <button
                    key={item.id}
                    onClick={() => onViewChange(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                        "mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150",
                        isActive
                            ? isAdmin
                                ? "bg-amber-400/15 text-amber-300"
                                : "bg-white/[0.08] text-quepia-cyan"
                            : "text-white/45 hover:bg-white/[0.05] hover:text-white/80"
                    )}
                >
                    <item.icon className="h-[18px] w-[18px]" />
                </button>
            )
        }

        return (
            <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                    "flex h-9 w-full items-center gap-2.5 rounded-lg pr-2 text-[13px] transition-colors duration-150 md:h-8",
                    options?.nested ? "pl-7" : "pl-2.5",
                    isActive
                        ? isAdmin
                            ? "bg-amber-400/10 text-white shadow-[inset_2px_0_0_0_rgba(251,191,36,0.55)]"
                            : "bg-white/[0.07] text-white"
                        : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
                )}
            >
                <item.icon
                    className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? (isAdmin ? "text-amber-300" : "text-quepia-cyan") : "text-white/35"
                    )}
                />
                <span className="truncate text-left">{item.label}</span>
            </button>
        )
    }

    const renderGroup = (group: NavGroup) => {
        const isOpen = Boolean(openGroups[group.id])
        const hasActiveItem = group.items.some((item) => item.id === activeView)

        if (collapsed) {
            return (
                <button
                    key={group.id}
                    onClick={() => handleGroupClick(group)}
                    title={group.label}
                    aria-label={`Abrir ${group.label}`}
                    className={cn(
                        "mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150",
                        hasActiveItem
                            ? group.isAdmin
                                ? "bg-amber-400/15 text-amber-300"
                                : "bg-white/[0.08] text-quepia-cyan"
                            : "text-white/45 hover:bg-white/[0.05] hover:text-white/80"
                    )}
                >
                    <group.icon className="h-[18px] w-[18px]" />
                </button>
            )
        }

        return (
            <div key={group.id}>
                <button
                    onClick={() => handleGroupClick(group)}
                    aria-expanded={isOpen}
                    className={cn(
                        "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-white/[0.04]",
                        hasActiveItem && !isOpen
                            ? group.isAdmin
                                ? "text-amber-300/80"
                                : "text-white/60"
                            : "text-white/30 hover:text-white/55"
                    )}
                >
                    <group.icon
                        className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            group.isAdmin ? "text-amber-400/60" : "text-white/30"
                        )}
                    />
                    <span className="flex-1 truncate text-left">{group.label}</span>
                    <ChevronRight
                        className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                            isOpen && "rotate-90"
                        )}
                    />
                </button>

                {isOpen && (
                    <div className="mt-0.5 space-y-0.5">
                        {group.items.map((item) => renderNavItem(item, { isAdmin: group.isAdmin, nested: true }))}
                    </div>
                )}
            </div>
        )
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
                        "group relative flex h-9 w-full items-center gap-1.5 rounded-lg pr-1.5 text-[13px] transition-colors duration-150 md:h-8",
                        isSelected ? "bg-white/[0.07] text-white" : "text-white/55 hover:bg-white/[0.04]"
                    )}
                    style={{ paddingLeft: `${depth * 10 + 4}px` }}
                    onContextMenu={(e) => openContextMenu(e, project.id)}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => toggleProjectExpansion(project.id, e)}
                            aria-label={isExpanded ? "Contraer subproyectos" : "Expandir subproyectos"}
                            className="shrink-0 rounded p-0.5 transition-colors duration-150 hover:bg-white/[0.1]"
                        >
                            <ChevronRight
                                className={cn(
                                    "h-3 w-3 text-white/35 transition-transform duration-200",
                                    isExpanded && "rotate-90"
                                )}
                            />
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
                        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left"
                    >
                        {project.logo_url ? (
                            <img
                                src={project.logo_url}
                                alt=""
                                className="h-4 w-4 shrink-0 rounded-full object-cover"
                            />
                        ) : (
                            <IconComponent className="h-3.5 w-3.5 shrink-0 text-white/40" style={{ color: project.color }} />
                        )}
                        <span className="truncate">{project.nombre}</span>
                    </button>

                    {project.task_count !== undefined && project.task_count > 0 && (
                        <span className="shrink-0 text-[11px] tabular-nums text-white/25">
                            {project.task_count}
                        </span>
                    )}

                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            openContextMenu(e, project.id)
                        }}
                        className="shrink-0 rounded p-1 opacity-70 transition-all duration-150 hover:bg-white/[0.1] hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        aria-label={`Más acciones para ${project.nombre}`}
                    >
                        <MoreHorizontal className="h-3 w-3 text-white/40" />
                    </button>
                </div>

                {hasChildren && isExpanded && (
                    <div className="mt-0.5">
                        {project.children!.map((child) => renderProject(child, depth + 1))}
                    </div>
                )}
            </div>
        )
    }

    const renderCollapsedProject = (project: ProjectWithChildren) => {
        const isSelected = activeProject === project.id
        const IconComponent = PROJECT_ICON_MAP[project.icon] || Hash

        return (
            <button
                key={project.id}
                type="button"
                onClick={() => {
                    onProjectChange?.(project.id)
                    onClose?.()
                }}
                title={project.nombre}
                aria-label={project.nombre}
                className={cn(
                    "mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150",
                    isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                )}
            >
                {project.logo_url ? (
                    <img src={project.logo_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                    <IconComponent className="h-[18px] w-[18px] text-white/45" style={{ color: project.color }} />
                )}
            </button>
        )
    }

    const projectCount = projects.length

    return (
        <aside
            data-collapsed={collapsed ? "true" : "false"}
            className={cn(
                "flex h-[100svh] flex-col border-r border-white/[0.06] bg-[#0d0d0d]/95 shadow-xl transition-[width] duration-200 ease-out",
                collapsed ? "w-[60px]" : "w-[84vw] max-w-[300px] sm:w-[248px]",
                className
            )}
        >
            {/* Header: identidad + control de plegado */}
            <div className={cn("flex items-center gap-2 p-2", collapsed && "flex-col gap-1 px-1.5 py-2")}>
                {collapsed ? (
                    <>
                        <button
                            onClick={onToggleCollapse}
                            className={iconButtonClass}
                            title="Expandir barra lateral"
                            aria-label="Expandir barra lateral"
                        >
                            <PanelLeftOpen className="h-4 w-4" />
                        </button>
                        {avatarNode}
                    </>
                ) : (
                    <>
                        {avatarNode}
                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden leading-tight">
                            <span className="truncate text-[13px] font-semibold text-white" title={userName || "Usuario"}>
                                {userName || "Usuario"}
                            </span>
                            {userEmail && (
                                <span className="truncate text-[10px] text-white/35" title={userEmail}>
                                    {userEmail}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={onToggleCollapse ?? onClose}
                            className={iconButtonClass}
                            title="Contraer barra lateral"
                            aria-label="Contraer barra lateral"
                        >
                            <PanelLeftClose className="h-4 w-4" />
                        </button>
                    </>
                )}
            </div>

            {/* Buscar */}
            <div className={cn("pb-1", collapsed ? "px-1.5" : "px-2")}>
                {collapsed ? (
                    <button
                        onClick={() => onViewChange("search")}
                        title="Buscar"
                        aria-label="Buscar"
                        className={cn(
                            "mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150",
                            activeView === "search"
                                ? "bg-white/[0.08] text-quepia-cyan"
                                : "text-white/45 hover:bg-white/[0.05] hover:text-white/80"
                        )}
                    >
                        <Search className="h-[18px] w-[18px]" />
                    </button>
                ) : (
                    <button
                        onClick={() => onViewChange("search")}
                        className={cn(
                            "flex h-9 w-full items-center gap-2.5 rounded-lg border border-white/[0.06] px-2.5 text-[13px] transition-colors duration-150 md:h-8",
                            activeView === "search"
                                ? "bg-white/[0.07] text-white"
                                : "bg-white/[0.02] text-white/40 hover:bg-white/[0.05] hover:text-white/70"
                        )}
                    >
                        <Search className="h-4 w-4 shrink-0 text-white/35" />
                        <span className="truncate text-left">Buscar</span>
                    </button>
                )}
            </div>

            <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
                style={{ WebkitOverflowScrolling: "touch" }}
            >
                {/* Accesos principales */}
                <nav className={cn("space-y-0.5", collapsed ? "px-1.5" : "px-2")}>
                    {PRIMARY_ITEMS.map((item) => renderNavItem(item))}
                </nav>

                {/* Grupos plegables */}
                <div className={cn("mt-1 space-y-0.5", collapsed ? "px-1.5" : "px-2")}>
                    {groups.map(renderGroup)}
                </div>

                <div className={cn("my-2 border-t border-white/[0.05]", collapsed ? "mx-2" : "mx-3")} />

                {/* Favoritos */}
                {favorites.length > 0 && !collapsed && (
                    <div className="mb-3 px-2">
                        <h3 className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">
                            Favoritos
                        </h3>
                        <div className="space-y-0.5">
                            {favorites.map((fav) => (
                                <button
                                    key={fav.id}
                                    type="button"
                                    onClick={() => {
                                        onProjectChange?.(fav.id)
                                        onClose?.()
                                    }}
                                    className={cn(
                                        "flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors duration-150 hover:bg-white/[0.04] md:h-8",
                                        activeProject === fav.id ? "bg-white/[0.07] text-white" : "text-white/55"
                                    )}
                                >
                                    <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
                                    <span className="flex-1 truncate text-left">{fav.nombre}</span>
                                    {fav.task_count !== undefined && fav.task_count > 0 && (
                                        <span className="text-[11px] tabular-nums text-white/25">{fav.task_count}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Proyectos: el bloque protagonista */}
                <div className={collapsed ? "px-1.5" : "px-2"}>
                    {collapsed ? (
                        <div className="space-y-0.5">
                            {projects.slice(0, 12).map(renderCollapsedProject)}
                            {onAddProject && (
                                <button
                                    onClick={onAddProject}
                                    title="Nuevo proyecto"
                                    aria-label="Nuevo proyecto"
                                    className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-white/35 transition-colors duration-150 hover:bg-white/[0.05] hover:text-white/70"
                                >
                                    <Plus className="h-[18px] w-[18px]" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="mb-1 flex items-center justify-between px-2.5">
                                <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                                    Proyectos
                                    {projectCount > 0 && (
                                        <span className="tabular-nums text-white/20">{projectCount}</span>
                                    )}
                                </h3>
                                {onAddProject && (
                                    <button
                                        onClick={onAddProject}
                                        className="rounded p-1 transition-colors duration-150 hover:bg-white/[0.06]"
                                        aria-label="Nuevo proyecto"
                                        title="Nuevo proyecto"
                                    >
                                        <Plus className="h-3.5 w-3.5 text-white/35" />
                                    </button>
                                )}
                            </div>

                            {projectsLoading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-4 w-4 animate-spin text-white/30" />
                                </div>
                            ) : projects.length === 0 ? (
                                <div className="py-5 text-center">
                                    <p className="mb-2 text-xs text-white/30">Sin proyectos</p>
                                    {onAddProject && (
                                        <button onClick={onAddProject} className="text-xs text-quepia-cyan hover:underline">
                                            Crear primer proyecto
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-0.5">{projects.map((project) => renderProject(project))}</div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Footer: utilidades */}
            <div
                className={cn(
                    "border-t border-white/[0.06] p-1.5",
                    collapsed ? "flex flex-col items-center gap-0.5" : "flex items-center gap-0.5"
                )}
            >
                <button
                    onClick={() => onViewChange("docs")}
                    className={cn(iconButtonClass, activeView === "docs" && "bg-white/[0.08] text-quepia-cyan")}
                    title="Documentación"
                    aria-label="Documentación"
                >
                    <Book className="h-4 w-4" />
                </button>
                <div className="relative">
                    <button
                        onClick={onOpenNotifications || (() => onViewChange("inbox"))}
                        className={cn(
                            iconButtonClass,
                            unreadNotifications > 0 && "text-quepia-cyan hover:text-quepia-cyan"
                        )}
                        title="Notificaciones"
                        aria-label="Notificaciones"
                    >
                        <Bell className="h-4 w-4" />
                    </button>
                    {unreadNotifications > 0 && (
                        <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-quepia-cyan px-1 text-[10px] font-semibold text-[#042423]">
                            {unreadNotifications > 99 ? "99+" : unreadNotifications}
                        </span>
                    )}
                </div>
                <button
                    onClick={onOpenSettings}
                    className={iconButtonClass}
                    title="Ajustes"
                    aria-label="Ajustes"
                >
                    <Settings className="h-4 w-4" />
                </button>
                {!collapsed && <div className="flex-1" />}
                {onSignOut && (
                    <button
                        onClick={onSignOut}
                        className={cn(iconButtonClass, "hover:bg-red-500/10 hover:text-red-400")}
                        title="Cerrar sesión"
                        aria-label="Cerrar sesión"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 min-w-[160px] rounded-lg border border-white/[0.08] bg-[#1a1a1a] py-1 shadow-xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        onClick={() => { onEditProject?.(contextMenu.projectId); setContextMenu(null) }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar proyecto
                    </button>
                    <button
                        onClick={() => { onManageMembers?.(contextMenu.projectId); setContextMenu(null) }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
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
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06]"
                    >
                        <Star className={cn("h-3.5 w-3.5", isFavorite(contextMenu.projectId) ? "fill-yellow-400 text-yellow-400" : "")} />
                        {isFavorite(contextMenu.projectId) ? "Quitar de favoritos" : "Agregar a favoritos"}
                    </button>
                    <div className="my-1 border-t border-white/[0.06]" />
                    <button
                        onClick={() => {
                            if (confirm("¿Eliminar este proyecto y todas sus tareas?")) {
                                onDeleteProject?.(contextMenu.projectId)
                            }
                            setContextMenu(null)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar proyecto
                    </button>
                </div>
            )}
        </aside>
    )
}
