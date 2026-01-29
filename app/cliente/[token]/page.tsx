"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { Calendar, CheckCircle2, Circle, Clock, AlertCircle, Loader2, MessageSquare, Send, X, AlignLeft, Tag, FileIcon, Eye, LayoutGrid } from "lucide-react"
import { getPublicClientData, getPublicClientDataV2 } from "@/lib/sistema/hooks"
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/types/sistema"
import type { CalendarEventType, Priority } from "@/types/sistema"
import { createClient } from "@/lib/sistema/supabase/client"
import { ClientAssetViewer, type ClientAsset } from "@/components/sistema/quepia/client-asset-viewer"
import { ClientAssetsView } from "@/components/sistema/quepia/client-assets-view"
import { ClientOnboardingOverlay } from "@/components/sistema/quepia/client-onboarding-overlay"

interface ClientData {
    project?: {
        id: string
        nombre: string
        color: string
    }
    client?: {
        id: string
        nombre: string
        email?: string
        can_view_calendar: boolean
        can_view_tasks: boolean
        can_comment: boolean
    }
    calendar_events?: Array<{
        id: string
        titulo: string
        descripcion: string | null
        tipo: CalendarEventType
        fecha_inicio: string
        fecha_fin: string | null
        todo_el_dia: boolean
        color: string
        comments?: Array<{
            id: string
            content: string
            created_at: string
            author_name: string
            is_client: boolean
        }>
    }>
    tasks?: Array<{
        id: string
        titulo: string
        descripcion: string | null
        social_copy?: string | null
        column: string
        priority: Priority
        due_date: string | null
        completed: boolean
        assets?: ClientAsset[]
    }>
    error?: string
}

