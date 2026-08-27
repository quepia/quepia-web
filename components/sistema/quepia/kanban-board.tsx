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
    GripVertical,
    ArrowLeft,
    ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { UserAvatar } from "./user-avatar"
import { getTaskDeadlineDateKey, toTaskDeadlineTimestamp } from "@/lib/sistema/task-deadlines"
import { useTasks, useColumns } from "@/lib/sistema/hooks"
import type { Task, ColumnWithTasks, SistemaUser, TaskType, Subtask } from "@/types/sistema"
import { PRIORITY_COLORS, PRIORITY_LABELS, PRIORITY_ORDER, Priority, TASK_TYPE_LABELS, TASK_TYPE_COLORS } from "@/types/sistema"
import { TaskContextMenu } from "@/components/sistema/quepia/task-context-menu"
import { SendReviewModal } from "@/components/sistema/quepia/send-review-modal"
import { ProjectResources } from "@/components/sistema/quepia/project-resources"
import { ProjectWorkspaceHeader, type ProjectWorkspaceSection } from "@/components/sistema/quepia/project-workspace-header"
import { ZernioProjectControl } from "@/components/sistema/quepia/zernio-project-control"
import { descriptionPreview } from "@/components/sistema/quepia/task-description"
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
    activeWorkspaceSection: ProjectWorkspaceSection
    onWorkspaceSectionChange: (section: ProjectWorkspaceSection) => void
}

