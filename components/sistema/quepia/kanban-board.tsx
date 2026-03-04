"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import {
    Plus,
    MoreHorizontal,
    Circle,
    CheckCircle2,
    Link2,
    Loader2,
    Pencil,
    Trash2,
    Check,
    X,
    Flag,
    Calendar,
    LayoutGrid,
    GitBranch,
    CloudUpload,
    Paperclip,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useTasks, useColumns } from "@/lib/sistema/hooks"
import type { Task, ColumnWithTasks, SistemaUser, TaskType, Subtask } from "@/types/sistema"
import { PRIORITY_COLORS, PRIORITY_LABELS, Priority, TASK_TYPE_LABELS, TASK_TYPE_COLORS } from "@/types/sistema"
import { TaskContextMenu } from "@/components/sistema/quepia/task-context-menu"
import { SendReviewModal } from "@/components/sistema/quepia/send-review-modal"
import { ProjectResources } from "@/components/sistema/quepia/project-resources"
import { uploadAssetFile, type UploadProgressUpdate } from "@/lib/sistema/asset-upload"
import { useToast } from "@/components/ui/toast-provider"
import { useConfirm } from "@/components/ui/confirm-provider"
import { trackExperienceMetric } from "@/lib/sistema/experience-metrics"

// Re-export types for backward compatibility
export type { Task, ColumnWithTasks as ColumnType }

interface KanbanBoardProps {
    projectId?: string
    projectName: string
    onTaskClick?: (task: Task) => void
    onRefreshRef?: React.MutableRefObject<(() => void) | null>
    userId?: string
}

