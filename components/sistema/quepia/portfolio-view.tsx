"use client"

import { useMemo } from "react"
import { Folder, Hash, ChevronRight, CheckCircle2, Clock, AlertCircle, BarChart3 } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { ProjectWithChildren } from "@/types/sistema"
import type { TaskWithProject } from "@/lib/sistema/hooks/useAllTasks"

interface PortfolioViewProps {
    projects: ProjectWithChildren[]
    tasks: TaskWithProject[]
    loading: boolean
    onProjectClick: (projectId: string) => void
}

export function PortfolioView({ projects, tasks, loading, onProjectClick }: PortfolioViewProps) {
    // Group projects by parent (folders)
    const portfolios = useMemo(() => {
        const folders = projects.filter(p => p.icon === "folder")
        return folders.map(folder => {
            const childProjects = projects.filter(p => p.parent_id === folder.id)
            const childIds = new Set(childProjects.map(p => p.id))
            const folderTasks = tasks.filter(t => childIds.has(t.project_id))
            const completedTasks = folderTasks.filter(t => t.completed)
            const overdueTasks = folderTasks.filter(t => !t.completed && t.due_date && new Date(t.due_date) < new Date())
            const totalHours = folderTasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0)
            const completedHours = completedTasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0)

            return {
                folder,
                children: childProjects,
                stats: {
                    totalTasks: folderTasks.length,
                    completedTasks: completedTasks.length,
                    overdueTasks: overdueTasks.length,
                    totalHours,
                    completedHours,
                    progress: folderTasks.length > 0 ? Math.round((completedTasks.length / folderTasks.length) * 100) : 0,
                }
            }
        })
    }, [projects, tasks])

    // Standalone projects (no parent)
    const standaloneProjects = useMemo(() => {
        const folderIds = new Set(projects.filter(p => p.icon === "folder").map(p => p.id))
        return projects.filter(p => p.icon === "hash" && !p.parent_id && !folderIds.has(p.id))
    }, [projects])

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto p-6">
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
                        <div key={folder.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                            {/* Portfolio header */}
                            <div className="p-4 border-b border-white/[0.04]">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: folder.color + "20" }}>
                                            <Folder className="h-4 w-4" style={{ color: folder.color }} />
                                        </div>
                                        <div>
                                            <h3 className="text-white font-medium">{folder.nombre}</h3>
                                            <p className="text-xs text-white/30">{children.length} proyecto{children.length !== 1 ? "s" : ""}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
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
                                {children.map(project => {
                                    const projTasks = tasks.filter(t => t.project_id === project.id)
                                    const projCompleted = projTasks.filter(t => t.completed).length
                                    const projProgress = projTasks.length > 0 ? Math.round((projCompleted / projTasks.length) * 100) : 0
                                    const nextDeadline = projTasks
                                        .filter(t => !t.completed && t.due_date)
                                        .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0]

                                    return (
                                        <button
                                            key={project.id}
                                            onClick={() => onProjectClick(project.id)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                                        >
                                            <Hash className="h-4 w-4 shrink-0" style={{ color: project.color }} />
                                            <span className="text-sm text-white/80 flex-1">{project.nombre}</span>
                                            <span className="text-xs text-white/30">{projCompleted}/{projTasks.length}</span>
                                            <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${projProgress}%`, backgroundColor: project.color }} />
                                            </div>
                                            {nextDeadline?.due_date && (
                                                <span className="text-[10px] text-white/25">
                                                    {new Date(nextDeadline.due_date).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                                                </span>
                                            )}
                                            <ChevronRight className="h-4 w-4 text-white/15" />
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
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl divide-y divide-white/[0.03]">
                                {standaloneProjects.map(project => {
                                    const projTasks = tasks.filter(t => t.project_id === project.id)
                                    const projCompleted = projTasks.filter(t => t.completed).length

                                    return (
                                        <button
                                            key={project.id}
                                            onClick={() => onProjectClick(project.id)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                                        >
                                            <Hash className="h-4 w-4 shrink-0" style={{ color: project.color }} />
                                            <span className="text-sm text-white/80 flex-1">{project.nombre}</span>
                                            <span className="text-xs text-white/30">{projCompleted}/{projTasks.length}</span>
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
