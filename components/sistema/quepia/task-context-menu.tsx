"use client"

import { useState, useRef, useEffect } from "react"
import {
    MoreHorizontal,
    Copy,
    Trash2,
    Calendar,
    Flag,
    ArrowUp,
    ArrowDown,
    Link2,
    CornerUpRight,
    Edit3
} from "lucide-react"
import type { Task, Priority } from "@/types/sistema"
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/sistema"

interface TaskContextMenuProps {
    task: Task
    children: React.ReactNode
    onDuplicate: (task: Task) => void
    onDelete: (taskId: string) => void
    onUpdate: (taskId: string, updates: Partial<Task>) => void
    onEdit: (task: Task) => void
    onQuickEdit?: (task: Task) => void
    onSendForReview?: (task: Task) => void
}

export function TaskContextMenu({
    task,
    children,
    onDuplicate,
    onDelete,
    onUpdate,
    onEdit,
    onQuickEdit,
    onSendForReview
}: TaskContextMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const menuRef = useRef<HTMLDivElement>(null)

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setPosition({ x: e.clientX, y: e.clientY })
        setIsOpen(true)
    }

    // Close on click outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) {
            document.addEventListener("click", handleClick)
        }
        return () => document.removeEventListener("click", handleClick)
    }, [isOpen])

    const handlePriorityChange = (priority: Priority) => {
        onUpdate(task.id, { priority })
        setIsOpen(false)
    }

    const copyLink = () => {
        // Assuming there will be a route like /sistema/task/[id] or just a query param
        const url = `${window.location.origin}/sistema?taskId=${task.id}`
        navigator.clipboard.writeText(url)
        setIsOpen(false)
        // You might want to add a toast here
    }

    return (
        <div onContextMenu={handleContextMenu}>
            {children}
            {isOpen && (
                <div
                    ref={menuRef}
                    className="fixed z-50 w-56 rounded-lg border border-white/10 bg-[#1a1a1a] p-1 shadow-xl text-white"
                    style={{ top: position.y, left: position.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex flex-col gap-0.5">
                        <button
                            onClick={() => { onEdit(task); setIsOpen(false) }}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/10 text-left"
                        >
                            <Edit3 className="h-4 w-4 text-white/50" />
                            Editar tarea
                            <span className="ml-auto text-xs text-white/30">⌘E</span>
                        </button>

                        {onQuickEdit && (
                            <button
                                onClick={() => { onQuickEdit(task); setIsOpen(false) }}
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/10 text-left"
                            >
                                <Edit3 className="h-4 w-4 text-quepia-cyan/50" />
                                Edición Rápida
                            </button>
                        )}

                        <div className="my-1 h-px bg-white/10" />

                        <div className="px-2 py-1.5">
                            <div className="mb-1 text-xs text-white/40 font-medium">Prioridad</div>
                            <div className="flex gap-1">
                                {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => handlePriorityChange(p)}
                                        className={`flex h-6 w-6 items-center justify-center rounded hover:bg-white/10 ${task.priority === p ? 'bg-white/10 ring-1 ring-white/20' : ''
                                            }`}
                                        title={PRIORITY_LABELS[p]}
                                    >
                                        <Flag
                                            className="h-3.5 w-3.5"
                                            style={{ color: PRIORITY_COLORS[p] }}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="my-1 h-px bg-white/10" />

                        <button
                            onClick={() => onDuplicate(task)}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/10 text-left"
                        >
                            <Copy className="h-4 w-4 text-white/50" />
                            Duplicar
                        </button>

                        <button
                            onClick={copyLink}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/10 text-left"
                        >
                            <Link2 className="h-4 w-4 text-white/50" />
                            Copiar enlace
                        </button>

                        <div className="my-1 h-px bg-white/10" />

                        <button
                            onClick={() => { onSendForReview?.(task); setIsOpen(false) }}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/10 text-left text-quepia-cyan/90 hover:text-quepia-cyan"
                        >
                            <CornerUpRight className="h-4 w-4" />
                            Enviar a revisión
                        </button>

                        <div className="my-1 h-px bg-white/10" />

                        <button
                            onClick={() => { onDelete(task.id); setIsOpen(false) }}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-red-400 hover:bg-red-500/10 text-left"
                        >
                            <Trash2 className="h-4 w-4" />
                            Eliminar
                            <span className="ml-auto text-xs text-red-400/50">⌘⌫</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
