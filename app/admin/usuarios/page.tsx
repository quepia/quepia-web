'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AuthorizedUser } from '@/types/database';
import { Plus, Trash2, X, Loader2, Shield } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function UsuariosPage() {
    const [users, setUsers] = useState<AuthorizedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [newEmail, setNewEmail] = useState('');

    const fetchUsers = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('authorized_users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching users:', error);
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const supabase = createClient();
            const { error } = await supabase
                .from('authorized_users')
                .insert([{ email: newEmail }]);

            if (error) throw error;

            setModalOpen(false);
            setNewEmail('');
            fetchUsers();
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error al guardar. Verifica que el email no esté duplicado.');
        }
        setSaving(false);
    };

    const handleDelete = async (id: string) => {
        const supabase = createClient();
        const { error } = await supabase.from('authorized_users').delete().eq('id', id);

        if (error) {
            console.error('Error deleting:', error);
            alert('Error al eliminar');
        } else {
            setDeleteConfirm(null);
            fetchUsers();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-quepia-cyan" />
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Usuarios Autorizados</h1>
                    <p className="text-gray-400">Gestiona los correos electrónicos que tienen acceso a este panel de administración.</p>
                </div>
                <Button onClick={() => setModalOpen(true)}>
                    <Plus size={18} className="mr-2" /> Agregar Usuario
                </Button>
            </div>

            {/* Users List */}
            <div className="admin-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white/5 text-gray-400 text-sm">
                            <tr>
                                <th className="p-4">Email</th>
                                <th className="p-4">Fecha de Alta</th>
                                <th className="p-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 text-white flex items-center gap-3">
                                        <div className="p-2 bg-quepia-purple/20 rounded-lg text-quepia-cyan">
                                            <Shield size={16} />
                                        </div>
                                        {user.email}
                                    </td>
                                    <td className="p-4 text-gray-400 text-sm">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => setDeleteConfirm(user.id)}
                                            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                            title="Revocar acceso"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-gray-400">
                                        No hay usuarios registrados (esto es extraño si estás viendo esto).
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Add */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
                    <div className="bg-quepia-dark border border-white/10 rounded-2xl w-full max-w-md">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">Nuevo Usuario</h2>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Email Autorizado *</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="admin-input"
                                    placeholder="usuario@ejemplo.com"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Este usuario podrá iniciar sesión con Google inmediatamente.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1">
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={saving} className="flex-1">
                                    {saving ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
                                    Autorizar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
                    <div className="bg-quepia-dark border border-white/10 rounded-2xl p-6 max-w-sm">
                        <h3 className="text-lg font-bold text-white mb-2">¿Revocar acceso?</h3>
                        <p className="text-gray-400 text-sm mb-6">El usuario <b>{users.find(u => u.id === deleteConfirm)?.email}</b> dejará de tener acceso al panel de administración.</p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1">
                                Cancelar
                            </Button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full hover:bg-red-500/30 transition-colors"
                            >
                                Revocar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
