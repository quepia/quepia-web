"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/sistema/supabase/client"
import { toTaskDeadlineTimestamp } from "@/lib/sistema/task-deadlines"
import {
    X,
    Calendar as CalendarIcon,
    AlignLeft,
    Tag,
    Trash2,
    Edit2,
    CheckSquare,
    Loader2,
    ArrowRight,
    Send,
    ChevronLeft,
    ChevronRight
} from "lucide-react"
import {
    EVENT_TYPE_COLORS,
    EVENT_TYPE_LABELS,
    type CalendarEvent,
    type CalendarEventType
} from "@/types/sistema"

interface CalendarComment {
    id: string
    event_id: string
    content: string
    created_at: string
    author_name: string
    is_client: boolean
    user_id?: string | null
}

type CalendarEventWithDetails = CalendarEvent & {
    project?: { id: string; nombre: string; color: string }
    comments?: CalendarComment[]
}

interface EventDetailModalProps {
    event: CalendarEventWithDetails | null
    isOpen: boolean
    onClose: () => void
    onUpdate: () => void
    userId?: string
    /** Planificaciones ordenadas cronológicamente para recorrer sin cerrar el modal. */
    navigationEvents?: CalendarEventWithDetails[]
    onNavigate?: (event: CalendarEventWithDetails) => void
}

