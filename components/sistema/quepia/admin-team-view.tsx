"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadImage, deleteImage } from '@/lib/storage';
import { Equipo, EquipoInsert } from '@/types/database';
import { Plus, Pencil, Trash2, X, Loader2, Instagram, Linkedin, Mail, Users, Upload } from 'lucide-react';
import Button from '@/components/ui/Button';
import Image from 'next/image';

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return 'Error desconocido';
}

export function AdminTeamView() {
    const [equipo, setEquipo] = useState<Equipo[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const uploadedInModalRef = useRef<Set<string>>(new Set());
    const deleteOnSaveRef = useRef<Set<string>>(new Set());

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

    const clearImageQueues = useCallback(() => {
        uploadedInModalRef.current.clear();
        deleteOnSaveRef.current.clear();
    }, []);

    const deleteStorageUrl = useCallback(async (url: string) => {
        const normalized = url.trim();
        if (!normalized) return;

        try {
            await deleteImage(normalized);
        } catch (error) {
            console.warn('No se pudo eliminar imagen de storage:', normalized, error);
        }
    }, []);

    const closeModalAndDiscardUploads = useCallback(() => {
        if (saving || uploadingImage) return;

        const uploadedInModal = [...uploadedInModalRef.current];
        clearImageQueues();
        setUploadError(null);
        setModalOpen(false);

        if (uploadedInModal.length > 0) {
            void Promise.all(uploadedInModal.map((url) => deleteStorageUrl(url)));
        }
    }, [clearImageQueues, deleteStorageUrl, saving, uploadingImage]);

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
        clearImageQueues();
        setUploadError(null);
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
        clearImageQueues();
        setUploadError(null);
        setEditingId(member.id);
        setModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const previousUrl = (form.imagen_url || '').trim();
        const previousWasUploadedInModal = previousUrl.length > 0 && uploadedInModalRef.current.has(previousUrl);

        if (!file.type.startsWith('image/')) {
            alert('Seleccioná un archivo de imagen válido.');
            e.target.value = '';
            return;
        }

        setUploadError(null);
        setUploadingImage(true);

        try {
            const uploadedUrl = await uploadImage(file, 'equipo');
            uploadedInModalRef.current.add(uploadedUrl);

            if (previousUrl && previousUrl !== uploadedUrl && !previousWasUploadedInModal) {
                deleteOnSaveRef.current.add(previousUrl);
            }

            setForm(prev => ({ ...prev, imagen_url: uploadedUrl }));
        } catch (error) {
            const message = getErrorMessage(error);
            setUploadError(message);
            alert(`Error al subir la imagen: ${message}`);
        } finally {
            setUploadingImage(false);
            e.target.value = '';
        }
    };

    const handleRemoveImage = () => {
        const currentUrl = (form.imagen_url || '').trim();
        if (!currentUrl) return;

        const uploadedInModal = uploadedInModalRef.current.has(currentUrl);
        if (!uploadedInModal) {
            deleteOnSaveRef.current.add(currentUrl);
        }

        setForm(prev => ({ ...prev, imagen_url: '' }));
        setUploadError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (uploadingImage) {
            alert('Esperá a que termine la subida de la imagen.');
            return;
        }

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

            const finalImageUrl = (form.imagen_url || '').trim();
            const uploadedInModal = [...uploadedInModalRef.current].filter((url) => url.trim() && url !== finalImageUrl);
            uploadedInModalRef.current.clear();

            if (uploadedInModal.length > 0) {
                await Promise.all(uploadedInModal.map((url) => deleteStorageUrl(url)));
            }

            const deleteOnSave = [...deleteOnSaveRef.current].filter((url) => url.trim() && url !== finalImageUrl);
            deleteOnSaveRef.current.clear();

            for (const url of deleteOnSave) {
                const { data: stillUsedRows, error: checkError } = await supabase
                    .from('equipo')
                    .select('id')
                    .eq('imagen_url', url)
                    .limit(1);

                if (checkError) {
                    console.warn('No se pudo verificar referencias de imagen en equipo:', checkError);
                    continue;
                }

                if ((stillUsedRows?.length ?? 0) > 0) {
                    continue;
                }

                await deleteStorageUrl(url);
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
        <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white p-4 sm:p-6 overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-quepia-purple/20 rounded-lg">
                        <Users className="h-6 w-6 text-quepia-purple" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Equipo</h1>
                        <p className="text-white/40 text-sm">Gestiona los miembros del equipo</p>
                    </div>
                </div>
                <Button onClick={openNewModal}>
                    <Plus size={18} className="mr-2" /> Nuevo Miembro
                </Button>
            </div>

            {/* Team Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {equipo.map(member => (
                    <div key={member.id} className="admin-card overflow-hidden group border border-white/[0.06] rounded-xl bg-[#1a1a1a]">
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
                    <div className="col-span-full admin-card p-8 text-center border border-white/[0.06] rounded-xl">
                        <p className="text-gray-400 mb-4">No hay miembros del equipo todavía</p>
                        <Button onClick={openNewModal} variant="outline">
                            Agregar primer miembro
                        </Button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                     <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModalAndDiscardUploads} />
                    <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-lg bg-[#1a1a1a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl p-4 sm:p-6 sm:max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingId ? 'Editar Miembro' : 'Nuevo Miembro'}
                            </h2>
                            <button onClick={closeModalAndDiscardUploads} disabled={saving || uploadingImage} className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Nombre *</label>
                                <input
                                    type="text"
                                    value={form.nombre}
                                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Rol/Cargo *</label>
                                <input
                                    type="text"
                                    value={form.rol}
                                    onChange={e => setForm({ ...form, rol: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
                                    placeholder="Ej: Co-Fundador & Director Creativo"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Biografía</label>
                                <textarea
                                    value={form.bio || ''}
                                    onChange={e => setForm({ ...form, bio: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors min-h-[100px]"
                                    rows={3}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Foto del miembro</label>
                                <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                    {form.imagen_url ? (
                                        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
                                            <Image
                                                src={form.imagen_url}
                                                alt={form.nombre || 'Preview del miembro'}
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] py-8 text-sm text-white/45">
                                            Sin foto cargada
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => imageInputRef.current?.click()}
                                            disabled={uploadingImage}
                                            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                                        >
                                            {uploadingImage ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Upload size={16} />
                                            )}
                                            {uploadingImage ? 'Subiendo...' : 'Subir foto'}
                                        </button>
                                        {form.imagen_url && (
                                            <button
                                                type="button"
                                                onClick={handleRemoveImage}
                                                disabled={uploadingImage}
                                                className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20 transition-colors"
                                            >
                                                Quitar foto
                                            </button>
                                        )}
                                    </div>

                                    <input
                                        ref={imageInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                    />

                                    {uploadError && (
                                        <p className="text-xs text-red-300">
                                            Error de subida: {uploadError}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">URL de Imagen (opcional)</label>
                                <input
                                    type="url"
                                    value={form.imagen_url || ''}
                                    onChange={e => setForm({ ...form, imagen_url: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
                                    placeholder="https://... (o subí un archivo arriba)"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Instagram</label>
                                    <input
                                        type="url"
                                        value={form.instagram || ''}
                                        onChange={e => setForm({ ...form, instagram: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
                                        placeholder="https://instagram.com/..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">LinkedIn</label>
                                    <input
                                        type="url"
                                        value={form.linkedin || ''}
                                        onChange={e => setForm({ ...form, linkedin: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
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
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
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
                                <Button type="button" variant="outline" onClick={closeModalAndDiscardUploads} disabled={saving || uploadingImage} className="flex-1">
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={saving || uploadingImage} className="flex-1">
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
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                     <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-sm bg-[#1a1a1a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl p-4 sm:p-6 shadow-2xl">
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
