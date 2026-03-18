"use client"

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadImage, deleteImage } from '@/lib/storage';
import { Proyecto, ProyectoInsert, CATEGORIES } from '@/types/database';
import { Plus, Pencil, Trash2, X, Upload, Star, StarOff, Loader2, FolderOpen } from 'lucide-react';
import Button from '@/components/ui/Button';
import Image from 'next/image';

export function AdminProjectsView() {
    const [proyectos, setProyectos] = useState<Proyecto[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState<ProyectoInsert>({
        titulo: '',
        descripcion: '',
        categoria: 'branding',
        imagen_url: '',
        destacado: false,
        orden: 0,
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const fetchProyectos = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('proyectos')
            .select('*')
            .order('orden', { ascending: true })
            .order('fecha_creacion', { ascending: false });

        if (error) {
            console.error('Error fetching proyectos:', error);
        } else {
            setProyectos(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchProyectos();
    }, [fetchProyectos]);

    const resetForm = () => {
        setForm({
            titulo: '',
            descripcion: '',
            categoria: 'branding',
            imagen_url: '',
            destacado: false,
            orden: 0,
        });
        setImageFile(null);
        setImagePreview(null);
        setEditingId(null);
    };

    const openNewModal = () => {
        resetForm();
        setModalOpen(true);
    };

    const openEditModal = (proyecto: Proyecto) => {
        setForm({
            titulo: proyecto.titulo,
            descripcion: proyecto.descripcion || '',
            categoria: proyecto.categoria,
            imagen_url: proyecto.imagen_url || '',
            destacado: proyecto.destacado,
            orden: proyecto.orden,
        });
        setImagePreview(proyecto.imagen_url);
        setEditingId(proyecto.id);
        setModalOpen(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const supabase = createClient();
            let imageUrl = form.imagen_url;

            // Upload new image if selected
            if (imageFile) {
                imageUrl = await uploadImage(imageFile, 'proyectos');
            }

            const data = {
                ...form,
                imagen_url: imageUrl,
            };

            if (editingId) {
                // Update existing
                const { error } = await supabase
                    .from('proyectos')
                    .update(data)
                    .eq('id', editingId);

                if (error) throw error;
            } else {
                // Create new
                const { error } = await supabase
                    .from('proyectos')
                    .insert(data);

                if (error) throw error;
            }

            await fetchProyectos();
            setModalOpen(false);
            resetForm();
        } catch (error) {
            console.error('Error saving proyecto:', error);
            alert('Error al guardar el proyecto');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const supabase = createClient();
            const proyecto = proyectos.find(p => p.id === id);

            // Delete image from storage if exists
            if (proyecto?.imagen_url) {
                try {
                    await deleteImage(proyecto.imagen_url);
                } catch (e) {
                    console.warn('Could not delete image:', e);
                }
            }

            const { error } = await supabase
                .from('proyectos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await fetchProyectos();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting proyecto:', error);
            alert('Error al eliminar el proyecto');
        }
    };

    const toggleDestacado = async (proyecto: Proyecto) => {
        const supabase = createClient();
        const { error } = await supabase
            .from('proyectos')
            .update({ destacado: !proyecto.destacado })
            .eq('id', proyecto.id);

        if (!error) {
            fetchProyectos();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-quepia-cyan" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white p-4 sm:p-6 overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-quepia-purple/20 rounded-lg">
                        <FolderOpen className="h-6 w-6 text-quepia-purple" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Proyectos (Portfolio)</h1>
                        <p className="text-white/40 text-sm">Gestiona los proyectos visibles en la web pública</p>
                    </div>
                </div>
                <Button onClick={openNewModal} className="flex items-center gap-2">
                    <Plus size={20} />
                    Nuevo Proyecto
                </Button>
            </div>

            {/* Table */}
            {proyectos.length === 0 ? (
                <div className="admin-card p-12 text-center border border-white/[0.06] rounded-xl">
                    <p className="text-gray-400 mb-4">No hay proyectos todavía</p>
                    <Button onClick={openNewModal} variant="outline">
                        Crear primer proyecto
                    </Button>
                </div>
            ) : (
                <div className="admin-card overflow-x-auto border border-white/[0.06] rounded-xl">
                    <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="bg-white/[0.02] border-b border-white/[0.06]">
                            <tr>
                                <th className="px-6 py-4 font-medium text-white/40">Imagen</th>
                                <th className="px-6 py-4 font-medium text-white/40">Título</th>
                                <th className="px-6 py-4 font-medium text-white/40">Categoría</th>
                                <th className="px-6 py-4 font-medium text-white/40">Destacado</th>
                                <th className="px-6 py-4 font-medium text-white/40">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                            {proyectos.map((proyecto) => (
                                <tr key={proyecto.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        {proyecto.imagen_url ? (
                                            <div className="w-16 h-12 rounded-lg overflow-hidden bg-white/5 relative">
                                                <Image
                                                    src={proyecto.imagen_url}
                                                    alt={proyecto.titulo}
                                                    fill
                                                    className="object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-16 h-12 rounded-lg bg-white/5 flex items-center justify-center text-gray-500 text-xs">
                                                Sin img
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-white font-medium">{proyecto.titulo}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-3 py-1 rounded-full bg-white/10 text-xs text-gray-300">
                                            {CATEGORIES.find(c => c.id === proyecto.categoria)?.label || proyecto.categoria}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => toggleDestacado(proyecto)}
                                            className={`p-2 rounded-lg transition-colors ${proyecto.destacado
                                                    ? 'bg-yellow-500/20 text-yellow-400'
                                                    : 'bg-white/5 text-gray-500 hover:text-yellow-400'
                                                }`}
                                        >
                                            {proyecto.destacado ? <Star size={18} /> : <StarOff size={18} />}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openEditModal(proyecto)}
                                                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(proyecto.id)}
                                                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
                    <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-lg bg-[#1a1a1a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl p-4 sm:p-6 sm:max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingId ? 'Editar Proyecto' : 'Nuevo Proyecto'}
                            </h2>
                            <button
                                onClick={() => { setModalOpen(false); resetForm(); }}
                                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Título */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Título *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.titulo}
                                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors"
                                    placeholder="Nombre del proyecto"
                                />
                            </div>

                            {/* Categoría */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Categoría *
                                </label>
                                <select
                                    required
                                    value={form.categoria}
                                    onChange={(e) => setForm({ ...form, categoria: e.target.value as ProyectoInsert['categoria'] })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-quepia-cyan transition-colors"
                                >
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat.id} value={cat.id} className="bg-[#1a1a1a]">
                                            {cat.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Descripción */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Descripción
                                </label>
                                <textarea
                                    value={form.descripcion || ''}
                                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-quepia-cyan transition-colors min-h-[100px]"
                                    placeholder="Descripción del proyecto"
                                />
                            </div>

                            {/* Imagen */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Imagen
                                </label>
                                <div className="space-y-3">
                                    {imagePreview && (
                                        <div className="relative w-full h-40 rounded-lg overflow-hidden bg-white/5">
                                            <Image
                                                src={imagePreview}
                                                alt="Preview"
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    )}
                                    <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-quepia-cyan/50 transition-colors">
                                        <Upload size={20} className="text-gray-400" />
                                        <span className="text-gray-400">
                                            {imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Orden */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Orden
                                </label>
                                <input
                                    type="number"
                                    value={form.orden}
                                    onChange={(e) => setForm({ ...form, orden: parseInt(e.target.value) || 0 })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-quepia-cyan transition-colors"
                                    placeholder="0"
                                />
                            </div>

                            {/* Destacado */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="destacado"
                                    checked={form.destacado}
                                    onChange={(e) => setForm({ ...form, destacado: e.target.checked })}
                                    className="w-5 h-5 rounded border-white/20 bg-black text-quepia-cyan focus:ring-quepia-cyan"
                                />
                                <label htmlFor="destacado" className="text-gray-300">
                                    Mostrar en página principal
                                </label>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setModalOpen(false); resetForm(); }}
                                    className="flex-1"
                                >
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={saving} className="flex-1">
                                    {saving ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin mr-2" />
                                            Guardando...
                                        </>
                                    ) : (
                                        'Guardar'
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                     <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-sm bg-[#1a1a1a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl p-4 sm:p-6 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-2">¿Eliminar proyecto?</h3>
                        <p className="text-gray-400 mb-6">Esta acción no se puede deshacer.</p>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1"
                            >
                                Cancelar
                            </Button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors font-medium border border-red-500/30"
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
