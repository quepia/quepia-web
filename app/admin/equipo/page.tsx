'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Equipo, EquipoInsert } from '@/types/database';
import { Plus, Pencil, Trash2, X, Loader2, Instagram, Linkedin, Mail } from 'lucide-react';
import Button from '@/components/ui/Button';
import Image from 'next/image';

export default function EquipoPage() {
    const [equipo, setEquipo] = useState<Equipo[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const [form, setForm] = useState<EquipoInsert>({
        nombre: '',
        rol: '',
        bio: '',
        imagen_url: '',
        instagram: '',
        linkedin: '',
        email: '',
        orden: 0,
        activo: true,
    });

    const fetchEquipo = useCallback(async () => {
        const supabase = createClient();
        console.log('Fetching equipo...');
        const { data, error } = await supabase
            .from('equipo')
            .select('*')
            .order('orden', { ascending: true });

        if (error) {
            console.error('Error fetching equipo:', error);
        } else {
            console.log('Fetched equipo:', data);
            setEquipo(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchEquipo();
    }, [fetchEquipo]);

    const resetForm = () => {
        setForm({
            nombre: '',
            rol: '',
            bio: '',
            imagen_url: '',
            instagram: '',
            linkedin: '',
            email: '',
            orden: equipo.length,
            activo: true,
        });
        setEditingId(null);
    };

    const openNewModal = () => {
        resetForm();
        setModalOpen(true);
    };

    const openEditModal = (member: Equipo) => {
        setForm({
            nombre: member.nombre,
            rol: member.rol,
            bio: member.bio || '',
            imagen_url: member.imagen_url || '',
            instagram: member.instagram || '',
            linkedin: member.linkedin || '',
            email: member.email || '',
            orden: member.orden,
            activo: member.activo,
        });
        setEditingId(member.id);
        setModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const supabase = createClient();

            if (editingId) {
                const { error } = await supabase
                    .from('equipo')
                    .update(form)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('equipo')
                    .insert([form]);
                if (error) throw error;
            }

            setModalOpen(false);
            resetForm();
            fetchEquipo();
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error al guardar');
        }
        setSaving(false);
    };

    const handleDelete = async (id: string) => {
        const supabase = createClient();
        const { error } = await supabase.from('equipo').delete().eq('id', id);
        if (error) {
            console.error('Error deleting:', error);
        } else {
            setDeleteConfirm(null);
            fetchEquipo();
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
                    <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Equipo</h1>
                    <p className="text-gray-400">Gestiona los miembros del equipo que aparecen en "Sobre Nosotros"</p>
                </div>
                <Button onClick={openNewModal}>
                    <Plus size={18} className="mr-2" /> Nuevo Miembro
                </Button>
            </div>

            {/* Team Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {equipo.map(member => (
                    <div key={member.id} className="admin-card overflow-hidden group">
                        {/* Image */}
                        <div className="aspect-[4/3] relative bg-white/5">
                            {member.imagen_url ? (
                                <Image
                                    src={member.imagen_url}
                                    alt={member.nombre}
                                    fill
                                    className="object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600">
                                    Sin imagen
                                </div>
                            )}

                            {/* Actions overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                    onClick={() => openEditModal(member)}
                                    className="p-2 rounded-lg bg-white/20 hover:bg-quepia-cyan/30 text-white transition-colors"
                                >
                                    <Pencil size={18} />
                                </button>
                                <button
                                    onClick={() => setDeleteConfirm(member.id)}
                                    className="p-2 rounded-lg bg-white/20 hover:bg-red-500/30 text-white transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Info */}
                        <div className="p-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-white font-bold">{member.nombre}</h3>
                                    <p className="text-quepia-cyan text-sm">{member.rol}</p>
                                </div>
                                {!member.activo && (
                                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                                        Inactivo
                                    </span>
                                )}
                            </div>

                            {member.bio && (
                                <p className="text-gray-400 text-sm mt-2 line-clamp-2">{member.bio}</p>
                            )}

                            {/* Social links */}
                            <div className="flex gap-2 mt-3">
                                {member.instagram && (
                                    <a href={member.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-quepia-purple">
                                        <Instagram size={16} />
                                    </a>
                                )}
                                {member.linkedin && (
                                    <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-quepia-cyan">
                                        <Linkedin size={16} />
                                    </a>
                                )}
                                {member.email && (
                                    <a href={`mailto:${member.email}`} className="text-gray-500 hover:text-white">
                                        <Mail size={16} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {equipo.length === 0 && (
                    <div className="col-span-full admin-card p-8 text-center">
                        <p className="text-gray-400 mb-4">No hay miembros del equipo todavía</p>
                        <Button onClick={openNewModal} variant="outline">
                            Agregar primer miembro
                        </Button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
                    <div className="bg-quepia-dark border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">
                                {editingId ? 'Editar Miembro' : 'Nuevo Miembro'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Nombre *</label>
                                <input
                                    type="text"
                                    value={form.nombre}
                                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                                    className="admin-input"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Rol/Cargo *</label>
                                <input
                                    type="text"
                                    value={form.rol}
                                    onChange={e => setForm({ ...form, rol: e.target.value })}
                                    className="admin-input"
                                    placeholder="Ej: Co-Fundador & Director Creativo"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Biografía</label>
                                <textarea
                                    value={form.bio || ''}
                                    onChange={e => setForm({ ...form, bio: e.target.value })}
                                    className="admin-input min-h-[100px]"
                                    rows={3}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">URL de Imagen</label>
                                <input
                                    type="url"
                                    value={form.imagen_url || ''}
                                    onChange={e => setForm({ ...form, imagen_url: e.target.value })}
                                    className="admin-input"
                                    placeholder="https://..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Instagram</label>
                                    <input
                                        type="url"
                                        value={form.instagram || ''}
                                        onChange={e => setForm({ ...form, instagram: e.target.value })}
                                        className="admin-input"
                                        placeholder="https://instagram.com/..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">LinkedIn</label>
                                    <input
                                        type="url"
                                        value={form.linkedin || ''}
                                        onChange={e => setForm({ ...form, linkedin: e.target.value })}
                                        className="admin-input"
                                        placeholder="https://linkedin.com/in/..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                                <input
                                    type="email"
                                    value={form.email || ''}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    className="admin-input"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="activo"
                                    checked={form.activo}
                                    onChange={e => setForm({ ...form, activo: e.target.checked })}
                                    className="rounded"
                                />
                                <label htmlFor="activo" className="text-sm text-gray-300">
                                    Visible en el sitio
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="flex-1">
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={saving} className="flex-1">
                                    {saving ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
                                    {editingId ? 'Guardar cambios' : 'Crear miembro'}
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
                        <h3 className="text-lg font-bold text-white mb-2">¿Eliminar miembro?</h3>
                        <p className="text-gray-400 text-sm mb-6">Esta acción no se puede deshacer.</p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1">
                                Cancelar
                            </Button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full hover:bg-red-500/30 transition-colors"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
