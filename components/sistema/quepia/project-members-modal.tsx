"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Users, Loader2, Trash2, UserPlus, Shield, ShieldCheck, Eye, User, Crown } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { SistemaUser } from "@/types/sistema"

interface ProjectMemberWithUser {
    id: string
    project_id: string
    user_id: string
    role: "owner" | "admin" | "member" | "viewer"
    created_at: string
    user: SistemaUser
}

interface ProjectMembersModalProps {
    isOpen: boolean
    onClose: () => void
    projectId: string
    projectName: string
    currentUserId: string
    ownerId: string
}

export function ProjectMembersModal({
    isOpen,
    onClose,
    projectId,
    projectName,
    currentUserId,
    ownerId,
}: ProjectMembersModalProps) {
    const [members, setMembers] = useState<ProjectMemberWithUser[]>([])
    const [allUsers, setAllUsers] = useState<SistemaUser[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState("")
    const [selectedRole, setSelectedRole] = useState<"admin" | "member" | "viewer">("member")
    const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())

    const fetchMembers = useCallback(async () => {
        try {
            const res = await fetch(`/api/sistema-data?type=project-members&projectId=${projectId}`)
            const result = await res.json()
            if (res.ok) {
                setMembers(result.data || [])
            }
        } catch (err) {
            console.error("Error fetching members:", err)
        } finally {
            setLoading(false)
        }
    }, [projectId])

    const fetchUsers = useCallback(async () => {
        try {
            const { createClient } = await import("@/lib/sistema/supabase/client")
            const supabase = createClient()
            const { data } = await supabase
                .from("sistema_users")
                .select("*")
                .order("nombre", { ascending: true })
            setAllUsers(data || [])
        } catch (err) {
            console.error("Error fetching users:", err)
        }
    }, [])

    useEffect(() => {
        if (isOpen) {
            setLoading(true)
            fetchMembers()
            fetchUsers()
        }
    }, [isOpen, fetchMembers, fetchUsers])

    const handleAddMember = async () => {
        if (!selectedUserId) return
        setAdding(true)
        try {
            const res = await fetch("/api/sistema-data", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "add-project-member",
                    userId: currentUserId,
                    projectId,
                    targetUserId: selectedUserId,
                    memberRole: selectedRole,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                alert(data.error || "Error al agregar miembro")
            } else {
                setSelectedUserId("")
                await fetchMembers()
            }
        } catch (err) {
            alert("Error inesperado")
        } finally {
            setAdding(false)
        }
    }

    const handleUpdateRole = async (memberId: string, newRole: string) => {
        setUpdatingIds((prev) => new Set(prev).add(memberId))
        try {
            const res = await fetch("/api/sistema-data", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update-project-member-role",
                    userId: currentUserId,
                    memberId,
                    memberRole: newRole,
                }),
            })
            if (res.ok) {
                await fetchMembers()
            } else {
                const data = await res.json()
                alert(data.error || "Error al actualizar rol")
            }
        } catch {
            alert("Error inesperado")
        } finally {
            setUpdatingIds((prev) => {
                const next = new Set(prev)
                next.delete(memberId)
                return next
            })
        }
    }

    const handleRemoveMember = async (memberId: string) => {
        if (!confirm("¿Quitar este miembro del proyecto?")) return
        setUpdatingIds((prev) => new Set(prev).add(memberId))
        try {
            const res = await fetch("/api/sistema-data", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "remove-project-member",
                    userId: currentUserId,
                    memberId,
                }),
            })
            if (res.ok) {
                await fetchMembers()
            } else {
                const data = await res.json()
                alert(data.error || "Error al quitar miembro")
            }
        } catch {
            alert("Error inesperado")
        } finally {
            setUpdatingIds((prev) => {
                const next = new Set(prev)
                next.delete(memberId)
                return next
            })
        }
    }

    if (!isOpen) return null

    // Separate users by type
    const memberUserIds = new Set(members.map((m) => m.user_id))
    const globalAdmins = allUsers.filter(
        (u) => u.role === "admin" && u.id !== ownerId && !memberUserIds.has(u.id)
    )
    const availableUsers = allUsers.filter(
        (u) => !memberUserIds.has(u.id) && u.id !== ownerId && u.role !== "admin"
    )

    const renderUserRow = (
        user: SistemaUser,
        badge: { label: string; color: string; bgColor: string; icon: any },
        options?: {
            memberId?: string
            memberRole?: string
            editable?: boolean
        }
    ) => {
        const Icon = badge.icon
        return (
            <div key={user.id} className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                options?.editable ? "hover:bg-white/[0.02]" : "bg-white/[0.02]"
            )}>
                {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white",
                        badge.bgColor
                    )}>
                        {user.nombre.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                        {user.nombre}
                        {user.id === currentUserId && (
                            <span className="ml-2 text-[10px] bg-white/[0.1] px-2 py-0.5 rounded-full text-white/50">Tu</span>
                        )}
                    </p>
                    <p className="text-xs text-white/40 truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                    {options?.editable && options.memberId ? (
                        updatingIds.has(options.memberId) ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                        ) : (
                            <>
                                <select
                                    value={options.memberRole}
                                    onChange={(e) => handleUpdateRole(options.memberId!, e.target.value)}
                                    className="bg-transparent border border-white/[0.1] rounded px-2 py-1 outline-none text-xs font-medium transition-colors cursor-pointer text-white/60"
                                >
                                    <option value="admin" className="bg-[#1a1a1a] text-white">Admin Proyecto</option>
                                    <option value="member" className="bg-[#1a1a1a] text-white">Miembro</option>
                                    <option value="viewer" className="bg-[#1a1a1a] text-white">Viewer</option>
                                </select>
                                <button
                                    onClick={() => handleRemoveMember(options.memberId!)}
                                    className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )
                    ) : (
                        <span className={cn("flex items-center gap-1 text-xs font-medium", badge.color)}>
                            <Icon className="h-3.5 w-3.5" />
                            {badge.label}
                        </span>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-lg border border-white/10 flex flex-col max-h-[85vh] mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-quepia-purple/20 rounded-lg">
                            <Users className="h-5 w-5 text-quepia-purple" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Miembros del Proyecto</h2>
                            <p className="text-xs text-white/40">{projectName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors">
                        <X className="h-4 w-4 text-white/40" />
                    </button>
                </div>

                {/* Add Member */}
                <div className="p-4 border-b border-white/[0.06]">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2">Agregar miembro al proyecto</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="w-full sm:flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-quepia-purple/50 transition-colors"
                        >
                            <option value="" className="bg-[#1a1a1a]">Seleccionar usuario...</option>
                            {availableUsers.map((u) => (
                                <option key={u.id} value={u.id} className="bg-[#1a1a1a]">
                                    {u.nombre} ({u.email})
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <select
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value as any)}
                                className="flex-1 sm:flex-none px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-quepia-purple/50 transition-colors"
                            >
                                <option value="admin" className="bg-[#1a1a1a]">Admin</option>
                                <option value="member" className="bg-[#1a1a1a]">Miembro</option>
                                <option value="viewer" className="bg-[#1a1a1a]">Viewer</option>
                            </select>
                            <button
                                onClick={handleAddMember}
                                disabled={!selectedUserId || adding}
                                className="px-4 py-2 bg-quepia-purple hover:bg-quepia-purple/80 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {adding ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <UserPlus className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Members List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-white/30" />
                        </div>
                    ) : (
                        <>
                            {/* Section: Acceso completo (Owner + Global Admins) */}
                            <div>
                                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2 px-1">
                                    Acceso completo
                                </p>
                                <div className="space-y-1">
                                    {/* Owner */}
                                    {(() => {
                                        const ownerUser = allUsers.find((u) => u.id === ownerId)
                                        if (!ownerUser) return null
                                        return renderUserRow(ownerUser, {
                                            label: ownerUser.role === "admin" ? "Owner + Admin Global" : "Owner",
                                            color: "text-yellow-400",
                                            bgColor: "bg-gradient-to-br from-yellow-600 to-yellow-500",
                                            icon: Crown,
                                        })
                                    })()}

                                    {/* Global Admins (auto-access, not explicitly added as members) */}
                                    {globalAdmins.filter(a => a.id !== ownerId).map((admin) =>
                                        renderUserRow(admin, {
                                            label: "Admin Global",
                                            color: "text-quepia-purple",
                                            bgColor: "bg-gradient-to-br from-purple-700 to-purple-600",
                                            icon: ShieldCheck,
                                        })
                                    )}

                                    {/* Members with global admin role (show they have elevated access) */}
                                    {members
                                        .filter((m) => m.user?.role === "admin" && m.user_id !== ownerId)
                                        .map((member) =>
                                            renderUserRow(member.user, {
                                                label: "Admin Global",
                                                color: "text-quepia-purple",
                                                bgColor: "bg-gradient-to-br from-purple-700 to-purple-600",
                                                icon: ShieldCheck,
                                            })
                                        )}
                                </div>
                            </div>

                            {/* Section: Miembros del proyecto (non-admin members) */}
                            {(() => {
                                const projectMembers = members.filter((m) => m.user?.role !== "admin" && m.user_id !== ownerId)
                                if (projectMembers.length === 0 && globalAdmins.length === 0 && members.filter(m => m.user?.role === "admin").length === 0) {
                                    return (
                                        <div className="text-center py-6">
                                            <Users className="h-8 w-8 text-white/20 mx-auto mb-2" />
                                            <p className="text-sm text-white/40">No hay miembros adicionales</p>
                                            <p className="text-xs text-white/25 mt-1">Agrega usuarios para colaborar en este proyecto</p>
                                        </div>
                                    )
                                }

                                return (
                                    <div>
                                        <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2 px-1">
                                            Miembros del proyecto
                                        </p>
                                        <div className="space-y-1">
                                            {projectMembers.map((member) =>
                                                renderUserRow(member.user, {
                                                    label: "",
                                                    color: "text-quepia-cyan",
                                                    bgColor: "bg-gradient-to-br from-gray-700 to-gray-600",
                                                    icon: User,
                                                }, {
                                                    memberId: member.id,
                                                    memberRole: member.role,
                                                    editable: true,
                                                })
                                            )}
                                            {projectMembers.length === 0 && (
                                                <p className="text-xs text-white/25 px-3 py-2">Sin miembros adicionales</p>
                                            )}
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Info note */}
                            <div className="px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                                <p className="text-[11px] text-white/30 leading-relaxed">
                                    Los <span className="text-quepia-purple font-medium">Admins Globales</span> tienen acceso completo a todos los proyectos del sistema automaticamente. Los miembros del proyecto solo tienen acceso a este proyecto especifico.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
