"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
    X,
    Circle,
    CheckCircle2,
    Hash,
    Calendar,
    AlertCircle,
    Flag,
    Tag,
    Plus,
    Link2,
    Paperclip,
    Loader2,
    Trash2,
    Send,
    Check,
    UserPlus,
    ArrowUpRight,
    GitBranch,
    Sparkles,
    Pencil,
    Maximize2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Radio,
    Copy as CopyIcon,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { getTaskDeadlineDateKey, toTaskDeadlineTimestamp } from "@/lib/sistema/task-deadlines"
import { useTaskDetails, useSubtasks, useComments, useTaskLinks, useSistemaUsers, useTaskDependencies } from "@/lib/sistema/hooks"
import { notifyTaskAssignment, sendNotification } from "@/lib/sistema/actions/notifications"
import type { CommentSource, CommentWithUser, Priority, SistemaUser, TaskType, Subtask } from "@/types/sistema"
import { PRIORITY_COLORS, PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPE_COLORS } from "@/types/sistema"
import { UserAvatar } from "./user-avatar"
import { RichDescription } from "./task-description"
import { ReelCoverPanel } from "./reel-cover-panel"
import { AssetPanel } from "./asset-panel"
import { ZernioPublishingPanel } from "./zernio-publishing-panel"

interface TaskDetailModalProps {
    taskId?: string
    isOpen: boolean
    onClose: () => void
    onUpdate?: () => void
    userId?: string
    /** Ordered ids to walk with the prev/next controls. Falls back to the task's own column. */
    taskIds?: string[]
    onNavigate?: (taskId: string) => void
}

type YoutubeSourceType = "youtube" | "drive"

interface YoutubeTaskMetadata {
    title?: string
    description?: string
    source_type?: YoutubeSourceType
    source_url?: string
    published_url?: string
    thumbnail_path?: string | null
    thumbnail_url?: string | null
    tags?: string[]
    playlist?: string
    scheduled_at?: string | null
}

type CopilotAction = "generate" | "improve" | "variants" | "instagram" | "linkedin" | "facebook" | "review" | "revise"

const COPILOT_ACTIONS: { id: Exclude<CopilotAction, "revise">; label: string }[] = [
    { id: "generate", label: "Generar copy" },
    { id: "improve", label: "Mejorar" },
    { id: "variants", label: "3 variantes" },
    { id: "instagram", label: "Instagram" },
    { id: "linkedin", label: "LinkedIn" },
    { id: "facebook", label: "Facebook" },
    { id: "review", label: "Revisar antes de publicar" },
]

interface CopilotAssetContext {
    id: string
    versionId: string
    name: string
    filename: string
    assetType: "single" | "carousel" | "reel" | "folder"
    groupId: string | null
    groupOrder: number
    fileType: string
    status: "ready" | "pending"
    analyzedAt: string | null
}

function readYoutubeMetadata(typeMetadata: Record<string, unknown> | null | undefined): YoutubeTaskMetadata {
    if (!typeMetadata || typeof typeMetadata !== "object") return {}
    const youtube = (typeMetadata as Record<string, unknown>).youtube
    if (!youtube || typeof youtube !== "object") return {}
    return youtube as YoutubeTaskMetadata
}

