"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { AppSidebar } from "@/components/sistema/quepia/app-sidebar"
import { TopHeader } from "@/components/sistema/quepia/top-header"
import { KanbanBoard } from "@/components/sistema/quepia/kanban-board"
import { TaskDetailModal } from "@/components/sistema/quepia/task-detail-modal"
import { DashboardOverview } from "@/components/sistema/quepia/dashboard-overview"
import { NotificationSettings } from "@/components/sistema/quepia/notification-settings"
import { TodayView } from "@/components/sistema/quepia/today-view"
import { UpcomingView } from "@/components/sistema/quepia/upcoming-view"
import { CompletedView } from "@/components/sistema/quepia/completed-view"
import { SearchView } from "@/components/sistema/quepia/search-view"
import { CalendarView } from "@/components/sistema/quepia/calendar-view"
import { InboxView } from "@/components/sistema/quepia/inbox-view"
import { WorkloadView } from "@/components/sistema/quepia/workload-view"
import { DocsView } from "@/components/sistema/quepia/docs-view"
import { useAuth, useProjects, useAllTasks, useAllCalendarEvents, useSistemaUsers, useProjectTemplates, useClientBrief } from "@/lib/sistema/hooks"
import { PortfolioView } from "@/components/sistema/quepia/portfolio-view"
import { ClientProfile } from "@/components/sistema/quepia/client-profile"
import { BriefingForm } from "@/components/sistema/quepia/briefing-form"
import { AdminUsersView } from "@/components/sistema/quepia/admin-users-view"
import { AdminProjectsView } from "@/components/sistema/quepia/admin-projects-view"
import { AdminServicesView } from "@/components/sistema/quepia/admin-services-view"
import { AdminConfigView } from "@/components/sistema/quepia/admin-config-view"
import { AdminTeamView } from "@/components/sistema/quepia/admin-team-view"
import { AccountingView } from "@/components/sistema/quepia/accounting-view"
import { ProjectMembersModal } from "@/components/sistema/quepia/project-members-modal"
import type { Task, ProjectWithChildren } from "@/types/sistema"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { LogoPicker } from "@/components/sistema/quepia/logo-picker"


function findProject(projects: ProjectWithChildren[], id: string): ProjectWithChildren | null {
    for (const p of projects) {
        if (p.id === id) return p
        if (p.children && p.children.length > 0) {
            const found = findProject(p.children, id)
            if (found) return found
        }
    }
    return null
}

function flattenHashProjects(projects: ProjectWithChildren[]): { id: string; nombre: string; color: string }[] {
    const result: { id: string; nombre: string; color: string }[] = []
    const walk = (list: ProjectWithChildren[]) => {
        for (const p of list) {
            if (p.icon !== "folder") {
                result.push({ id: p.id, nombre: p.nombre, color: p.color })
            }
            if (p.children && p.children.length > 0) {
                walk(p.children)
            }
        }
    }
    walk(projects)
    return result
}