export function EventDetailModal({ event, isOpen, onClose, onUpdate, userId, navigationEvents = [], onNavigate }: EventDetailModalProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [loading, setLoading] = useState(false)
    const [converting, setConverting] = useState(false)

    const [formData, setFormData] = useState({
        titulo: "",
        descripcion: "",
        fecha_inicio: "",
        tipo: "publicacion" as CalendarEventType,
        color: "#22c55e"
    })

    const [newComment, setNewComment] = useState("")
    const [sendingComment, setSendingComment] = useState(false)
    const [comments, setComments] = useState<CalendarComment[]>([])
    const commentsRequestRef = useRef(0)

    const navigationIndex = event ? navigationEvents.findIndex((item) => item.id === event.id) : -1
    const previousEvent = navigationIndex > 0 ? navigationEvents[navigationIndex - 1] : null
    const nextEvent = navigationIndex >= 0 && navigationIndex < navigationEvents.length - 1
        ? navigationEvents[navigationIndex + 1]
        : null

    const goToEvent = (destination: CalendarEventWithDetails | null) => {
        if (!destination || isEditing) return
        onNavigate?.(destination)
    }

    const fetchComments = async (eventId: string) => {
        const requestId = commentsRequestRef.current + 1
        commentsRequestRef.current = requestId
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('sistema_calendar_comments')
                .select('*')
                .eq('event_id', eventId)
                .order('created_at', { ascending: true })

            if (error) throw error
            if (requestId === commentsRequestRef.current) {
                setComments((data as CalendarComment[]) || [])
            }
        } catch (err) {
            console.error("Error fetching event comments:", err)
        }
    }

    useEffect(() => {
        if (event) {
            setIsEditing(false)
            setFormData({
                titulo: event.titulo,
                descripcion: event.descripcion || "",
                fecha_inicio: event.fecha_inicio.split("T")[0],
                tipo: event.tipo,
                color: event.color
            })
            // Reset comment input when event changes
            setNewComment("")
            // Keep optimistic initial comments while loading latest
            setComments(event.comments || [])
            fetchComments(event.id)
        }
    }, [event])

    useEffect(() => {
        if (!isOpen) return

        const handleKeyboardNavigation = (keyboardEvent: KeyboardEvent) => {
            if (keyboardEvent.key === "Escape") {
                onClose()
                return
            }
            if (isEditing || (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight")) return
            if (keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey) return

            const target = keyboardEvent.target as HTMLElement | null
            if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return

            const destination = keyboardEvent.key === "ArrowLeft" ? previousEvent : nextEvent
            if (!destination) return
            keyboardEvent.preventDefault()
            onNavigate?.(destination)
        }

        window.addEventListener("keydown", handleKeyboardNavigation)
        return () => window.removeEventListener("keydown", handleKeyboardNavigation)
    }, [isEditing, isOpen, nextEvent, onClose, onNavigate, previousEvent])

    const handleSendComment = async () => {
        if (!event || !newComment.trim()) return

        setSendingComment(true)
        try {
            const supabase = createClient()
            const { error } = await supabase
                .from('sistema_calendar_comments')
                .insert({
                    event_id: event.id,
                    content: newComment,
                    author_name: "Equipo Quepia", // Placeholder, ideally from auth
                    is_client: false,
                    user_id: userId
                })

            if (error) throw error

            setNewComment("")
            await fetchComments(event.id)
        } catch (err) {
            console.error("Error sending comment:", err)
            alert("Error al enviar respuesta")
        } finally {
            setSendingComment(false)
        }
    }

    if (!isOpen || !event) return null

    const handleSave = async () => {
        setLoading(true)
        try {
            const supabase = createClient()
            const { error } = await supabase
                .from('sistema_calendar_events')
                .update({
                    titulo: formData.titulo,
                    descripcion: formData.descripcion,
                    fecha_inicio: formData.fecha_inicio, // Assuming full day for now, or append time if needed
                    tipo: formData.tipo,
                    color: formData.color
                })
                .eq('id', event.id)

            if (error) throw error

            setIsEditing(false)
            onUpdate()
        } catch (err) {
            console.error("Error updating event:", err)
            alert("Error al guardar cambios")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm("¿Estás seguro de eliminar este evento?")) return

        setLoading(true)
        try {
            const supabase = createClient()
            const { error } = await supabase
                .from('sistema_calendar_events')
                .delete()
                .eq('id', event.id)

            if (error) throw error

            onClose()
            onUpdate()
        } catch (err) {
            console.error("Error deleting event:", err)
            alert("Error al eliminar evento")
        } finally {
            setLoading(false)
        }
    }

    const handleConvertToTask = async () => {
        if (!userId || !event.project_id) return
        if (!confirm("Se creará una tarea con la info del evento y se eliminará el evento del calendario. ¿Continuar?")) return

        setConverting(true)
        try {
            const supabase = createClient()

            // 1. Get first column of the project
            const { data: column, error: colError } = await supabase
                .from('sistema_columns')
                .select('id')
                .eq('project_id', event.project_id)
                .order('orden', { ascending: true })
                .limit(1)
                .single()

            if (colError || !column) throw new Error("No se encontró columna para crear la tarea")

            // 2. Get max orden
            const { data: maxOrden } = await supabase
                .from('sistema_tasks')
                .select('orden')
                .eq('column_id', column.id)
                .order('orden', { ascending: false })
                .limit(1)
                .single()

            const newOrden = (maxOrden?.orden || 0) + 1

            // 3. Create Task
            const { error: insertError } = await supabase
                .from('sistema_tasks')
                .insert({
                    project_id: event.project_id,
                    column_id: column.id,
                    titulo: formData.titulo, // Use current form data in case user edited
                    descripcion: formData.descripcion,
                    deadline: toTaskDeadlineTimestamp(formData.fecha_inicio),
                    priority: 'P3', // Default medium
                    orden: newOrden,
                    task_type: 'otro', // Or map from event type if possible
                    completed: false
                })

            if (insertError) throw insertError

            // 4. Delete Event
            const { error: deleteError } = await supabase
                .from('sistema_calendar_events')
                .delete()
                .eq('id', event.id)

            if (deleteError) throw deleteError

            onClose()
            onUpdate()
        } catch (err) {
            console.error("Error converting to task:", err)
            alert("Error al convertir a tarea")
        } finally {
            setConverting(false)
        }
    }

    const eventDate = new Date(`${formData.fecha_inicio}T12:00:00`)

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-5">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-[3px]" onClick={onClose} />

            <div className="relative z-[70] flex h-[100svh] w-full flex-col overflow-hidden border-0 bg-[#0d1014] shadow-[0_28px_90px_rgba(0,0,0,0.58)] sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl sm:border sm:border-[#2a3038]">
                <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[#252b33] bg-[#101318] px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-400/[0.09]">
                            <CalendarIcon className="h-4 w-4 text-violet-300" />
                        </div>
                        <span className="shrink-0 font-medium text-violet-300">Planificación</span>
                        {event.project && (
                            <>
                                <span className="text-white/20">/</span>
                                <span className="truncate font-medium text-white/70">{event.project.nombre}</span>
                            </>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                        {navigationEvents.length > 1 && (
                            <div className="mr-1 flex items-center gap-0.5 border-r border-white/[0.08] pr-2">
                                <button
                                    onClick={() => goToEvent(previousEvent)}
                                    disabled={!previousEvent || isEditing}
                                    className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
                                    title="Planificación anterior (←)"
                                    aria-label="Planificación anterior"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                {navigationIndex >= 0 && (
                                    <span className="px-1 font-mono text-[11px] tabular-nums text-white/30">
                                        {navigationIndex + 1}/{navigationEvents.length}
                                    </span>
                                )}
                                <button
                                    onClick={() => goToEvent(nextEvent)}
                                    disabled={!nextEvent || isEditing}
                                    className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
                                    title="Planificación siguiente (→)"
                                    aria-label="Planificación siguiente"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="rounded-lg p-2 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                            aria-label="Cerrar planificación"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-7 lg:p-8">
                    <div className="mb-7">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="rounded-md border border-violet-400/20 bg-violet-400/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-300">
                                Planificación
                            </span>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: formData.color }} />
                        </div>
                        {isEditing ? (
                            <input
                                value={formData.titulo}
                                onChange={(inputEvent) => setFormData((previous) => ({ ...previous, titulo: inputEvent.target.value }))}
                                className="w-full border-b border-violet-400/40 bg-transparent pb-2 text-2xl font-semibold text-white outline-none placeholder:text-white/30"
                                placeholder="Título de la planificación"
                                autoFocus
                            />
                        ) : (
                            <h2 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">{formData.titulo}</h2>
                        )}
                    </div>

                    <div className="mb-7 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-[#252b33] bg-[#101318] p-3.5">
                            <span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">
                                <CalendarIcon className="h-3.5 w-3.5 text-violet-300/80" /> Fecha
                            </span>
                            {isEditing ? (
                                <input
                                    type="date"
                                    value={formData.fecha_inicio}
                                    onChange={(inputEvent) => setFormData((previous) => ({ ...previous, fecha_inicio: inputEvent.target.value }))}
                                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-sm text-white outline-none focus:border-violet-400/50"
                                />
                            ) : (
                                <p className="text-sm font-medium capitalize text-white/75">
                                    {eventDate.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                                </p>
                            )}
                        </div>

                        <div className="rounded-xl border border-[#252b33] bg-[#101318] p-3.5">
                            <span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">
                                <Tag className="h-3.5 w-3.5 text-violet-300/80" /> Tipo
                            </span>
                            {isEditing ? (
                                <select
                                    value={formData.tipo}
                                    onChange={(selectEvent) => setFormData((previous) => ({ ...previous, tipo: selectEvent.target.value as CalendarEventType }))}
                                    className="w-full rounded-lg border border-white/10 bg-[#151920] px-2.5 py-2 text-sm text-white outline-none focus:border-violet-400/50"
                                >
                                    {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="flex items-center gap-2 text-sm font-medium text-white/75">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLORS[formData.tipo] }} />
                                    {EVENT_TYPE_LABELS[formData.tipo]}
                                </p>
                            )}
                        </div>

                        <div className="rounded-xl border border-[#252b33] bg-[#101318] p-3.5">
                            <span className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">Proyecto</span>
                            <p className="truncate text-sm font-medium text-white/75">{event.project?.nombre || "Sin proyecto"}</p>
                        </div>
                    </div>

                    {isEditing && (
                        <div className="mb-7 rounded-xl border border-[#252b33] bg-[#101318] p-3.5">
                            <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">Color del evento</span>
                            <div className="flex flex-wrap gap-2">
                                {Object.values(EVENT_TYPE_COLORS).map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => setFormData((previous) => ({ ...previous, color }))}
                                        className={`h-7 w-7 rounded-full transition-transform ${formData.color === color ? "scale-110 ring-2 ring-white/80 ring-offset-2 ring-offset-[#101318]" : "hover:scale-105"}`}
                                        style={{ backgroundColor: color }}
                                        aria-label={`Usar color ${color}`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-7">
                        <span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">
                            <AlignLeft className="h-3.5 w-3.5" /> Descripción / Info
                        </span>
                        {isEditing ? (
                            <textarea
                                value={formData.descripcion}
                                onChange={(textareaEvent) => setFormData((previous) => ({ ...previous, descripcion: textareaEvent.target.value }))}
                                className="h-44 w-full resize-none rounded-xl border border-white/10 bg-[#101318] p-4 text-sm leading-6 text-white outline-none focus:border-violet-400/50"
                                placeholder="Detalles de la planificación..."
                            />
                        ) : (
                            <div className="min-h-28 w-full whitespace-pre-wrap rounded-xl border border-[#252b33] bg-[#101318] p-4 text-sm leading-6 text-white/75">
                                {formData.descripcion || <span className="italic text-white/30">Sin descripción</span>}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-[#252b33] bg-[#101318] p-4">
                        <div className="mb-4 flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">
                                <ArrowRight className="h-3.5 w-3.5 text-violet-300/80" /> Comentarios del cliente
                            </span>
                            {comments.length > 0 && (
                                <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/55">{comments.length}</span>
                            )}
                        </div>

                        <div className="mb-4 max-h-60 space-y-3 overflow-y-auto pr-2">
                            {comments.length > 0 ? comments.map((comment) => (
                                <div key={comment.id} className={`flex flex-col ${comment.is_client ? "items-start" : "items-end"}`}>
                                    <div className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${comment.is_client
                                        ? "border-white/10 bg-white/[0.04] text-white/80"
                                        : "border-violet-400/20 bg-violet-400/[0.08] text-white"
                                        }`}>
                                        <p>{comment.content}</p>
                                    </div>
                                    <span className="mt-1 px-1 text-[10px] text-white/30">
                                        {comment.author_name} • {new Date(comment.created_at).toLocaleString("es-AR")}
                                    </span>
                                </div>
                            )) : (
                                <p className="py-2 text-center text-sm text-white/30">No hay comentarios.</p>
                            )}
                        </div>

                        <div className="relative">
                            <input
                                type="text"
                                value={newComment}
                                onChange={(inputEvent) => setNewComment(inputEvent.target.value)}
                                placeholder="Escribe una respuesta..."
                                className="w-full rounded-xl border border-white/[0.09] bg-black/10 px-3 py-2.5 pr-12 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-violet-400/50"
                                onKeyDown={(keyboardEvent) => keyboardEvent.key === "Enter" && handleSendComment()}
                            />
                            <button
                                onClick={handleSendComment}
                                disabled={!newComment.trim() || sendingComment}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-violet-300 transition-colors hover:bg-violet-400/10 disabled:opacity-30"
                                aria-label="Enviar comentario"
                            >
                                {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex min-h-16 items-center justify-between gap-3 border-t border-[#252b33] bg-[#101318] px-4 py-3 sm:px-6">
                    {isEditing ? (
                        <>
                            <button
                                onClick={handleDelete}
                                className="flex items-center gap-2 rounded-lg p-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                                disabled={loading}
                            >
                                <Trash2 className="h-4 w-4" /> Eliminar
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="rounded-lg px-4 py-2 text-sm text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
                                    disabled={loading}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 rounded-lg bg-violet-400 px-4 py-2 text-sm font-semibold text-[#101318] transition-colors hover:bg-violet-300 disabled:opacity-50"
                                    disabled={loading}
                                >
                                    {loading && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white"
                                    title="Editar planificación"
                                    aria-label="Editar planificación"
                                >
                                    <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="rounded-lg p-2 text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                    title="Eliminar planificación"
                                    aria-label="Eliminar planificación"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                            <button
                                onClick={handleConvertToTask}
                                disabled={converting}
                                className="flex items-center gap-2 rounded-lg border border-violet-400/25 bg-violet-400/[0.08] px-3 py-2 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-400/[0.14] hover:text-violet-200 disabled:opacity-50"
                            >
                                {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                                Convertir a tarea
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