export function TaskDetailModal({ taskId, isOpen, onClose, onUpdate, userId, taskIds, onNavigate }: TaskDetailModalProps) {
    const { task, loading, refresh } = useTaskDetails(taskId)
    const { subtasks, createSubtask, toggleSubtask, deleteSubtask, updateSubtask, convertSubtaskToTask } = useSubtasks(taskId)
    const { comments, createComment, deleteComment } = useComments(taskId)
    const { links, createLink, deleteLink } = useTaskLinks(taskId)
    const { users } = useSistemaUsers({ enabled: isOpen })
    const { dependencies, dependents, addDependency, removeDependency } = useTaskDependencies(taskId)

    const currentUser = users.find((u) => u.id === userId) || null

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
    const [descExpanded, setDescExpanded] = useState(false)
    const [descReaderOpen, setDescReaderOpen] = useState(false)
    const [zernioOpen, setZernioOpen] = useState(false)
    const [copiedCopy, setCopiedCopy] = useState(false)
    const [columnTaskIds, setColumnTaskIds] = useState<string[]>([])
    const [editingSocialCopy, setEditingSocialCopy] = useState(false)
    const [socialCopyValue, setSocialCopyValue] = useState("")
    const [showPriorityMenu, setShowPriorityMenu] = useState(false)
    const [showAssigneeMenu, setShowAssigneeMenu] = useState(false)
    const [editingDeadline, setEditingDeadline] = useState(false)
    const [deadlineValue, setDeadlineValue] = useState("")
    const [showTaskTypeMenu, setShowTaskTypeMenu] = useState(false)
    const [editingHours, setEditingHours] = useState(false)
    const [hoursValue, setHoursValue] = useState("")
    const [youtubeData, setYoutubeData] = useState<YoutubeTaskMetadata>({})
    const [youtubeThumbPreviewUrl, setYoutubeThumbPreviewUrl] = useState<string | null>(null)
    const [uploadingYoutubeThumb, setUploadingYoutubeThumb] = useState(false)
    const [showCopilot, setShowCopilot] = useState(false)
    const [copilotAction, setCopilotAction] = useState<CopilotAction | null>(null)
    const [copilotResultAction, setCopilotResultAction] = useState<CopilotAction | null>(null)
    const [copilotResult, setCopilotResult] = useState("")
    const [copilotError, setCopilotError] = useState("")
    const [copilotFeedback, setCopilotFeedback] = useState("")
    const [copilotAssets, setCopilotAssets] = useState<CopilotAssetContext[]>([])
    const [copilotAssetsError, setCopilotAssetsError] = useState("")
    const [selectedCopilotAssetIds, setSelectedCopilotAssetIds] = useState<string[] | null>(null)
    const [copilotAssetsLoading, setCopilotAssetsLoading] = useState(false)
    const [copilotMaxAssets, setCopilotMaxAssets] = useState(24)
    const [copilotAssetsUsed, setCopilotAssetsUsed] = useState(0)
    const [copilotAssetsFailed, setCopilotAssetsFailed] = useState(0)
    const [copilotGroundingVerified, setCopilotGroundingVerified] = useState(false)
    const copilotAbortRef = useRef<AbortController | null>(null)

    const loadCopilotAssets = useCallback(async () => {
        if (!taskId) return
        setCopilotAssetsLoading(true)
        setCopilotAssetsError("")
        try {
            const response = await fetch(`/api/ai/content-copilot/context?taskId=${encodeURIComponent(taskId)}`)
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || "No se pudieron cargar los assets")

            const assets = Array.isArray(data?.assets) ? data.assets as CopilotAssetContext[] : []
            const maxAssets = typeof data?.maxAssets === "number" ? data.maxAssets : 24
            const availableIds = new Set(assets.map((asset) => asset.id))
            setCopilotAssets(assets)
            setCopilotMaxAssets(maxAssets)
            setSelectedCopilotAssetIds((current) => current === null
                ? assets.slice(0, maxAssets).map((asset) => asset.id)
                : current.filter((id) => availableIds.has(id)).slice(0, maxAssets)
            )
        } catch (error) {
            setCopilotAssetsError((error as Error).message)
        } finally {
            setCopilotAssetsLoading(false)
        }
    }, [taskId])

    // No separate refresh on open - useTaskDetails already fetches when taskId changes

    // Without an explicit list, prev/next walks the task's own kanban column.
    useEffect(() => {
        if (taskIds && taskIds.length > 0) return
        const columnId = task?.column_id
        if (!columnId) {
            setColumnTaskIds([])
            return
        }
        let cancelled = false
        const loadSiblings = async () => {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const { data } = await supabase
                .from("sistema_tasks")
                .select("id")
                .eq("column_id", columnId)
                .order("orden", { ascending: true })
                .order("created_at", { ascending: false })
            if (!cancelled) setColumnTaskIds((data || []).map((row) => row.id as string))
        }
        void loadSiblings()
        return () => { cancelled = true }
    }, [task?.column_id, taskIds])

    // Collapse the description again whenever we switch to another task.
    useEffect(() => {
        setDescExpanded(false)
        setDescReaderOpen(false)
        setZernioOpen(false)
    }, [taskId])

    useEffect(() => {
        if (task) {
            setTitleValue(task.titulo)
            setDescValue(task.descripcion || "")
            setSocialCopyValue(task.social_copy || "")
            setYoutubeData(readYoutubeMetadata(task.type_metadata as Record<string, unknown> | null))
        }
    }, [task])

    useEffect(() => {
        setSelectedCopilotAssetIds(null)
        setCopilotAssets([])
        setCopilotAssetsError("")
        setCopilotFeedback("")
        setCopilotAssetsUsed(0)
        setCopilotAssetsFailed(0)
        setCopilotGroundingVerified(false)
    }, [taskId])

    useEffect(() => {
        if (showCopilot && taskId) void loadCopilotAssets()
    }, [showCopilot, taskId, loadCopilotAssets])

    useEffect(() => {
        let cancelled = false
        const hydrateThumb = async () => {
            const thumbRef = youtubeData.thumbnail_path || youtubeData.thumbnail_url
            if (!thumbRef) {
                setYoutubeThumbPreviewUrl(null)
                return
            }
            if (/^https?:\/\//i.test(thumbRef)) {
                setYoutubeThumbPreviewUrl(thumbRef)
                return
            }
            try {
                const response = await fetch("/api/assets/sign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paths: [thumbRef] }),
                })
                const data = await response.json()
                if (!cancelled) {
                    setYoutubeThumbPreviewUrl(data?.urls?.[thumbRef] || null)
                }
            } catch (error) {
                console.error("Error signing YouTube thumbnail:", error)
                if (!cancelled) {
                    setYoutubeThumbPreviewUrl(null)
                }
            }
        }
        hydrateThumb()
        return () => {
            cancelled = true
        }
    }, [youtubeData.thumbnail_path, youtubeData.thumbnail_url])

    const navigationIds = taskIds && taskIds.length > 0 ? taskIds : columnTaskIds
    const navigationIndex = taskId ? navigationIds.indexOf(taskId) : -1
    const prevTaskId = navigationIndex > 0 ? navigationIds[navigationIndex - 1] : null
    const nextTaskId = navigationIndex >= 0 && navigationIndex < navigationIds.length - 1
        ? navigationIds[navigationIndex + 1]
        : null

    const goToTask = useCallback((nextId: string | null) => {
        if (!nextId) return
        if (onNavigate) {
            onNavigate(nextId)
            return
        }
        // Default: drive the dashboard through the URL it already listens to
        // (the App Router keeps useSearchParams in sync with pushState).
        const url = new URL(window.location.href)
        url.searchParams.set("taskId", nextId)
        window.history.pushState({}, "", url)
    }, [onNavigate])

    // Arrow keys walk the list, except while typing.
    useEffect(() => {
        if (!isOpen) return
        const handleArrows = (e: KeyboardEvent) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            if (descReaderOpen || zernioOpen) return
            const target = e.target as HTMLElement | null
            if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return
            const destination = e.key === "ArrowLeft" ? prevTaskId : nextTaskId
            if (!destination) return
            e.preventDefault()
            goToTask(destination)
        }
        window.addEventListener("keydown", handleArrows)
        return () => window.removeEventListener("keydown", handleArrows)
    }, [isOpen, prevTaskId, nextTaskId, goToTask, descReaderOpen, zernioOpen])

    // Close on escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return
            // Overlays swallow the first Escape.
            if (zernioOpen) {
                setZernioOpen(false)
                return
            }
            if (descReaderOpen) {
                setDescReaderOpen(false)
                return
            }
            onClose()
        }
        if (isOpen) window.addEventListener("keydown", handleEsc)
        return () => window.removeEventListener("keydown", handleEsc)
    }, [isOpen, onClose, descReaderOpen, zernioOpen])

    useEffect(() => () => copilotAbortRef.current?.abort(), [])

    if (!isOpen) return null

    const completedSubtasks = subtasks.filter(st => st.completed)
    const pendingSubtasks = subtasks.filter(st => !st.completed)
    const showReelPanel = task?.task_type === "reel"
    const showYoutubePanel = task?.task_type === "video" || Boolean(
        youtubeData.title ||
        youtubeData.description ||
        youtubeData.source_url ||
        youtubeData.published_url ||
        youtubeData.thumbnail_path ||
        youtubeData.thumbnail_url
    )

    const getCommentAuthorName = (commentItem: CommentWithUser) =>
        commentItem.user?.nombre || commentItem.author_name || "Usuario"

    const getCommentInitials = (commentItem: CommentWithUser) =>
        getCommentAuthorName(commentItem)
            .split(" ")
            .filter(Boolean)
            .map((name) => name[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?"

    const getCommentSourceLabel = (source?: CommentSource | null) => {
        if (source === "asset_feedback") return "Feedback de asset"
        if (source === "asset_status") return "Estado de asset"
        if (source === "telegram_feedback") return "Telegram"
        return null
    }

    const getCommentAssetLabel = (commentItem: CommentWithUser) => {
        if (!commentItem.asset?.nombre) return null
        const versionSuffix = commentItem.asset_version?.version_number
            ? ` · v${commentItem.asset_version.version_number}`
            : ""
        return `${commentItem.asset.nombre}${versionSuffix}`
    }

    const formatLocalDate = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, "0")
        const day = String(date.getDate()).padStart(2, "0")
        return `${year}-${month}-${day}`
    }

    const getDateOnly = (value?: string | null) => (value ? value.split("T")[0] : "")

    const isPastDate = (value?: string | null) => {
        if (!value) return false
        const date = new Date(`${getDateOnly(value)}T12:00:00`)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return date < today
    }

    const updateTaskField = async (field: string, value: unknown) => {
        if (!taskId) return
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const updates: Record<string, unknown> = { [field]: value }
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
                    await notifyTaskAssignment({
                        userId: value as string,
                        actorId: userId,
                        taskId,
                        taskTitle: task?.titulo || "Tarea",
                        projectId: task?.project_id,
                        projectName: task?.project?.nombre,
                        source: 'app',
                    })
                } else if (task?.assignee_id && task.assignee_id !== userId) {
                    // Notify assignee of changes if they are not the actor
                    const notifyFields = ['titulo', 'descripcion', 'deadline', 'priority', 'completed']
                    if (notifyFields.includes(field)) {
                        let title = `Actualización en tarea: ${task.titulo}`
                        let content = field === "deadline"
                            ? "Se actualizó el deadline de la tarea"
                            : `Se actualizó ${field} en la tarea`

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

    const handleCopySocialCopy = async () => {
        const text = socialCopyValue.trim()
        if (!text) return
        try {
            await navigator.clipboard.writeText(text)
            setCopiedCopy(true)
            window.setTimeout(() => setCopiedCopy(false), 1800)
        } catch (error) {
            console.error("No se pudo copiar el copy:", error)
        }
    }

    const updateYoutubeMetadata = async (updates: Partial<YoutubeTaskMetadata>) => {
        const nextYoutube = {
            ...youtubeData,
            ...updates,
        }
        const nextTypeMetadata = {
            ...((task?.type_metadata as Record<string, unknown>) || {}),
            youtube: nextYoutube,
        }
        setYoutubeData(nextYoutube)
        await updateTaskField("type_metadata", nextTypeMetadata)
    }

    const handleYoutubeFieldChange = (field: keyof YoutubeTaskMetadata, value: YoutubeTaskMetadata[keyof YoutubeTaskMetadata]) => {
        setYoutubeData((prev) => ({ ...prev, [field]: value }))
    }

    const handleYoutubeFieldBlur = async (field: keyof YoutubeTaskMetadata) => {
        await updateYoutubeMetadata({ [field]: youtubeData[field] } as Partial<YoutubeTaskMetadata>)
    }

    const handleUploadYoutubeThumbnail = async (file: File) => {
        if (!task || !taskId) return
        setUploadingYoutubeThumb(true)
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const safeName = file.name
                .normalize("NFKD")
                .replace(/[^a-zA-Z0-9._-]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^[-.]+|[-.]+$/g, "")
                .toLowerCase() || `thumbnail-${Date.now()}.jpg`
            const path = `${task.project_id}/${taskId}/youtube-thumbnail-${Date.now()}-${safeName}`

            const { error } = await supabase.storage
                .from("sistema-assets")
                .upload(path, file, {
                    upsert: true,
                    contentType: file.type || "image/jpeg",
                })
            if (error) throw error

            await updateYoutubeMetadata({
                thumbnail_path: path,
                thumbnail_url: path,
            })
        } catch (error) {
            console.error("Error uploading YouTube thumbnail:", error)
        } finally {
            setUploadingYoutubeThumb(false)
        }
    }

    const handleAddSubtask = async () => {
        if (!newSubtaskTitle.trim() || !taskId || submitting) return
        setSubmitting(true)
        try {
            const created = await createSubtask({ task_id: taskId, titulo: newSubtaskTitle.trim() })
            if (!created) {
                alert("No se pudo crear la subtarea. Reintentá y, si sigue fallando, recargá la página.")
                return
            }
            setNewSubtaskTitle("")
            setIsAddingSubtask(false)
            onUpdate?.()
        } finally {
            setSubmitting(false)
        }
    }

    const handleAssignSubtask = async (subtaskId: string, assigneeId: string | null, subtaskTitle: string) => {
        const updated = await updateSubtask(subtaskId, { assignee_id: assigneeId })
        if (updated) {
            onUpdate?.()
        }
        if (assigneeId && userId && assigneeId !== userId && task) {
            await sendNotification({
                userId: assigneeId,
                actorId: userId,
                type: 'assignment',
                title: `Te asignaron una subtarea: ${subtaskTitle}`,
                content: `Se te asignó la subtarea "${subtaskTitle}" en la tarea "${task.titulo}"`,
                link: `/sistema?taskId=${taskId}`,
                data: { taskId, projectId: task.project_id }
            })
        }
    }

    const handleConvertSubtaskToTask = async (subtaskId: string, subtaskTitle: string) => {
        // Default to first column of the project
        if (!task?.project_id) return
        
        // Get columns for the project
        const { createClient } = await import("@/lib/sistema/supabase/client")
        const supabase = createClient()
        const { data: columns } = await supabase
            .from('sistema_columns')
            .select('id, orden')
            .eq('project_id', task.project_id)
            .order('orden', { ascending: true })
            .limit(1)
        
        const firstColumnId = columns?.[0]?.id
        if (!firstColumnId) {
            alert('No se encontró una columna para crear la tarea')
            return
        }
        
        if (!confirm(`¿Convertir "${subtaskTitle}" en una tarea independiente?`)) return
        
        const newTask = await convertSubtaskToTask(subtaskId, firstColumnId)
        if (newTask) {
            onUpdate?.()
            // Open the new task in a new tab or refresh
            window.open(`/sistema?taskId=${newTask.id}`, '_blank')
        } else {
            alert('Error al convertir la subtarea')
        }
    }

    const handleToggleSubtask = async (subtaskId: string) => {
        const success = await toggleSubtask(subtaskId)
        if (success) {
            onUpdate?.()
        }
    }

    const handleDeleteSubtask = async (subtaskId: string) => {
        const success = await deleteSubtask(subtaskId)
        if (success) {
            onUpdate?.()
        }
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

    const handleSaveSocialCopy = async () => {
        const val = socialCopyValue.trim() || null
        if (val !== (task?.social_copy || null)) {
            await updateTaskField("social_copy", val)
        }
        setEditingSocialCopy(false)
    }

    const toggleCopilotAsset = (assetId: string) => {
        setSelectedCopilotAssetIds((current) => {
            const selected = current || []
            if (selected.includes(assetId)) return selected.filter((id) => id !== assetId)
            if (selected.length >= copilotMaxAssets) {
                setCopilotError(`Podés seleccionar hasta ${copilotMaxAssets} assets por vez`)
                return selected
            }
            setCopilotError("")
            return [...selected, assetId]
        })
    }

    const runCopilot = async (
        action: CopilotAction,
        options?: { currentCopy?: string; feedback?: string },
    ) => {
        if (!taskId) return
        copilotAbortRef.current?.abort()
        const controller = new AbortController()
        const previousResult = copilotResult
        copilotAbortRef.current = controller
        setCopilotAction(action)
        setCopilotResultAction(action)
        setCopilotResult("")
        setCopilotError("")
        setCopilotAssetsUsed(0)
        setCopilotAssetsFailed(0)

        try {
            const response = await fetch("/api/ai/content-copilot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    taskId,
                    action,
                    currentCopy: options?.currentCopy ?? socialCopyValue ?? task?.social_copy,
                    feedback: options?.feedback,
                    selectedAssetIds: selectedCopilotAssetIds || [],
                }),
                signal: controller.signal,
            })

            if (!response.ok || !response.body) {
                const data = await response.json().catch(() => null)
                throw new Error(data?.error || "No se pudo generar el contenido")
            }

            setCopilotAssetsUsed(Number(response.headers.get("X-Copilot-Assets-Used") || 0))
            setCopilotAssetsFailed(Number(response.headers.get("X-Copilot-Assets-Failed") || 0))
            setCopilotGroundingVerified(response.headers.get("X-Copilot-Grounding-Verified") === "true")

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            while (true) {
                const { value, done } = await reader.read()
                if (done) break
                setCopilotResult((current) => current + decoder.decode(value, { stream: true }))
            }
            if (action === "revise") setCopilotFeedback("")
            void loadCopilotAssets()
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                if (action === "revise") setCopilotResult(previousResult)
                setCopilotError((error as Error).message)
            }
        } finally {
            if (copilotAbortRef.current === controller) {
                copilotAbortRef.current = null
                setCopilotAction(null)
            }
        }
    }

    const applyCopilotResult = async () => {
        if (!copilotResult.trim()) return
        const nextCopy = copilotResult.trim()
        setSocialCopyValue(nextCopy)
        await updateTaskField("social_copy", nextCopy)
        setShowCopilot(false)
        setCopilotResult("")
        setCopilotResultAction(null)
        setCopilotFeedback("")
    }

    const reviseCopilotResult = () => {
        const feedback = copilotFeedback.trim()
        const currentCopy = copilotResult.trim()
        if (!feedback || !currentCopy) return
        void runCopilot("revise", { currentCopy, feedback })
    }

    const handleOpenParentTask = async () => {
        if (!task?.parent_task_id) return
        // Open parent task in same view
        window.open(`/sistema?taskId=${task.parent_task_id}`, '_blank')
    }

    const readyToPublish = Boolean(socialCopyValue.trim())
    const descriptionText = task?.descripcion?.trim() || ""
    // Long briefs get collapsed in place and a dedicated reading view.
    const isLongDescription = descriptionText.length > 480 || descriptionText.split(/\r?\n/).length > 10

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-[3px]" onClick={onClose} />

            <div className="relative flex h-[100svh] w-full flex-col overflow-hidden border-0 bg-[#0d1014] shadow-[0_28px_90px_rgba(0,0,0,0.58)] sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-[#2a3038]">
                {/* Header */}
                <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[#252b33] bg-[#101318] px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-quepia-cyan/20 bg-quepia-cyan/[0.07]">
                            <Hash className="h-4 w-4 text-quepia-cyan" />
                        </div>
                        <span className="truncate font-medium text-white/75">{task?.project?.nombre || "Proyecto"}</span>
                        <span className="text-white/20">/</span>
                        <span className="shrink-0 text-xs font-medium uppercase tracking-[0.08em] text-white/35">
                            {task?.column?.nombre || "Columna"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleDeleteTask}
                            className="rounded-lg p-2 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-300"
                            title="Eliminar tarea"
                            aria-label="Eliminar tarea"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                        {navigationIds.length > 1 && (
                            <div className="mr-1 flex items-center gap-0.5 border-r border-white/[0.08] pr-2">
                                <button
                                    onClick={() => goToTask(prevTaskId)}
                                    disabled={!prevTaskId}
                                    className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
                                    title="Tarea anterior (←)"
                                    aria-label="Tarea anterior"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                {navigationIndex >= 0 && (
                                    <span className="px-1 font-mono text-[11px] tabular-nums text-white/30">
                                        {navigationIndex + 1}/{navigationIds.length}
                                    </span>
                                )}
                                <button
                                    onClick={() => goToTask(nextTaskId)}
                                    disabled={!nextTaskId}
                                    className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
                                    title="Tarea siguiente (→)"
                                    aria-label="Tarea siguiente"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                        <button onClick={onClose} className="rounded-lg p-2 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white" aria-label="Cerrar tarea">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-quepia-cyan" />
                    </div>
                ) : task ? (
                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
                        <div className="flex min-w-0 flex-col md:flex-row">
                            {/* Main Content */}
                            <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-7 lg:p-8">
                                {/* Task Title */}
                                <div className="mb-4 flex items-start gap-3">
                                    <button
                                        onClick={() => updateTaskField("completed", !task.completed)}
                                        className="mt-1 rounded-full transition-transform hover:scale-105"
                                        aria-label={task.completed ? "Marcar tarea como pendiente" : "Completar tarea"}
                                    >
                                        {task.completed ? (
                                            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                                        ) : (
                                            <Circle className="h-6 w-6 text-white/35 transition-colors hover:text-quepia-cyan" />
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
                                            className="flex-1 border-b border-quepia-cyan bg-transparent text-2xl font-semibold leading-tight text-white outline-none"
                                        />
                                    ) : (
                                        <h1
                                            onClick={() => setEditingTitle(true)}
                                            className={cn(
                                                "flex-1 cursor-text rounded-lg px-1 -mx-1 text-2xl font-semibold leading-tight transition-colors hover:bg-white/[0.03]",
                                                task.completed ? "text-white/40 line-through" : "text-white"
                                            )}
                                        >
                                            {task.titulo.replace(/\*/g, "")}
                                        </h1>
                                    )}
                                </div>

                                {/* Two columns on desktop: delivery work on the left, coordination on the right. */}
                                <div className="grid min-w-0 grid-cols-1 gap-x-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                                    <div className="flex min-w-0 flex-col">
                                        {/* Description */}
                                        <div className="mb-5 rounded-2xl border border-[#242a32] bg-[#12161b]">
                                            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
                                                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                                                    Descripción
                                                </h3>
                                                {!editingDesc && (
                                                    <div className="flex items-center gap-1">
                                                        {isLongDescription && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setDescReaderOpen(true)}
                                                                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                                                                title="Abrir en modo lectura"
                                                            >
                                                                <Maximize2 className="h-3.5 w-3.5" />
                                                                Lectura
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingDesc(true)}
                                                            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                                                            title="Editar descripción"
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                            Editar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-4">
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
                                                        rows={Math.min(24, Math.max(6, descValue.split("\n").length + 1))}
                                                        className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-[12.5px] leading-[1.6] text-white/85 outline-none placeholder:text-white/35 focus:border-quepia-cyan/60"
                                                    />
                                                ) : descriptionText ? (
                                                    <div className="relative">
                                                        <div
                                                            className={cn(
                                                                "relative overflow-hidden transition-[max-height] duration-200",
                                                                !descExpanded && isLongDescription ? "max-h-[280px]" : "max-h-none"
                                                            )}
                                                        >
                                                            <RichDescription text={descriptionText} />
                                                            {!descExpanded && isLongDescription && (
                                                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#12161b] to-transparent" />
                                                            )}
                                                        </div>
                                                        {isLongDescription && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setDescExpanded((v) => !v)}
                                                                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-quepia-cyan/80 transition-colors hover:text-quepia-cyan"
                                                            >
                                                                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", descExpanded && "rotate-180")} />
                                                                {descExpanded ? "Ver menos" : "Ver descripción completa"}
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingDesc(true)}
                                                        className="w-full rounded-lg text-left text-[13px] text-white/35 transition-colors hover:text-white/55"
                                                    >
                                                        Agregá una descripción para que el equipo sepa qué debe entregar.
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* Assets sit right under the brief: this is where the work lands. */}
                                        {taskId && task?.project_id && userId && (
                                            <div className="mb-5 rounded-2xl border border-quepia-cyan/15 bg-[#12161b] p-4 shadow-[inset_0_1px_0_rgba(42,231,228,0.06)] sm:p-5">
                                                <AssetPanel
                                                    taskId={taskId}
                                                    projectId={task.project_id}
                                                    userId={userId}
                                                />
                                            </div>
                                        )}

                                        {showReelPanel && taskId && task?.project_id && (
                                            <ReelCoverPanel
                                                taskId={taskId}
                                                projectId={task.project_id}
                                                onCoverChanged={() => {
                                                    void refresh()
                                                    onUpdate?.()
                                                }}
                                            />
                                        )}
                                        {showYoutubePanel && (
                                            <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 sm:p-5">
                                                <h3 className="mb-3 text-sm font-medium text-white">Ficha YouTube</h3>

                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    <div className="sm:col-span-2">
                                                        <label className="mb-1 block text-xs text-white/45">Titulo YouTube</label>
                                                        <input
                                                            type="text"
                                                            value={youtubeData.title || ""}
                                                            onChange={(e) => handleYoutubeFieldChange("title", e.target.value)}
                                                            onBlur={() => { void handleYoutubeFieldBlur("title") }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan"
                                                            placeholder="Titulo final para YouTube"
                                                        />
                                                    </div>

                                                    <div className="sm:col-span-2">
                                                        <label className="mb-1 block text-xs text-white/45">Descripcion YouTube</label>
                                                        <textarea
                                                            value={youtubeData.description || ""}
                                                            onChange={(e) => handleYoutubeFieldChange("description", e.target.value)}
                                                            onBlur={() => { void handleYoutubeFieldBlur("description") }}
                                                            rows={4}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan resize-y"
                                                            placeholder="Descripcion final, enlaces, creditos y CTA"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="mb-1 block text-xs text-white/45">Origen del video</label>
                                                        <select
                                                            value={youtubeData.source_type || "youtube"}
                                                            onChange={(e) => {
                                                                const value = e.target.value as YoutubeSourceType
                                                                handleYoutubeFieldChange("source_type", value)
                                                                void updateYoutubeMetadata({ source_type: value })
                                                            }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan [color-scheme:dark]"
                                                        >
                                                            <option value="youtube">YouTube</option>
                                                            <option value="drive">Google Drive</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="mb-1 block text-xs text-white/45">Playlist</label>
                                                        <input
                                                            type="text"
                                                            value={youtubeData.playlist || ""}
                                                            onChange={(e) => handleYoutubeFieldChange("playlist", e.target.value)}
                                                            onBlur={() => { void handleYoutubeFieldBlur("playlist") }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan"
                                                            placeholder="Nombre de playlist"
                                                        />
                                                    </div>

                                                    <div className="sm:col-span-2">
                                                        <label className="mb-1 block text-xs text-white/45">URL fuente (subida)</label>
                                                        <input
                                                            type="url"
                                                            value={youtubeData.source_url || ""}
                                                            onChange={(e) => handleYoutubeFieldChange("source_url", e.target.value)}
                                                            onBlur={() => { void handleYoutubeFieldBlur("source_url") }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan"
                                                            placeholder="https://drive.google.com/... o https://studio.youtube.com/..."
                                                        />
                                                    </div>

                                                    <div className="sm:col-span-2">
                                                        <label className="mb-1 block text-xs text-white/45">URL publicada</label>
                                                        <input
                                                            type="url"
                                                            value={youtubeData.published_url || ""}
                                                            onChange={(e) => handleYoutubeFieldChange("published_url", e.target.value)}
                                                            onBlur={() => { void handleYoutubeFieldBlur("published_url") }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan"
                                                            placeholder="https://www.youtube.com/watch?v=..."
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="mb-1 block text-xs text-white/45">Programado para</label>
                                                        <input
                                                            type="datetime-local"
                                                            value={
                                                                youtubeData.scheduled_at && !Number.isNaN(new Date(youtubeData.scheduled_at).getTime())
                                                                    ? new Date(youtubeData.scheduled_at).toISOString().slice(0, 16)
                                                                    : ""
                                                            }
                                                            onChange={(e) => {
                                                                const value = e.target.value
                                                                handleYoutubeFieldChange("scheduled_at", value ? new Date(value).toISOString() : null)
                                                            }}
                                                            onBlur={() => { void handleYoutubeFieldBlur("scheduled_at") }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan [color-scheme:dark]"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="mb-1 block text-xs text-white/45">Tags (coma separadas)</label>
                                                        <input
                                                            type="text"
                                                            value={Array.isArray(youtubeData.tags) ? youtubeData.tags.join(", ") : ""}
                                                            onChange={(e) => {
                                                                const tags = e.target.value
                                                                    .split(",")
                                                                    .map((tag) => tag.trim())
                                                                    .filter(Boolean)
                                                                handleYoutubeFieldChange("tags", tags)
                                                            }}
                                                            onBlur={() => { void handleYoutubeFieldBlur("tags") }}
                                                            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-quepia-cyan"
                                                            placeholder="seo, growth, tutorial"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="mt-4">
                                                    <p className="mb-2 text-xs text-white/45">Thumbnail</p>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        {youtubeThumbPreviewUrl ? (
                                                            <img
                                                                src={youtubeThumbPreviewUrl}
                                                                alt="Thumbnail YouTube"
                                                                className="h-20 w-36 rounded-md border border-white/10 object-cover"
                                                            />
                                                        ) : (
                                                            <div className="flex h-20 w-36 items-center justify-center rounded-md border border-dashed border-white/20 text-xs text-white/35">
                                                                Sin thumbnail
                                                            </div>
                                                        )}
                                                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.08]">
                                                            <Paperclip className="h-3.5 w-3.5" />
                                                            {uploadingYoutubeThumb ? "Subiendo..." : "Subir thumbnail"}
                                                            <input
                                                                type="file"
                                                                accept="image/png,image/jpeg,image/webp"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0]
                                                                    if (file) handleUploadYoutubeThumbnail(file)
                                                                    e.currentTarget.value = ""
                                                                }}
                                                            />
                                                        </label>
                                                        {(youtubeData.thumbnail_path || youtubeData.thumbnail_url) && (
                                                            <button
                                                                onClick={() => { void updateYoutubeMetadata({ thumbnail_path: null, thumbnail_url: null }) }}
                                                                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                                                            >
                                                                Quitar
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex min-w-0 flex-col">
                                        {/* Social Media Copy */}
                                        <div className="mb-5 rounded-2xl border border-[#242a32] bg-[#12161b] p-4 sm:p-5">
                                            <h3 className="mb-4 flex items-center justify-between gap-2 text-sm font-semibold text-white/90">
                                                <span className="flex items-center gap-2">
                                                    <Sparkles className="h-4 w-4 text-quepia-cyan" />
                                                    Copy / SEO
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => { void handleCopySocialCopy() }}
                                                        disabled={!socialCopyValue.trim()}
                                                        className={cn(
                                                            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                                                            copiedCopy
                                                                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                                                                : "border-white/10 text-white/45 hover:border-white/25 hover:text-white/80",
                                                            !socialCopyValue.trim() && "cursor-not-allowed opacity-40"
                                                        )}
                                                        title="Copiar el copy al portapapeles"
                                                    >
                                                        {copiedCopy ? <Check className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                                                        {copiedCopy ? "Copiado" : "Copiar"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCopilot((value) => !value)}
                                                        className={cn(
                                                            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                                                            showCopilot
                                                                ? "border-quepia-cyan/40 bg-quepia-cyan/10 text-quepia-cyan"
                                                                : "border-white/10 text-white/45 hover:border-quepia-cyan/30 hover:text-quepia-cyan"
                                                        )}
                                                    >
                                                        <Sparkles className="h-3.5 w-3.5" />
                                                        Copiloto IA
                                                    </button>
                                                </span>
                                            </h3>
                                            {editingSocialCopy ? (
                                                <textarea
                                                    value={socialCopyValue}
                                                    onChange={(e) => setSocialCopyValue(e.target.value)}
                                                    onBlur={handleSaveSocialCopy}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Escape") { setSocialCopyValue(task.social_copy || ""); setEditingSocialCopy(false) }
                                                    }}
                                                    placeholder="Escribir copy para redes..."
                                                    rows={4}
                                                    className="w-full resize-none rounded-xl border border-white/10 bg-black/10 p-3 font-mono text-sm leading-relaxed text-white/85 outline-none placeholder:text-white/35 focus:border-quepia-cyan/60"
                                                />
                                            ) : (
                                                <div
                                                    onClick={() => setEditingSocialCopy(true)}
                                                    className="min-h-[56px] cursor-text whitespace-pre-wrap rounded-xl border border-transparent bg-black/10 p-3 font-mono text-sm leading-relaxed text-white/65 transition-colors hover:border-white/[0.07] hover:text-white/80"
                                                >
                                                    {task.social_copy || (
                                                        <span className="font-sans text-white/35">Agregá el copy o usá el Copiloto IA para crear una primera versión.</span>
                                                    )}
                                                </div>
                                            )}
                                            {showCopilot && (
                                                <div className="mt-4 rounded-xl border border-quepia-cyan/20 bg-quepia-cyan/[0.04] p-3">
                                                    <div className="mb-3 rounded-lg border border-white/[0.07] bg-black/15 p-2.5">
                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                            <span className="text-[11px] font-medium uppercase tracking-wide text-white/45">
                                                                Contexto visual
                                                            </span>
                                                            {!copilotAssetsLoading && copilotAssets.length > 0 && (
                                                                <span className="text-[11px] text-white/30">
                                                                    {(selectedCopilotAssetIds || []).length}/{copilotAssets.length} seleccionados
                                                                </span>
                                                            )}
                                                        </div>

                                                        {copilotAssetsLoading ? (
                                                            <div className="flex items-center gap-2 text-xs text-white/35">
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                Buscando assets de la tarea…
                                                            </div>
                                                        ) : copilotAssetsError ? (
                                                            <div className="flex items-center justify-between gap-3 text-xs text-red-300">
                                                                <span>{copilotAssetsError}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void loadCopilotAssets()}
                                                                    className="shrink-0 rounded-md border border-red-300/20 px-2 py-1 text-[11px] transition-colors hover:bg-red-300/10"
                                                                >
                                                                    Reintentar
                                                                </button>
                                                            </div>
                                                        ) : copilotAssets.length > 0 ? (
                                                            <>
                                                                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                                                                    {copilotAssets.map((asset) => {
                                                                        const isSelected = (selectedCopilotAssetIds || []).includes(asset.id)
                                                                        return (
                                                                            <button
                                                                                key={asset.versionId}
                                                                                type="button"
                                                                                onClick={() => toggleCopilotAsset(asset.id)}
                                                                                title={asset.filename}
                                                                                className={cn(
                                                                                    "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
                                                                                    isSelected
                                                                                        ? "border-quepia-cyan/35 bg-quepia-cyan/10 text-white/75"
                                                                                        : "border-white/[0.07] bg-white/[0.02] text-white/30"
                                                                                )}
                                                                            >
                                                                                {isSelected ? <Check className="h-3 w-3 text-quepia-cyan" /> : <Paperclip className="h-3 w-3" />}
                                                                                <span className="truncate">{asset.name}</span>
                                                                                {asset.assetType === "carousel" && (
                                                                                    <span className="text-white/25">#{asset.groupOrder + 1}</span>
                                                                                )}
                                                                                <span
                                                                                    className={cn(
                                                                                        "h-1.5 w-1.5 shrink-0 rounded-full",
                                                                                        asset.status === "ready" ? "bg-emerald-400" : "bg-amber-300/70"
                                                                                    )}
                                                                                    title={asset.status === "ready" ? "Análisis listo" : "Se analizará al generar"}
                                                                                />
                                                                            </button>
                                                                        )
                                                                    })}
                                                                </div>
                                                                <p className="mt-2 text-[10px] leading-relaxed text-white/25">
                                                                    Verde: análisis guardado. Amarillo: se analizará al generar. La versión más reciente de cada asset es la que se usa.
                                                                </p>
                                                                <p className="mt-1.5 text-[10px] leading-relaxed text-quepia-cyan/60">
                                                                    Los assets seleccionados definen el tema y los datos del copy; el brief aporta tono y dirección.
                                                                </p>
                                                            </>
                                                        ) : (
                                                            <p className="text-xs text-white/30">
                                                                No hay assets adjuntos. El Copiloto usará el título, el brief y el copy disponible.
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="mb-3 flex flex-wrap gap-1.5">
                                                        {COPILOT_ACTIONS.map((action) => (
                                                            <button
                                                                key={action.id}
                                                                type="button"
                                                                onClick={() => void runCopilot(action.id)}
                                                                disabled={copilotAction !== null || copilotAssetsLoading || selectedCopilotAssetIds === null}
                                                                className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/65 transition-colors hover:border-quepia-cyan/30 hover:text-white disabled:opacity-40"
                                                            >
                                                                {copilotAction === action.id && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                                                                {action.label}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {(copilotResult || copilotAction) && (
                                                        <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                                                            <div className="min-h-16 whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                                                                {copilotResult || <span className="text-white/35">Preparando propuesta…</span>}
                                                            </div>
                                                            {copilotResult && !copilotAction && (
                                                                <div className="mt-3 border-t border-white/[0.06] pt-3">
                                                                    {copilotResultAction !== "review" && (
                                                                        <div className="mb-3">
                                                                            <label className="mb-1.5 block text-[11px] font-medium text-white/40">
                                                                                ¿Qué querés cambiar de este copy?
                                                                            </label>
                                                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                                                                <textarea
                                                                                    value={copilotFeedback}
                                                                                    onChange={(e) => setCopilotFeedback(e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") reviseCopilotResult()
                                                                                    }}
                                                                                    rows={2}
                                                                                    maxLength={2000}
                                                                                    placeholder="Ej: hacelo más corto, menos comercial y sin hashtags…"
                                                                                    className="min-h-16 flex-1 resize-none rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-white/70 outline-none placeholder:text-white/20 focus:border-quepia-cyan/40"
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={reviseCopilotResult}
                                                                                    disabled={!copilotFeedback.trim()}
                                                                                    className="rounded-md border border-quepia-cyan/30 bg-quepia-cyan/10 px-3 py-2 text-xs font-medium text-quepia-cyan hover:bg-quepia-cyan/15 disabled:cursor-not-allowed disabled:opacity-35"
                                                                                >
                                                                                    Mejorar con feedback
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setCopilotResult("")}
                                                                            className="px-2 py-1 text-xs text-white/40 hover:text-white/70"
                                                                        >
                                                                            Descartar
                                                                        </button>
                                                                        {copilotResultAction !== "review" && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => void applyCopilotResult()}
                                                                                className="rounded-md bg-quepia-cyan px-3 py-1.5 text-xs font-medium text-black hover:bg-quepia-cyan/90"
                                                                            >
                                                                                Aplicar al copy
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {copilotError && (
                                                        <p className="mt-2 text-xs text-red-300">{copilotError}</p>
                                                    )}
                                                    {!copilotAction && (copilotAssetsUsed > 0 || copilotAssetsFailed > 0) && (
                                                        <p className="mt-2 text-[11px] text-white/30">
                                                            {copilotAssetsUsed > 0 && `${copilotAssetsUsed} asset(s) usados como fuente visual principal.`}
                                                            {copilotGroundingVerified && " Copy verificado contra esos assets."}
                                                            {copilotAssetsFailed > 0 && ` ${copilotAssetsFailed} no pudieron analizarse.`}
                                                        </p>
                                                    )}
                                                    <p className="mt-2 text-[11px] text-white/25">La IA nunca modifica el copy sin tu aprobación.</p>
                                                </div>
                                            )}
                                        </div>
                                        {/* Subtasks: a dense checklist, not a section that competes with the work itself. */}
                                        <div className="mb-4 rounded-xl border border-[#242a32] bg-[#12161b] px-3 py-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-white/35" />
                                                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Subtareas</span>
                                                    {subtasks.length > 0 && (
                                                        <span className="font-mono text-[11px] text-white/30">
                                                            {completedSubtasks.length}/{subtasks.length}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {completedSubtasks.length > 0 && (
                                                        <button
                                                            onClick={() => setShowCompletedSubtasks(!showCompletedSubtasks)}
                                                            className="text-[11px] text-white/30 transition-colors hover:text-white/60"
                                                        >
                                                            {showCompletedSubtasks ? "Ocultar" : "Ver"} hechas
                                                        </button>
                                                    )}
                                                    {!isAddingSubtask && (
                                                        <button
                                                            onClick={() => setIsAddingSubtask(true)}
                                                            className="flex h-6 w-6 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/[0.06] hover:text-quepia-cyan"
                                                            title="Agregar sub-tarea"
                                                            aria-label="Agregar sub-tarea"
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {subtasks.length > 0 && (
                                                <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-400/60 transition-all duration-300"
                                                        style={{ width: `${(completedSubtasks.length / subtasks.length) * 100}%` }}
                                                    />
                                                </div>
                                            )}

                                            {isAddingSubtask && (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <Circle className="h-3.5 w-3.5 shrink-0 text-white/25" />
                                                    <input
                                                        type="text"
                                                        placeholder="Título de sub-tarea"
                                                        value={newSubtaskTitle}
                                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") {
                                                                e.preventDefault()
                                                                if (!submitting) handleAddSubtask()
                                                            }
                                                            if (e.key === "Escape") { setIsAddingSubtask(false); setNewSubtaskTitle("") }
                                                        }}
                                                        autoFocus
                                                        className="flex-1 border-b border-white/15 bg-transparent px-1 py-0.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-quepia-cyan"
                                                    />
                                                    <button
                                                        onClick={handleAddSubtask}
                                                        disabled={!newSubtaskTitle.trim() || submitting}
                                                        className="rounded bg-quepia-cyan px-2 py-1 text-[11px] font-medium text-black disabled:opacity-50"
                                                    >
                                                        Agregar
                                                    </button>
                                                </div>
                                            )}

                                            {(pendingSubtasks.length > 0 || (showCompletedSubtasks && completedSubtasks.length > 0)) && (
                                                <div className="mt-1.5">
                                                    {pendingSubtasks.map((subtask) => (
                                                        <SubtaskItem
                                                            key={subtask.id}
                                                            subtask={subtask}
                                                            onToggle={() => handleToggleSubtask(subtask.id)}
                                                            onDelete={() => handleDeleteSubtask(subtask.id)}
                                                            onAssign={(uid) => handleAssignSubtask(subtask.id, uid, subtask.titulo)}
                                                            onConvert={() => handleConvertSubtaskToTask(subtask.id, subtask.titulo)}
                                                            users={users}
                                                        />
                                                    ))}
                                                    {showCompletedSubtasks && completedSubtasks.map((subtask) => (
                                                        <SubtaskItem
                                                            key={subtask.id}
                                                            subtask={subtask}
                                                            onToggle={() => handleToggleSubtask(subtask.id)}
                                                            onDelete={() => handleDeleteSubtask(subtask.id)}
                                                            onAssign={(uid) => handleAssignSubtask(subtask.id, uid, subtask.titulo)}
                                                            onConvert={() => handleConvertSubtaskToTask(subtask.id, subtask.titulo)}
                                                            users={users}
                                                            completed
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Links */}
                                        <div className="mb-5 rounded-2xl border border-[#242a32] bg-[#12161b] p-4 sm:p-5">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <Link2 className="h-4 w-4 text-white/45" />
                                                    <h3 className="text-sm font-semibold text-white/90">Enlaces</h3>
                                                    {links.length > 0 && (
                                                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/45">{links.length}</span>
                                                    )}
                                                </div>
                                                {!isAddingLink && (
                                                    <button onClick={() => setIsAddingLink(true)} className="flex items-center gap-1 text-xs font-medium text-quepia-cyan/80 transition-colors hover:text-quepia-cyan">
                                                        <Plus className="h-3.5 w-3.5" /> Agregar
                                                    </button>
                                                )}
                                            </div>

                                            {links.length > 0 ? (
                                                <div className="mb-3 min-w-0 space-y-1">
                                                    {links.map((link) => (
                                                        <div key={link.id} className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
                                                            <a
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title={link.url}
                                                                className="flex min-w-0 flex-1 items-center gap-2 text-sm text-quepia-cyan hover:underline"
                                                            >
                                                                <ArrowUpRight className="h-4 w-4 shrink-0" />
                                                                <span className="block min-w-0 truncate">{link.titulo || link.url}</span>
                                                            </a>
                                                            <button
                                                                onClick={() => deleteLink(link.id)}
                                                                className="shrink-0 rounded p-1 opacity-0 transition-all hover:bg-white/[0.06] group-hover:opacity-100"
                                                                aria-label="Eliminar enlace"
                                                            >
                                                                <Trash2 className="h-3 w-3 text-white/40" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : !isAddingLink ? (
                                                <p className="text-xs text-white/35">Agregá documentos, referencias o recursos relacionados con la tarea.</p>
                                            ) : null}

                                            {isAddingLink && (
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                                                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-quepia-cyan"
                                                    />
                                                    <button onClick={handleAddLink} disabled={!newLinkUrl.trim() || submitting} className="rounded-lg bg-quepia-cyan px-3 py-2 text-xs font-medium text-black disabled:opacity-50">Agregar</button>
                                                    <button onClick={() => { setIsAddingLink(false); setNewLinkUrl("") }} className="px-2 py-2 text-xs text-white/50 hover:text-white/70">Cancelar</button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Dependencies Section */}
                                        <div className="mb-5 rounded-2xl border border-[#242a32] bg-[#12161b] p-4 sm:p-5">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="flex items-center gap-2 text-sm font-semibold text-white/90">
                                                    <GitBranch className="h-4 w-4 text-white/45" />
                                                    Dependencias
                                                </span>
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
                                                <p className="text-xs text-white/35">Esta tarea puede comenzar sin esperar a otra.</p>
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
                                        <div className="mb-1 rounded-2xl border border-[#242a32] bg-[#12161b] p-4 sm:p-5">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <h3 className="flex items-center gap-2 text-sm font-semibold text-white/90">
                                                    <Send className="h-4 w-4 text-white/45" />
                                                    Comentarios
                                                </h3>
                                                {comments.length > 0 && (
                                                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/45">{comments.length}</span>
                                                )}
                                            </div>

                                            {comments.length > 0 && (
                                                <div className="space-y-3 mb-4">
                                                    {comments.map((c) => (
                                                        <div key={c.id} className="flex items-start gap-3 group">
                                                            <UserAvatar
                                                                name={getCommentAuthorName(c)}
                                                                avatarUrl={c.is_client ? null : c.user?.avatar_url}
                                                                size={28}
                                                                fontSize={10}
                                                                fallbackLabel={getCommentInitials(c)}
                                                                fallbackClassName={
                                                                    c.is_client
                                                                        ? "bg-gradient-to-br from-amber-400/80 to-orange-500/80"
                                                                        : undefined
                                                                }
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-white/80">{getCommentAuthorName(c)}</span>
                                                                    {c.is_client && (
                                                                        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                                                                            Cliente
                                                                        </span>
                                                                    )}
                                                                    {getCommentSourceLabel(c.source) && (
                                                                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/45">
                                                                            {getCommentSourceLabel(c.source)}
                                                                        </span>
                                                                    )}
                                                                    {getCommentAssetLabel(c) && (
                                                                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100/85">
                                                                            {getCommentAssetLabel(c)}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-xs text-white/25">
                                                                        {new Date(c.created_at).toLocaleDateString("es-AR")}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm text-white/65 mt-0.5">{c.contenido}</p>
                                                            </div>
                                                            {c.user_id && c.user_id === userId && (
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
                                                <UserAvatar
                                                    name={currentUser?.nombre}
                                                    avatarUrl={currentUser?.avatar_url}
                                                    size={28}
                                                    fontSize={10}
                                                    fallbackLabel={currentUser ? undefined : "Q"}
                                                />
                                                <div className="flex-1 relative">
                                                    <input
                                                        type="text"
                                                        placeholder="Agregar un comentario..."
                                                        value={comment}
                                                        onChange={(e) => setComment(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment() }
                                                        }}
                                                        className="w-full rounded-xl border border-white/[0.09] bg-black/10 px-3 py-2.5 pr-12 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-quepia-cyan/50"
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
                                    </div>
                                </div>
                            </div>

                            {/* Sidebar */}
                            <div className="w-full border-t border-[#252b33] bg-[#101318] p-4 md:sticky md:top-0 md:w-72 md:self-start md:border-l md:border-t-0 sm:p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Propiedades</h2>
                                    <span className="text-[11px] text-white/25">Click para editar</span>
                                </div>
                                <div className="space-y-1.5">
                                    {/* Parent Task - Only shown if this task was converted from a subtask */}
                                    {task?.parent_task_id && (
                                        <SidebarField label="Convertida desde">
                                            <button
                                                onClick={handleOpenParentTask}
                                                className="flex items-center gap-2 text-sm text-quepia-cyan hover:text-quepia-cyan/80 hover:bg-quepia-cyan/10 rounded px-1 -mx-1 py-0.5 transition-colors w-full text-left group"
                                                title="Ver tarea padre"
                                            >
                                                <GitBranch className="h-4 w-4" />
                                                <span className="truncate flex-1">
                                                    {task.parent_task?.titulo || 'Tarea padre'}
                                                </span>
                                                <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </button>
                                        </SidebarField>
                                    )}

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
                                                        <UserAvatar
                                                            name={task.assignee.nombre}
                                                            avatarUrl={task.assignee.avatar_url}
                                                            size={24}
                                                            fontSize={10}
                                                        />
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
                                                            <UserAvatar
                                                                name={u.nombre}
                                                                avatarUrl={u.avatar_url}
                                                                size={20}
                                                                fontSize={9}
                                                                fallbackClassName="bg-gradient-to-br from-quepia-cyan/60 to-quepia-magenta/60"
                                                            />
                                                            {u.nombre}
                                                        </button>
                                                    ))}
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    </SidebarField>

                                    {/* Deadline */}
                                    <SidebarField label="Deadline">
                                        {editingDeadline ? (
                                            <div>
                                                <input
                                                    type="date"
                                                    value={deadlineValue}
                                                    onChange={(e) => setDeadlineValue(e.target.value)}
                                                    onBlur={() => {
                                                        const currentDeadlineDate = getTaskDeadlineDateKey(task)
                                                        const val = deadlineValue || null
                                                        if (val !== currentDeadlineDate) {
                                                            updateTaskField("deadline", toTaskDeadlineTimestamp(val))
                                                        }
                                                        setEditingDeadline(false)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            const currentDeadlineDate = getTaskDeadlineDateKey(task)
                                                            const val = deadlineValue || null
                                                            if (val !== currentDeadlineDate) {
                                                                updateTaskField("deadline", toTaskDeadlineTimestamp(val))
                                                            }
                                                            setEditingDeadline(false)
                                                        }
                                                        if (e.key === "Escape") setEditingDeadline(false)
                                                    }}
                                                    autoFocus
                                                    className="text-sm bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-quepia-cyan w-full [color-scheme:dark]"
                                                />
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {[
                                                        { label: "Hoy", days: 0 },
                                                        { label: "Mañana", days: 1 },
                                                        { label: "+7 días", days: 7 },
                                                    ].map(option => (
                                                        <button
                                                            key={option.label}
                                                            type="button"
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onClick={() => {
                                                                const base = new Date()
                                                                base.setHours(0, 0, 0, 0)
                                                                base.setDate(base.getDate() + option.days)
                                                                const dateStr = formatLocalDate(base)
                                                                setDeadlineValue(dateStr)
                                                                updateTaskField("deadline", toTaskDeadlineTimestamp(dateStr))
                                                                setEditingDeadline(false)
                                                            }}
                                                            className="text-[11px] px-2 py-1 rounded-full bg-white/[0.04] text-white/70 hover:bg-white/[0.08] transition-colors"
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setDeadlineValue(getTaskDeadlineDateKey(task) || "")
                                                    setEditingDeadline(true)
                                                }}
                                                className="flex items-center gap-2 text-sm hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
                                            >
                                                {getTaskDeadlineDateKey(task) && isPastDate(getTaskDeadlineDateKey(task)) ? (
                                                    <AlertCircle className="h-4 w-4 text-red-400" />
                                                ) : (
                                                    <Calendar className="h-4 w-4 text-white/30" />
                                                )}
                                                {getTaskDeadlineDateKey(task) ? (
                                                    <span className={cn(
                                                        isPastDate(getTaskDeadlineDateKey(task))
                                                            ? "text-red-400"
                                                            : "text-white/70"
                                                    )}>
                                                        {new Date(`${getTaskDeadlineDateKey(task)}T12:00:00`).toLocaleDateString("es-AR")}
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

                                {/* Publishing CTA: the last step of the task, kept out of the reading flow. */}
                                <div className="mt-4 border-t border-white/[0.06] pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setZernioOpen(true)}
                                        className={cn(
                                            "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors",
                                            readyToPublish
                                                ? "bg-quepia-cyan text-black hover:opacity-90"
                                                : "border border-white/10 bg-white/[0.03] text-white/60 hover:border-quepia-cyan/30 hover:text-quepia-cyan"
                                        )}
                                    >
                                        <Radio className="h-4 w-4" />
                                        Publicar con Zernio
                                    </button>
                                    <p className="mt-1.5 text-center text-[11px] text-white/30">
                                        {readyToPublish ? "Copy cargado — listo para revisar y publicar" : "Cargá el copy y los assets antes de publicar"}
                                    </p>
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

                {/* Publishing overlay: the full Zernio panel, opened from the sidebar CTA. */}
                {zernioOpen && task && (
                    <div className="absolute inset-0 z-30 flex flex-col bg-[#0d1014]">
                        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[#252b33] bg-[#101318] px-4 sm:px-6">
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Publicación</p>
                                <p className="truncate text-sm font-medium text-white/80">{task.titulo?.replace(/\*/g, "")}</p>
                            </div>
                            <button
                                onClick={() => setZernioOpen(false)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                                title="Cerrar"
                                aria-label="Cerrar publicación"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                            <div className="mx-auto max-w-2xl">
                                <ZernioPublishingPanel
                                    taskId={task.id}
                                    projectId={task.project_id}
                                    socialCopy={socialCopyValue}
                                    onPublished={() => {
                                        void refresh()
                                        onUpdate?.()
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Reading view: the full brief at a comfortable measure. */}
                {descReaderOpen && descriptionText && (
                    <div className="absolute inset-0 z-30 flex flex-col bg-[#0d1014]">
                        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[#252b33] bg-[#101318] px-4 sm:px-6">
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Descripción</p>
                                <p className="truncate text-sm font-medium text-white/80">{task?.titulo?.replace(/\*/g, "")}</p>
                            </div>
                            <button
                                onClick={() => setDescReaderOpen(false)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                                title="Cerrar lectura"
                                aria-label="Cerrar lectura"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
                            <RichDescription text={descriptionText} className="mx-auto max-w-[68ch] text-[14px] leading-[1.7]" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="group rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-white/[0.07] hover:bg-white/[0.025]">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/35 transition-colors group-hover:text-white/45">{label}</p>
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
    const [tasks, setTasks] = useState<{ id: string; titulo: string }[]>([])

    useEffect(() => {
        let cancelled = false
        const fetchTasks = async () => {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            let q = supabase
                .from("sistema_tasks")
                .select("id, titulo")
                .eq("project_id", projectId)
                .neq("id", currentTaskId)
                .order("titulo", { ascending: true })
                .limit(50)

            if (query) {
                q = q.ilike("titulo", `%${query}%`)
            }

            const { data } = await q
            if (!cancelled && data) {
                setTasks(data.filter(t => !existingDepIds.includes(t.id)))
            }
        }
        fetchTasks()
        return () => { cancelled = true }
    }, [projectId, query, currentTaskId, existingDepIds])

    if (tasks.length === 0) {
        return <p className="text-xs text-white/25 py-2 text-center">Sin resultados</p>
    }

    return (
        <>
            {tasks.slice(0, 8).map(t => (
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

function SubtaskItem({ subtask, onToggle, onDelete, onAssign, onConvert, users, completed }: {
    subtask: Subtask & { assignee?: { id?: string; nombre: string; avatar_url?: string | null } | null };
    onToggle: () => void;
    onDelete: () => void;
    onAssign: (userId: string | null) => void;
    onConvert: () => void;
    users: SistemaUser[];
    completed?: boolean;
}) {
    const [showAssigneeMenu, setShowAssigneeMenu] = useState(false)

    return (
        <div className={cn(
            "group flex items-center gap-2 rounded-md px-1 py-[3px] transition-colors hover:bg-white/[0.03]",
            completed && "opacity-50"
        )}>
            <button onClick={onToggle} className="shrink-0">
                {completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
                ) : (
                    <Circle className="h-3.5 w-3.5 text-white/25 transition-colors hover:text-quepia-cyan" />
                )}
            </button>
            <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", completed ? "text-white/35 line-through" : "text-white/70")}>
                {subtask.titulo}
            </span>
            <div className="relative">
                <button
                    onClick={() => setShowAssigneeMenu(!showAssigneeMenu)}
                    title={subtask.assignee ? subtask.assignee.nombre : "Asignar"}
                >
                    {subtask.assignee ? (
                        <UserAvatar
                            name={subtask.assignee.nombre}
                            avatarUrl={subtask.assignee.avatar_url}
                            size={20}
                            fontSize={8}
                            fallbackClassName="bg-gradient-to-br from-quepia-cyan/60 to-quepia-magenta/60"
                            className="transition-all hover:ring-1 hover:ring-quepia-cyan/50"
                        />
                    ) : (
                        <UserPlus className="h-3.5 w-3.5 text-white/20 opacity-0 group-hover:opacity-100 hover:text-quepia-cyan transition-all" />
                    )}
                </button>
                {showAssigneeMenu && (
                    <DropdownMenu onClose={() => setShowAssigneeMenu(false)}>
                        <button
                            onClick={() => { onAssign(null); setShowAssigneeMenu(false) }}
                            className="w-full text-left px-3 py-2 text-sm text-white/50 hover:bg-white/[0.06] transition-colors"
                        >
                            Sin asignar
                        </button>
                        {users.map((u) => (
                            <button
                                key={u.id}
                                onClick={() => { onAssign(u.id); setShowAssigneeMenu(false) }}
                                className={cn(
                                    "w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center gap-2",
                                    subtask.assignee_id === u.id ? "text-quepia-cyan" : "text-white/70"
                                )}
                            >
                                <UserAvatar
                                    name={u.nombre}
                                    avatarUrl={u.avatar_url}
                                    size={20}
                                    fontSize={9}
                                    fallbackClassName="bg-gradient-to-br from-quepia-cyan/60 to-quepia-magenta/60"
                                />
                                {u.nombre}
                            </button>
                        ))}
                    </DropdownMenu>
                )}
            </div>
            <button 
                onClick={onConvert} 
                title="Convertir a tarea"
                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-quepia-cyan/10 hover:text-quepia-cyan rounded transition-all"
            >
                <ArrowUpRight className="h-3 w-3 text-white/30 hover:text-quepia-cyan" />
            </button>
            <button onClick={onDelete} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] rounded transition-all">
                <Trash2 className="h-3 w-3 text-white/30" />
            </button>
        </div>
    )
}
