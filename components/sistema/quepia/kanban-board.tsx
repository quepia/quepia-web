"use client"

import { useState } from "react"
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
    LayoutGrid
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useTasks, useColumns } from "@/lib/sistema/hooks"
import type { Task, ColumnWithTasks, SistemaUser, TaskType } from "@/types/sistema"
import { PRIORITY_COLORS, PRIORITY_LABELS, Priority, TASK_TYPE_LABELS, TASK_TYPE_COLORS } from "@/types/sistema"
import { TaskContextMenu } from "@/components/sistema/quepia/task-context-menu"
import { SendReviewModal } from "@/components/sistema/quepia/send-review-modal"
import { ProjectResources } from "@/components/sistema/quepia/project-resources"

// Re-export types for backward compatibility
export type { Task, ColumnWithTasks as ColumnType }

interface KanbanBoardProps {
    projectId?: string
    projectName: string
    onTaskClick?: (task: Task) => void
}

export function KanbanBoard({ projectId, projectName, onTaskClick }: KanbanBoardProps) {
    const { columns, loading, error, createTask, updateTask, moveTask, duplicateTask, deleteTask, refresh: refreshTasks } = useTasks(projectId)
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
        if (confirm("¿Estás seguro de eliminar esta tarea?")) {
            await deleteTask(taskId)
        }
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
            alert(`La columna "${targetColumn.nombre}" tiene un límite de ${targetColumn.wip_limit} tareas. Mueve una tarea primero.`)
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
                        alert(`No se puede mover "${draggedTask.titulo}" a "${targetColumn.nombre}": tiene ${incomplete.length} subtarea(s) sin completar.`)
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
                    alert(`No se puede mover "${draggedTask.titulo}": depende de ${names} que aún no están completadas.`)
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
        await refreshTasks()
    }

    const handleCancelColumnEdit = () => {
        setEditingColumnId(null)
        setEditingColumnName("")
    }

    const handleDeleteColumn = async (columnId: string) => {
        const column = columns.find(c => c.id === columnId)
        if (column && column.tasks.length > 0) {
            alert("No puedes eliminar una columna con tareas. Mueve las tareas primero.")
            return
        }
        if (confirm("¿Estás seguro de eliminar esta columna?")) {
            await deleteColumn(columnId)
            await refreshTasks()
        }
    }

    const handleAddColumn = async () => {
        if (!newColumnName.trim()) return
        await createColumn(newColumnName.trim())
        setNewColumnName("")
        setIsAddingColumn(false)
        await refreshTasks()
    }

    const handleToggleComplete = async (taskId: string) => {
        const task = columns.flatMap(c => c.tasks).find(t => t.id === taskId)
        if (!task) return
        await updateTask(taskId, { completed: !task.completed })
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
            <div className="px-6 py-3 border-b border-white/[0.06] flex items-center justify-between gap-4">
                <h1 className="text-lg font-semibold text-white">{projectName}</h1>
                {projectId && <ProjectResources projectId={projectId} />}
            </div>

            {/* Kanban Columns */}
            <div className="flex-1 overflow-x-auto p-6">
                <div className="flex gap-4 h-full min-w-max">
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
                                await refreshTasks()
                            }}
                            editingTaskId={editingTaskId}
                            onSetEditingTaskId={setEditingTaskId}
                        />
                    ))}

                    {/* Add Column */}
                    {isAddingColumn ? (
                        <div className="w-[320px] shrink-0 bg-white/5 border border-white/10 rounded-lg p-3">
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
                            className="w-[320px] shrink-0 flex items-center justify-center gap-2 py-4 border-2 border-dashed border-white/10 rounded-lg text-white/40 hover:border-white/20 hover:text-white/60 transition-colors"
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
    onSetEditingTaskId
}: KanbanColumnProps) {
    const [showMenu, setShowMenu] = useState(false)
    const [editingWip, setEditingWip] = useState(false)
    const [wipValue, setWipValue] = useState(column.wip_limit?.toString() || "")

    const isAtWipLimit = column.wip_limit !== null && column.wip_limit !== undefined && column.tasks.length >= column.wip_limit
    const isNearWipLimit = column.wip_limit !== null && column.wip_limit !== undefined && column.tasks.length >= column.wip_limit - 1

    return (
        <div
            className={cn(
                "w-[320px] flex flex-col shrink-0 rounded-lg transition-colors",
                isDragOver && !isAtWipLimit && "bg-quepia-cyan/10",
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
                                {column.tasks.length}
                                {column.wip_limit != null && (
                                    <span className="text-white/25">/{column.wip_limit}</span>
                                )}
                            </span>
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
            <div className="flex-1 space-y-2 overflow-y-auto pb-4">
                {column.tasks.map((task) => (
                    <TaskContextMenu
                        key={task.id}
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
                            onClick={() => onTaskClick?.(task)}
                            onDragStart={(e) => onDragStart(e, task)}
                            onDragEnd={onDragEnd}
                            isDragging={draggedTaskId === task.id}
                            onToggleComplete={onToggleComplete}
                            isEditing={editingTaskId === task.id}
                            onSaveEdit={async (updates) => {
                                await onUpdateTask(task.id, updates)
                                onSetEditingTaskId(null)
                            }}
                            onCancelEdit={() => onSetEditingTaskId(null)}
                        />
                    </TaskContextMenu>
                ))}

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
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-quepia-cyan hover:bg-white/5 rounded-lg transition-colors"
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
    onClick?: () => void
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: () => void
    isDragging: boolean
    onToggleComplete?: (taskId: string) => void
    isEditing?: boolean
    onSaveEdit?: (updates: Partial<Task>) => void
    onCancelEdit?: () => void
}

function TaskCard({
    task,
    onClick,
    onDragStart,
    onDragEnd,
    isDragging,
    onToggleComplete,
    isEditing,
    onSaveEdit,
    onCancelEdit
}: TaskCardProps) {
    const [editTitle, setEditTitle] = useState(task.titulo)
    const [editPriority, setEditPriority] = useState<Priority>(task.priority || "P4")
    const [editDueDate, setEditDueDate] = useState(task.due_date || "")

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

    const priorityColor = PRIORITY_COLORS[task.priority as Priority] || PRIORITY_COLORS["P4"]
    const isHighPriority = task.priority === "P1"

    if (isEditing) {
        return (
            <div
                className="w-full text-left bg-[#1a1a1a] border border-white/10 rounded-lg p-3 cursor-default shadow-lg"
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

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !task.completed
    const isDueSoon = task.due_date && !isOverdue && !task.completed &&
        new Date(task.due_date).getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000

    const formatDueDate = (date: string) => {
        const d = new Date(date)
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        if (d.toDateString() === today.toDateString()) return "Hoy"
        if (d.toDateString() === tomorrow.toDateString()) return "Mañana"
        return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
    }

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onClick}
            className={cn(
                "w-full text-left bg-[#161616] hover:bg-[#1a1a1a] border border-white/[0.04] hover:border-white/[0.08] rounded-lg p-3 transition-all cursor-pointer group relative overflow-hidden",
                isDragging && "opacity-50 scale-95 shadow-xl ring-1 ring-quepia-cyan/50",
                task.completed && "opacity-60"
            )}
        >
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
                        <p className="text-xs text-[#808080] line-clamp-2 mb-2.5 font-normal leading-relaxed">
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
                    </div>
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
}
