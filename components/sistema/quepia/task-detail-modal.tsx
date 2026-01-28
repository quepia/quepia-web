"use client"

import { useState, useEffect, useRef } from "react"
import {
    X,
    ChevronUp,
    ChevronDown,
    MoreHorizontal,
    Circle,
    CheckCircle2,
    Hash,
    Folder,
    Calendar,
    AlertCircle,
    Flag,
    Tag,
    Bell,
    Plus,
    Link2,
    Paperclip,
    Loader2,
    Trash2,
    Send,
    Pencil,
    Check,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useTaskDetails, useSubtasks, useComments, useTaskLinks, useSistemaUsers, useTasks, useTaskDependencies } from "@/lib/sistema/hooks"
import { sendNotification } from "@/lib/sistema/actions/notifications"
import type { Task, TaskWithDetails, Subtask, Comment, TaskLink, Priority, SistemaUser, TaskType, AssetWithVersions } from "@/types/sistema"
import { PRIORITY_COLORS, PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPE_COLORS } from "@/types/sistema"
import { AssetPanel } from "./asset-panel"
import { AssetDetailModal } from "./asset-detail-modal"

interface TaskDetailModalProps {
    taskId?: string
    isOpen: boolean
    onClose: () => void
    onUpdate?: () => void
    userId?: string
}