export default function ClientViewPage() {
    const params = useParams()
    const token = params?.token as string
    const router = useRouter()

    const [data, setData] = useState<ClientData | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<"calendar" | "tasks" | "assets">("calendar")
    const [showOnboarding, setShowOnboarding] = useState(false)

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true)

        // Detect V2 Token (Session UUID) vs V1 Token (64 char hex)
        // UUIDs are 36 chars.
        let result: any = null

        if (token.length === 36) {
            // V2 Session
            result = await getPublicClientDataV2(token)
        } else {
            // V1 Legacy
            result = await getPublicClientData(token)
        }

        if (result?.error === "Session invalid or expired") {
            // Redirect to login if V2 session expired
            router.push(`/cliente/login?expired=true`)
            return
        }

        setData(result)
        setLoading(false)

        // Check Onboarding status (only for successful load)
        if (result && !result.error && token.length === 36) {
            const hasSeen = localStorage.getItem(`quepia_onboarding_seen_${result.client.id}`)
            if (!hasSeen) {
                setShowOnboarding(true)
            }
        }
    }

    const handleOnboardingComplete = () => {
        if (data?.client?.id) {
            localStorage.setItem(`quepia_onboarding_seen_${data.client.id}`, "true")
        }
    }

    useEffect(() => {
        if (token) {
            fetchData()
        }
    }, [token])

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-quepia-cyan" />
            </div>
        )
    }

    if (data?.error || !data?.project) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2">Enlace no válido</h1>
                    <p className="text-white/60">Este enlace ha expirado o no es válido.</p>
                    <button
                        onClick={() => router.push("/cliente/login")}
                        className="mt-6 text-quepia-cyan hover:underline"
                    >
                        Ir al Acceso de Clientes
                    </button>
                </div>
            </div>
        )
    }

    const { project, client, calendar_events, tasks } = data

    return (
        <div className="min-h-screen bg-[#0a0a0a]">
            {showOnboarding && client && (
                <ClientOnboardingOverlay
                    clientName={client.nombre}
                    onComplete={handleOnboardingComplete}
                />
            )}

            {/* Header */}
            <header className="border-b border-white/10 sticky top-0 bg-[#0a0a0a]/95 backdrop-blur z-20">
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-quepia-cyan to-quepia-magenta flex items-center justify-center">
                                <Image
                                    src="/images/logo.png"
                                    alt="Quepia"
                                    width={40}
                                    height={40}
                                    className="object-cover rounded-full"
                                />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-white">{project?.nombre}</h1>
                                <p className="text-sm text-white/60">
                                    Hola, {client?.nombre}
                                </p>
                            </div>
                        </div>
                        <div className="text-sm text-white/40 hidden sm:block">
                            Powered by <span className="text-quepia-cyan">Quepia</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="border-b border-white/10 sticky top-[73px] bg-[#0a0a0a] z-10">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex gap-8">
                        {client?.can_view_calendar && (
                            <button
                                onClick={() => setActiveTab("calendar")}
                                className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "calendar"
                                    ? "border-quepia-cyan text-quepia-cyan"
                                    : "border-transparent text-white/60 hover:text-white"
                                    }`}
                            >
                                <Calendar className="h-4 w-4 inline-block mr-2" />
                                Calendario
                            </button>
                        )}
                        {client?.can_view_tasks && (
                            <>
                                <button
                                    onClick={() => setActiveTab("tasks")}
                                    className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "tasks"
                                        ? "border-quepia-cyan text-quepia-cyan"
                                        : "border-transparent text-white/60 hover:text-white"
                                        }`}
                                >
                                    <CheckCircle2 className="h-4 w-4 inline-block mr-2" />
                                    Tareas
                                </button>
                                <button
                                    onClick={() => setActiveTab("assets")}
                                    className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "assets"
                                        ? "border-quepia-cyan text-quepia-cyan"
                                        : "border-transparent text-white/60 hover:text-white"
                                        }`}
                                >
                                    <LayoutGrid className="h-4 w-4 inline-block mr-2" />
                                    Recursos
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
                {activeTab === "calendar" && client?.can_view_calendar && (
                    <ClientCalendarView
                        events={calendar_events || []}
                        canComment={client.can_comment}
                        clientName={client.nombre}
                        onCommentAdded={() => fetchData(true)}
                        token={token}
                    />
                )}
                {activeTab === "tasks" && client?.can_view_tasks && (
                    <TasksView
                        tasks={tasks || []}
                        token={token}
                        clientName={client?.nombre || "Cliente"}
                        onUpdate={() => fetchData(true)}
                    />
                )}
                {activeTab === "assets" && client?.can_view_tasks && (
                    <ClientAssetsView
                        tasks={tasks || []}
                        token={token}
                        clientName={client?.nombre || "Cliente"}
                        onUpdate={() => fetchData(true)}
                    />
                )}
            </main>
        </div>
    )
}

function ClientCalendarView({
    events,
    canComment,
    clientName,
    onCommentAdded,
    token
}: {
    events: ClientData["calendar_events"],
    canComment: boolean,
    clientName: string,
    onCommentAdded: () => void,
    token: string
}) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [selectedEvent, setSelectedEvent] = useState<Exclude<ClientData["calendar_events"], undefined>[0] | null>(null)

    // Sync selectedEvent with events prop when it changes (e.g. after adding a comment)
    useEffect(() => {
        if (selectedEvent && events) {
            const updatedEvent = events.find(e => e.id === selectedEvent.id)
            if (updatedEvent) {
                setSelectedEvent(updatedEvent)
            }
        }
    }, [events, selectedEvent])

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const daysInMonth = lastDay.getDate()
        const startingDayOfWeek = firstDay.getDay()

        const days: (number | null)[] = []

        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null)
        }

        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i)
        }

        return days
    }

    const getEventsForDay = (day: number) => {
        if (!events) return []
        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()

        // Construct target date string YYYY-MM-DD
        const targetDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

        return events.filter((event) => {
            // Use string splitting to avoid timezone issues, matching Admin view
            const eventDateStr = event.fecha_inicio.split("T")[0]
            return eventDateStr === targetDateStr
        })
    }

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]

    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

    const days = getDaysInMonth(currentMonth)
    const today = new Date()

    return (
        <div>
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                    className="px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                    ← Anterior
                </button>
                <h2 className="text-xl font-bold text-white capitalize">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h2>
                <button
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                    className="px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                    Siguiente →
                </button>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                        {/* Day Headers */}
                        <div className="grid grid-cols-7 border-b border-white/10">
                            {dayNames.map((day) => (
                                <div key={day} className="p-3 text-center text-sm font-medium text-white/60">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Days Grid */}
                        <div className="grid grid-cols-7">
                            {days.map((day, index) => {
                                const dayEvents = day ? getEventsForDay(day) : []
                                const isToday =
                                    day &&
                                    today.getDate() === day &&
                                    today.getMonth() === currentMonth.getMonth() &&
                                    today.getFullYear() === currentMonth.getFullYear()

                                return (
                                    <div
                                        key={index}
                                        className={`min-h-[100px] border-b border-r border-white/5 p-2 ${day ? "bg-white/[0.02]" : "bg-transparent"
                                            }`}
                                    >
                                        {day && (
                                            <>
                                                <div className="flex justify-center mb-1">
                                                    <span
                                                        className={`inline-flex items-center justify-center w-7 h-7 text-sm rounded-full ${isToday
                                                            ? "bg-quepia-cyan text-black font-bold"
                                                            : "text-white/80"
                                                            }`}
                                                    >
                                                        {day}
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {dayEvents.slice(0, 3).map((event) => (
                                                        <button
                                                            key={event.id}
                                                            onClick={() => setSelectedEvent(event)}
                                                            className="w-full text-left text-xs px-2 py-1 rounded truncate hover:opacity-80 transition-opacity"
                                                            style={{
                                                                backgroundColor: `${EVENT_TYPE_COLORS[event.tipo]}20`,
                                                                color: EVENT_TYPE_COLORS[event.tipo],
                                                            }}
                                                        >
                                                            {event.titulo}
                                                        </button>
                                                    ))}
                                                    {dayEvents.length > 3 && (
                                                        <div className="text-xs text-white/40 px-2 text-center">
                                                            +{dayEvents.length - 3} más
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Event Legend */}
            <div className="mt-6 flex flex-wrap gap-4">
                {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => (
                    <div key={type} className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: EVENT_TYPE_COLORS[type as CalendarEventType] }}
                        />
                        <span className="text-sm text-white/60">{label}</span>
                    </div>
                ))}
            </div>

            {/* Event Detail Modal */}
            <ClientEventModal
                event={selectedEvent}
                isOpen={!!selectedEvent}
                onClose={() => setSelectedEvent(null)}
                canComment={canComment}
                clientName={clientName}
                onCommentAdded={onCommentAdded}
                token={token}
            />
        </div>
    )
}

function ClientEventModal({
    event,
    isOpen,
    onClose,
    canComment,
    clientName,
    onCommentAdded,
    token
}: {
    event: Exclude<ClientData["calendar_events"], undefined>[0] | null,
    isOpen: boolean,
    onClose: () => void,
    canComment: boolean,
    clientName: string,
    onCommentAdded: () => void,
    token: string
}) {
    const [newComment, setNewComment] = useState("")
    const [sending, setSending] = useState(false)

    if (!event || !isOpen) return null

    const handleSendComment = async () => {
        if (!newComment.trim()) return

        setSending(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase.rpc('public_add_calendar_comment', {
                token: token,
                event_id: event.id,
                content: newComment,
                author_name: clientName
            })

            if (error) throw error
            if (data?.error) throw new Error(data.error)

            onCommentAdded() // Refresh data
            setNewComment("")
            alert("Comentario enviado correctamente")
        } catch (error) {
            console.error("Error sending comment", error)
            alert("Error al enviar comentario")
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative z-[70] w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full mt-0.5`} style={{ backgroundColor: event.color }} />
                        <h2 className="text-lg font-semibold text-white">{event.titulo}</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Date & Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" /> Fecha
                            </label>
                            <div className="text-sm text-white/80">
                                {new Date(event.fecha_inicio).toLocaleDateString("es-AR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5" /> Tipo
                            </label>
                            <div className="text-sm text-white/80 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EVENT_TYPE_COLORS[event.tipo] }} />
                                {EVENT_TYPE_LABELS[event.tipo]}
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="text-xs text-white/40 flex items-center gap-1.5">
                            <AlignLeft className="h-3.5 w-3.5" /> Descripción / Contenido
                        </label>
                        <div className="w-full bg-white/[0.02] rounded-lg p-3 text-sm text-white/80 whitespace-pre-wrap min-h-[100px]">
                            {event.descripcion || <span className="text-white/30 italic">Sin descripción</span>}
                        </div>
                    </div>

                    {/* Comments Section */}
                    {canComment && (
                        <div className="pt-4 border-t border-white/10 space-y-4">
                            <label className="text-xs text-white/40 flex items-center gap-1.5">
                                <MessageSquare className="h-3.5 w-3.5" /> Comentarios
                            </label>

                            {/* Comment List */}
                            <div className="space-y-3">
                                {event.comments && event.comments.length > 0 ? (
                                    event.comments.map(comment => (
                                        <div key={comment.id} className={`flex flex-col ${comment.is_client ? "items-end" : "items-start"}`}>
                                            <div className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${comment.is_client
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
                                    <p className="text-sm text-white/30 text-center py-2">No hay comentarios aún.</p>
                                )}
                            </div>

                            {/* Comment Input */}
                            <div className="flex gap-2 pt-2">
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Escribe un comentario..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-quepia-cyan outline-none"
                                    onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                                />
                                <button
                                    onClick={handleSendComment}
                                    disabled={!newComment.trim() || sending}
                                    className="p-2 rounded-lg bg-quepia-cyan text-black hover:bg-quepia-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function TasksView({ tasks, token, clientName, onUpdate }: { tasks: ClientData["tasks"], token: string, clientName: string, onUpdate: () => void }) {
    const [selectedTask, setSelectedTask] = useState<Exclude<ClientData["tasks"], undefined>[0] | null>(null)

    // Sync selectedTask when tasks update
    useEffect(() => {
        if (selectedTask && tasks) {
            const updated = tasks.find(t => t.id === selectedTask.id)
            if (updated) setSelectedTask(updated)
        }
    }, [tasks, selectedTask])

    if (!tasks || tasks.length === 0) {
        return (
            <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/60">No hay tareas para mostrar</p>
            </div>
        )
    }

    const groupedTasks = tasks.reduce((acc, task) => {
        const column = task.column || "Sin columna"
        if (!acc[column]) {
            acc[column] = []
        }
        acc[column].push(task)
        return acc
    }, {} as Record<string, typeof tasks>)

    return (
        <div className="space-y-8">
            {Object.entries(groupedTasks).map(([column, columnTasks]) => (
                <div key={column}>
                    <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-4">
                        {column}
                        <span className="ml-2 text-white/40">({columnTasks?.length || 0})</span>
                    </h3>
                    <div className="space-y-2">
                        {columnTasks?.map((task) => (
                            <div
                                key={task.id}
                                onClick={() => setSelectedTask(task)}
                                className={`flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors ${task.completed ? "opacity-60" : ""
                                    }`}
                            >
                                {task.completed ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                ) : (
                                    <Circle className="h-5 w-5 text-white/40 shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className={`text-white ${task.completed ? "line-through" : ""}`}>
                                        {task.titulo}
                                    </p>
                                    {task.descripcion && (
                                        <p className="text-sm text-white/40 mt-1 line-clamp-2">{task.descripcion}</p>
                                    )}
                                    <div className="flex items-center gap-3 mt-2">
                                        <span
                                            className="text-xs px-2 py-0.5 rounded"
                                            style={{
                                                backgroundColor: `${PRIORITY_COLORS[task.priority]}20`,
                                                color: PRIORITY_COLORS[task.priority],
                                            }}
                                        >
                                            {PRIORITY_LABELS[task.priority]}
                                        </span>
                                        {task.due_date && (
                                            <span className="text-xs text-white/40 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {new Date(task.due_date).toLocaleDateString("es-AR")}
                                            </span>
                                        )}
                                        {task.assets && task.assets.length > 0 && (
                                            <span className="text-xs text-white/40 flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded">
                                                <FileIcon className="h-3 w-3" />
                                                {task.assets.length}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {selectedTask && (
                <ClientTaskDetailModal
                    task={selectedTask}
                    isOpen={!!selectedTask}
                    onClose={() => setSelectedTask(null)}
                    token={token}
                    clientName={clientName}
                    onUpdate={onUpdate}
                />
            )}
        </div>
    )
}

function ClientTaskDetailModal({
    task,
    isOpen,
    onClose,
    token,
    clientName,
    onUpdate
}: {
    task: Exclude<ClientData["tasks"], undefined>[0]
    isOpen: boolean
    onClose: () => void
    token: string,
    clientName: string,
    onUpdate: () => void
}) {
    const [viewingAssetId, setViewingAssetId] = useState<string | null>(null)

    if (!isOpen) return null

    // Derive the currently viewing asset from the updated task assets
    const viewingAsset = viewingAssetId
        ? task.assets?.find(a => a.id === viewingAssetId) || null
        : null

    console.log("ClientTaskDetailModal render:", {
        taskId: task.id,
        assetCount: task.assets?.length,
        viewingAssetId,
        foundAsset: !!viewingAsset,
        assetRating: viewingAsset?.client_rating
    })

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative z-[70] w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-semibold text-white">{task.titulo}</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div className="space-y-1.5">
                        <label className="text-xs text-white/40 flex items-center gap-1.5">
                            <AlignLeft className="h-3.5 w-3.5" /> Descripción
                        </label>
                        <div className="w-full bg-white/[0.02] rounded-lg p-3 text-sm text-white/80 whitespace-pre-wrap">
                            {task.descripcion || <span className="text-white/30 italic">Sin descripción</span>}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs text-white/40 flex items-center gap-1.5">
                            <FileIcon className="h-3.5 w-3.5" /> Archivos / Assets
                        </label>

                        {!task.assets || task.assets.length === 0 ? (
                            <p className="text-sm text-white/30 italic">No hay archivos adjuntos.</p>
                        ) : (
                            <div className="space-y-2">
                                {task.assets.map(asset => (
                                    <div
                                        key={asset.id}
                                        className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer group"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setViewingAssetId(asset.id)
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-quepia-cyan/20 flex items-center justify-center text-quepia-cyan">
                                                <FileIcon className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-medium text-white">{asset.nombre}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/60">
                                                        v{asset.version_number}
                                                    </span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                                        style={{ color: APPROVAL_STATUS_COLORS[asset.approval_status], backgroundColor: APPROVAL_STATUS_COLORS[asset.approval_status] + '20' }}>
                                                        {APPROVAL_STATUS_LABELS[asset.approval_status]}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <button className="p-2 rounded-lg bg-black/20 text-white/40 group-hover:text-quepia-cyan transition-colors">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {viewingAsset && (
                <ClientAssetViewer
                    asset={viewingAsset}
                    isOpen={!!viewingAsset}
                    onClose={() => setViewingAssetId(null)}
                    token={token}
                    clientName={clientName}
                    onUpdate={onUpdate}
                />
            )}
        </div>
    )
}
