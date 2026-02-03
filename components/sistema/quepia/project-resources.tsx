"use client"

import { useState, useEffect, useCallback } from "react"
import {
    ExternalLink,
    Plus,
    Trash2,
    X,
    Instagram,
    Facebook,
    Youtube,
    Linkedin,
    Twitter,
    FolderOpen,
    Palette,
    Globe,
    Link2,
    Pencil,
    ChevronDown,
    Loader2,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { createClient } from "@/lib/sistema/supabase/client"
import type { ProjectResource, ProjectResourceType } from "@/types/sistema"

const RESOURCE_TYPE_OPTIONS: { value: ProjectResourceType; label: string }[] = [
    { value: "social", label: "Red Social" },
    { value: "drive", label: "Drive / Archivos" },
    { value: "design", label: "Diseño" },
    { value: "link", label: "Enlace" },
    { value: "other", label: "Otro" },
]

const ICON_PRESETS: { label: string; icon: string; type: ProjectResourceType }[] = [
    { label: "Instagram", icon: "instagram", type: "social" },
    { label: "Facebook", icon: "facebook", type: "social" },
    { label: "YouTube", icon: "youtube", type: "social" },
    { label: "LinkedIn", icon: "linkedin", type: "social" },
    { label: "X / Twitter", icon: "twitter", type: "social" },
    { label: "TikTok", icon: "tiktok", type: "social" },
    { label: "Google Drive", icon: "drive", type: "drive" },
    { label: "Canva", icon: "canva", type: "design" },
    { label: "Figma", icon: "figma", type: "design" },
    { label: "Sitio Web", icon: "globe", type: "link" },
]

function getResourceIcon(resource: ProjectResource) {
    const iconName = resource.icon || resource.type
    const cls = "h-4 w-4"

    switch (iconName) {
        case "instagram": return <Instagram className={cls} />
        case "facebook": return <Facebook className={cls} />
        case "youtube": return <Youtube className={cls} />
        case "linkedin": return <Linkedin className={cls} />
        case "twitter": return <Twitter className={cls} />
        case "tiktok": return <span className={cn(cls, "text-[10px] font-bold leading-none flex items-center justify-center")}>TT</span>
        case "drive": return <FolderOpen className={cls} />
        case "canva": return <Palette className={cls} />
        case "figma": return <Pencil className={cls} />
        case "globe": return <Globe className={cls} />
        case "social": return <Globe className={cls} />
        case "design": return <Palette className={cls} />
        case "link": return <Link2 className={cls} />
        default: return <Link2 className={cls} />
    }
}

function getTypeColor(type: ProjectResourceType): string {
    switch (type) {
        case "social": return "text-pink-400"
        case "drive": return "text-blue-400"
        case "design": return "text-purple-400"
        case "link": return "text-cyan-400"
        default: return "text-white/50"
    }
}

interface ProjectResourcesProps {
    projectId: string
}

export function ProjectResources({ projectId }: ProjectResourcesProps) {
    const [resources, setResources] = useState<ProjectResource[]>([])
    const [loading, setLoading] = useState(true)
    const [showManager, setShowManager] = useState(false)
    const [showAddForm, setShowAddForm] = useState(false)
    const [saving, setSaving] = useState(false)

    // Add form state
    const [newTitle, setNewTitle] = useState("")
    const [newUrl, setNewUrl] = useState("")
    const [newType, setNewType] = useState<ProjectResourceType>("link")
    const [newIcon, setNewIcon] = useState<string>("")

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState("")
    const [editUrl, setEditUrl] = useState("")
    const [editType, setEditType] = useState<ProjectResourceType>("link")
    const [editIcon, setEditIcon] = useState("")

    const fetchResources = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from("sistema_projects")
                .select("resources")
                .eq("id", projectId)
                .single()

            if (error) throw error
            setResources(data?.resources || [])
        } catch (err) {
            console.error("Error fetching resources:", err)
        } finally {
            setLoading(false)
        }
    }, [projectId])

    useEffect(() => {
        fetchResources()
    }, [fetchResources])

    const saveResources = async (updated: ProjectResource[]) => {
        setSaving(true)
        try {
            const supabase = createClient()
            const { error } = await supabase
                .from("sistema_projects")
                .update({ resources: updated })
                .eq("id", projectId)

            if (error) throw error
            setResources(updated)
        } catch (err) {
            console.error("Error saving resources:", err)
        } finally {
            setSaving(false)
        }
    }

    const handleAdd = async () => {
        if (!newTitle.trim() || !newUrl.trim()) return

        const resource: ProjectResource = {
            id: crypto.randomUUID(),
            title: newTitle.trim(),
            url: newUrl.trim().startsWith("http") ? newUrl.trim() : `https://${newUrl.trim()}`,
            type: newType,
            icon: newIcon || undefined,
        }

        await saveResources([...resources, resource])
        setNewTitle("")
        setNewUrl("")
        setNewType("link")
        setNewIcon("")
        setShowAddForm(false)
    }

    const handleDelete = async (id: string) => {
        await saveResources(resources.filter(r => r.id !== id))
    }

    const handleStartEdit = (resource: ProjectResource) => {
        setEditingId(resource.id)
        setEditTitle(resource.title)
        setEditUrl(resource.url)
        setEditType(resource.type)
        setEditIcon(resource.icon || "")
    }

    const handleSaveEdit = async () => {
        if (!editTitle.trim() || !editUrl.trim() || !editingId) return

        const updated = resources.map(r =>
            r.id === editingId
                ? {
                    ...r,
                    title: editTitle.trim(),
                    url: editUrl.trim().startsWith("http") ? editUrl.trim() : `https://${editUrl.trim()}`,
                    type: editType,
                    icon: editIcon || undefined,
                }
                : r
        )
        await saveResources(updated)
        setEditingId(null)
    }

    const handlePresetClick = (preset: typeof ICON_PRESETS[0]) => {
        setNewTitle(preset.label)
        setNewType(preset.type)
        setNewIcon(preset.icon)
        setShowAddForm(true)
    }

    if (loading) return null

    return (
        <>
            {/* Quick Access Icons in Header */}
            <div className="flex items-center gap-1">
                {resources.slice(0, 6).map((resource) => (
                    <a
                        key={resource.id}
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={resource.title}
                        className={cn(
                            "p-1.5 rounded-md hover:bg-white/10 transition-colors",
                            getTypeColor(resource.type)
                        )}
                    >
                        {getResourceIcon(resource)}
                    </a>
                ))}
                {resources.length > 6 && (
                    <button
                        onClick={() => setShowManager(true)}
                        className="px-1.5 py-0.5 text-[10px] text-white/40 hover:text-white/60 rounded-md hover:bg-white/10 transition-colors"
                    >
                        +{resources.length - 6}
                    </button>
                )}
                <button
                    onClick={() => setShowManager(true)}
                    title="Gestionar recursos"
                    className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-white/30 hover:text-white/60"
                >
                    {resources.length === 0 ? (
                        <Plus className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                    )}
                </button>
            </div>

            {/* Manager Overlay */}
            {showManager && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => {
                            setShowManager(false)
                            setShowAddForm(false)
                            setEditingId(null)
                        }}
                    />
                    <div className="relative z-50 w-full h-[100svh] sm:h-auto sm:max-w-md rounded-t-2xl sm:rounded-xl border-0 sm:border sm:border-white/10 bg-[#1a1a1a] shadow-2xl p-4 sm:p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-semibold text-white">Recursos del proyecto</h2>
                            <button
                                onClick={() => {
                                    setShowManager(false)
                                    setShowAddForm(false)
                                    setEditingId(null)
                                }}
                                className="p-1 rounded hover:bg-white/10 transition-colors"
                            >
                                <X className="h-4 w-4 text-white/60" />
                            </button>
                        </div>

                        {/* Resources List */}
                        {resources.length === 0 && !showAddForm ? (
                            <div className="text-center py-8">
                                <Link2 className="h-8 w-8 text-white/15 mx-auto mb-3" />
                                <p className="text-sm text-white/40 mb-1">Sin recursos</p>
                                <p className="text-xs text-white/25 mb-4">
                                    Agrega enlaces rápidos a redes sociales, Drive, Canva, etc.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-1.5 mb-4 max-h-[300px] overflow-y-auto">
                                {resources.map((resource) => (
                                    <div key={resource.id}>
                                        {editingId === resource.id ? (
                                            <div className="bg-white/[0.05] border border-white/10 rounded-lg p-3 space-y-2">
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    placeholder="Título"
                                                    className="w-full bg-white/10 text-sm text-white px-3 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-quepia-cyan placeholder:text-white/30"
                                                    autoFocus
                                                />
                                                <input
                                                    type="url"
                                                    value={editUrl}
                                                    onChange={(e) => setEditUrl(e.target.value)}
                                                    placeholder="URL"
                                                    className="w-full bg-white/10 text-sm text-white px-3 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-quepia-cyan placeholder:text-white/30"
                                                />
                                                <select
                                                    value={editType}
                                                    onChange={(e) => setEditType(e.target.value as ProjectResourceType)}
                                                    className="w-full bg-white/10 text-sm text-white/80 px-3 py-1.5 rounded-md outline-none border border-white/10 appearance-none cursor-pointer"
                                                >
                                                    {RESOURCE_TYPE_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value} className="bg-[#1a1a1a]">{opt.label}</option>
                                                    ))}
                                                </select>
                                                <div className="flex justify-end gap-2 pt-1">
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="px-3 py-1 text-xs text-white/50 hover:text-white rounded"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        disabled={!editTitle.trim() || !editUrl.trim() || saving}
                                                        className="px-3 py-1 text-xs bg-quepia-cyan text-black font-medium rounded disabled:opacity-50"
                                                    >
                                                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar"}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] group transition-colors">
                                                <span className={cn("shrink-0", getTypeColor(resource.type))}>
                                                    {getResourceIcon(resource)}
                                                </span>
                                                <a
                                                    href={resource.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 min-w-0"
                                                >
                                                    <p className="text-sm text-white/90 truncate hover:text-quepia-cyan transition-colors">
                                                        {resource.title}
                                                    </p>
                                                    <p className="text-[11px] text-white/30 truncate">
                                                        {resource.url.replace(/^https?:\/\//, "").slice(0, 40)}
                                                    </p>
                                                </a>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <a
                                                        href={resource.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                    <button
                                                        onClick={() => handleStartEdit(resource)}
                                                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(resource.id)}
                                                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-red-400"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add Form */}
                        {showAddForm ? (
                            <div className="border-t border-white/[0.06] pt-4 space-y-3">
                                <h3 className="text-sm font-medium text-white/70">Nuevo recurso</h3>
                                {/* Quick Presets */}
                                <div className="flex flex-wrap gap-1.5">
                                    {ICON_PRESETS.map((preset) => (
                                        <button
                                            key={preset.icon}
                                            onClick={() => {
                                                setNewTitle(preset.label)
                                                setNewType(preset.type)
                                                setNewIcon(preset.icon)
                                            }}
                                            className={cn(
                                                "flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-md border transition-colors",
                                                newIcon === preset.icon
                                                    ? "border-quepia-cyan/50 bg-quepia-cyan/10 text-quepia-cyan"
                                                    : "border-white/10 text-white/50 hover:bg-white/[0.05] hover:text-white/70"
                                            )}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="Título (ej: Instagram)"
                                    className="w-full bg-white/[0.06] text-sm text-white px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-quepia-cyan placeholder:text-white/30 border border-white/10"
                                    autoFocus
                                />
                                <input
                                    type="url"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="URL (ej: https://instagram.com/...)"
                                    className="w-full bg-white/[0.06] text-sm text-white px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-quepia-cyan placeholder:text-white/30 border border-white/10"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleAdd()
                                        if (e.key === "Escape") setShowAddForm(false)
                                    }}
                                />
                                <select
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value as ProjectResourceType)}
                                    className="w-full bg-white/[0.06] text-sm text-white/80 px-3 py-2 rounded-md outline-none border border-white/10 appearance-none cursor-pointer"
                                >
                                    {RESOURCE_TYPE_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value} className="bg-[#1a1a1a]">{opt.label}</option>
                                    ))}
                                </select>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        onClick={() => {
                                            setShowAddForm(false)
                                            setNewTitle("")
                                            setNewUrl("")
                                            setNewIcon("")
                                        }}
                                        className="px-3 py-1.5 text-xs text-white/50 hover:text-white rounded transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleAdd}
                                        disabled={!newTitle.trim() || !newUrl.trim() || saving}
                                        className="px-4 py-1.5 text-xs bg-quepia-cyan text-black font-medium rounded disabled:opacity-50 transition-opacity"
                                    >
                                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Agregar"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="border-t border-white/[0.06] pt-3">
                                <button
                                    onClick={() => setShowAddForm(true)}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-quepia-cyan hover:bg-white/[0.04] rounded-lg transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                    Agregar recurso
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