export default function DashboardPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const initialView = searchParams.get("view") || "dashboard"
    const { user, sistemaUser, loading: authLoading, isAuthenticated, tablesExist, setupError, createSistemaUser, signOut } = useAuth()

    useEffect(() => {
        console.log("DashboardPage - sistemaUser:", sistemaUser)
        console.log("DashboardPage - role:", sistemaUser?.role)
    }, [sistemaUser])

    const { projects, deleteProject, createProject, updateProject, loading: projectsLoading } = useProjects(user?.id)
    const { tasks: allTasks, loading: allTasksLoading, refresh: refreshAllTasks } = useAllTasks(user?.id)
    const { events: allEvents, loading: allEventsLoading, refresh: refreshAllEvents } = useAllCalendarEvents(user?.id)
    const { users: sistemaUsers, refresh: refreshUsers } = useSistemaUsers()
    const { templates, createProjectFromTemplate } = useProjectTemplates()

    const [activeView, setActiveView] = useState(initialView)
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const kanbanRefreshRef = useRef<(() => void) | null>(null)

    const { brief, saveBrief } = useClientBrief(activeProjectId);

    const [showSetupModal, setShowSetupModal] = useState(false)
    const [setupName, setSetupName] = useState("")
    const [settingUp, setSettingUp] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)

    // Settings modal state
    const [showSettingsModal, setShowSettingsModal] = useState(false)

    // Client profile & briefing state
    const [showClientProfile, setShowClientProfile] = useState(false)
    const [showBriefingForm, setShowBriefingForm] = useState(false)

    // Project members modal state
    const [membersProjectId, setMembersProjectId] = useState<string | null>(null)

    // New project modal state
    const [showNewProjectModal, setShowNewProjectModal] = useState(false)
    const [newProjectName, setNewProjectName] = useState("")
    const [newProjectLogo, setNewProjectLogo] = useState("")
    const [newProjectColor, setNewProjectColor] = useState("#dc4a3e")
    const [newProjectParentId, setNewProjectParentId] = useState<string | null>(null)
    const [newProjectType, setNewProjectType] = useState<"folder" | "hash">("hash")
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
    const [creatingProject, setCreatingProject] = useState(false)
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
    const [newProjectIcon, setNewProjectIcon] = useState<string | null>(null)

    const activeProject = activeProjectId ? findProject(projects, activeProjectId) : null

    // Determine if we're showing a project-specific view vs a global view
    const isProjectView = activeProjectId !== null && !["dashboard", "today", "upcoming", "completed", "search", "inbox", "filters", "calendar", "workload", "portfolio", "docs", "admin-users", "admin-projects", "admin-services", "admin-config", "admin-team", "accounting"].includes(activeView)

    const handleTaskClick = (task: Task | TaskWithProject) => {
        setSelectedTaskId(task.id)
        setIsModalOpen(true)
    }

    // Sync activeView with URL param if it changes externally or initially
    useEffect(() => {
        const view = searchParams.get("view")
        if (view && view !== activeView) {
            setActiveView(view)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    const handleViewChange = (view: string) => {
        setActiveView(view)
        setActiveProjectId(null)
        // Update URL without reloading
        const url = new URL(window.location.href)
        url.searchParams.set("view", view)
        window.history.pushState({}, "", url)
    }

    const handleSetupProfile = async () => {
        if (!setupName.trim()) return
        setSettingUp(true)
        setLocalError(null)
        const success = await createSistemaUser(setupName.trim())
        if (success) {
            setShowSetupModal(false)
            setLocalError(null)
        }
        setSettingUp(false)
    }

    const handleDeleteProject = async (projectId: string) => {
        await deleteProject(projectId)
        if (activeProjectId === projectId) {
            setActiveProjectId(null)
            setActiveView("dashboard")
        }
    }

    const handleEditProject = (projectId: string) => {
        const project = findProject(projects, projectId)
        if (!project) return

        setEditingProjectId(projectId)
        setNewProjectName(project.nombre)
        setNewProjectColor(project.color)
        setNewProjectLogo(project.logo_url || "")
        // Handle icon if needed, though project.icon is used for "folder" vs "hash"
        // We might want to store the lucide icon name in a separate field or reuse logic
        setNewProjectType(project.icon === "folder" ? "folder" : "hash")
        setNewProjectParentId(project.parent_id || null)
        setShowNewProjectModal(true)
    }

    const handleCreateProject = async () => {
        if (!newProjectName.trim() || !user?.id) return

        setCreatingProject(true)
        try {
            if (editingProjectId) {
                await updateProject(editingProjectId, {
                    nombre: newProjectName.trim(),
                    color: newProjectColor,
                    // If project icon is set (from LogoPicker), use it. Otherwise use folder/hash type
                    icon: (newProjectIcon || newProjectType) as any,
                    parent_id: newProjectParentId,
                    logo_url: newProjectLogo.trim() || null,
                })
                setShowNewProjectModal(false)
                setNewProjectName("")
                setNewProjectParentId(null)
                setSelectedTemplateId(null)
                setEditingProjectId(null)
                setNewProjectLogo("")
            } else if (selectedTemplateId) {
                const projectId = await createProjectFromTemplate(
                    selectedTemplateId,
                    newProjectName.trim(),
                    user.id,
                    newProjectColor,
                    newProjectParentId
                )
                if (projectId) {
                    setShowNewProjectModal(false)
                    setNewProjectName("")
                    setNewProjectParentId(null)
                    setSelectedTemplateId(null)
                    setNewProjectLogo("")
                }
            } else {
                const newProject = await createProject({
                    nombre: newProjectName.trim(),
                    color: newProjectColor,
                    icon: (newProjectIcon || newProjectType) as any,
                    parent_id: newProjectParentId,
                    owner_id: user.id,
                    logo_url: newProjectLogo.trim() || null,
                })

                if (newProject) {
                    setShowNewProjectModal(false)
                    setNewProjectName("")
                    setNewProjectParentId(null)
                    setSelectedTemplateId(null)
                    setNewProjectLogo("")
                }
            }
        } catch (err) {
            console.error("Error creating/updating project:", err)
        }
        setCreatingProject(false)
    }

    const handleCloseModal = () => {
        setIsModalOpen(false)
        setSelectedTaskId(null)
    }

    const handleModalUpdate = useCallback(() => {
        // Silently refresh the kanban board data (no remounting)
        kanbanRefreshRef.current?.()
        // Refresh global task list for sidebar views
        refreshAllTasks()
        if (activeView === "calendar") {
            refreshAllEvents()
        }
    }, [activeView, refreshAllTasks, refreshAllEvents])

    // Compute breadcrumb based on current view
    const getBreadcrumb = (): string[] => {
        if (isProjectView && activeProject) return ["Quepia", activeProject.nombre]
        const viewLabels: Record<string, string> = {
            dashboard: "Dashboard",
            today: "Hoy",
            upcoming: "Próximo",
            completed: "Completado",
            search: "Buscar",
            inbox: "Inbox",
            filters: "Filtros",
            calendar: "Calendario",
            workload: "Carga de trabajo",
            portfolio: "Portafolios",
        }
        return ["Quepia", viewLabels[activeView] || "Dashboard"]
    }

    // Render the main content area based on active view
    const renderContent = () => {
        if (isProjectView) {
            return (
                <KanbanBoard
                    projectId={activeProjectId || undefined}
                    projectName={activeProject?.nombre || "Selecciona un proyecto"}
                    onTaskClick={handleTaskClick}
                    onRefreshRef={kanbanRefreshRef}
                />
            )
        }

        switch (activeView) {
            case "today":
                return (
                    <TodayView
                        tasks={allTasks}
                        loading={allTasksLoading}
                        onTaskClick={handleTaskClick}
                        onRefresh={refreshAllTasks}
                    />
                )
            case "upcoming":
                return (
                    <UpcomingView
                        tasks={allTasks}
                        loading={allTasksLoading}
                        onTaskClick={handleTaskClick}
                        onRefresh={refreshAllTasks}
                    />
                )
            case "completed":
                return (
                    <CompletedView
                        tasks={allTasks}
                        loading={allTasksLoading}
                        onTaskClick={handleTaskClick}
                        onRefresh={refreshAllTasks}
                    />
                )
            case "search":
            case "filters":
                return (
                    <SearchView
                        tasks={allTasks}
                        loading={allTasksLoading}
                        onTaskClick={handleTaskClick}
                        onRefresh={refreshAllTasks}
                    />
                )
            case "inbox":
                return (
                    <InboxView
                        tasks={allTasks}
                        loading={allTasksLoading}
                        onTaskClick={handleTaskClick}
                    />
                )
            case "workload":
                return (
                    <WorkloadView
                        tasks={allTasks}
                        users={sistemaUsers.filter(u => u.id === user?.id)}
                        loading={allTasksLoading}
                        onTaskClick={handleTaskClick}
                    />
                )
            case "admin-users":
                if (sistemaUser?.role !== 'admin') {
                    setActiveView("dashboard")
                    return null
                }
                return (
                    <AdminUsersView
                        users={sistemaUsers}
                        currentUserId={user?.id}
                        onRefresh={refreshUsers}
                    />
                )
            case "admin-projects":
                if (sistemaUser?.role !== 'admin') {
                    setActiveView("dashboard")
                    return null
                }
                return <AdminProjectsView />
            case "admin-services":
                if (sistemaUser?.role !== 'admin') {
                    setActiveView("dashboard")
                    return null
                }
                return <AdminServicesView />
            case "admin-config":
                if (sistemaUser?.role !== 'admin') {
                    setActiveView("dashboard")
                    return null
                }
                return <AdminConfigView />
            case "admin-team":
                if (sistemaUser?.role !== 'admin') {
                    setActiveView("dashboard")
                    return null
                }
                return <AdminTeamView />
            case "calendar":
                return (
                    <CalendarView
                        tasks={allTasks}
                        events={allEvents}
                        loading={allTasksLoading || allEventsLoading}
                        onTaskClick={handleTaskClick}
                        userId={user?.id}
                        projects={flattenHashProjects(projects)}
                        onRefresh={refreshAllEvents}
                    />
                )
            case "portfolio":
                return (
                    <PortfolioView
                        projects={projects}
                        tasks={allTasks}
                        loading={allTasksLoading || projectsLoading}
                        onProjectClick={(id) => {
                            setActiveProjectId(id)
                            setActiveView("project")
                        }}
                    />
                )
            case "accounting":
                if (sistemaUser?.role !== 'admin') {
                    setActiveView("dashboard")
                    return null
                }
                return <AccountingView projects={projects} />
            case "docs":
                return <DocsView />
            default:
                return (
                    <DashboardOverview
                        tasks={allTasks}
                        events={allEvents}
                        loading={allTasksLoading || allEventsLoading}
                        onTaskClick={handleTaskClick}
                        onViewChange={handleViewChange}
                        userRole={sistemaUser?.role}
                    />
                )
        }
    }

    // Show loading while checking auth
    if (authLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                {/* Subtle gradient background */}
                <div className="absolute inset-0">
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]"
                        style={{
                            background: 'radial-gradient(circle, rgba(42,231,228,0.08) 0%, transparent 60%)',
                            filter: 'blur(40px)',
                        }}
                    />
                </div>

                <motion.div
                    className="relative z-10 flex flex-col items-center gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <motion.div
                        className="w-12 h-12 border-2 border-quepia-cyan/20 border-t-quepia-cyan rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    <span className="text-white/40 text-sm">Cargando...</span>
                </motion.div>
            </div>
        )
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return (
            <div className="flex h-screen items-center justify-center px-4 relative overflow-hidden bg-[#0a0a0a]">
                {/* Animated background */}
                <div className="absolute inset-0">
                    <motion.div
                        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full"
                        style={{
                            background: 'radial-gradient(circle, rgba(42,231,228,0.12) 0%, transparent 70%)',
                            filter: 'blur(60px)',
                        }}
                        animate={{
                            scale: [1, 1.2, 1],
                            x: [0, 50, 0],
                            y: [0, -30, 0],
                        }}
                        transition={{
                            duration: 15,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                    />
                    <motion.div
                        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full"
                        style={{
                            background: 'radial-gradient(circle, rgba(136,16,120,0.12) 0%, transparent 70%)',
                            filter: 'blur(60px)',
                        }}
                        animate={{
                            scale: [1, 1.3, 1],
                            x: [0, -40, 0],
                            y: [0, 40, 0],
                        }}
                        transition={{
                            duration: 18,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                    />
                </div>

                {/* Content */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 w-full max-w-md"
                >
                    <div className="relative">
                        {/* Glow effect */}
                        <div className="absolute -inset-px bg-gradient-to-b from-white/10 to-transparent rounded-2xl blur-sm" />

                        <div className="relative liquid-glass p-8 md:p-12">
                            {/* Header */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2, duration: 0.6 }}
                                className="text-center mb-10"
                            >
                                {/* Icon */}
                                <motion.div
                                    className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 flex items-center justify-center"
                                    whileHover={{ scale: 1.05, rotate: -5 }}
                                    transition={{ type: 'spring', stiffness: 400 }}
                                >
                                    <svg className="w-8 h-8 text-quepia-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </motion.div>

                                <h1 className="font-display text-3xl md:text-4xl font-light text-white mb-3">
                                    Sistema de <span className="text-white/60">Gestión</span>
                                </h1>
                                <p className="text-white/50 text-sm">
                                    Acceso restringido a personal autorizado
                                </p>
                            </motion.div>

                            {/* Login Button */}
                            <motion.button
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.6 }}
                                onClick={() => router.push("/auth/login?redirect=/sistema")}
                                className="group w-full relative overflow-hidden"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-quepia-cyan to-quepia-purple rounded-xl opacity-80 group-hover:opacity-100 transition-opacity" />
                                <div className="relative flex items-center justify-center gap-2 px-6 py-4 rounded-xl">
                                    <span className="text-white font-medium">Iniciar Sesión</span>
                                    <svg
                                        className="w-4 h-4 text-white transition-transform group-hover:translate-x-1"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </div>
                            </motion.button>

                            {/* Divider */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                className="flex items-center gap-4 my-8"
                            >
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-white/30 text-xs uppercase tracking-wider">o</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </motion.div>

                            {/* Back link */}
                            <motion.a
                                href="/"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.6 }}
                                className="flex items-center justify-center gap-2 text-white/40 hover:text-white text-sm transition-colors group"
                            >
                                <svg
                                    className="w-4 h-4 transition-transform group-hover:-translate-x-1"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Volver al sitio
                            </motion.a>
                        </div>
                    </div>
                </motion.div>
            </div>
        )
    }

    // Show database setup instructions if tables don't exist
    if (!tablesExist) {
        return (
            <div className="flex h-screen items-center justify-center px-4 relative overflow-hidden bg-[#0a0a0a]">
                {/* Animated background */}
                <div className="absolute inset-0">
                    <motion.div
                        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full"
                        style={{
                            background: 'radial-gradient(circle, rgba(234,179,8,0.08) 0%, transparent 70%)',
                            filter: 'blur(60px)',
                        }}
                        animate={{
                            scale: [1, 1.1, 1],
                        }}
                        transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                    />
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 w-full max-w-lg"
                >
                    <div className="relative">
                        {/* Glow effect */}
                        <div className="absolute -inset-px bg-gradient-to-b from-yellow-500/20 to-transparent rounded-2xl blur-sm" />

                        <div className="relative liquid-glass p-8 md:p-10">
                            {/* Icon */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2 }}
                                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-6"
                            >
                                <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="font-display text-2xl md:text-3xl font-light text-white mb-3 text-center"
                            >
                                Configuración <span className="text-yellow-500">Requerida</span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="text-white/50 text-center mb-8"
                            >
                                Las tablas del sistema no están configuradas en la base de datos.
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className="bg-white/[0.03] border border-white/10 rounded-xl p-5 mb-6"
                            >
                                <p className="text-sm text-white/70 mb-4 font-medium">Para configurar el sistema:</p>
                                <ol className="text-sm text-white/50 space-y-3 list-decimal list-inside">
                                    <li>Ve al panel de Supabase → SQL Editor</li>
                                    <li>Ejecuta <code className="text-quepia-cyan bg-white/5 px-1.5 py-0.5 rounded text-xs">001_sistema_tables.sql</code></li>
                                    <li>Ejecuta <code className="text-quepia-cyan bg-white/5 px-1.5 py-0.5 rounded text-xs">002_calendar_client_access.sql</code></li>
                                    <li>Recarga esta página</li>
                                </ol>
                            </motion.div>

                            <motion.button
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6 }}
                                onClick={() => window.location.reload()}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-quepia-cyan to-quepia-purple rounded-xl opacity-80 group-hover:opacity-100 transition-opacity" />
                                <div className="relative flex items-center justify-center gap-2 px-6 py-4 rounded-xl">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span className="text-white font-medium">Recargar Página</span>
                                </div>
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="flex h-screen bg-[#0a0a0a]">
            {/* Setup Profile Modal */}
            {showSetupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    <div className="relative bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-md p-6 border border-white/10">
                        <h2 className="text-xl font-bold text-white mb-2">Bienvenido al Sistema</h2>
                        <p className="text-white/60 mb-6">Configura tu perfil para comenzar</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Tu nombre
                                </label>
                                <input
                                    type="text"
                                    value={setupName}
                                    onChange={(e) => setSetupName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && setupName.trim()) {
                                            handleSetupProfile()
                                        }
                                    }}
                                    placeholder="Ej: Juan Pérez"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
                                />
                            </div>

                            {(setupError || localError) && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <p className="text-sm text-red-400">{setupError || localError}</p>
                                </div>
                            )}

                            <button
                                onClick={handleSetupProfile}
                                disabled={!setupName.trim() || settingUp}
                                className="w-full px-4 py-3 bg-gradient-to-r from-quepia-cyan to-quepia-magenta text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {settingUp ? (
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                                ) : (
                                    "Comenzar"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettingsModal && user?.id && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowSettingsModal(false)}
                    />
                    <div className="relative z-10 w-full max-w-md">
                        <NotificationSettings
                            userId={user.id}
                            onClose={() => setShowSettingsModal(false)}
                        />
                    </div>
                </div>
            )}

            {/* New Project Modal */}
            {showNewProjectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => {
                            setShowNewProjectModal(false)
                            setEditingProjectId(null)
                            setNewProjectName("")
                            setNewProjectLogo("")
                            setNewProjectParentId(null)
                        }}
                    />
                    <div className="relative bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-md p-6 border border-white/10">
                        <h2 className="text-xl font-bold text-white mb-6">
                            {editingProjectId ? "Editar Proyecto" : "Nuevo Cliente"}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Nombre del cliente
                                </label>
                                <input
                                    type="text"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    placeholder="Ej: Cocacola"
                                    autoFocus
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
                                />
                            </div>

                            {/* Logo Picker (New) */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Logo o Icono
                                </label>
                                <LogoPicker
                                    currentLogo={newProjectLogo}
                                    currentIcon={newProjectIcon}
                                    onLogoChange={(url) => {
                                        setNewProjectLogo(url || "")
                                        if (url) setNewProjectIcon(null)
                                    }}
                                    onIconChange={(icon) => {
                                        setNewProjectIcon(icon)
                                        // For now we don't save icon to DB in a separate field, 
                                        // keeping it simple or reusing fields if needed.
                                        // But if user picks icon, we clear logo URL
                                    }}
                                />
                            </div>

                            {/* Template selector */}
                            {templates.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">
                                        Plantilla (opcional)
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setSelectedTemplateId(null)}
                                            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${!selectedTemplateId
                                                ? "border-quepia-cyan bg-quepia-cyan/10 text-white"
                                                : "border-white/10 text-white/60 hover:border-white/20"
                                                }`}
                                        >
                                            En blanco
                                        </button>
                                        {templates.map((tpl) => (
                                            <button
                                                key={tpl.id}
                                                onClick={() => {
                                                    setSelectedTemplateId(tpl.id)
                                                    setNewProjectType("hash")
                                                }}
                                                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${selectedTemplateId === tpl.id
                                                    ? "border-quepia-cyan bg-quepia-cyan/10 text-white"
                                                    : "border-white/10 text-white/60 hover:border-white/20"
                                                    }`}
                                            >
                                                {tpl.nombre}
                                            </button>
                                        ))}
                                    </div>
                                    {selectedTemplateId && (
                                        <p className="text-[10px] text-white/30 mt-1">
                                            Se crearán las columnas y tareas de la plantilla
                                        </p>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Tipo
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setNewProjectType("hash")}
                                        className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${newProjectType === "hash"
                                            ? "border-quepia-cyan bg-quepia-cyan/10 text-white"
                                            : "border-white/10 text-white/60 hover:border-white/20"
                                            }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 inline-block mr-1 -mt-0.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                        </svg>
                                        Cliente
                                    </button>
                                    <button
                                        onClick={() => setNewProjectType("folder")}
                                        className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${newProjectType === "folder"
                                            ? "border-quepia-cyan bg-quepia-cyan/10 text-white"
                                            : "border-white/10 text-white/60 hover:border-white/20"
                                            }`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 inline-block mr-1 -mt-0.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                                        </svg>
                                        Carpeta
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white/80 mb-2">
                                Color
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                {["#dc4a3e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"].map(
                                    (color) => (
                                        <button
                                            key={color}
                                            onClick={() => setNewProjectColor(color)}
                                            className={`w-8 h-8 rounded-full transition-transform ${newProjectColor === color ? "scale-110 ring-2 ring-white" : ""
                                                }`}
                                            style={{ backgroundColor: color }}
                                        />
                                    )
                                )}
                            </div>
                        </div>

                        {projects.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Proyecto padre (opcional)
                                </label>
                                <select
                                    value={newProjectParentId || ""}
                                    onChange={(e) => setNewProjectParentId(e.target.value || null)}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-quepia-cyan transition-colors"
                                >
                                    <option value="">Sin padre (raíz)</option>
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setShowNewProjectModal(false)
                                    setEditingProjectId(null)
                                    setNewProjectName("")
                                    setNewProjectLogo("")
                                    setNewProjectParentId(null)
                                }}
                                className="flex-1 px-4 py-3 bg-white/5 text-white/80 font-medium rounded-lg hover:bg-white/10 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateProject}
                                disabled={!newProjectName.trim() || creatingProject}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-quepia-cyan to-quepia-magenta text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {creatingProject ? (
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                                ) : (
                                    editingProjectId ? "Guardar" : "Crear"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Sidebar Overlay */}
            {
                isMobileSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                        onClick={() => setIsMobileSidebarOpen(false)}
                    />
                )
            }

            {/* Sidebar */}
            <AppSidebar
                className={cn(
                    "md:flex", // Always show on desktop
                    isMobileSidebarOpen
                        ? "fixed inset-y-0 left-0 z-50 flex shadow-2xl"
                        : "hidden" // Hidden on mobile by default
                )}
                userId={user?.id}
                userName={sistemaUser?.nombre}
                userEmail={user?.email}
                userAvatar={sistemaUser?.avatar_url}
                userRole={sistemaUser?.role}
                activeView={activeView}
                onViewChange={(view) => {
                    handleViewChange(view)
                    setIsMobileSidebarOpen(false)
                }}
                activeProject={activeProjectId || undefined}
                onProjectChange={(id) => {
                    // Always switch to project view when clicked from sidebar
                    setActiveProjectId(id)
                    setActiveView("project")
                    setIsMobileSidebarOpen(false)
                }}
                onAddProject={() => {
                    setEditingProjectId(null)
                    setNewProjectName("")
                    setNewProjectLogo("")
                    setNewProjectParentId(null)
                    setShowNewProjectModal(true)
                    setIsMobileSidebarOpen(false)
                }}
                onEditProject={handleEditProject}
                onDeleteProject={handleDeleteProject}
                onManageMembers={(projectId) => setMembersProjectId(projectId)}
                onSignOut={signOut}
                onOpenSettings={() => {
                    setShowSettingsModal(true)
                    setIsMobileSidebarOpen(false)
                }}
                projects={projects}
                projectsLoading={projectsLoading}
                onClose={() => setIsMobileSidebarOpen(false)}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Header */}
                <TopHeader
                    breadcrumb={getBreadcrumb()}
                    onOpenClientProfile={isProjectView ? () => setShowClientProfile(true) : undefined}
                    onOpenBriefing={isProjectView ? () => setShowBriefingForm(true) : undefined}
                    onMenuClick={() => setIsMobileSidebarOpen(true)}
                />

                {/* Content Area */}
                {renderContent()}
            </div>

            {/* Task Detail Modal */}
            <TaskDetailModal
                taskId={selectedTaskId || undefined}
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onUpdate={handleModalUpdate}
                userId={user?.id}
            />

            {/* Client Profile Panel */}
            {
                activeProjectId && (
                    <ClientProfile
                        projectId={activeProjectId}
                        isOpen={showClientProfile}
                        onClose={() => setShowClientProfile(false)}
                    />
                )
            }

            {/* Briefing Form Modal */}
            {
                activeProjectId && (
                    <BriefingForm
                        projectId={activeProjectId}
                        isOpen={showBriefingForm}
                        onClose={() => setShowBriefingForm(false)}
                        initialData={brief ? {
                            project_type: brief.project_type,
                            objectives: brief.objectives || "",
                            target_audience: brief.target_audience || "",
                            tone_of_voice: brief.tone_of_voice || "",
                            references: brief.references_text || "",
                            budget: brief.budget || "",
                            timeline: brief.timeline || "",
                            includes_ads: brief.includes_ads,
                            ad_budget: brief.ad_budget || "",
                            platforms: brief.platforms || [],
                            keep_existing_brand: brief.keep_existing_brand,
                            existing_elements: brief.existing_elements || "",
                            content_frequency: brief.content_frequency || "",
                            key_messages: brief.key_messages || "",
                        } : null}
                        onSave={async (data) => {
                            console.log("Briefing saving:", data)
                            const success = await saveBrief({
                                project_type: data.project_type,
                                objectives: data.objectives,
                                target_audience: data.target_audience,
                                tone_of_voice: data.tone_of_voice,
                                references_text: data.references,
                                budget: data.budget,
                                timeline: data.timeline,
                                includes_ads: data.includes_ads,
                                ad_budget: data.ad_budget,
                                platforms: data.platforms,
                                keep_existing_brand: data.keep_existing_brand,
                                existing_elements: data.existing_elements,
                                content_frequency: data.content_frequency,
                                key_messages: data.key_messages,
                            })
                            if (success) {
                                setShowBriefingForm(false)
                            }
                        }}
                    />
                )
            }
            {/* Project Members Modal */}
            {membersProjectId && user?.id && (
                <ProjectMembersModal
                    isOpen={!!membersProjectId}
                    onClose={() => setMembersProjectId(null)}
                    projectId={membersProjectId}
                    projectName={findProject(projects, membersProjectId)?.nombre || "Proyecto"}
                    currentUserId={user.id}
                    ownerId={findProject(projects, membersProjectId)?.owner_id || ""}
                />
            )}
        </div >
    )
}