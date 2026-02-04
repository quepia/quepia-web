"use client"

import { useState } from "react"

import {
    ExternalLink,
    MessageSquare,
    CheckCircle2,
    XCircle,
    Send,
    Loader2,
    FileText,
    AlertCircle,
    User
} from "lucide-react"
import Button from "@/components/ui/Button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/sistema/utils"
import { submitReviewDecision, postReviewComment } from "@/lib/sistema/actions/reviews"
import { useRouter } from "next/navigation"

// Define types locally since we don't assume Database type availability for nested joins
interface ReviewComment {
    id: string
    content: string
    author_name: string
    created_at: string
}

interface ReviewData {
    id: string
    token: string
    status: 'pending' | 'approved' | 'changes_requested'
    deliverable_url: string
    created_at: string
    task: {
        id: string
        titulo: string
        descripcion: string | null
        project?: {
            nombre: string
        } | null
    }
    comments: ReviewComment[]
}

interface ReviewInterfaceProps {
    review: any // Using any to bypass complex type matching for now, as we defined ReviewData above for internal usage
}

export function ReviewInterface({ review: initialReview }: ReviewInterfaceProps) {
    const router = useRouter()
    const [review, setReview] = useState<ReviewData>(initialReview)
    const [status, setStatus] = useState(initialReview.status)
    const [comment, setComment] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleDecision = async (decision: 'approved' | 'changes_requested') => {
        if (!confirm(decision === 'approved'
            ? "¿Aprobar este entregable? Esto notificará al equipo."
            : "¿Solicitar cambios? Asegúrate de dejar comentarios explicativos.")) {
            return
        }

        setIsSubmitting(true)
        try {
            const result = await submitReviewDecision(review.token, decision)
            if (result.success) {
                setStatus(decision)
                router.refresh()
            }
        } catch (error) {
            console.error(error)
            alert("Error al actualizar el estado")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCommentSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!comment.trim()) return

        setIsSubmitting(true)
        try {
            const result = await postReviewComment(review.id, comment, "Cliente")
            if (result.success && result.data) {
                setComment("")
                // Optimistically add comment
                const newComment: ReviewComment = {
                    id: result.data[0].id,
                    content: result.data[0].content,
                    author_name: result.data[0].author_name,
                    created_at: result.data[0].created_at
                }
                setReview(prev => ({
                    ...prev,
                    comments: [...(prev.comments || []), newComment]
                }))
            }
        } catch (error) {
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!review.task) return <div>Error: Tarea no encontrada</div>

    return (
        <div className="flex flex-col h-screen max-w-7xl mx-auto md:flex-row">
            {/* Left: Deliverable Preview / Info */}
            <div className="flex-1 p-6 md:p-10 flex flex-col border-r border-white/10 overflow-y-auto">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="px-3 py-1 rounded-full bg-quepia-cyan/10 text-quepia-cyan text-xs font-medium border border-quepia-cyan/20">
                            {review.task.project?.nombre || "Proyecto Sin Nombre"}
                        </div>
                        {status === 'pending' && <span className="text-sm text-yellow-500 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Pendiente de revisión</span>}
                        {status === 'approved' && <span className="text-sm text-green-500 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Aprobado</span>}
                        {status === 'changes_requested' && <span className="text-sm text-red-500 flex items-center gap-1"><XCircle className="w-4 h-4" /> Cambios solicitados</span>}
                    </div>

                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                        {review.task.titulo}
                    </h1>

                    {review.task.descripcion && (
                        <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
                            {review.task.descripcion}
                        </p>
                    )}
                </div>

                <div className="flex-1 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center justify-center p-8 text-center group hover:bg-white/10 transition-colors min-h-[300px]">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-quepia-cyan to-quepia-magenta flex items-center justify-center mb-6 shadow-lg shadow-quepia-cyan/20">
                        <FileText className="w-10 h-10 text-white" />
                    </div>

                    <h3 className="text-xl font-semibold text-white mb-2">Entregable disponible</h3>
                    <p className="text-white/40 mb-8 max-w-sm">
                        El entregable se encuentra alojado externamente. Haz clic abajo para verlo o descargarlo.
                    </p>

                    <a
                        href={review.deliverable_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl s-btn-solid font-semibold hover:opacity-90 transition-transform active:scale-95"
                    >
                        <ExternalLink className="w-5 h-5" />
                        Abrir Entregable
                    </a>
                </div>

                <div className="mt-8 flex items-center justify-between text-white/30 text-sm">
                    <p>Enviado el {new Date(review.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}</p>
                    <p className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Sistema Seguro
                    </p>
                </div>
            </div>

            {/* Right: Actions & Comments */}
            <div className="w-full md:w-[400px] bg-[#0f0f0f] border-l border-white/5 flex flex-col h-[50vh] md:h-auto">
                {/* Actions Header */}
                <div className="p-6 border-b border-white/10 bg-[#111]">
                    <h2 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider text-white/50">Tu Decisión</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            onClick={() => handleDecision('approved')}
                            disabled={isSubmitting || status === 'approved'}
                            className={cn(
                                "h-12 bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20 transition-all",
                                status === 'approved' && "bg-green-500 text-black border-green-500 hover:bg-green-600 opacity-100 ring-2 ring-green-500/20"
                            )}
                        >
                            <CheckCircle2 className="mr-2 w-5 h-5" />
                            {status === 'approved' ? 'Aprobado' : 'Aprobar'}
                        </Button>
                        <Button
                            onClick={() => handleDecision('changes_requested')}
                            disabled={isSubmitting || status === 'changes_requested'}
                            className={cn(
                                "h-12 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all",
                                status === 'changes_requested' && "bg-red-500 text-white border-red-500 hover:bg-red-600 opacity-100 ring-2 ring-red-500/20"
                            )}
                        >
                            <XCircle className="mr-2 w-5 h-5" />
                            {status === 'changes_requested' ? 'Cambios' : 'Cambios'}
                        </Button>
                    </div>
                </div>

                {/* Comments List */}
                <div className="flex-1 p-0 overflow-y-auto flex flex-col bg-[#0a0a0a]">
                    {review.comments && review.comments.length > 0 ? (
                        <div className="flex flex-col gap-0">
                            {review.comments.map((comment) => (
                                <div key={comment.id} className="p-4 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                                            <User className="w-3 h-3 text-white/50" />
                                        </div>
                                        <span className="text-sm font-medium text-white/90">{comment.author_name}</span>
                                        <span className="text-xs text-white/30 ml-auto">
                                            {new Date(comment.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-white/70 pl-8 leading-relaxed whitespace-pre-wrap">
                                        {comment.content}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-white/20 p-8 text-center">
                            <MessageSquare className="w-10 h-10 mb-3 opacity-20" />
                            <p className="text-sm font-medium">Sin comentarios</p>
                            <p className="text-xs max-w-[200px] mt-1 opacity-50">Los comentarios que dejes aquí serán visibles para el equipo.</p>
                        </div>
                    )}
                </div>

                {/* Comment Input */}
                <div className="p-4 border-t border-white/10 bg-[#111]">
                    <form onSubmit={handleCommentSubmit} className="relative">
                        <Textarea
                            placeholder="Escribe un comentario o feedback..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleCommentSubmit(e)
                                }
                            }}
                            className="min-h-[80px] bg-black border-white/10 text-white placeholder:text-white/30 pr-12 resize-none focus-visible:ring-quepia-cyan/50"
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!comment.trim() || isSubmitting}
                            className="absolute bottom-3 right-3 h-8 w-8 bg-quepia-cyan text-black hover:bg-quepia-cyan/90 disabled:opacity-50 transition-all active:scale-95"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                    </form>
                    <p className="text-[10px] text-white/20 mt-2 text-center">
                        Presiona Enter para enviar
                    </p>
                </div>
            </div>
        </div>
    )
}