export function KanbanBoard({ projectId, projectName, onTaskClick, onRefreshRef, userId }: KanbanBoardProps) {
    const { toast } = useToast()
    const { confirm } = useConfirm()
    const { columns, loading, error, createTask, updateTask, moveTask, duplicateTask, deleteTask, clearCompletedTasks, silentRefresh } = useTasks(projectId)

    // Expose silentRefresh to parent via ref
    useEffect(() => {
        if (onRefreshRef) {
            onRefreshRef.current = silentRefresh
        }
        return () => {
            if (onRefreshRef) {
                onRefreshRef.current = null
            }
        }
    }, [onRefreshRef, silentRefresh])
    const { updateColumn, updateColumnWipLimit, createColumn, deleteColumn } = useColumns(projectId)

    const [addingTaskColumn, setAddingTaskColumn] = useState<string | null>(null)
    const [newTaskTitle, setNewTaskTitle] = useState("")
    const [draggedTask, setDraggedTask] = useState<Task | null>(null)
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
    const [editingColumnName, setEditingColumnName] = useState("")
    const [isAddingColumn, setIsAddingColumn] = useState(false)
    const [newColumnName, setNewColumnName] = useState("")
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
    const [showCompletedTasks, setShowCompletedTasks] = useState(false)
    const [isClearingCompleted, setIsClearingCompleted] = useState(false)

    const completedTasksCount = useMemo(
        () => columns.reduce((count, column) => count + column.tasks.filter((task) => task.completed).length, 0),
        [columns]
    )

    // Review Modal State
    const [reviewTask, setReviewTask] = useState<Task | null>(null)
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)

    const handleSendForReview = (task: Task) => {
        setReviewTask(task)
        setIsReviewModalOpen(true)
    }

    const handleAddTask = async (columnId: string) => {
        if (!newTaskTitle.trim() || !projectId) return

        await createTask({
            project_id: projectId,
            column_id: columnId,
            titulo: newTaskTitle.trim(),
        })

        setNewTaskTitle("")
        setAddingTaskColumn(null)
    }

    const handleDeleteTask = async (taskId: string) => {
        const accepted = await confirm({
            title: "Eliminar tarea",
            description: "Esta acción no se puede deshacer.",
            confirmText: "Eliminar",
            cancelText: "Cancelar",
            tone: "danger"
        })

        if (!accepted) return

        await deleteTask(taskId)
        trackExperienceMetric("task_deleted")
        toast({
            title: "Tarea eliminada",
            variant: "success"
        })
    }

    const handleDragStart = (e: React.DragEvent, task: Task) => {
        setDraggedTask(task)
        e.dataTransfer.effectAllowed = "move"
    }

    const handleDragOver = (e: React.DragEvent, columnId: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setDragOverColumn(columnId)
    }

    const handleDragLeave = () => {
        setDragOverColumn(null)
    }

    const handleDrop = async (e: React.DragEvent, columnId: string) => {
        e.preventDefault()
        setDragOverColumn(null)

        if (!draggedTask || draggedTask.column_id === columnId) {
            setDraggedTask(null)
            return
        }

        const targetColumn = columns.find(c => c.id === columnId)
        if (!targetColumn) {
            setDraggedTask(null)
            return
        }

        // Enforce WIP limit
        if (targetColumn.wip_limit && targetColumn.tasks.length >= targetColumn.wip_limit) {
            trackExperienceMetric("task_move_blocked")
            toast({
                title: "Límite WIP alcanzado",
                description: `La columna "${targetColumn.nombre}" permite hasta ${targetColumn.wip_limit} tareas.`,
                variant: "warning"
            })
            setDraggedTask(null)
            return
        }

        // Enforce blocking subtasks: cannot move to last column if incomplete subtasks exist
        if (draggedTask.blocking_subtasks) {
            const isLastColumn = columns.indexOf(targetColumn) === columns.length - 1
            if (isLastColumn) {
                try {
                    const { createClient } = await import("@/lib/sistema/supabase/client")
                    const supabase = createClient()
                    const { data: subs } = await supabase
                        .from("sistema_subtasks")
                        .select("id, completed")
                        .eq("task_id", draggedTask.id)
                    const incomplete = subs?.filter(s => !s.completed) || []
                    if (incomplete.length > 0) {
                        trackExperienceMetric("task_move_blocked")
                        toast({
                            title: "Movimiento bloqueado por subtareas",
                            description: `"${draggedTask.titulo}" tiene ${incomplete.length} subtarea(s) sin completar.`,
                            variant: "warning"
                        })
                        setDraggedTask(null)
                        return
                    }
                } catch (err) {
                    console.error("Error checking subtasks:", err)
                }
            }
        }

        // Enforce task dependencies: cannot move if dependencies are not in last column
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const { data: deps } = await supabase
                .from("sistema_task_dependencies")
                .select("depends_on_id")
                .eq("task_id", draggedTask.id)
            if (deps && deps.length > 0) {
                const depIds = deps.map(d => d.depends_on_id)
                const allTasks = columns.flatMap(c => c.tasks)
                const lastColId = columns[columns.length - 1]?.id
                const blockedBy = depIds
                    .map(id => allTasks.find(t => t.id === id))
                    .filter(t => t && t.column_id !== lastColId)
                if (blockedBy.length > 0) {
                    const names = blockedBy.map(t => `"${t!.titulo}"`).join(", ")
                    trackExperienceMetric("task_move_blocked")
                    toast({
                        title: "Movimiento bloqueado por dependencias",
                        description: `"${draggedTask.titulo}" depende de ${names}.`,
                        variant: "warning"
                    })
                    setDraggedTask(null)
                    return
                }
            }
        } catch (err) {
            console.error("Error checking dependencies:", err)
        }

        const newOrden = targetColumn.tasks.length

        await moveTask(draggedTask.id, columnId, newOrden)
        setDraggedTask(null)
    }

    const handleDragEnd = () => {
        setDraggedTask(null)
        setDragOverColumn(null)
    }

    const handleEditColumn = (column: ColumnWithTasks) => {
        setEditingColumnId(column.id)
        setEditingColumnName(column.nombre)
    }

    const handleSaveColumnEdit = async (columnId: string) => {
        if (!editingColumnName.trim()) return
        await updateColumn(columnId, editingColumnName.trim())
        setEditingColumnId(null)
        setEditingColumnName("")
        // Column name updated optimistically via useColumns, silently sync tasks
        await silentRefresh()
    }

    const handleCancelColumnEdit = () => {
        setEditingColumnId(null)
        setEditingColumnName("")
    }

    const handleDeleteColumn = async (columnId: string) => {
        const column = columns.find(c => c.id === columnId)
        if (column && column.tasks.length > 0) {
            trackExperienceMetric("errors_shown")
            toast({
                title: "No se puede eliminar la columna",
                description: "Mueve o completa sus tareas primero.",
                variant: "warning"
            })
            return
        }
        const accepted = await confirm({
            title: "Eliminar columna",
            description: "La columna se eliminará permanentemente.",
            confirmText: "Eliminar",
            cancelText: "Cancelar",
            tone: "danger"
        })
        if (!accepted) return
        await deleteColumn(columnId)
        await silentRefresh()
        toast({
            title: "Columna eliminada",
            variant: "success"
        })
    }

    const handleAddColumn = async () => {
        if (!newColumnName.trim()) return
        await createColumn(newColumnName.trim())
        setNewColumnName("")
        setIsAddingColumn(false)
        await silentRefresh()
    }

    const handleToggleComplete = async (taskId: string) => {
        const task = columns.flatMap(c => c.tasks).find(t => t.id === taskId)
        if (!task) return
        await updateTask(taskId, { completed: !task.completed })
    }

    const handleClearCompletedTasks = async () => {
        if (completedTasksCount === 0 || isClearingCompleted) return

        const accepted = await confirm({
            title: "Limpiar tareas completadas",
            description: "Esta acción eliminará permanentemente todas las tareas completadas del proyecto.",
            confirmText: "Eliminar completadas",
            cancelText: "Cancelar",
            tone: "danger"
        })
        if (!accepted) return

        setIsClearingCompleted(true)
        const deletedCount = await clearCompletedTasks()
        setIsClearingCompleted(false)

        if (deletedCount === null) {
            trackExperienceMetric("errors_shown")
            toast({
                title: "No se pudieron limpiar las tareas completadas",
                variant: "error"
            })
            return
        }

        if (deletedCount > 0) {
            trackExperienceMetric("task_deleted")
            toast({
                title: `${deletedCount} tarea(s) completada(s) eliminada(s)`,
                variant: "success"
            })
        }
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-quepia-cyan" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <p className="text-red-400">Error: {error}</p>
            </div>
        )
    }

    if (!projectId) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                        <LayoutGrid className="h-7 w-7 text-white/20" />
                    </div>
                    <p className="text-white/50 mb-1 font-medium">Sin proyecto seleccionado</p>
                    <p className="text-sm text-white/25">Selecciona un proyecto desde la barra lateral para ver y gestionar sus tareas</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0a0a0a]">
            {/* Project Header */}
            <div className="px-4 sm:px-6 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <h1 className="text-lg font-semibold text-white truncate">{projectName}</h1>
                <div className="w-full sm:w-auto flex items-center gap-2 sm:justify-end">
                    <button
                        onClick={() => setShowCompletedTasks((prev) => !prev)}
                        className={cn(
                            "h-9 px-3 rounded-lg text-xs border transition-colors whitespace-nowrap",
                            showCompletedTasks
                                ? "border-[rgba(42,231,228,0.38)] bg-[rgba(42,231,228,0.1)] text-[#41efec]"
                                : "border-white/10 text-white/70 hover:bg-white/5"
                        )}
                    >
                        {showCompletedTasks ? "Ocultar completadas" : "Mostrar completadas"}
                    </button>
                    <button
                        onClick={handleClearCompletedTasks}
                        disabled={completedTasksCount === 0 || isClearingCompleted}
                        className={cn(
                            "h-9 px-3 rounded-lg text-xs border transition-colors whitespace-nowrap flex items-center",
                            completedTasksCount === 0 || isClearingCompleted
                                ? "border-white/10 text-white/40 cursor-not-allowed"
                                : "border-white/10 text-white/70 hover:bg-white/5"
                        )}
                    >
                        {isClearingCompleted && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                        Limpiar completadas
                        {completedTasksCount > 0 && (
                            <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                                {completedTasksCount}
                            </span>
                        )}
                    </button>
                    {projectId && <ProjectResources projectId={projectId} />}
                </div>
            </div>

            {/* Kanban Columns */}
            <div className="flex-1 overflow-x-auto p-3 sm:p-6">
                <div className="flex gap-4 h-full min-w-max snap-x snap-mandatory">
                    {columns.map((column) => (
                        <KanbanColumn
                            key={column.id}
                            column={column}
                            onTaskClick={onTaskClick}
                            onToggleComplete={handleToggleComplete}
                            onAddTaskClick={() => setAddingTaskColumn(column.id)}
                            isAddingTask={addingTaskColumn === column.id}
                            newTaskTitle={newTaskTitle}
                            onNewTaskChange={setNewTaskTitle}
                            onNewTaskSubmit={() => handleAddTask(column.id)}
                            onNewTaskCancel={() => {
                                setAddingTaskColumn(null)
                                setNewTaskTitle("")
                            }}
                            onDragStart={handleDragStart}
                            onDragOver={(e) => handleDragOver(e, column.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, column.id)}
                            onDragEnd={handleDragEnd}
                            isDragOver={dragOverColumn === column.id}
                            draggedTaskId={draggedTask?.id}
                            isEditing={editingColumnId === column.id}
                            editingName={editingColumnName}
                            onEditingNameChange={setEditingColumnName}
                            onEditClick={() => handleEditColumn(column)}
                            onSaveEdit={() => handleSaveColumnEdit(column.id)}
                            onCancelEdit={handleCancelColumnEdit}
                            onDeleteClick={() => handleDeleteColumn(column.id)}
                            onDeleteTask={handleDeleteTask}
                            onDuplicateTask={duplicateTask}
                            onUpdateTask={updateTask}
                            onSendForReview={handleSendForReview}
                            onUpdateColumnWip={async (colId, wip) => {
                                await updateColumnWipLimit(colId, wip)
                                await silentRefresh()
                            }}
                            editingTaskId={editingTaskId}
                            onSetEditingTaskId={setEditingTaskId}
                            userId={userId}
                            onAssetsUploaded={() => silentRefresh()}
                            showCompletedTasks={showCompletedTasks}
                        />
                    ))}

                    {/* Add Column */}
                    {isAddingColumn ? (
                        <div className="w-[280px] sm:w-[320px] shrink-0 bg-white/5 border border-white/10 rounded-lg p-3 snap-start">
                            <input
                                type="text"
                                placeholder="Nombre de la columna"
                                value={newColumnName}
                                onChange={(e) => setNewColumnName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAddColumn()
                                    if (e.key === "Escape") {
                                        setIsAddingColumn(false)
                                        setNewColumnName("")
                                    }
                                }}
                                autoFocus
                                className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none mb-2"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleAddColumn}
                                    disabled={!newColumnName.trim()}
                                    className="px-3 py-1 text-xs font-medium rounded bg-quepia-cyan text-black disabled:opacity-50"
                                >
                                    Agregar
                                </button>
                                <button
                                    onClick={() => {
                                        setIsAddingColumn(false)
                                        setNewColumnName("")
                                    }}
                                    className="px-3 py-1 text-xs font-medium rounded text-white/60 hover:text-white"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsAddingColumn(true)}
                            className="w-[280px] sm:w-[320px] shrink-0 flex items-center justify-center gap-2 py-4 border-2 border-dashed border-white/10 rounded-lg text-white/40 hover:border-white/20 hover:text-white/60 transition-colors snap-start"
                        >
                            <Plus className="h-5 w-5" />
                            <span>Agregar columna</span>
                        </button>
                    )}
                </div>
            </div>

            <SendReviewModal
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                task={reviewTask}
            />
        </div>
    )
}

