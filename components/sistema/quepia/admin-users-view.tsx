"use client"

import { useState } from "react"
import { Users, Search, Shield, ShieldAlert, Check, Trash2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { SistemaUser } from "@/types/sistema"
import { Loader2 } from "lucide-react"

interface AdminUsersViewProps {
    users: SistemaUser[]
    currentUserId?: string
    onRefresh: () => void
}

export function AdminUsersView({ users, currentUserId, onRefresh }: AdminUsersViewProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [userToDelete, setUserToDelete] = useState<SistemaUser | null>(null)
    const [newName, setNewName] = useState("")
    const [newEmail, setNewEmail] = useState("")
    const [newRole, setNewRole] = useState<'admin' | 'user' | 'manager'>("user")
    const [isCreating, setIsCreating] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const filteredUsers = users.filter(user =>
        user.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleRoleChange = async (targetUserId: string, newRole: 'admin' | 'user' | 'manager') => {
        if (!currentUserId) return

        // Don't allow changing own role
        if (targetUserId === currentUserId) return

        setUpdatingIds(prev => new Set(prev).add(targetUserId))

        try {
            const res = await fetch('/api/sistema-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-role',
                    userId: currentUserId,
                    targetUserId,
                    newRole
                })
            })

            if (!res.ok) {
                const data = await res.json()
                alert(data.error || 'Error updating role')
            } else {
                onRefresh()
            }
        } catch (err) {
            console.error(err)
            alert('Error updating role')
        } finally {
            setUpdatingIds(prev => {
                const next = new Set(prev)
                next.delete(targetUserId)
                return next
            })
        }
    }

    const handleCreateUser = async () => {
        if (!newName.trim() || !newEmail.trim() || !currentUserId) return

        setIsCreating(true)
        try {
            const res = await fetch('/api/sistema-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create-user',
                    userId: currentUserId,
                    email: newEmail.trim(),
                    nombre: newName.trim(),
                    role: newRole
                })
            })

            const data = await res.json()

            if (!res.ok) {
                alert(data.error || 'Error creating user')
            } else {
                setIsCreateModalOpen(false)
                setNewName("")
                setNewEmail("")
                setNewRole("user")
                onRefresh()
            }
        } catch (err) {
            console.error(err)
            alert('Error creating user')
        } finally {
            setIsCreating(false)
        }
    }

    const handleDeleteClick = (user: SistemaUser) => {
        setUserToDelete(user)
        setIsDeleteModalOpen(true)
    }

    const handleConfirmDelete = async () => {
        if (!userToDelete || !currentUserId) return

        setIsDeleting(true)
        try {
            const res = await fetch('/api/sistema-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete-user',
                    userId: currentUserId,
                    targetUserId: userToDelete.id
                })
            })

            const data = await res.json()

            if (!res.ok) {
                alert(data.error || 'Error deleting user')
            } else {
                setIsDeleteModalOpen(false)
                setUserToDelete(null)
                onRefresh()
            }
        } catch (err) {
            console.error(err)
            alert('Error deleting user')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-white/[0.06]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-quepia-purple/20 rounded-lg">
                            <Shield className="h-6 w-6 text-quepia-purple" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">Gestión de Usuarios</h1>
                            <p className="text-white/40 text-sm">Administra los roles y permisos del equipo</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                            <input
                                type="text"
                                placeholder="Buscar usuarios..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-quepia-purple/50 transition-colors w-full sm:w-64"
                            />
                        </div>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-quepia-purple hover:bg-quepia-purple/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
                        >
                            Agregar Usuario
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-4 sm:p-6">
                <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="bg-white/[0.02] border-b border-white/[0.06]">
                            <tr>
                                <th className="px-6 py-4 font-medium text-white/40">Usuario</th>
                                <th className="px-6 py-4 font-medium text-white/40">Email</th>
                                <th className="px-6 py-4 font-medium text-white/40">Rol</th>
                                <th className="px-6 py-4 font-medium text-white/40">Fecha de Registro</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                            {filteredUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {user.avatar_url ? (
                                                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-xs font-medium">
                                                    {user.nombre.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="font-medium text-white/90">{user.nombre}</span>
                                            {user.id === currentUserId && (
                                                <span className="text-[10px] bg-white/[0.1] px-2 py-0.5 rounded-full text-white/50">Tú</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-white/60">{user.email}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {updatingIds.has(user.id) ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                                            ) : (
                                                <select
                                                    value={user.role || 'user'}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value as any)}
                                                    disabled={user.id === currentUserId}
                                                    className={cn(
                                                        "bg-transparent border border-white/[0.1] rounded px-2 py-1 outline-none text-xs font-medium transition-colors cursor-pointer",
                                                        user.role === 'admin'
                                                            ? "text-quepia-purple border-quepia-purple/30 bg-quepia-purple/5"
                                                            : "text-white/60 hover:text-white hover:border-white/20"
                                                    )}
                                                >
                                                    <option value="user" className="bg-[#1a1a1a] text-white">Miembro</option>
                                                    <option value="admin" className="bg-[#1a1a1a] text-quepia-purple">Admin</option>
                                                    <option value="manager" className="bg-[#1a1a1a] text-quepia-cyan">Manager</option>
                                                </select>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-white/40 tabular-nums">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {user.id !== currentUserId && (
                                            <button
                                                onClick={() => handleDeleteClick(user)}
                                                className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create User Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsCreateModalOpen(false)}
                    />
                    <div className="relative bg-[#1a1a1a] w-full h-[100svh] sm:h-auto sm:max-w-md p-4 sm:p-6 border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-6">Agregar Usuario</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Ej: Juan Pérez"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-purple transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="ejemplo@quepia.com"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-purple transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Rol Inicial
                                </label>
                                <div className="flex gap-2">
                                    {(['user', 'manager', 'admin'] as const).map((role) => (
                                        <button
                                            key={role}
                                            onClick={() => setNewRole(role)}
                                            className={cn(
                                                "flex-1 px-3 py-2 rounded-lg text-sm border transition-colors capitalize",
                                                newRole === role
                                                    ? "bg-quepia-purple/20 border-quepia-purple text-quepia-purple"
                                                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                            )}
                                        >
                                            {role === 'user' ? 'Miembro' : role}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleCreateUser}
                                disabled={!newName.trim() || !newEmail.trim() || isCreating}
                                className="w-full mt-2 px-4 py-3 bg-quepia-purple text-white font-medium rounded-lg hover:bg-quepia-purple/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isCreating ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    "Crear e Invitar"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && userToDelete && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsDeleteModalOpen(false)}
                    />
                    <div className="relative bg-[#1a1a1a] w-full h-[100svh] sm:h-auto sm:max-w-sm p-4 sm:p-6 border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="h-6 w-6 text-red-500" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">¿Eliminar Usuario?</h2>
                            <p className="text-white/60 text-sm">
                                ¿Estás seguro que deseas eliminar a <span className="text-white font-medium">{userToDelete.nombre}</span>?
                                <br />Esta acción no se puede deshacer.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center"
                            >
                                {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    "Eliminar"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
