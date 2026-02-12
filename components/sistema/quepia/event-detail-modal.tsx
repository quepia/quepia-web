"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/sistema/supabase/client"
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
    Send
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
}

export function EventDetailModal({ event, isOpen, onClose, onUpdate, userId }: EventDetailModalProps) {
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

    const fetchComments = async (eventId: string) => {
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('sistema_calendar_comments')
                .select('*')
                .eq('event_id', eventId)
                .order('created_at', { ascending: true })

            if (error) throw error
            setComments((data as CalendarComment[]) || [])
        } catch (err) {
            console.error("Error fetching event comments:", err)
        }
    }

    useEffect(() => {
        if (event) {
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
                    due_date: formData.fecha_inicio,
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

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative z-[70] w-full h-[100svh] sm:h-auto sm:max-w-lg bg-[#1a1a1a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col sm:max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full mt-0.5`} style={{ backgroundColor: formData.color }} />
                        {isEditing ? (
                            <input
                                value={formData.titulo}
                                onChange={e => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                                className="bg-transparent text-lg font-semibold text-white outline-none placeholder:text-white/30 w-full"
                                placeholder="Título del evento"
                                autoFocus
                            />
                        ) : (
                            <h2 className="text-lg font-semibold text-white">{event.titulo}</h2>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">

                    {/* Project Info */}
                    {event.project && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-white/40">Proyecto:</span>
                            <span
                                className="px-2 py-0.5 rounded textxs font-medium"
                                style={{ backgroundColor: event.project.color + "20", color: event.project.color }}
                            >
                                {event.project.nombre}
                            </span>
                        </div>
                    )}

                    {/* Date & Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 flex items-center gap-1.5">
                                <CalendarIcon className="h-3.5 w-3.5" /> Fecha
                            </label>
                            {isEditing ? (
                                <input
                                    type="date"
                                    value={formData.fecha_inicio}
                                    onChange={e => setFormData(prev => ({ ...prev, fecha_inicio: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:border-quepia-cyan outline-none"
                                />
                            ) : (
                                <div className="text-sm text-white/80">
                                    {new Date(event.fecha_inicio).toLocaleDateString("es-AR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5" /> Tipo
                            </label>
                            {isEditing ? (
                                <select
                                    value={formData.tipo}
                                    onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value as CalendarEventType }))}
                                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:border-quepia-cyan outline-none"
                                >
                                    {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="text-sm text-white/80 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLORS[event.tipo] }} />
                                    {EVENT_TYPE_LABELS[event.tipo]}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Color (only editing) */}
                    {isEditing && (
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40">Color</label>
                            <div className="flex gap-2 flex-wrap">
                                {Object.values(EVENT_TYPE_COLORS).map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setFormData(prev => ({ ...prev, color: c }))}
                                        className={`w-6 h-6 rounded-full transition-transform ${formData.color === c ? "scale-110 ring-2 ring-white" : ""}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="text-xs text-white/40 flex items-center gap-1.5">
                            <AlignLeft className="h-3.5 w-3.5" /> Descripción / Info
                        </label>
                        {isEditing ? (
                            <textarea
                                value={formData.descripcion}
                                onChange={e => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                                className="w-full h-40 bg-white/5 border border-white/10 rounded p-3 text-sm text-white focus:border-quepia-cyan outline-none resize-none"
                                placeholder="Detalles del evento..."
                            />
                        ) : (
                            <div className="w-full bg-white/[0.02] rounded-lg p-3 text-sm text-white/80 whitespace-pre-wrap min-h-[100px]">
                                {event.descripcion || <span className="text-white/30 italic">Sin descripción</span>}
                            </div>
                        )}
                    </div>

                    {/* Comments Section */}
                    <div className="pt-4 border-t border-white/10 space-y-4">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-white/40 flex items-center gap-1.5">
                                <ArrowRight className="h-3.5 w-3.5" /> Comentarios del Cliente
                            </label>
                            {comments.length > 0 && (
                                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full text-white/60">
                                    {comments.length}
                                </span>
                            )}
                        </div>

                        {/* Comment List */}
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {comments.length > 0 ? (
                                comments.map((comment) => (
                                    <div key={comment.id} className={`flex flex-col ${!comment.is_client ? "items-end" : "items-start"}`}>
                                        <div className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${!comment.is_client
                                            ? "bg-quepia-cyan/10 text-white border border-quepia-cyan/20"
                                            : "bg-white/5 text-white/80 border border-white/10"
                                            }`}>
                                            <p>{comment.content}</p>
                                        </div>
                                        <span className="text-[10px] text-white/30 mt-1 px-1">
                                            {comment.author_name} • {new Date(comment.created_at).toLocaleString("es-AR")}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-white/30 text-center py-2">No hay comentarios.</p>
                            )}
                        </div>

                        {/* Comment Input */}
                        <div className="flex gap-2 pt-2">
                            <input
                                type="text"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Escribe una respuesta..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-quepia-cyan outline-none"
                                onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                            />
                            <button
                                onClick={handleSendComment}
                                disabled={!newComment.trim() || sendingComment}
                                className="p-2 rounded-lg bg-quepia-cyan text-black hover:bg-quepia-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex justify-between items-center bg-[#1a1a1a]">
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => handleDelete()}
                                className="flex items-center gap-2 text-red-500 hover:text-red-400 p-2 rounded hover:bg-red-500/10 transition-colors text-sm"
                                disabled={loading}
                            >
                                <Trash2 className="h-4 w-4" />
                                Eliminar
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="px-4 py-2 rounded-lg hover:bg-white/5 text-white/60 text-sm transition-colors"
                                    disabled={loading}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-4 py-2 rounded-lg bg-quepia-cyan text-black font-medium text-sm hover:bg-quepia-cyan/90 transition-colors flex items-center gap-2"
                                    disabled={loading}
                                >
                                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Guardar
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                                    title="Editar"
                                >
                                    <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="p-2 rounded-lg hover:bg-red-500/10 text-white/60 hover:text-red-500 transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleConvertToTask}
                                    disabled={converting}
                                    className="px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors text-sm flex items-center gap-2 border border-indigo-500/20"
                                >
                                    {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                                    Convertir a Tarea
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