interface KanbanColumnProps {
    column: ColumnWithTasks
    onTaskClick?: (task: Task) => void
    onToggleComplete?: (taskId: string) => void
    onAddTaskClick: () => void
    isAddingTask: boolean
    newTaskTitle: string
    onNewTaskChange: (value: string) => void
    onNewTaskSubmit: () => void
    onNewTaskCancel: () => void
    onDragStart: (e: React.DragEvent, task: Task) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: () => void
    onDrop: (e: React.DragEvent) => void
    onDragEnd: () => void
    isDragOver: boolean
    draggedTaskId?: string
    isEditing: boolean
    editingName: string
    onEditingNameChange: (value: string) => void
    onEditClick: () => void
    onSaveEdit: () => void
    onCancelEdit: () => void
    onDeleteClick: () => void
    onDeleteTask: (taskId: string) => void
    onDuplicateTask: (task: Task) => void
    onUpdateTask: (taskId: string, updates: Partial<Task>) => void
    onSendForReview: (task: Task) => void
    onUpdateColumnWip?: (columnId: string, wipLimit: number | null) => void
    editingTaskId: string | null
    onSetEditingTaskId: (taskId: string | null) => void
    userId?: string
    onAssetsUploaded?: () => void
    showCompletedTasks: boolean
}