export function KanbanBoard({
    projectId,
    projectName,
    onTaskClick,
    onRefreshRef,
    userId,
    activeWorkspaceSection,
    onWorkspaceSectionChange,
}: KanbanBoardProps) {
    const { toast } = useToast()
    const { confirm } = useConfirm()
    const [showCompletedTasks, setShowCompletedTasks] = useState(false)
    const { columns, loading, error, createTask, updateTask, moveTask, reorderColumns, duplicateTask, deleteTask, clearCompletedTasks, silentRefresh } = useTasks(projectId, {
        includeCompletedThumbnails: showCompletedTasks,
    })

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
    const { updateColumn, updateColumnWipLimit, createColumn, deleteColumn } = useColumns(projectId, {
        fetchOnMount: false,
        initialColumns: columns,
    })

    const [addingTaskColumn, setAddingTaskColumn] = useState<string | null>(null)
    const [newTaskTitle, setNewTaskTitle] = useState("")
    const [creatingTaskColumn, setCreatingTaskColumn] = useState<string | null>(null)
    const [draggedTask, setDraggedTask] = useState<Task | null>(null)
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
    const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null)
    const [dragOverColumnOrderId, setDragOverColumnOrderId] = useState<string | null>(null)
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
    const [editingColumnName, setEditingColumnName] = useState("")
    const [isAddingColumn, setIsAddingColumn] = useState(false)
    const [newColumnName, setNewColumnName] = useState("")
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
    const [isClearingCompleted, setIsClearingCompleted] = useState(false)
    const creatingTaskColumnRef = useRef<string | null>(null)

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
        const title = newTaskTitle.trim()

        if (!title || !projectId || creatingTaskColumnRef.current === columnId) return

        creatingTaskColumnRef.current = columnId
        setCreatingTaskColumn(columnId)

        try {
            const createdTask = await createTask({
                project_id: projectId,
                column_id: columnId,
                titulo: title,
            })

            if (createdTask) {
                setNewTaskTitle("")
                setAddingTaskColumn(null)
            }
        } finally {
            if (creatingTaskColumnRef.current === columnId) {
                creatingTaskColumnRef.current = null
            }
            setCreatingTaskColumn((current) => current === columnId ? null : current)
        }
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

    const persistColumnMove = async (columnId: string, targetIndex: number) => {
        const sourceIndex = columns.findIndex((column) => column.id === columnId)
        const boundedTargetIndex = Math.max(0, Math.min(targetIndex, columns.length - 1))
        if (sourceIndex < 0 || sourceIndex === boundedTargetIndex) return true

        const reordered = [...columns]
        const [movedColumn] = reordered.splice(sourceIndex, 1)
        reordered.splice(boundedTargetIndex, 0, movedColumn)

        const didSave = await reorderColumns(reordered.map((column) => column.id))
        if (!didSave) {
            trackExperienceMetric("errors_shown")
            toast({
                title: "No se pudo mover la columna",
                description: "El orden anterior fue restaurado. Intenta nuevamente.",
                variant: "error",
            })
        }
        return didSave
    }

    const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
        setDraggedTask(null)
        setDragOverColumn(null)
        setDraggedColumnId(columnId)
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("application/x-quepia-kanban-column", columnId)
        e.dataTransfer.setData("text/plain", columnId)
    }

    const handleColumnDragOver = (e: React.DragEvent, columnId: string) => {
        if (!draggedColumnId || draggedColumnId === columnId) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setDragOverColumnOrderId(columnId)
    }

    const handleColumnDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault()
        const columnId = draggedColumnId || e.dataTransfer.getData("application/x-quepia-kanban-column")
        const targetIndex = columns.findIndex((column) => column.id === targetColumnId)

        setDraggedColumnId(null)
        setDragOverColumnOrderId(null)

        if (!columnId || targetIndex < 0 || columnId === targetColumnId) return
        await persistColumnMove(columnId, targetIndex)
    }

    const handleColumnDragEnd = () => {
        setDraggedColumnId(null)
        setDragOverColumnOrderId(null)
    }

    const handleMoveColumnBy = async (columnId: string, offset: -1 | 1) => {
        const currentIndex = columns.findIndex((column) => column.id === columnId)
        if (currentIndex < 0) return
        await persistColumnMove(columnId, currentIndex + offset)
    }

    const handleEditColumn = (column: ColumnWithTasks) => {
        setEditingColumnId(column.id)
        setEditingColumnName(column.nombre)
    }

    const handleSaveColumnEdit = async (columnId: string) => {
        const nextName = editingColumnName.trim()
        if (!nextName) return

        const didSave = await updateColumn(columnId, nextName)
        if (!didSave) {
            trackExperienceMetric("errors_shown")
            toast({
                title: "No se pudo cambiar el nombre",
                description: "La columna conserva su nombre anterior.",
                variant: "error",
            })
            return
        }

        setEditingColumnId(null)
        setEditingColumnName("")
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
            <ProjectWorkspaceHeader
                projectName={projectName}
                activeSection={activeWorkspaceSection}
                onSectionChange={onWorkspaceSectionChange}
                actions={(
                    <>
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
                    {projectId && <ZernioProjectControl projectId={projectId} />}
                    {projectId && <ProjectResources projectId={projectId} />}
                    </>
                )}
            />

            {/* Kanban Columns */}
            <div className="flex-1 overflow-x-auto p-3 sm:p-6">
                <div className="flex gap-4 h-full min-w-max snap-x snap-mandatory">
                    {columns.map((column, columnIndex) => (
                        <KanbanColumn
                            key={column.id}
                            column={column}
                            onTaskClick={onTaskClick}
                            onToggleComplete={handleToggleComplete}
                            onAddTaskClick={() => setAddingTaskColumn(column.id)}
                            isAddingTask={addingTaskColumn === column.id}
                            isCreatingTask={creatingTaskColumn === column.id}
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
                            isColumnReordering={Boolean(draggedColumnId)}
                            isColumnDragging={draggedColumnId === column.id}
                            isColumnDragTarget={dragOverColumnOrderId === column.id}
                            onColumnDragStart={(e) => handleColumnDragStart(e, column.id)}
                            onColumnDragOver={(e) => handleColumnDragOver(e, column.id)}
                            onColumnDrop={(e) => handleColumnDrop(e, column.id)}
                            onColumnDragEnd={handleColumnDragEnd}
                            canMoveColumnLeft={columnIndex > 0}
                            canMoveColumnRight={columnIndex < columns.length - 1}
                            onMoveColumnLeft={() => handleMoveColumnBy(column.id, -1)}
                            onMoveColumnRight={() => handleMoveColumnBy(column.id, 1)}
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
    isCreatingTask: boolean
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
    isColumnReordering: boolean
    isColumnDragging: boolean
    isColumnDragTarget: boolean
    onColumnDragStart: (e: React.DragEvent) => void
    onColumnDragOver: (e: React.DragEvent) => void
    onColumnDrop: (e: React.DragEvent) => void
    onColumnDragEnd: () => void
    canMoveColumnLeft: boolean
    canMoveColumnRight: boolean
    onMoveColumnLeft: () => void
    onMoveColumnRight: () => void
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
    isCreatingTask,
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
    isColumnReordering,
    isColumnDragging,
    isColumnDragTarget,
    onColumnDragStart,
    onColumnDragOver,
    onColumnDrop,
    onColumnDragEnd,
    canMoveColumnLeft,
    canMoveColumnRight,
    onMoveColumnLeft,
    onMoveColumnRight,
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
    const visibleTasks = useMemo(() => {
        const filteredTasks = showCompletedTasks
            ? column.tasks
            : column.tasks.filter((task) => !task.completed)

        return [...filteredTasks].sort((a, b) => {
            const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
            if (priorityDiff !== 0) return priorityDiff
            return a.orden - b.orden
        })
    }, [column.tasks, showCompletedTasks])
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
                isDragOver && isAtWipLimit && "bg-red-500/10",
                isColumnDragging && "scale-[0.98] opacity-45",
                isColumnDragTarget && "border-[#2ae7e4] bg-[rgba(42,231,228,0.06)] ring-1 ring-[rgba(42,231,228,0.22)]"
            )}
            onDragOver={(e) => isColumnReordering ? onColumnDragOver(e) : onDragOver(e)}
            onDragLeave={() => {
                if (!isColumnReordering) onDragLeave()
            }}
            onDrop={(e) => isColumnReordering ? onColumnDrop(e) : onDrop(e)}
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
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <button
                                type="button"
                                draggable
                                onDragStart={onColumnDragStart}
                                onDragEnd={onColumnDragEnd}
                                aria-label={`Mover columna ${column.nombre}`}
                                title="Arrastrar para mover la columna"
                                className="-ml-1 flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/60 active:cursor-grabbing"
                            >
                                <GripVertical className="h-4 w-4" />
                            </button>
                            <h2 className="min-w-0 text-sm font-semibold text-white/60 uppercase tracking-wide">
                                <button
                                    type="button"
                                    onDoubleClick={onEditClick}
                                    title="Doble clic para cambiar el nombre"
                                    className="max-w-[150px] cursor-text truncate rounded px-0.5 text-left outline-none transition-colors hover:text-white/80 focus-visible:ring-1 focus-visible:ring-quepia-cyan"
                                >
                                    {column.nombre}
                                </button>
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
                                type="button"
                                onClick={() => setShowMenu(!showMenu)}
                                aria-label={`Opciones de la columna ${column.nombre}`}
                                className="p-1 hover:bg-white/10 rounded transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                            >
                                <MoreHorizontal className="h-4 w-4 text-white/40" />
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 z-10 min-w-[190px]">
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
                                        type="button"
                                        disabled={!canMoveColumnLeft}
                                        onClick={() => {
                                            setShowMenu(false)
                                            onMoveColumnLeft()
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        Mover a la izquierda
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!canMoveColumnRight}
                                        onClick={() => {
                                            setShowMenu(false)
                                            onMoveColumnRight()
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        <ArrowRight className="h-4 w-4" />
                                        Mover a la derecha
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
            <div className="flex-1 space-y-2 overflow-y-auto pb-4 pt-1">
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
                                <div className="mt-2 space-y-1.5">
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
                            disabled={isCreatingTask}
                            autoFocus
                            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                onClick={onNewTaskSubmit}
                                disabled={!newTaskTitle.trim() || isCreatingTask}
                                className="px-3 py-1 text-xs font-medium rounded bg-quepia-cyan text-black disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                            >
                                {isCreatingTask && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {isCreatingTask ? "Agregando..." : "Agregar"}
                            </button>
                            <button
                                onClick={onNewTaskCancel}
                                disabled={isCreatingTask}
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

// --- Card design tokens -----------------------------------------------------
// Flat surfaces, 1px borders and a hover that only shifts background/border.
// No elevation or translate: cards must read as rows of a list, not floating chips.
const CARD_BASE =
    "group relative cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(42,231,228,0.45)]"
const CARD_SURFACE = "border-white/[0.07] bg-[#141619] hover:border-white/[0.14] hover:bg-[#191c21]"
const CARD_SURFACE_NESTED = "border-white/[0.06] bg-[#111316] hover:border-white/[0.12] hover:bg-[#16191d]"
// Tree rail for nested cards (children and subtasks).
const CARD_NESTED_LAYOUT =
    "ml-5 w-[calc(100%-20px)] before:absolute before:inset-y-0 before:-left-3 before:w-px before:bg-white/[0.09]"
const META_ROW = "mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-none text-white/40"
const GHOST_ACTION =
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/35 opacity-0 transition-all duration-150 hover:bg-white/[0.07] hover:text-quepia-cyan focus-visible:opacity-100 group-hover:opacity-100"

const PRIORITY_LEVELS: Record<Priority, number> = { P1: 3, P2: 3, P3: 2, P4: 1 }

/** Linear-style priority glyph: three bars filled up to the priority level. */
function PriorityGlyph({ priority }: { priority: Priority }) {
    const level = PRIORITY_LEVELS[priority] ?? 1
    const color = PRIORITY_COLORS[priority]
    return (
        <span
            className="inline-flex items-end gap-[2px]"
            title={`Prioridad: ${PRIORITY_LABELS[priority]}`}
            aria-label={`Prioridad ${PRIORITY_LABELS[priority]}`}
        >
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="w-[3px] rounded-[1px]"
                    style={{
                        height: `${4 + i * 2.5}px`,
                        backgroundColor: i < level ? color : "rgba(255,255,255,0.16)"
                    }}
                />
            ))}
        </span>
    )
}

/** Renders *emphasis* markers inside a task title. */
function renderTaskTitle(title: string) {
    return title.split(/(\*[^*]+\*)/).map((part, i) => {
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return (
                <span key={i} className="font-semibold text-quepia-cyan">
                    {part.slice(1, -1)}
                </span>
            )
        }
        return <span key={i}>{part}</span>
    })
}

function SubtaskPreviewCard({ subtask, parentTitle, parentDescription, onClick }: SubtaskPreviewCardProps) {
    const context = parentTitle || parentDescription

    return (
        <div
            onClick={onClick}
            className={cn(
                CARD_BASE,
                CARD_SURFACE_NESTED,
                CARD_NESTED_LAYOUT,
                subtask.completed && "opacity-55"
            )}
        >
            <div className="flex items-start gap-2.5">
                <div className="mt-[1px] shrink-0">
                    {subtask.completed ? (
                        <CheckCircle2 className="h-[15px] w-[15px] text-white/30" />
                    ) : (
                        <Circle className="h-[15px] w-[15px] text-white/25 transition-colors group-hover:text-quepia-cyan/60" />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className={cn(
                        "text-[13px] font-medium leading-[1.35]",
                        subtask.completed ? "text-white/40 line-through decoration-white/20" : "text-white/85"
                    )}>
                        {subtask.titulo}
                    </p>
                    {context && (
                        <p className="mt-0.5 truncate text-[11px] leading-none text-white/30">{context}</p>
                    )}
                    <div className={META_ROW}>
                        <span className="inline-flex items-center gap-1 text-white/30">
                            <GitBranch className="h-3 w-3" />
                            Subtarea
                        </span>
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onClick?.()
                    }}
                    className={GHOST_ACTION}
                    title="Subir assets"
                    aria-label="Subir assets"
                >
                    <CloudUpload className="h-3.5 w-3.5" />
                </button>
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
    const [editDeadlineDate, setEditDeadlineDate] = useState(getTaskDeadlineDateKey(task) || "")
    const [uploadQueue, setUploadQueue] = useState<UploadProgressUpdate[]>([])
    const [isFileDragOver, setIsFileDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation()
        onSaveEdit?.({
            titulo: editTitle,
            priority: editPriority,
            deadline: toTaskDeadlineTimestamp(editDeadlineDate)
        })
    }

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation()
        onCancelEdit?.()
        // Reset fields
        setEditTitle(task.titulo)
        setEditPriority(task.priority || "P4")
        setEditDeadlineDate(getTaskDeadlineDateKey(task) || "")
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

    const priority = (task.priority as Priority) || "P4"

    if (isEditing) {
        return (
            <div
                className={cn(
                    "w-full cursor-default rounded-lg border border-white/[0.12] bg-[#16191d] p-3 text-left ring-1 ring-[rgba(42,231,228,0.18)]",
                    isChild && "ml-5 w-[calc(100%-20px)]"
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
                    className="mb-3 w-full border-none bg-transparent p-0 text-[13.5px] font-medium leading-[1.35] text-white outline-none placeholder:text-white/25"
                    placeholder="Nombre de la tarea"
                    autoFocus
                />

                <div className="mb-3 flex items-center gap-2">
                    <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as Priority)}
                        className="cursor-pointer appearance-none rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/75 outline-none transition-colors hover:bg-white/[0.08]"
                    >
                        {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                            <option key={key} value={key} className="bg-[#16191d]">
                                {label}
                            </option>
                        ))}
                    </select>

                    <input
                        type="date"
                        value={editDeadlineDate}
                        onChange={(e) => setEditDeadlineDate(e.target.value)}
                        className="cursor-pointer rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/75 outline-none transition-colors hover:bg-white/[0.08] [color-scheme:dark]"
                    />
                </div>

                <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-2.5">
                    <button
                        onClick={handleCancel}
                        className="rounded-md px-2.5 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="rounded-md bg-quepia-cyan px-3 py-1.5 text-[11px] font-medium text-black transition-opacity hover:opacity-90"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        )
    }

    const todayStart = startOfLocalDay(new Date())
    const deadlineDate = getTaskDeadlineDateKey(task)
    const dueDayOffset = deadlineDate
        ? Math.round((startOfLocalDay(parseTaskDate(deadlineDate)).getTime() - todayStart.getTime()) / DAY_IN_MS)
        : null
    const isOverdue = dueDayOffset !== null && dueDayOffset < 0 && !task.completed
    const isDueSoon = dueDayOffset !== null && dueDayOffset >= 0 && dueDayOffset <= 2 && !task.completed

    const formatDueDate = (offset: number, date: Date) => {
        if (offset === 0) return "Hoy"
        if (offset === 1) return "Mañana"
        if (offset === -1) return "Ayer"
        return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
    }

    // Structured briefs start with an uppercase heading; show the first real lines instead.
    const descriptionSummary = task.descripcion ? descriptionPreview(task.descripcion) : ""

    const assets = Array.isArray(task.assets) ? task.assets : []
    const assetThumbs = assets.map(a => a.thumbnail_url).filter(Boolean).slice(0, 4) as string[]
    const pendingAssets = assets.filter(a => a.approval_status === "pending_review").length
    const changesRequestedAssets = assets.filter(a => a.approval_status === "changes_requested").length
    const approvedAssets = assets.filter(a => ["approved_internal", "approved_final", "published"].includes(a.approval_status)).length
    const hasCarousel = assets.some(a => a.asset_type === "carousel")
    const hasReel = assets.some(a => a.asset_type === "reel")

    const taskTypeMetadata = task.type_metadata && typeof task.type_metadata === "object"
        ? (task.type_metadata as Record<string, unknown>)
        : null
    const youtubeMeta = taskTypeMetadata?.youtube && typeof taskTypeMetadata.youtube === "object"
        ? (taskTypeMetadata.youtube as Record<string, unknown>)
        : null
    const youtubeThumbUrl = youtubeMeta && typeof youtubeMeta.thumbnail_url === "string" ? youtubeMeta.thumbnail_url : null
    const youtubePublishedUrl = youtubeMeta && typeof youtubeMeta.published_url === "string" ? youtubeMeta.published_url : null
    const youtubeSourceUrl = youtubeMeta && typeof youtubeMeta.source_url === "string" ? youtubeMeta.source_url : null

    // Breadcrumb shown above the title when the task hangs from a parent.
    const parentLabel = task.parent_task?.titulo || parentTask?.titulo || (task.parent_task_id ? "Subtarea" : null)
    const visibleLabels = task.labels?.slice(0, 2) ?? []
    const extraLabels = (task.labels?.length ?? 0) - visibleLabels.length

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
                CARD_BASE,
                isChild ? cn(CARD_SURFACE_NESTED, CARD_NESTED_LAYOUT) : CARD_SURFACE,
                isDragging && "opacity-40 border-[rgba(42,231,228,0.45)]",
                task.completed && "opacity-55",
                // Overdue is the only state that earns a full-height accent rail.
                isOverdue && "after:absolute after:inset-y-2 after:left-0 after:w-[2px] after:rounded-r-full after:bg-red-500/70",
                isFileDragOver && "border-[#2ae7e4] bg-[rgba(42,231,228,0.08)]"
            )}
        >
            {isFileDragOver && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-dashed border-[rgba(42,231,228,0.6)] bg-[#0a0a0a]/80">
                    <div className="flex items-center gap-1.5 text-[11px] text-white/75">
                        <CloudUpload className="h-3.5 w-3.5 text-quepia-cyan" />
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

            <div className="flex items-start gap-2.5">
                {/* Complete toggle — neutral by default so it never competes with the title. */}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleComplete?.(task.id)
                    }}
                    className="group/check mt-[1px] shrink-0"
                    title={task.completed ? "Marcar como pendiente" : "Marcar como completada"}
                    aria-label={task.completed ? "Marcar como pendiente" : "Marcar como completada"}
                >
                    {task.completed ? (
                        <div className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-white/20">
                            <Check className="h-2.5 w-2.5 text-white/80" />
                        </div>
                    ) : (
                        <div className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-white/25 transition-colors group-hover/check:border-quepia-cyan group-hover/check:bg-[rgba(42,231,228,0.12)]">
                            <Check className="h-2 w-2 text-quepia-cyan opacity-0 transition-opacity group-hover/check:opacity-100" />
                        </div>
                    )}
                </button>

                <div className="min-w-0 flex-1">
                    {parentLabel && (
                        <div className="mb-1 flex items-center gap-1 text-[11px] leading-none text-white/30">
                            <GitBranch className="h-3 w-3 shrink-0" />
                            <span className="truncate" title={parentLabel}>{parentLabel}</span>
                        </div>
                    )}

                    <p className={cn(
                        "text-[13.5px] font-medium leading-[1.35]",
                        task.completed ? "text-white/40 line-through decoration-white/20" : "text-white/90"
                    )}>
                        {renderTaskTitle(task.titulo)}
                    </p>

                    {descriptionSummary && (
                        <p className="mt-1 line-clamp-2 text-[12px] font-normal leading-[1.45] text-white/40">
                            {descriptionSummary}
                        </p>
                    )}

                    {/* Media preview: YouTube frame wins over the asset strip. */}
                    {youtubeThumbUrl ? (
                        <div className="mt-2 overflow-hidden rounded-md border border-white/[0.07] bg-black/30">
                            <img
                                src={youtubeThumbUrl}
                                alt=""
                                className="h-20 w-full object-cover"
                                loading="lazy"
                            />
                        </div>
                    ) : assetThumbs.length > 0 && (
                        <div className="mt-2 flex items-center gap-1">
                            {assetThumbs.map((url, idx) => (
                                <div
                                    key={`${url}-${idx}`}
                                    className="relative h-7 w-7 overflow-hidden rounded-[5px] border border-white/[0.08] bg-white/[0.04]"
                                >
                                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                                    {idx === 0 && (hasCarousel || hasReel) && (
                                        <span className="absolute bottom-0 right-0 flex h-3 w-3 items-center justify-center rounded-tl-[4px] bg-black/70">
                                            {hasCarousel
                                                ? <LayoutGrid className="h-2 w-2 text-white/70" />
                                                : <GitBranch className="h-2 w-2 text-white/70" />}
                                        </span>
                                    )}
                                </div>
                            ))}
                            {assets.length > assetThumbs.length && (
                                <span className="ml-0.5 text-[10px] text-white/30">+{assets.length - assetThumbs.length}</span>
                            )}
                        </div>
                    )}

                    {/* Metadata: one flat row, colour reserved for what needs action. */}
                    <div className={META_ROW}>
                        {priority !== "P4" && <PriorityGlyph priority={priority} />}

                        {deadlineDate && dueDayOffset !== null && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1",
                                    isOverdue ? "font-medium text-red-400" : isDueSoon ? "text-amber-400" : "text-white/40"
                                )}
                                title={parseTaskDate(deadlineDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
                            >
                                <Calendar className="h-3 w-3" />
                                {formatDueDate(dueDayOffset, parseTaskDate(deadlineDate))}
                            </span>
                        )}

                        {task.task_type && (
                            <span className="inline-flex items-center gap-1.5 text-white/45">
                                <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: TASK_TYPE_COLORS[task.task_type as TaskType] }}
                                />
                                {TASK_TYPE_LABELS[task.task_type as TaskType]}
                            </span>
                        )}

                        {assets.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-white/40" title={`${assets.length} asset(s) · ${approvedAssets} aprobado(s)`}>
                                <Paperclip className="h-3 w-3" />
                                {assets.length}
                            </span>
                        )}

                        {/* A single review signal: blockers first, then pending. */}
                        {changesRequestedAssets > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-400/85" title="Assets con cambios pedidos">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-400/85" />
                                {changesRequestedAssets}
                            </span>
                        ) : pendingAssets > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-400/85" title="Assets esperando revisión">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/85" />
                                {pendingAssets}
                            </span>
                        ) : assets.length > 0 && approvedAssets === assets.length ? (
                            <Check className="h-3 w-3 text-emerald-400/80" aria-label="Assets aprobados" />
                        ) : null}

                        {visibleLabels.map((label, i) => (
                            <span key={i} className="rounded border border-white/[0.09] px-1.5 py-px text-[10px] leading-[14px] text-white/45">
                                {label}
                            </span>
                        ))}
                        {extraLabels > 0 && (
                            <span className="text-[10px] text-white/30">+{extraLabels}</span>
                        )}

                        {task.estimated_hours && (
                            <span className="font-mono text-[10px] text-white/30">{task.estimated_hours}h</span>
                        )}

                        {task.link && <Link2 className="h-3 w-3 text-white/30" aria-label="Tiene enlace" />}

                        {(youtubePublishedUrl || youtubeSourceUrl) && (
                            <span className="text-[10px] font-medium text-red-400/70">YouTube</span>
                        )}
                    </div>

                    {uploadQueue.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                            {uploadQueue.slice(0, 2).map((u) => (
                                <div key={u.id}>
                                    <div className="mb-1 flex items-center justify-between text-[10px] leading-none text-white/40">
                                        <span className="max-w-[150px] truncate">{u.fileName || u.id}</span>
                                        <span>{u.stage === "error" ? "Error" : `${u.percent}%`}</span>
                                    </div>
                                    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
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

                {/* Trailing rail: hover-only actions, then the persistent assignee. */}
                <div className="flex shrink-0 items-center gap-1">
                    {userId && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                fileInputRef.current?.click()
                            }}
                            className={GHOST_ACTION}
                            title="Subir assets"
                            aria-label="Subir assets"
                        >
                            <CloudUpload className="h-3.5 w-3.5" />
                        </button>
                    )}

                    {task.assignee && (
                        <UserAvatar
                            name={task.assignee.nombre}
                            avatarUrl={task.assignee.avatar_url}
                            size={20}
                            fontSize={9}
                            className="border border-black/30"
                        />
                    )}
                </div>
            </div>
        </div>
    )
})