export function TaskDetailModal({ taskId, isOpen, onClose, onUpdate, userId }: TaskDetailModalProps) {
    const { task, loading, refresh } = useTaskDetails(taskId)
    const { subtasks, createSubtask, toggleSubtask, deleteSubtask } = useSubtasks(taskId)
    const { comments, createComment, deleteComment } = useComments(taskId)
    const { links, createLink, deleteLink } = useTaskLinks(taskId)
    const { users } = useSistemaUsers()
    const { dependencies, dependents, addDependency, removeDependency } = useTaskDependencies(taskId)

    const [showCompletedSubtasks, setShowCompletedSubtasks] = useState(false)
    const [showAddDep, setShowAddDep] = useState(false)
    const [depSearchQuery, setDepSearchQuery] = useState("")
    const [comment, setComment] = useState("")
    const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
    const [isAddingSubtask, setIsAddingSubtask] = useState(false)
    const [newLinkUrl, setNewLinkUrl] = useState("")
    const [isAddingLink, setIsAddingLink] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Editing states
    const [editingTitle, setEditingTitle] = useState(false)
    const [titleValue, setTitleValue] = useState("")
    const [editingDesc, setEditingDesc] = useState(false)
    const [descValue, setDescValue] = useState("")
    const [showPriorityMenu, setShowPriorityMenu] = useState(false)
    const [showAssigneeMenu, setShowAssigneeMenu] = useState(false)
    const [editingDueDate, setEditingDueDate] = useState(false)
    const [editingDeadline, setEditingDeadline] = useState(false)
    const [showTaskTypeMenu, setShowTaskTypeMenu] = useState(false)
    const [editingHours, setEditingHours] = useState(false)
    const [hoursValue, setHoursValue] = useState("")

    useEffect(() => {
        if (isOpen && taskId) {
            refresh()
        }
    }, [isOpen, taskId])

    useEffect(() => {
        if (task) {
            setTitleValue(task.titulo)
            setDescValue(task.descripcion || "")
        }
    }, [task])

    // Close on escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        if (isOpen) window.addEventListener("keydown", handleEsc)
        return () => window.removeEventListener("keydown", handleEsc)
    }, [isOpen, onClose])

    if (!isOpen) return null

    const completedSubtasks = subtasks.filter(st => st.completed)
    const pendingSubtasks = subtasks.filter(st => !st.completed)

    const updateTaskField = async (field: string, value: any) => {
        if (!taskId) return
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const updates: Record<string, any> = { [field]: value }
            if (field === "completed") {
                updates.completed_at = value ? new Date().toISOString() : null
            }
            await supabase.from("sistema_tasks").update(updates).eq("id", taskId)
            refresh()
            onUpdate?.()

            // Handle notifications
            if (userId) { // Ensure we have an actor
                if (field === "assignee_id" && value && value !== userId) {
                    // Assignment notification
                    await sendNotification({
                        userId: value,
                        actorId: userId,
                        type: 'assignment',
                        title: `Te asignaron a la tarea: ${task?.titulo}`,
                        content: `Has sido asignado a la tarea "${task?.titulo}" en el proyecto ${task?.project?.nombre}`,
                        link: `/sistema?taskId=${taskId}`,
                        data: { taskId, projectId: task?.project_id }
                    })
                } else if (task?.assignee_id && task.assignee_id !== userId) {
                    // Notify assignee of changes if they are not the actor
                    const notifyFields = ['titulo', 'descripcion', 'due_date', 'deadline', 'priority', 'completed']
                    if (notifyFields.includes(field)) {
                        let title = `Actualización en tarea: ${task.titulo}`
                        let content = `Se actualizó ${field} en la tarea`

                        if (field === 'completed') {
                            title = `Tarea completada: ${task.titulo}`
                            content = `La tarea ha sido marcada como ${value ? 'completada' : 'incompleta'}`
                        } else if (field === 'priority') {
                            content = `La prioridad cambió a ${PRIORITY_LABELS[value as Priority]}`
                        }

                        await sendNotification({
                            userId: task.assignee_id,
                            actorId: userId,
                            type: 'system', // or status_change depending on field
                            title: title,
                            content: content,
                            link: `/sistema?taskId=${taskId}`,
                            data: { taskId, projectId: task?.project_id, field, value }
                        })
                    }
                }
            }
        } catch (err) {
            console.error("Error updating task:", err)
        }
    }

    const handleAddSubtask = async () => {
        if (!newSubtaskTitle.trim() || !taskId) return
        setSubmitting(true)
        await createSubtask({ task_id: taskId, titulo: newSubtaskTitle.trim() })
        setNewSubtaskTitle("")
        setIsAddingSubtask(false)
        setSubmitting(false)
    }

    const handleAddComment = async () => {
        if (!comment.trim() || !taskId || !userId) return
        setSubmitting(true)
        await createComment({ task_id: taskId, user_id: userId, contenido: comment.trim() })
        setComment("")
        setSubmitting(false)
    }

    const handleAddLink = async () => {
        if (!newLinkUrl.trim() || !taskId) return
        setSubmitting(true)
        await createLink({ task_id: taskId, url: newLinkUrl.trim() })
        setNewLinkUrl("")
        setIsAddingLink(false)
        setSubmitting(false)
    }

    const handleDeleteTask = async () => {
        if (!taskId) return
        if (!confirm("¿Eliminar esta tarea?")) return
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            await supabase.from("sistema_tasks").delete().eq("id", taskId)
            onUpdate?.()
            onClose()
        } catch (err) {
            console.error("Error deleting task:", err)
        }
    }

    const handleSaveTitle = async () => {
        if (titleValue.trim() && titleValue !== task?.titulo) {
            await updateTaskField("titulo", titleValue.trim())
        }
        setEditingTitle(false)
    }

    const handleSaveDesc = async () => {
        const val = descValue.trim() || null
        if (val !== (task?.descripcion || null)) {
            await updateTaskField("descripcion", val)
        }
        setEditingDesc(false)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-[#141414] rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col border border-white/[0.08]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2 text-sm text-white/50">
                        <Hash className="h-4 w-4 text-quepia-cyan" />
                        <span>{task?.project?.nombre || "Proyecto"}</span>
                        <span className="text-white/20">/</span>
                        <span>{task?.column?.nombre || "Columna"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleDeleteTask}
                            className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors"
                            title="Eliminar tarea"
                        >
                            <Trash2 className="h-4 w-4 text-white/30 hover:text-red-400" />
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                            <X className="h-4 w-4 text-white/40" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-quepia-cyan" />
                    </div>
                ) : task ? (
                    <div className="flex-1 overflow-y-auto">
                        <div className="flex">
                            {/* Main Content */}
                            <div className="flex-1 p-6">
                                {/* Task Title */}
                                <div className="flex items-start gap-3 mb-4">
                                    <button
                                        onClick={() => updateTaskField("completed", !task.completed)}
                                        className="mt-1"
                                    >
                                        {task.completed ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <Circle className="h-5 w-5 text-white/30 hover:text-quepia-cyan transition-colors" />
                                        )}
                                    </button>
                                    {editingTitle ? (
                                        <input
                                            type="text"
                                            value={titleValue}
                                            onChange={(e) => setTitleValue(e.target.value)}
                                            onBlur={handleSaveTitle}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSaveTitle()
                                                if (e.key === "Escape") { setTitleValue(task.titulo); setEditingTitle(false) }
                                            }}
                                            autoFocus
                                            className="flex-1 text-xl font-semibold text-white bg-transparent border-b border-quepia-cyan outline-none"
                                        />
                                    ) : (
                                        <h1
                                            onClick={() => setEditingTitle(true)}
                                            className={cn(
                                                "text-xl font-semibold leading-tight cursor-text hover:bg-white/[0.03] rounded px-1 -mx-1 transition-colors flex-1",
                                                task.completed ? "text-white/40 line-through" : "text-white"
                                            )}
                                        >
                                            {task.titulo.replace(/\*/g, "")}
                                        </h1>
                                    )}
                                </div>

                                {/* Description */}
                                <div className="mb-6">
                                    {editingDesc ? (
                                        <textarea
                                            value={descValue}
                                            onChange={(e) => setDescValue(e.target.value)}
                                            onBlur={handleSaveDesc}
                                            onKeyDown={(e) => {
                                                if (e.key === "Escape") { setDescValue(task.descripcion || ""); setEditingDesc(false) }
                                            }}
                                            autoFocus
                                            placeholder="Agregar descripción..."
                                            rows={4}
                                            className="w-full text-sm text-white/80 bg-white/[0.03] border border-white/10 rounded-lg p-3 outline-none focus:border-quepia-cyan resize-none placeholder:text-white/30"
                                        />
                                    ) : (
                                        <div
                                            onClick={() => setEditingDesc(true)}
                                            className="text-sm text-white/50 cursor-text hover:bg-white/[0.03] rounded-lg p-3 -m-3 transition-colors min-h-[40px]"
                                        >
                                            {task.descripcion || (
                                                <span className="text-white/25 italic">Agregar descripción...</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Links */}
                                {links.length > 0 && (
                                    <div className="mb-4 space-y-1">
                                        {links.map((link) => (
                                            <div key={link.id} className="flex items-center gap-2 group">
                                                <a
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-sm text-quepia-cyan hover:underline flex-1 truncate"
                                                >
                                                    <Link2 className="h-4 w-4 shrink-0" />
                                                    {link.titulo || link.url}
                                                </a>
                                                <button
                                                    onClick={() => deleteLink(link.id)}
                                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] rounded transition-all"
                                                >
                                                    <Trash2 className="h-3 w-3 text-white/40" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add Link */}
                                {isAddingLink ? (
                                    <div className="mb-4 flex items-center gap-2">
                                        <input
                                            type="url"
                                            placeholder="https://..."
                                            value={newLinkUrl}
                                            onChange={(e) => setNewLinkUrl(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleAddLink()
                                                if (e.key === "Escape") { setIsAddingLink(false); setNewLinkUrl("") }
                                            }}
                                            autoFocus
                                            className="flex-1 px-3 py-2 text-sm bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan"
                                        />
                                        <button onClick={handleAddLink} disabled={!newLinkUrl.trim() || submitting} className="px-3 py-2 text-xs font-medium rounded-lg bg-quepia-cyan text-black disabled:opacity-50">
                                            Agregar
                                        </button>
                                        <button onClick={() => { setIsAddingLink(false); setNewLinkUrl("") }} className="px-3 py-2 text-xs text-white/50 hover:text-white/70">
                                            Cancelar
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setIsAddingLink(true)} className="mb-4 flex items-center gap-2 text-sm text-white/30 hover:text-white/50 transition-colors">
                                        <Link2 className="h-4 w-4" />
                                        <span>Agregar enlace</span>
                                    </button>
                                )}

                                {/* Subtasks Section */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white">Sub-tareas</span>
                                            {subtasks.length > 0 && (
                                                <span className="text-xs text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                                    {completedSubtasks.length}/{subtasks.length}
                                                </span>
                                            )}
                                        </div>
                                        {completedSubtasks.length > 0 && (
                                            <button
                                                onClick={() => setShowCompletedSubtasks(!showCompletedSubtasks)}
                                                className="text-xs text-white/35 hover:text-white/55 transition-colors"
                                            >
                                                {showCompletedSubtasks ? "Ocultar" : "Mostrar"} completadas
                                            </button>
                                        )}
                                    </div>

                                    {/* Progress bar */}
                                    {subtasks.length > 0 && (
                                        <div className="h-1 bg-white/[0.06] rounded-full mb-3 overflow-hidden">
                                            <div
                                                className="h-full bg-green-500/70 rounded-full transition-all duration-300"
                                                style={{ width: `${(completedSubtasks.length / subtasks.length) * 100}%` }}
                                            />
                                        </div>
                                    )}

                                    {/* Add Subtask */}
                                    {isAddingSubtask ? (
                                        <div className="flex items-center gap-2 mb-2">
                                            <Circle className="h-4 w-4 text-white/30" />
                                            <input
                                                type="text"
                                                placeholder="Título de sub-tarea"
                                                value={newSubtaskTitle}
                                                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleAddSubtask()
                                                    if (e.key === "Escape") { setIsAddingSubtask(false); setNewSubtaskTitle("") }
                                                }}
                                                autoFocus
                                                className="flex-1 px-2 py-1 text-sm bg-transparent text-white placeholder:text-white/30 outline-none border-b border-white/15 focus:border-quepia-cyan"
                                            />
                                            <button onClick={handleAddSubtask} disabled={!newSubtaskTitle.trim() || submitting} className="px-2 py-1 text-xs font-medium rounded bg-quepia-cyan text-black disabled:opacity-50">
                                                Agregar
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setIsAddingSubtask(true)} className="flex items-center gap-2 text-sm text-quepia-cyan/80 hover:text-quepia-cyan hover:bg-white/[0.03] px-2 py-1.5 rounded-md transition-colors mb-2">
                                            <Plus className="h-4 w-4" />
                                            <span>Agregar sub-tarea</span>
                                        </button>
                                    )}

                                    {/* Subtask List */}
                                    <div className="space-y-0.5">
                                        {pendingSubtasks.map((subtask) => (
                                            <SubtaskItem key={subtask.id} subtask={subtask} onToggle={() => toggleSubtask(subtask.id)} onDelete={() => deleteSubtask(subtask.id)} />
                                        ))}
                                        {showCompletedSubtasks && completedSubtasks.map((subtask) => (
                                            <SubtaskItem key={subtask.id} subtask={subtask} onToggle={() => toggleSubtask(subtask.id)} onDelete={() => deleteSubtask(subtask.id)} completed />
                                        ))}
                                    </div>
                                </div>

                                {/* Dependencies Section */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium text-white">Dependencias</span>
                                        <button
                                            onClick={() => setShowAddDep(!showAddDep)}
                                            className="text-xs text-quepia-cyan/80 hover:text-quepia-cyan transition-colors"
                                        >
                                            {showAddDep ? "Cerrar" : "+ Agregar"}
                                        </button>
                                    </div>

                                    {showAddDep && (
                                        <div className="mb-3 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                                            <input
                                                type="text"
                                                placeholder="Buscar tarea..."
                                                value={depSearchQuery}
                                                onChange={(e) => setDepSearchQuery(e.target.value)}
                                                className="w-full px-2 py-1.5 text-sm bg-transparent border-b border-white/10 text-white placeholder:text-white/30 outline-none focus:border-quepia-cyan mb-2"
                                            />
                                            <div className="max-h-32 overflow-y-auto space-y-0.5">
                                                {task?.project_id && (
                                                    <DepSearchResults
                                                        projectId={task.project_id}
                                                        query={depSearchQuery}
                                                        currentTaskId={taskId!}
                                                        existingDepIds={dependencies.map(d => d.depends_on_id)}
                                                        onAdd={async (id) => {
                                                            await addDependency(id)
                                                            setDepSearchQuery("")
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {dependencies.length > 0 ? (
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Depende de:</p>
                                            {dependencies.map(dep => (
                                                <DepItem key={dep.id} depId={dep.depends_on_id} onRemove={() => removeDependency(dep.depends_on_id)} />
                                            ))}
                                        </div>
                                    ) : !showAddDep ? (
                                        <p className="text-xs text-white/25 italic">Sin dependencias</p>
                                    ) : null}

                                    {dependents.length > 0 && (
                                        <div className="space-y-1 mt-3">
                                            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Bloquea a:</p>
                                            {dependents.map(dep => (
                                                <DepItem key={dep.id} depId={dep.task_id} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Comments Section */}
                                <div className="mb-6">
                                    <h3 className="text-sm font-medium text-white mb-3">Comentarios</h3>

                                    {comments.length > 0 && (
                                        <div className="space-y-3 mb-4">
                                            {comments.map((c: any) => (
                                                <div key={c.id} className="flex items-start gap-3 group">
                                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-quepia-cyan/70 to-quepia-magenta/70 flex items-center justify-center text-[10px] text-white font-medium shrink-0">
                                                        {c.user?.nombre?.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "?"}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-white/80">{c.user?.nombre || "Usuario"}</span>
                                                            <span className="text-xs text-white/25">
                                                                {new Date(c.created_at).toLocaleDateString("es-AR")}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-white/65 mt-0.5">{c.contenido}</p>
                                                    </div>
                                                    {c.user_id === userId && (
                                                        <button onClick={() => deleteComment(c.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] rounded transition-all">
                                                            <Trash2 className="h-3 w-3 text-white/30" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Comment Input */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-quepia-cyan/70 to-quepia-magenta/70 flex items-center justify-center text-[10px] text-white font-medium shrink-0">
                                            Q
                                        </div>
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                placeholder="Agregar un comentario..."
                                                value={comment}
                                                onChange={(e) => setComment(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment() }
                                                }}
                                                className="w-full px-3 py-2 pr-12 text-sm bg-white/[0.03] border border-white/[0.06] rounded-lg text-white placeholder:text-white/25 outline-none focus:border-quepia-cyan/50 transition-colors"
                                            />
                                            <button
                                                onClick={handleAddComment}
                                                disabled={!comment.trim() || submitting}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/[0.06] rounded transition-colors disabled:opacity-30"
                                            >
                                                <Send className="h-4 w-4 text-quepia-cyan" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Asset Panel */}
                                {taskId && task?.project_id && userId && (
                                    <div className="mb-6">
                                        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                                            <AssetPanel
                                                taskId={taskId}
                                                projectId={task.project_id}
                                                userId={userId}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sidebar */}
                            <div className="w-56 border-l border-white/[0.06] p-4 bg-white/[0.02]">
                                <div className="space-y-5">
                                    {/* Project */}
                                    <SidebarField label="Proyecto">
                                        <div className="flex items-center gap-2 text-sm text-white/70">
                                            <Hash className="h-4 w-4 text-quepia-cyan" />
                                            <span>{task.project?.nombre || "—"}</span>
                                        </div>
                                    </SidebarField>

                                    {/* Assignee */}
                                    <SidebarField label="Asignado">
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowAssigneeMenu(!showAssigneeMenu)}
                                                className="flex items-center gap-2 hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors w-full"
                                            >
                                                {task.assignee ? (
                                                    <>
                                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-quepia-cyan/70 to-quepia-magenta/70 flex items-center justify-center text-[10px] text-white font-medium">
                                                            {task.assignee.nombre.split(" ").map(n => n[0]).join("").toUpperCase()}
                                                        </div>
                                                        <span className="text-sm text-white/70">{task.assignee.nombre}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-sm text-white/30 flex items-center gap-1">
                                                        <Plus className="h-3 w-3" /> Asignar
                                                    </span>
                                                )}
                                            </button>
                                            {showAssigneeMenu && (
                                                <DropdownMenu onClose={() => setShowAssigneeMenu(false)}>
                                                    <button
                                                        onClick={() => { updateTaskField("assignee_id", null); setShowAssigneeMenu(false) }}
                                                        className="w-full text-left px-3 py-2 text-sm text-white/50 hover:bg-white/[0.06] transition-colors"
                                                    >
                                                        Sin asignar
                                                    </button>
                                                    {users.map((u) => (
                                                        <button
                                                            key={u.id}
                                                            onClick={() => { updateTaskField("assignee_id", u.id); setShowAssigneeMenu(false) }}
                                                            className={cn(
                                                                "w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2",
                                                                task.assignee_id === u.id ? "text-quepia-cyan" : "text-white/70"
                                                            )}
                                                        >
                                                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-quepia-cyan/60 to-quepia-magenta/60 flex items-center justify-center text-[9px] text-white font-medium">
                                                                {u.nombre.split(" ").map(n => n[0]).join("").toUpperCase()}
                                                            </div>
                                                            {u.nombre}
                                                        </button>
                                                    ))}
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </SidebarField>

                                    {/* Due Date */}
                                    <SidebarField label="Fecha">
                                        {editingDueDate ? (
                                            <input
                                                type="date"
                                                defaultValue={task.due_date || ""}
                                                onChange={(e) => { updateTaskField("due_date", e.target.value || null); setEditingDueDate(false) }}
                                                onBlur={() => setEditingDueDate(false)}
                                                autoFocus
                                                className="text-sm bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-quepia-cyan w-full [color-scheme:dark]"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => setEditingDueDate(true)}
                                                className="flex items-center gap-2 text-sm hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
                                            >
                                                <Calendar className="h-4 w-4 text-white/30" />
                                                {task.due_date ? (
                                                    <span className="text-white/70">{new Date(task.due_date).toLocaleDateString("es-AR")}</span>
                                                ) : (
                                                    <span className="text-white/30">Agregar fecha</span>
                                                )}
                                            </button>
                                        )}
                                    </SidebarField>

                                    {/* Deadline */}
                                    <SidebarField label="Deadline">
                                        {editingDeadline ? (
                                            <input
                                                type="date"
                                                defaultValue={task.deadline || ""}
                                                onChange={(e) => { updateTaskField("deadline", e.target.value || null); setEditingDeadline(false) }}
                                                onBlur={() => setEditingDeadline(false)}
                                                autoFocus
                                                className="text-sm bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-quepia-cyan w-full [color-scheme:dark]"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => setEditingDeadline(true)}
                                                className="flex items-center gap-2 text-sm hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
                                            >
                                                {task.deadline && new Date(task.deadline) < new Date(new Date().setHours(0, 0, 0, 0)) ? (
                                                    <AlertCircle className="h-4 w-4 text-red-400" />
                                                ) : (
                                                    <Calendar className="h-4 w-4 text-white/30" />
                                                )}
                                                {task.deadline ? (
                                                    <span className={cn(
                                                        new Date(task.deadline) < new Date(new Date().setHours(0, 0, 0, 0))
                                                            ? "text-red-400"
                                                            : "text-white/70"
                                                    )}>
                                                        {new Date(task.deadline).toLocaleDateString("es-AR")}
                                                    </span>
                                                ) : (
                                                    <span className="text-white/30">Agregar deadline</span>
                                                )}
                                            </button>
                                        )}
                                    </SidebarField>

                                    {/* Priority */}
                                    <SidebarField label="Prioridad">
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                                                className="flex items-center gap-2 text-sm hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
                                            >
                                                <Flag className="h-4 w-4" style={{ color: PRIORITY_COLORS[task.priority as Priority] }} />
                                                <span className="text-white/70">{PRIORITY_LABELS[task.priority as Priority]}</span>
                                            </button>
                                            {showPriorityMenu && (
                                                <DropdownMenu onClose={() => setShowPriorityMenu(false)}>
                                                    {(["P1", "P2", "P3", "P4"] as Priority[]).map((p) => (
                                                        <button
                                                            key={p}
                                                            onClick={() => { updateTaskField("priority", p); setShowPriorityMenu(false) }}
                                                            className={cn(
                                                                "w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2",
                                                                task.priority === p ? "text-white" : "text-white/60"
                                                            )}
                                                        >
                                                            <Flag className="h-4 w-4" style={{ color: PRIORITY_COLORS[p] }} />
                                                            {PRIORITY_LABELS[p]}
                                                            {task.priority === p && <Check className="h-3 w-3 ml-auto text-quepia-cyan" />}
                                                        </button>
                                                    ))}
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </SidebarField>

                                    {/* Task Type */}
                                    <SidebarField label="Tipo de tarea">
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowTaskTypeMenu(!showTaskTypeMenu)}
                                                className="flex items-center gap-2 text-sm hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
                                            >
                                                {task.task_type ? (
                                                    <>
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TASK_TYPE_COLORS[task.task_type as TaskType] }} />
                                                        <span className="text-white/70">{TASK_TYPE_LABELS[task.task_type as TaskType]}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-white/30">Sin tipo</span>
                                                )}
                                            </button>
                                            {showTaskTypeMenu && (
                                                <DropdownMenu onClose={() => setShowTaskTypeMenu(false)}>
                                                    <button
                                                        onClick={() => { updateTaskField("task_type", null); setShowTaskTypeMenu(false) }}
                                                        className="w-full text-left px-3 py-2 text-sm text-white/40 hover:bg-white/[0.06] transition-colors"
                                                    >
                                                        Sin tipo
                                                    </button>
                                                    {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => (
                                                        <button
                                                            key={t}
                                                            onClick={() => { updateTaskField("task_type", t); setShowTaskTypeMenu(false) }}
                                                            className={cn(
                                                                "w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2",
                                                                task.task_type === t ? "text-white" : "text-white/60"
                                                            )}
                                                        >
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TASK_TYPE_COLORS[t] }} />
                                                            {TASK_TYPE_LABELS[t]}
                                                            {task.task_type === t && <Check className="h-3 w-3 ml-auto text-quepia-cyan" />}
                                                        </button>
                                                    ))}
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </SidebarField>

                                    {/* Estimated Hours */}
                                    <SidebarField label="Horas estimadas">
                                        {editingHours ? (
                                            <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                value={hoursValue}
                                                onChange={(e) => setHoursValue(e.target.value)}
                                                onBlur={() => {
                                                    const val = hoursValue.trim() === "" ? null : parseFloat(hoursValue)
                                                    updateTaskField("estimated_hours", val && val > 0 ? val : null)
                                                    setEditingHours(false)
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        const val = hoursValue.trim() === "" ? null : parseFloat(hoursValue)
                                                        updateTaskField("estimated_hours", val && val > 0 ? val : null)
                                                        setEditingHours(false)
                                                    }
                                                    if (e.key === "Escape") setEditingHours(false)
                                                }}
                                                autoFocus
                                                className="text-sm bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-quepia-cyan w-20 [color-scheme:dark]"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setHoursValue(task.estimated_hours?.toString() || "")
                                                    setEditingHours(true)
                                                }}
                                                className="flex items-center gap-2 text-sm hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
                                            >
                                                {task.estimated_hours ? (
                                                    <span className="text-white/70">{task.estimated_hours}h</span>
                                                ) : (
                                                    <span className="text-white/30">Agregar</span>
                                                )}
                                            </button>
                                        )}
                                    </SidebarField>

                                    {/* Blocking Subtasks */}
                                    <SidebarField label="Subtareas bloqueantes">
                                        <button
                                            onClick={() => updateTaskField("blocking_subtasks", !task.blocking_subtasks)}
                                            className={cn(
                                                "flex items-center gap-2 text-sm px-2 py-1 rounded transition-colors",
                                                task.blocking_subtasks
                                                    ? "bg-amber-500/10 text-amber-400"
                                                    : "text-white/30 hover:bg-white/[0.04]"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-4 rounded-full relative transition-colors",
                                                task.blocking_subtasks ? "bg-amber-500/40" : "bg-white/10"
                                            )}>
                                                <div className={cn(
                                                    "w-3 h-3 rounded-full absolute top-0.5 transition-all",
                                                    task.blocking_subtasks ? "right-0.5 bg-amber-400" : "left-0.5 bg-white/30"
                                                )} />
                                            </div>
                                            <span>{task.blocking_subtasks ? "Activado" : "Desactivado"}</span>
                                        </button>
                                    </SidebarField>

                                    {/* Labels */}
                                    <SidebarField label="Etiquetas">
                                        {task.labels && task.labels.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {task.labels.map((label, i) => (
                                                    <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-white/[0.06] text-white/60">
                                                        {label}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-sm text-white/30 flex items-center gap-1">
                                                <Tag className="h-4 w-4" /> Agregar
                                            </span>
                                        )}
                                    </SidebarField>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <p className="text-white/30">Tarea no encontrada</p>
                    </div>
                )
                }
            </div>
        </div>
    )
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs text-white/30 mb-1.5">{label}</p>
            {children}
        </div>
    )
}

function DropdownMenu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [onClose])

    return (
        <div ref={ref} className="absolute left-0 top-full mt-1 bg-[#1a1a1a] border border-white/[0.08] rounded-lg shadow-xl py-1 z-20 min-w-[160px] max-h-[200px] overflow-y-auto">
            {children}
        </div>
    )
}

function DepSearchResults({ projectId, query, currentTaskId, existingDepIds, onAdd }: {
    projectId: string
    query: string
    currentTaskId: string
    existingDepIds: string[]
    onAdd: (id: string) => void
}) {
    const { columns } = useTasks(projectId)
    const allTasks = columns.flatMap(c => c.tasks).filter(t =>
        t.id !== currentTaskId &&
        !existingDepIds.includes(t.id) &&
        (!query || t.titulo.toLowerCase().includes(query.toLowerCase()))
    )

    if (allTasks.length === 0) {
        return <p className="text-xs text-white/25 py-2 text-center">Sin resultados</p>
    }

    return (
        <>
            {allTasks.slice(0, 8).map(t => (
                <button
                    key={t.id}
                    onClick={() => onAdd(t.id)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-sm text-white/60 hover:bg-white/[0.04] rounded transition-colors"
                >
                    <Circle className="h-3 w-3 text-white/20 shrink-0" />
                    <span className="truncate">{t.titulo}</span>
                </button>
            ))}
        </>
    )
}

function DepItem({ depId, onRemove }: { depId: string; onRemove?: () => void }) {
    const [title, setTitle] = useState<string>("...")

    useEffect(() => {
        (async () => {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const { data } = await supabase.from("sistema_tasks").select("titulo, completed").eq("id", depId).single()
            if (data) setTitle(data.titulo)
        })()
    }, [depId])

    return (
        <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.03] group">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
            <span className="text-xs text-white/60 truncate flex-1">{title}</span>
            {onRemove && (
                <button onClick={onRemove} className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] rounded transition-all">
                    <X className="h-3 w-3 text-white/30" />
                </button>
            )}
        </div>
    )
}

function SubtaskItem({ subtask, onToggle, onDelete, completed }: {
    subtask: Subtask & { assignee?: { nombre: string } | null };
    onToggle: () => void;
    onDelete: () => void;
    completed?: boolean;
}) {
    return (
        <div className={cn(
            "flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.03] rounded-md transition-colors group",
            completed && "opacity-50"
        )}>
            <button onClick={onToggle}>
                {completed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                    <Circle className="h-4 w-4 text-white/30 hover:text-quepia-cyan transition-colors" />
                )}
            </button>
            <span className={cn("flex-1 text-sm", completed ? "text-white/35 line-through" : "text-white/75")}>
                {subtask.titulo}
            </span>
            {subtask.assignee && (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-quepia-cyan/60 to-quepia-magenta/60 flex items-center justify-center text-[8px] text-white font-medium">
                    {subtask.assignee.nombre.split(" ").map(n => n[0]).join("").toUpperCase()}
                </div>
            )}
            <button onClick={onDelete} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] rounded transition-all">
                <Trash2 className="h-3 w-3 text-white/30" />
            </button>
        </div>
    )
}