function KanbanColumn({
    column,
    onTaskClick,
    onToggleComplete,
    onAddTaskClick,
    isAddingTask,
    newTaskTitle,
    onNewTaskChange,
    onNewTaskSubmit,
    onNewTaskCancel,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    isDragOver,
    isEditing,
    editingName,
    onEditingNameChange,
    onEditClick,
    onSaveEdit,
    onCancelEdit,
    onDeleteClick,
    onDeleteTask,
    onDuplicateTask,
    onUpdateTask,
    onSendForReview,
    draggedTaskId,
    onUpdateColumnWip,
    editingTaskId,
    onSetEditingTaskId,
    userId,
    onAssetsUploaded: onAssetsUploadedProp,
    showCompletedTasks,
}: KanbanColumnProps) {
    const [showMenu, setShowMenu] = useState(false)
    const [editingWip, setEditingWip] = useState(false)
    const [wipValue, setWipValue] = useState(column.wip_limit?.toString() || "")
    const visibleTasks = useMemo(
        () => showCompletedTasks ? column.tasks : column.tasks.filter((task) => !task.completed),
        [column.tasks, showCompletedTasks]
    )
    const hiddenCompletedCount = column.tasks.length - visibleTasks.length

    const isAtWipLimit = column.wip_limit !== null && column.wip_limit !== undefined && column.tasks.length >= column.wip_limit
    const isNearWipLimit = column.wip_limit !== null && column.wip_limit !== undefined && column.tasks.length >= column.wip_limit - 1

    // Reorganize tasks: group children under their parents
    const organizedTasks = useMemo(() => {
        const tasks = [...visibleTasks]
        const taskMap = new Map(tasks.map(t => [t.id, t]))
        const visited = new Set<string>()
        const result: Array<{ task: Task; isChild: boolean; parentTask?: Task }> = []

        const addTaskWithChildren = (task: Task) => {
            if (visited.has(task.id)) return
            visited.add(task.id)

            // Add parent task
            result.push({ task, isChild: false })

            // Find and add all children immediately after
            const children = tasks.filter(t => t.parent_task_id === task.id)
            children.forEach(child => {
                if (!visited.has(child.id)) {
                    visited.add(child.id)
                    result.push({ task: child, isChild: true, parentTask: task })
                }
            })
        }

        // First add all parent tasks (tasks without parent_task_id or whose parent is not in this column)
        tasks.forEach(task => {
            if (!task.parent_task_id || !taskMap.has(task.parent_task_id)) {
                addTaskWithChildren(task)
            }
        })

        // Add remaining tasks (orphaned children whose parent is not in this column)
        tasks.forEach(task => {
            if (!visited.has(task.id)) {
                const parentTask = task.parent_task_id ? taskMap.get(task.parent_task_id) : undefined
                result.push({ task, isChild: !!task.parent_task_id, parentTask })
            }
        })

        return result
    }, [visibleTasks])

    return (
        <div
            className={cn(
                "w-[280px] sm:w-[320px] flex flex-col shrink-0 rounded-2xl border border-[#1f232b] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))] p-3 sm:p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all snap-start",
                isDragOver && !isAtWipLimit && "bg-[rgba(42,231,228,0.08)]",
                isDragOver && isAtWipLimit && "bg-red-500/10"
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 group">
                {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                        <input
                            type="text"
                            value={editingName}
                            onChange={(e) => onEditingNameChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onSaveEdit()
                                if (e.key === "Escape") onCancelEdit()
                            }}
                            autoFocus
                            className="flex-1 bg-white/10 text-sm font-semibold text-white/80 uppercase tracking-wide px-2 py-1 rounded outline-none focus:ring-1 focus:ring-quepia-cyan"
                        />
                        <button
                            onClick={onSaveEdit}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                            <Check className="h-4 w-4 text-green-500" />
                        </button>
                        <button
                            onClick={onCancelEdit}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                            <X className="h-4 w-4 text-red-400" />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide">
                                {column.nombre}
                            </h2>
                            <span className={cn(
                                "text-sm",
                                isAtWipLimit ? "text-red-400 font-semibold" :
                                    isNearWipLimit ? "text-amber-400" : "text-white/40"
                            )}>
                                {visibleTasks.length}
                                {column.wip_limit != null && (
                                    <span className="text-white/25">/{column.wip_limit}</span>
                                )}
                            </span>
                            {!showCompletedTasks && hiddenCompletedCount > 0 && (
                                <span className="text-[10px] text-white/25">
                                    -{hiddenCompletedCount} ocultas
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="p-1 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <MoreHorizontal className="h-4 w-4 text-white/40" />
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 z-10 min-w-[140px]">
                                    <button
                                        onClick={() => {
                                            setShowMenu(false)
                                            onEditClick()
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors"
                                    >
                                        <Pencil className="h-4 w-4" />
                                        Editar nombre
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowMenu(false)
                                            setEditingWip(true)
                                            setWipValue(column.wip_limit?.toString() || "")
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors"
                                    >
                                        <Flag className="h-4 w-4" />
                                        Límite WIP {column.wip_limit != null && `(${column.wip_limit})`}
                                    </button>
                                    <div className="border-t border-white/[0.06] my-1" />
                                    <button
                                        onClick={() => {
                                            setShowMenu(false)
                                            onDeleteClick()
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Eliminar
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* WIP Limit Editor */}
            {editingWip && (
                <div className="mb-3 bg-white/[0.05] border border-white/10 rounded-lg p-3">
                    <p className="text-xs text-white/50 mb-2">Límite de tareas en progreso (WIP)</p>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="0"
                            value={wipValue}
                            onChange={(e) => setWipValue(e.target.value)}
                            placeholder="Sin límite"
                            autoFocus
                            className="flex-1 bg-white/10 text-sm text-white px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-quepia-cyan"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    const val = wipValue.trim() === "" ? null : parseInt(wipValue)
                                    onUpdateColumnWip?.(column.id, val && val > 0 ? val : null)
                                    setEditingWip(false)
                                }
                                if (e.key === "Escape") setEditingWip(false)
                            }}
                        />
                        <button
                            onClick={() => {
                                const val = wipValue.trim() === "" ? null : parseInt(wipValue)
                                onUpdateColumnWip?.(column.id, val && val > 0 ? val : null)
                                setEditingWip(false)
                            }}
                            className="px-2 py-1.5 text-xs rounded bg-quepia-cyan text-black font-medium"
                        >
                            OK
                        </button>
                        <button
                            onClick={() => setEditingWip(false)}
                            className="px-2 py-1.5 text-xs rounded text-white/50 hover:text-white"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Tasks */}
            <div className="flex-1 space-y-3 overflow-y-auto pb-4 pt-1">
                {organizedTasks.length === 0 && !showCompletedTasks && hiddenCompletedCount > 0 && (
                    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/40">
                        Esta columna tiene solo tareas completadas.
                    </div>
                )}
                {organizedTasks.map(({ task, isChild, parentTask }) => {
                    // Find siblings to determine if this is the last child
                    const siblings = organizedTasks.filter(t =>
                        t.parentTask?.id === parentTask?.id
                    )
                    const isLastChild = isChild && siblings[siblings.length - 1]?.task.id === task.id
                    // Check if there are more children after this one in the list
                    const hasMoreSiblings = isChild && siblings.some((s, i) =>
                        i > siblings.findIndex(sib => sib.task.id === task.id)
                    )
                    // Check if this task has children
                    const hasChildren = organizedTasks.some(t => t.parentTask?.id === task.id)
                    const taskSubtasks = Array.isArray(task.subtasks)
                        ? [...task.subtasks].sort((a, b) => a.orden - b.orden)
                        : []
                    const visibleSubtasks = showCompletedTasks
                        ? taskSubtasks
                        : taskSubtasks.filter((subtask) => !subtask.completed)

                    return (
                        <div key={task.id} className="relative">

                            <TaskContextMenu
                                task={task}
                                onDuplicate={(t) => onDuplicateTask(t)}
                                onDelete={onDeleteTask}
                                onUpdate={(id, updates) => onUpdateTask(id, updates)}
                                onEdit={(t) => onTaskClick?.(t)}
                                onQuickEdit={(t) => onSetEditingTaskId(t.id)}
                                onSendForReview={onSendForReview}
                            >
                                <TaskCard
                                    task={task}
                                    isChild={isChild}
                                    isLastChild={isLastChild}
                                    hasMoreSiblings={hasMoreSiblings}
                                    hasChildren={hasChildren}
                                    parentTask={parentTask}
                                    onClick={() => onTaskClick?.(task)}
                                    onDragStart={(e) => onDragStart(e, task)}
                                    onDragEnd={onDragEnd}
                                    isDragging={draggedTaskId === task.id}
                                    onToggleComplete={onToggleComplete}
                                    isEditing={editingTaskId === task.id}
                                    userId={userId}
                                    onAssetsUploaded={onAssetsUploadedProp}
                                    onSaveEdit={async (updates) => {
                                        await onUpdateTask(task.id, updates)
                                        onSetEditingTaskId(null)
                                    }}
                                    onCancelEdit={() => onSetEditingTaskId(null)}
                                />
                            </TaskContextMenu>
                            {!isChild && visibleSubtasks.length > 0 && (
                                <div className="mt-2 space-y-2">
                                    {visibleSubtasks.map((subtask) => (
                                        <SubtaskPreviewCard
                                            key={subtask.id}
                                            subtask={subtask}
                                            parentTitle={task.titulo}
                                            parentDescription={task.descripcion}
                                            onClick={() => onTaskClick?.(task)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}

                {/* Add Task Form */}
                {isAddingTask ? (
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                        <input
                            type="text"
                            placeholder="Nombre de la tarea"
                            value={newTaskTitle}
                            onChange={(e) => onNewTaskChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onNewTaskSubmit()
                                if (e.key === "Escape") onNewTaskCancel()
                            }}
                            autoFocus
                            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
                        />
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                onClick={onNewTaskSubmit}
                                disabled={!newTaskTitle.trim()}
                                className="px-3 py-1 text-xs font-medium rounded bg-quepia-cyan text-black disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Agregar
                            </button>
                            <button
                                onClick={onNewTaskCancel}
                                className="px-3 py-1 text-xs font-medium rounded text-white/60 hover:text-white"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={onAddTaskClick}
                        className="w-full flex items-center gap-2 rounded-xl border border-dashed border-[#1f3d42] bg-[#0d1215] px-3 py-2.5 text-sm text-[#39e8e5] transition-colors hover:border-[#2c6a70] hover:bg-[#10181d]"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Agregar tarea</span>
                    </button>
                )}
            </div>
        </div>
    )
}

interface TaskCardProps {
    task: Task & { assignee?: SistemaUser | null }
    isChild?: boolean
    isLastChild?: boolean
    hasMoreSiblings?: boolean
    hasChildren?: boolean
    parentTask?: Task
    onClick?: () => void
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: () => void
    isDragging: boolean
    onToggleComplete?: (taskId: string) => void
    isEditing?: boolean
    onSaveEdit?: (updates: Partial<Task>) => void
    onCancelEdit?: () => void
    userId?: string
    onAssetsUploaded?: () => void
}

interface SubtaskPreviewCardProps {
    subtask: Subtask
    parentTitle?: string
    parentDescription?: string | null
    onClick?: () => void
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

function parseTaskDate(value: string): Date {
    // Date-only values from Postgres (YYYY-MM-DD) must stay in local day.
    if (value.includes("T")) return new Date(value)
    return new Date(`${value}T12:00:00`)
}

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function SubtaskPreviewCard({ subtask, parentTitle, parentDescription, onClick }: SubtaskPreviewCardProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "relative cursor-pointer overflow-hidden rounded-xl border border-[#263841] bg-[linear-gradient(180deg,rgba(24,41,46,0.55),rgba(18,27,33,0.55))] px-3.5 py-3 text-left shadow-[0_6px_18px_rgba(0,0,0,0.22)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#32717a] hover:bg-[linear-gradient(180deg,rgba(24,41,46,0.7),rgba(18,27,33,0.7))] ml-6 w-[calc(100%-24px)] before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[2px] before:rounded-full before:bg-[rgba(42,231,228,0.3)]",
                subtask.completed && "opacity-70"
            )}
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                    {subtask.completed ? (
                        <CheckCircle2 className="h-[18px] w-[18px] text-white/45" />
                    ) : (
                        <Circle className="h-[18px] w-[18px] text-quepia-cyan/70" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={cn(
                        "text-[15px] font-medium leading-snug mb-1",
                        subtask.completed ? "text-white/45 line-through decoration-white/20" : "text-white/85"
                    )}>
                        {subtask.titulo}
                    </p>
                    {(parentDescription || parentTitle) && (
                        <p className="text-xs text-white/35 line-clamp-1 mb-2">
                            {parentDescription || parentTitle}
                        </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(42,231,228,0.38)] bg-[rgba(42,231,228,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#5cf5f2]">
                            <GitBranch className="h-3 w-3" />
                            Subtarea
                        </span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onClick?.()
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(42,231,228,0.32)] bg-[rgba(42,231,228,0.08)] px-2.5 py-1 text-[11px] text-[#41efec] transition-all duration-200 hover:border-[rgba(42,231,228,0.5)] hover:bg-[rgba(42,231,228,0.14)]"
                        >
                            <CloudUpload className="h-3 w-3" />
                            Subir assets
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const TaskCard = React.memo(function TaskCard({
    task,
    isChild,
    isLastChild,
    hasMoreSiblings,
    hasChildren,
    parentTask,
    onClick,
    onDragStart,
    onDragEnd,
    isDragging,
    onToggleComplete,
    isEditing,
    onSaveEdit,
    onCancelEdit,
    userId,
    onAssetsUploaded
}: TaskCardProps) {
    const [editTitle, setEditTitle] = useState(task.titulo)
    const [editPriority, setEditPriority] = useState<Priority>(task.priority || "P4")
    const [editDueDate, setEditDueDate] = useState(task.due_date || "")
    const [uploadQueue, setUploadQueue] = useState<UploadProgressUpdate[]>([])
    const [isFileDragOver, setIsFileDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Reset state when entering edit mode
    if (isEditing && editTitle === task.titulo && editTitle === "") {
        // This is just a safeguard, usually we rely on init
    }

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation()
        onSaveEdit?.({
            titulo: editTitle,
            priority: editPriority,
            due_date: editDueDate || null
        })
    }

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation()
        onCancelEdit?.()
        // Reset fields
        setEditTitle(task.titulo)
        setEditPriority(task.priority || "P4")
        setEditDueDate(task.due_date || "")
    }

    const updateUploadQueue = (update: UploadProgressUpdate) => {
        setUploadQueue((prev) => {
            const idx = prev.findIndex((u) => u.id === update.id)
            if (idx === -1) return [...prev, update]
            const next = [...prev]
            next[idx] = { ...next[idx], ...update }
            return next
        })
    }

    const handleFilesUpload = async (files: FileList | File[]) => {
        if (!userId) return
        const list = Array.from(files || [])
        if (list.length === 0) return

        for (const file of list) {
            try {
                await uploadAssetFile({
                    file,
                    taskId: task.id,
                    projectId: task.project_id,
                    userId,
                    onProgress: updateUploadQueue,
                })
            } catch (err: unknown) {
                updateUploadQueue({
                    id: `${file.name}-${Date.now()}`,
                    fileName: file.name,
                    percent: 0,
                    stage: "error",
                    message: err instanceof Error ? err.message : "Error subiendo archivo",
                })
            }
        }

        onAssetsUploaded?.()
    }

    const priorityColor = PRIORITY_COLORS[task.priority as Priority] || PRIORITY_COLORS["P4"]
    const isHighPriority = task.priority === "P1"

    if (isEditing) {
        return (
            <div
                className={cn(
                    "w-full text-left bg-[#1a1a1a] border border-white/10 rounded-lg p-3 cursor-default shadow-lg",
                    isChild && "ml-4"
                )}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation()
                        onCancelEdit?.()
                    }
                }}
            >
                <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-transparent text-[15px] font-medium text-white placeholder:text-white/30 border-none outline-none mb-3 p-0"
                    placeholder="Nombre de la tarea"
                    autoFocus
                />

                <div className="flex items-center gap-2 mb-3">
                    <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as Priority)}
                        className="bg-white/[0.05] text-[11px] text-white/80 border border-white/10 rounded px-2 py-1 outline-none appearance-none hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                            <option key={key} value={key} className="bg-[#1a1a1a]">
                                {label}
                            </option>
                        ))}
                    </select>

                    <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="bg-white/[0.05] text-[11px] text-white/80 border border-white/10 rounded px-2 py-1 outline-none hover:bg-white/10 transition-colors cursor-pointer [color-scheme:dark]"
                    />
                </div>

                <div className="flex justify-end gap-2 border-t border-white/5 pt-2">
                    <button
                        onClick={handleCancel}
                        className="px-3 py-1.5 text-xs text-white/60 hover:text-white rounded hover:bg-white/5 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-3 py-1.5 text-xs bg-quepia-cyan text-black font-medium rounded hover:opacity-90 transition-opacity"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        )
    }

    const todayStart = startOfLocalDay(new Date())
    const dueDayOffset = task.due_date
        ? Math.round((startOfLocalDay(parseTaskDate(task.due_date)).getTime() - todayStart.getTime()) / DAY_IN_MS)
        : null
    const isOverdue = dueDayOffset !== null && dueDayOffset < 0 && !task.completed
    const isDueSoon = dueDayOffset !== null && dueDayOffset >= 0 && dueDayOffset <= 2 && !task.completed

    const formatDueDate = (date: string) => {
        const dueDate = parseTaskDate(date)
        const offset = Math.round((startOfLocalDay(dueDate).getTime() - startOfLocalDay(new Date()).getTime()) / DAY_IN_MS)

        if (offset === 0) return "Hoy"
        if (offset === 1) return "Mañana"
        return dueDate.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
    }

    // Check if this task has a parent (was converted from subtask)
    const isChildTask = !!task.parent_task_id
    const assetThumbs = (task.assets || []).map(a => a.thumbnail_url).filter(Boolean).slice(0, 3) as string[]
    const taskTypeMetadata = task.type_metadata && typeof task.type_metadata === "object"
        ? (task.type_metadata as Record<string, unknown>)
        : null
    const youtubeMeta = taskTypeMetadata?.youtube && typeof taskTypeMetadata.youtube === "object"
        ? (taskTypeMetadata.youtube as Record<string, unknown>)
        : null
    const youtubeThumbUrl = youtubeMeta && typeof youtubeMeta.thumbnail_url === "string" ? youtubeMeta.thumbnail_url : null
    const youtubePublishedUrl = youtubeMeta && typeof youtubeMeta.published_url === "string" ? youtubeMeta.published_url : null
    const youtubeSourceUrl = youtubeMeta && typeof youtubeMeta.source_url === "string" ? youtubeMeta.source_url : null

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onClick}
            onDragOver={(e) => {
                if (!userId) return
                const hasFiles = Array.from(e.dataTransfer?.types || []).includes("Files")
                if (hasFiles) {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsFileDragOver(true)
                }
            }}
            onDragLeave={() => setIsFileDragOver(false)}
            onDrop={(e) => {
                if (!userId) return
                const hasFiles = Array.from(e.dataTransfer?.types || []).includes("Files")
                if (!hasFiles) return
                e.preventDefault()
                e.stopPropagation()
                setIsFileDragOver(false)
                handleFilesUpload(e.dataTransfer.files)
            }}
            className={cn(
                "relative cursor-pointer overflow-hidden rounded-xl border border-[#252a33] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-3.5 py-3 text-left shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-all duration-200 group hover:-translate-y-[1px] hover:border-[#3a4350] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] hover:shadow-[0_16px_30px_rgba(0,0,0,0.35)]",
                isDragging && "opacity-50 scale-95 shadow-xl ring-1 ring-[rgba(42,231,228,0.45)]",
                task.completed && "opacity-60",
                // Child task styling: compact and connected to parent with a subtle accent rail.
                isChild && [
                    "ml-6 w-[calc(100%-24px)] border-[#263841] bg-[linear-gradient(180deg,rgba(24,41,46,0.55),rgba(18,27,33,0.55))] shadow-[0_6px_18px_rgba(0,0,0,0.22)]",
                    "before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[2px] before:rounded-full before:bg-[rgba(42,231,228,0.3)]"
                ],
                // Parent task with children styling
                !isChild && isChildTask && "border-l border-l-[rgba(42,231,228,0.35)]",
                isFileDragOver && "border-[#2ae7e4] bg-[rgba(42,231,228,0.12)] before:bg-[#2ae7e4]"
            )}
        >
            {isFileDragOver && (
                <div className="absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[rgba(42,231,228,0.65)] bg-black/40 pointer-events-none">
                    <div className="flex items-center gap-2 text-[11px] text-white/80">
                        <CloudUpload className="h-4 w-4 text-quepia-cyan" />
                        Soltá para subir assets
                    </div>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) handleFilesUpload(e.target.files)
                }}
            />
            {/* Parent connector removed to avoid visual artifacts in compact cards */}
            <div className="flex items-start gap-3">
                {/* Circular Checkbox (Todoist Style) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleComplete?.(task.id)
                    }}
                    className="mt-0.5 shrink-0 group/check relative"
                >
                    {task.completed ? (
                        <div className="h-[18px] w-[18px] rounded-full bg-white/20 flex items-center justify-center transition-colors">
                            <Check className="h-3 w-3 text-white" />
                        </div>
                    ) : (
                        <div
                            className="h-[18px] w-[18px] rounded-full border-2 transition-all flex items-center justify-center group-hover/check:bg-opacity-10"
                            style={{
                                borderColor: priorityColor,
                                backgroundColor: 'transparent'
                            }}
                        >
                            <div className="h-full w-full rounded-full opacity-0 group-hover/check:opacity-20" style={{ backgroundColor: priorityColor }} />
                            <Check className="h-2.5 w-2.5 opacity-0 group-hover/check:opacity-100 transition-opacity" style={{ color: priorityColor }} />
                        </div>
                    )}
                </button>

                <div className="flex-1 min-w-0">
                    {youtubeThumbUrl && (
                        <div className="mb-2 overflow-hidden rounded-md border border-white/10 bg-black/20">
                            <img
                                src={youtubeThumbUrl}
                                alt="YouTube thumbnail"
                                className="h-24 w-full object-cover"
                                loading="lazy"
                            />
                        </div>
                    )}

                    {/* Title */}
                    <p className={cn(
                        "text-[15px] font-medium leading-snug mb-0.5",
                        task.completed ? "text-white/40 line-through decoration-white/20" : "text-white/90"
                    )}>
                        {task.titulo.split(/(\*[^*]+\*)/).map((part, i) => {
                            if (part.startsWith("*") && part.endsWith("*")) {
                                return (
                                    <span key={i} className="font-semibold text-quepia-cyan">
                                        {part.slice(1, -1)}
                                    </span>
                                )
                            }
                            return <span key={i}>{part}</span>
                        })}
                    </p>

                    {/* Description */}
                    {task.descripcion && (
                        <p className={cn(
                            "line-clamp-2 mb-2.5 font-normal leading-relaxed text-white/45",
                            isChild ? "text-[11px]" : "text-xs"
                        )}>
                            {task.descripcion}
                        </p>
                    )}

                    {/* Meta Chips Row */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {/* Due Date Chip */}
                        {task.due_date && (
                            <span className={cn(
                                "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium transition-colors",
                                isOverdue ? "text-red-400 bg-red-500/10" :
                                    isDueSoon ? "text-amber-400 bg-amber-500/10" :
                                        "text-white/50 bg-white/[0.04]"
                            )}>
                                <Calendar className="h-3 w-3" />
                                {formatDueDate(task.due_date)}
                            </span>
                        )}

                        {/* Priority Chip (Only if not P4/Gray) */}
                        {task.priority && task.priority !== "P4" && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium",
                                    isHighPriority ? "bg-red-500/20 text-red-400" : "bg-white/[0.04]"
                                )}
                                style={!isHighPriority ? { color: priorityColor } : undefined}
                            >
                                <Flag className="h-3 w-3" fill={isHighPriority ? "currentColor" : "none"} />
                                {PRIORITY_LABELS[task.priority as Priority]}
                            </span>
                        )}

                        {/* Task Type Chip */}
                        {task.task_type && (
                            <span
                                className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-white/[0.04]"
                                style={{ color: TASK_TYPE_COLORS[task.task_type as TaskType] }}
                            >
                                {TASK_TYPE_LABELS[task.task_type as TaskType]}
                            </span>
                        )}

                        {/* Labels Chips */}
                        {task.labels && task.labels.length > 0 && task.labels.slice(0, 2).map((label, i) => (
                            <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/40">
                                {label}
                            </span>
                        ))}
                        {task.labels && task.labels.length > 2 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/30">
                                +{task.labels.length - 2}
                            </span>
                        )}

                        {/* Estimated Hours */}
                        {task.estimated_hours && (
                            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/30 font-mono">
                                {task.estimated_hours}h
                            </span>
                        )}

                        {/* Link Indicator */}
                        {task.link && (
                            <Link2 className="h-3 w-3 text-quepia-cyan/60 ml-0.5" />
                        )}

                        {/* YouTube links indicator */}
                        {(youtubePublishedUrl || youtubeSourceUrl) && (
                            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-300 font-medium">
                                YouTube
                            </span>
                        )}

                        {/* Parent Task Indicator - Shows when task was converted from subtask */}
                        {task.parent_task_id && (
                            <span
                                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(42,231,228,0.38)] bg-[rgba(42,231,228,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#5cf5f2]"
                                title={task.parent_task?.titulo ? `Subtarea de: ${task.parent_task.titulo}` : 'Tarea convertida desde subtarea'}
                            >
                                <GitBranch className="h-3 w-3" />
                                <span className="max-w-[100px] truncate">
                                    {task.parent_task?.titulo ? `↳ ${task.parent_task.titulo}` : 'Subtarea'}
                                </span>
                            </span>
                        )}
                    </div>

                    {/* Assets Summary + Upload */}
                    {Array.isArray(task.assets) && task.assets.length > 0 && (() => {
                        const carouselCount = new Set(task.assets!.filter(a => a.asset_type === 'carousel' && a.group_id).map(a => a.group_id)).size
                        const reelCount = task.assets!.filter(a => a.asset_type === 'reel').length
                        const singleCount = task.assets!.filter(a => !a.asset_type || a.asset_type === 'single').length
                        return (
                            <div className="mt-2 flex items-center gap-3 text-[10px] text-white/40 flex-wrap">
                                {assetThumbs.length > 0 && (
                                    <div className="flex items-center -space-x-1">
                                        {assetThumbs.map((url, idx) => (
                                            <div key={`${url}-${idx}`} className="w-5 h-5 rounded-md border border-black/30 overflow-hidden bg-white/5">
                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                        {task.assets!.length > assetThumbs.length && (
                                            <span className="text-[9px] text-white/40 ml-2">+{task.assets!.length - assetThumbs.length}</span>
                                        )}
                                    </div>
                                )}
                                <span className="inline-flex items-center gap-1">
                                    <Paperclip className="h-3 w-3 text-white/30" />
                                    {task.assets!.length}
                                </span>
                                {carouselCount > 0 && (
                                    <span className="inline-flex items-center gap-1 text-purple-300/80 text-[9px]">
                                        <LayoutGrid className="h-2.5 w-2.5" />
                                        {carouselCount}
                                    </span>
                                )}
                                {reelCount > 0 && (
                                    <span className="inline-flex items-center gap-1 text-pink-300/80 text-[9px]">
                                        <GitBranch className="h-2.5 w-2.5" />
                                        {reelCount}
                                    </span>
                                )}
                                <span className="inline-flex items-center gap-1 text-emerald-400/80">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                                    {task.assets!.filter(a => ['approved_internal', 'approved_final', 'published'].includes(a.approval_status)).length}
                                </span>
                                <span className="inline-flex items-center gap-1 text-amber-400/80">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                                    {task.assets!.filter(a => a.approval_status === 'pending_review').length}
                                </span>
                                <span className="inline-flex items-center gap-1 text-red-400/80">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
                                    {task.assets!.filter(a => a.approval_status === 'changes_requested').length}
                                </span>
                            </div>
                        )
                    })()}

                    {userId && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                fileInputRef.current?.click()
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[rgba(42,231,228,0.32)] bg-[rgba(42,231,228,0.08)] px-2.5 py-1 text-[11px] text-[#41efec] transition-all duration-200 hover:border-[rgba(42,231,228,0.5)] hover:bg-[rgba(42,231,228,0.14)]"
                        >
                            <CloudUpload className="h-3 w-3" />
                            Subir assets
                        </button>
                    )}

                    {uploadQueue.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {uploadQueue.slice(0, 2).map((u) => (
                                <div key={u.id} className="bg-white/[0.03] border border-white/[0.06] rounded p-1.5">
                                    <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
                                        <span className="truncate max-w-[140px]">{u.fileName || u.id}</span>
                                        <span>{u.stage === "error" ? "Error" : `${u.percent}%`}</span>
                                    </div>
                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all",
                                                u.stage === "error" ? "bg-red-400/70" : "bg-quepia-cyan"
                                            )}
                                            style={{ width: `${Math.min(100, Math.max(0, u.percent))}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {uploadQueue.length > 2 && (
                                <div className="text-[10px] text-white/30">+{uploadQueue.length - 2} más</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Assignee Avatar */}
                {task.assignee && (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-quepia-cyan/80 to-quepia-magenta/80 flex items-center justify-center text-[9px] text-white font-medium shrink-0 shadow-sm mt-0.5 border border-black/20" title={task.assignee.nombre}>
                        {task.assignee.nombre.split(" ").map(n => n[0]).join("").toUpperCase()}
                    </div>
                )}
            </div>
        </div>
    )
})
