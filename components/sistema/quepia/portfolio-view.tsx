"use client"

import { useMemo } from "react"
import { Folder, Hash, ChevronRight, CheckCircle2, Clock, AlertCircle, BarChart3 } from "lucide-react"
import type { ProjectWithChildren } from "@/types/sistema"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"

interface PortfolioViewProps {
    projects: ProjectWithChildren[]
    tasks: TaskWithProject[]
    loading: boolean
    onProjectClick: (projectId: string) => void
}

interface ProjectTaskStats {
    totalTasks: number
    completedTasks: number
    overdueTasks: number
    totalHours: number
    completedHours: number
    progress: number
    nextDeadline: string | null
}

const EMPTY_PROJECT_STATS: ProjectTaskStats = {
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
    totalHours: 0,
    completedHours: 0,
    progress: 0,
    nextDeadline: null,
}

export function PortfolioView({ projects, tasks, loading, onProjectClick }: PortfolioViewProps) {
    const todayStr = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return today.toISOString().split("T")[0]
    }, [])

    const statsByProject = useMemo(() => {
        const byProject = new Map<string, TaskWithProject[]>()
        for (const task of tasks) {
            if (!byProject.has(task.project_id)) {
                byProject.set(task.project_id, [])
            }
            byProject.get(task.project_id)!.push(task)
        }

        const statsMap = new Map<string, ProjectTaskStats>()
        for (const [projectId, projectTasks] of byProject) {
            const completedTasks = projectTasks.filter((task) => task.completed)
            const overdueTasks = projectTasks.filter((task) => !task.completed && task.due_date && task.due_date < todayStr)
            const totalHours = projectTasks.reduce((sum, task) => sum + (task.estimated_hours || 0), 0)
            const completedHours = completedTasks.reduce((sum, task) => sum + (task.estimated_hours || 0), 0)
            const nextDeadline = projectTasks
                .filter((task) => !task.completed && task.due_date)
                .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))[0]?.due_date || null

            statsMap.set(projectId, {
                totalTasks: projectTasks.length,
                completedTasks: completedTasks.length,
                overdueTasks: overdueTasks.length,
                totalHours,
                completedHours,
                progress: projectTasks.length > 0 ? Math.round((completedTasks.length / projectTasks.length) * 100) : 0,
                nextDeadline,
            })
        }

        return statsMap
    }, [tasks, todayStr])

    const childrenByParent = useMemo(() => {
        const map = new Map<string, ProjectWithChildren[]>()
        for (const project of projects) {
            if (!project.parent_id) continue
            if (!map.has(project.parent_id)) {
                map.set(project.parent_id, [])
            }
            map.get(project.parent_id)!.push(project)
        }
        return map
    }, [projects])

    const portfolios = useMemo(() => {
        return projects
            .filter((project) => project.icon === "folder")
            .map((folder) => {
                const children = (childrenByParent.get(folder.id) || []).map((project) => ({
                    project,
                    stats: statsByProject.get(project.id) || EMPTY_PROJECT_STATS,
                }))

                const stats = children.reduce<ProjectTaskStats>(
                    (acc, child) => ({
                        totalTasks: acc.totalTasks + child.stats.totalTasks,
                        completedTasks: acc.completedTasks + child.stats.completedTasks,
                        overdueTasks: acc.overdueTasks + child.stats.overdueTasks,
                        totalHours: acc.totalHours + child.stats.totalHours,
                        completedHours: acc.completedHours + child.stats.completedHours,
                        progress: 0,
                        nextDeadline: null,
                    }),
                    { ...EMPTY_PROJECT_STATS }
                )

                const progress = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0

                return {
                    folder,
                    children,
                    stats: { ...stats, progress },
                }
            })
    }, [childrenByParent, projects, statsByProject])

    // Standalone projects (no parent)
    const standaloneProjects = useMemo(() => {
        const folderIds = new Set(projects.filter((project) => project.icon === "folder").map((project) => project.id))
        return projects
            .filter((project) => project.icon === "hash" && !project.parent_id && !folderIds.has(project.id))
            .map((project) => ({
                project,
                stats: statsByProject.get(project.id) || EMPTY_PROJECT_STATS,
            }))
    }, [projects, statsByProject])

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
                <BarChart3 className="h-5 w-5 text-quepia-cyan" />
                <h2 className="text-lg font-semibold text-white">Portafolios</h2>
            </div>

            {portfolios.length === 0 && standaloneProjects.length === 0 ? (
                <div className="text-center py-16">
                    <Folder className="h-12 w-12 text-white/10 mx-auto mb-4" />
                    <p className="text-white/30">No hay portafolios. Crea una carpeta y agrega proyectos dentro.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Portfolio groups */}
                    {portfolios.map(({ folder, children, stats }) => (
                        <div key={folder.id} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-sm">
                            {/* Portfolio header */}
                            <div className="border-b border-white/[0.04] p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: folder.color + "20" }}>
                                            <Folder className="h-4 w-4" style={{ color: folder.color }} />
                                        </div>
                                        <div>
                                            <h3 className="text-white font-medium">{folder.nombre}</h3>
                                            <p className="text-xs text-white/30">{children.length} proyecto{children.length !== 1 ? "s" : ""}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                        <div className="flex items-center gap-1.5 text-green-400">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            <span>{stats.completedTasks}/{stats.totalTasks}</span>
                                        </div>
                                        {stats.overdueTasks > 0 && (
                                            <div className="flex items-center gap-1.5 text-red-400">
                                                <AlertCircle className="h-3.5 w-3.5" />
                                                <span>{stats.overdueTasks} vencidas</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1.5 text-white/40">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span>{stats.completedHours}/{stats.totalHours}h</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${stats.progress}%`,
                                            backgroundColor: stats.progress === 100 ? "#22c55e" : folder.color
                                        }}
                                    />
                                </div>
                                <p className="text-[10px] text-white/25 mt-1">{stats.progress}% completado</p>
                            </div>

                            {/* Child projects */}
                            <div className="divide-y divide-white/[0.03]">
                                {children.map(({ project, stats: childStats }) => {
                                    return (
                                        <button
                                            key={project.id}
                                            onClick={() => onProjectClick(project.id)}
                                            className="w-full px-4 py-3 text-left transition-all duration-200 hover:bg-white/[0.04]"
                                        >
                                            <div className="flex items-start gap-3 sm:items-center">
                                                <Hash className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" style={{ color: project.color }} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm text-white/80">{project.nombre}</p>
                                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/35 sm:hidden">
                                                        <span>{childStats.completedTasks}/{childStats.totalTasks} tareas</span>
                                                        {childStats.nextDeadline && (
                                                            <span>
                                                                Vence {new Date(childStats.nextDeadline).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="hidden items-center gap-3 sm:flex">
                                                    <span className="text-xs text-white/30">{childStats.completedTasks}/{childStats.totalTasks}</span>
                                                    <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                                                        <div className="h-full rounded-full" style={{ width: `${childStats.progress}%`, backgroundColor: project.color }} />
                                                    </div>
                                                    {childStats.nextDeadline && (
                                                        <span className="text-[10px] text-white/25">
                                                            {new Date(childStats.nextDeadline).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                                                        </span>
                                                    )}
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-white/15" />
                                            </div>
                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06] sm:hidden">
                                                <div className="h-full rounded-full" style={{ width: `${childStats.progress}%`, backgroundColor: project.color }} />
                                            </div>
                                        </button>
                                    )
                                })}
                                {children.length === 0 && (
                                    <p className="px-4 py-3 text-xs text-white/20 italic">Sin proyectos en este grupo</p>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Standalone projects */}
                    {standaloneProjects.length > 0 && (
                        <div>
                            <h3 className="text-xs text-white/25 uppercase tracking-wider mb-3">Proyectos independientes</h3>
                            <div className="divide-y divide-white/[0.03] rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-sm">
                                {standaloneProjects.map(({ project, stats }) => {
                                    return (
                                        <button
                                            key={project.id}
                                            onClick={() => onProjectClick(project.id)}
                                            className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-all duration-200 hover:bg-white/[0.04]"
                                        >
                                            <Hash className="h-4 w-4 shrink-0" style={{ color: project.color }} />
                                            <span className="text-sm text-white/80 flex-1">{project.nombre}</span>
                                            <span className="text-xs text-white/30">{stats.completedTasks}/{stats.totalTasks}</span>
                                            <ChevronRight className="h-4 w-4 text-white/15" />
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
