"use client"

import { useState, useEffect, useCallback } from "react"
import { X, Users, Loader2, Trash2, UserPlus, Shield, ShieldCheck, Eye, User } from "lucide-react"
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

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
    owner: { label: "Owner", icon: ShieldCheck, color: "text-yellow-400" },
    admin: { label: "Admin", icon: Shield, color: "text-quepia-purple" },
    member: { label: "Miembro", icon: User, color: "text-quepia-cyan" },
    viewer: { label: "Viewer", icon: Eye, color: "text-white/50" },
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

    const memberUserIds = new Set(members.map((m) => m.user_id))
    const availableUsers = allUsers.filter(
        (u) => !memberUserIds.has(u.id) && u.id !== ownerId
    )

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-lg border border-white/10 flex flex-col max-h-[85vh]">
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
                    <div className="flex gap-2">
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-quepia-purple/50 transition-colors"
                        >
                            <option value="" className="bg-[#1a1a1a]">Seleccionar usuario...</option>
                            {availableUsers.map((u) => (
                                <option key={u.id} value={u.id} className="bg-[#1a1a1a]">
                                    {u.nombre} ({u.email})
                                </option>
                            ))}
                        </select>
                        <select
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value as any)}
                            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-quepia-purple/50 transition-colors"
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

                {/* Members List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-white/30" />
                        </div>
                    ) : (
                        <>
                            {/* Owner (always shown) */}
                            {(() => {
                                const ownerUser = allUsers.find((u) => u.id === ownerId)
                                if (!ownerUser) return null
                                return (
                                    <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/[0.02]">
                                        {ownerUser.avatar_url ? (
                                            <img src={ownerUser.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-600 to-yellow-500 flex items-center justify-center text-xs font-medium text-white">
                                                {ownerUser.nombre.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">
                                                {ownerUser.nombre}
                                                {ownerUser.id === currentUserId && (
                                                    <span className="ml-2 text-[10px] bg-white/[0.1] px-2 py-0.5 rounded-full text-white/50">Tu</span>
                                                )}
                                            </p>
                                            <p className="text-xs text-white/40 truncate">{ownerUser.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 text-xs font-medium text-yellow-400">
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                Owner
                                            </span>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Members */}
                            {members.map((member) => {
                                const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.member
                                const RoleIcon = config.icon
                                return (
                                    <div key={member.id} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/[0.02] transition-colors">
                                        {member.user?.avatar_url ? (
                                            <img src={member.user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-xs font-medium text-white">
                                                {member.user?.nombre?.charAt(0).toUpperCase() || "?"}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">
                                                {member.user?.nombre || "Usuario"}
                                                {member.user_id === currentUserId && (
                                                    <span className="ml-2 text-[10px] bg-white/[0.1] px-2 py-0.5 rounded-full text-white/50">Tu</span>
                                                )}
                                            </p>
                                            <p className="text-xs text-white/40 truncate">{member.user?.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {updatingIds.has(member.id) ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                                            ) : (
                                                <>
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                                                        className={cn(
                                                            "bg-transparent border border-white/[0.1] rounded px-2 py-1 outline-none text-xs font-medium transition-colors cursor-pointer",
                                                            config.color
                                                        )}
                                                    >
                                                        <option value="admin" className="bg-[#1a1a1a] text-white">Admin</option>
                                                        <option value="member" className="bg-[#1a1a1a] text-white">Miembro</option>
                                                        <option value="viewer" className="bg-[#1a1a1a] text-white">Viewer</option>
                                                    </select>
                                                    <button
                                                        onClick={() => handleRemoveMember(member.id)}
                                                        className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}

                            {members.length === 0 && (
                                <div className="text-center py-8">
                                    <Users className="h-8 w-8 text-white/20 mx-auto mb-2" />
                                    <p className="text-sm text-white/40">No hay miembros adicionales</p>
                                    <p className="text-xs text-white/25 mt-1">Agrega usuarios para colaborar en este proyecto</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
