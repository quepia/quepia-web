"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadImage, deleteImage } from '@/lib/storage';
import { Proyecto, ProyectoInsert, CATEGORIES, WorkCategory } from '@/types/database';
import { Plus, Pencil, Trash2, X, Star, StarOff, Loader2, FolderOpen, ImagePlus } from 'lucide-react';
import { getProjectCoverImage, getProjectGalleryImages } from '@/lib/project-images';
import { getCategoryLabel, getProjectCategories, normalizeWorkCategories } from '@/lib/project-categories';
import Button from '@/components/ui/Button';
import Image from 'next/image';

interface PendingImage {
    id: string;
    file: File;
    previewUrl: string;
}

const DEFAULT_PROJECT_CATEGORY: WorkCategory = CATEGORIES[0]?.id ?? 'branding';

const INITIAL_FORM: ProyectoInsert = {
    titulo: '',
    descripcion: '',
    categoria: DEFAULT_PROJECT_CATEGORY,
    categorias: [DEFAULT_PROJECT_CATEGORY],
    imagen_url: '',
    galeria_urls: [],
    destacado: false,
    orden: 0,
};
const MAX_GALLERY_IMAGES = 15;
const MAX_PARALLEL_UPLOADS = 4;

function dedupeUrls(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((value) => value?.trim() ?? '').filter((value) => value.length > 0))];
}

function ensureProjectCategories(values: Array<string | null | undefined>): WorkCategory[] {
    const normalized = normalizeWorkCategories(values);
    return normalized.length > 0 ? normalized : [DEFAULT_PROJECT_CATEGORY];
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return 'Error desconocido';
}

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (items.length === 0) return [];

    const limit = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const runners = Array.from({ length: limit }, async () => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= items.length) break;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(runners);
    return results;
}

export function AdminProjectsView() {
    const [proyectos, setProyectos] = useState<Proyecto[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState<ProyectoInsert>(INITIAL_FORM);
    const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
    const previewUrlsRef = useRef<Set<string>>(new Set());

    const rememberPreviewUrl = useCallback((previewUrl: string) => {
        previewUrlsRef.current.add(previewUrl);
    }, []);

    const revokePreviewUrl = useCallback((previewUrl: string) => {
        URL.revokeObjectURL(previewUrl);
        previewUrlsRef.current.delete(previewUrl);
    }, []);

    const clearPendingImages = useCallback(() => {
        setPendingImages((current) => {
            current.forEach((item) => revokePreviewUrl(item.previewUrl));
            return [];
        });
    }, [revokePreviewUrl]);

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

    useEffect(() => {
        const previewUrls = previewUrlsRef.current;
        return () => {
            previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
            previewUrls.clear();
        };
    }, []);

    const resetForm = useCallback(() => {
        setForm({ ...INITIAL_FORM, categorias: [...(INITIAL_FORM.categorias ?? [])] });
        clearPendingImages();
        setEditingId(null);
    }, [clearPendingImages]);

    const openNewModal = () => {
        resetForm();
        setModalOpen(true);
    };

    const openEditModal = (proyecto: Proyecto) => {
        const gallery = getProjectGalleryImages(proyecto);
        const selectedCategories = ensureProjectCategories([proyecto.categoria, ...(proyecto.categorias ?? [])]);
        setForm({
            titulo: proyecto.titulo,
            descripcion: proyecto.descripcion || '',
            categoria: selectedCategories[0],
            categorias: selectedCategories,
            imagen_url: gallery[0] ?? proyecto.imagen_url ?? '',
            galeria_urls: gallery,
            destacado: proyecto.destacado,
            orden: proyecto.orden,
        });
        clearPendingImages();
        setEditingId(proyecto.id);
        setModalOpen(true);
    };

    const updateExistingGallery = useCallback((galleryUrls: string[]) => {
        setForm((current) => ({
            ...current,
            galeria_urls: galleryUrls,
            imagen_url: galleryUrls[0] ?? '',
        }));
    }, []);

    const existingGallery = useMemo(() => dedupeUrls(form.galeria_urls ?? []), [form.galeria_urls]);
    const selectedFormCategories = useMemo(
        () => ensureProjectCategories([form.categoria, ...(form.categorias ?? [])]),
        [form.categoria, form.categorias]
    );

    const toggleCategorySelection = useCallback((categoryId: WorkCategory) => {
        setForm((current) => {
            const currentCategories = ensureProjectCategories([current.categoria, ...(current.categorias ?? [])]);
            const nextCategories = currentCategories.includes(categoryId)
                ? (currentCategories.length === 1
                    ? currentCategories
                    : currentCategories.filter((currentCategory) => currentCategory !== categoryId))
                : [...currentCategories, categoryId];

            return {
                ...current,
                categoria: nextCategories[0],
                categorias: nextCategories,
            };
        });
    }, []);

    const setPrimaryCategory = useCallback((categoryId: WorkCategory) => {
        setForm((current) => {
            const currentCategories = ensureProjectCategories([current.categoria, ...(current.categorias ?? [])]);
            if (!currentCategories.includes(categoryId)) {
                return current;
            }

            const nextCategories = [categoryId, ...currentCategories.filter((currentCategory) => currentCategory !== categoryId)];
            return {
                ...current,
                categoria: nextCategories[0],
                categorias: nextCategories,
            };
        });
    }, []);

    const removeExistingGalleryImage = (indexToRemove: number) => {
        updateExistingGallery(existingGallery.filter((_, index) => index !== indexToRemove));
    };

    const setExistingImageAsCover = (indexToPromote: number) => {
        const selected = existingGallery[indexToPromote];
        if (!selected) return;
        updateExistingGallery([selected, ...existingGallery.filter((_, index) => index !== indexToPromote)]);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const currentlySelected = existingGallery.length + pendingImages.length;
        const availableSlots = Math.max(0, MAX_GALLERY_IMAGES - currentlySelected);

        if (availableSlots <= 0) {
            alert(`Máximo ${MAX_GALLERY_IMAGES} imágenes por proyecto.`);
            e.target.value = '';
            return;
        }

        const filesToAdd = files.slice(0, availableSlots);
        if (filesToAdd.length < files.length) {
            alert(`Solo se agregaron ${filesToAdd.length} imágenes para respetar el máximo de ${MAX_GALLERY_IMAGES}.`);
        }

        const nextItems = filesToAdd.map((file) => {
            const previewUrl = URL.createObjectURL(file);
            rememberPreviewUrl(previewUrl);
            return {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`,
                file,
                previewUrl,
            };
        });

        setPendingImages((current) => [...current, ...nextItems]);
        e.target.value = '';
    };

    const removePendingImage = (id: string) => {
        setPendingImages((current) => {
            const target = current.find((item) => item.id === id);
            if (target) {
                revokePreviewUrl(target.previewUrl);
            }
            return current.filter((item) => item.id !== id);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setUploadProgress({ done: 0, total: pendingImages.length });

        try {
            const supabase = createClient();
            const uploadedGalleryUrls = await mapWithConcurrency(
                pendingImages,
                MAX_PARALLEL_UPLOADS,
                async (item) => {
                    const imageUrl = await uploadImage(item.file, 'proyectos');
                    setUploadProgress((current) => ({ ...current, done: current.done + 1 }));
                    return imageUrl;
                }
            );

            const mergedGallery = dedupeUrls([...existingGallery, ...uploadedGalleryUrls]);
            const limitedGallery = mergedGallery.slice(0, MAX_GALLERY_IMAGES);
            const coverImage = limitedGallery[0] ?? null;

            const data = {
                ...form,
                categoria: selectedFormCategories[0],
                categorias: selectedFormCategories,
                descripcion: (form.descripcion || '').trim() || null,
                imagen_url: coverImage,
                galeria_urls: limitedGallery,
                orden: Number.isFinite(Number(form.orden)) ? Number(form.orden) : 0,
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
            alert(`Error al guardar el proyecto: ${getErrorMessage(error)}`);
        } finally {
            setUploadProgress({ done: 0, total: 0 });
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const supabase = createClient();
            const proyecto = proyectos.find((project) => project.id === id);

            if (proyecto) {
                const urlsToDelete = dedupeUrls([proyecto.imagen_url, ...getProjectGalleryImages(proyecto)]);
                for (const url of urlsToDelete) {
                    try {
                        await deleteImage(url);
                    } catch (err) {
                        console.warn('Could not delete image:', err);
                    }
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
                        <p className="text-white/40 text-sm">Gestiona los proyectos visibles en la web pública y sus galerías</p>
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
                    <table className="w-full min-w-[860px] text-left text-sm">
                        <thead className="bg-white/[0.02] border-b border-white/[0.06]">
                            <tr>
                                <th className="px-6 py-4 font-medium text-white/40">Imagen</th>
                                <th className="px-6 py-4 font-medium text-white/40">Título</th>
                                <th className="px-6 py-4 font-medium text-white/40">Categorías</th>
                                <th className="px-6 py-4 font-medium text-white/40">Fotos</th>
                                <th className="px-6 py-4 font-medium text-white/40">Destacado</th>
                                <th className="px-6 py-4 font-medium text-white/40">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                            {proyectos.map((proyecto) => {
                                const coverImage = getProjectCoverImage(proyecto);
                                const galleryCount = getProjectGalleryImages(proyecto).length;
                                const projectCategories = getProjectCategories(proyecto);

                                return (
                                    <tr key={proyecto.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            {coverImage ? (
                                                <div className="w-16 h-12 rounded-lg overflow-hidden bg-white/5 relative">
                                                    <Image
                                                        src={coverImage}
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
                                            <div className="flex flex-wrap gap-2">
                                                {projectCategories.map((categoryId, index) => (
                                                    <span
                                                        key={`${proyecto.id}-${categoryId}`}
                                                        className={`px-3 py-1 rounded-full text-xs ${index === 0
                                                            ? 'bg-quepia-cyan/15 text-quepia-cyan'
                                                            : 'bg-white/10 text-gray-300'
                                                            }`}
                                                    >
                                                        {getCategoryLabel(categoryId)}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-white/70">{galleryCount || 0}</td>
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
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
                    <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-2xl bg-[#1a1a1a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl p-4 sm:p-6 sm:max-h-[90vh] overflow-y-auto shadow-2xl">
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

                            {/* Categorías */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Categorías *
                                </label>
                                <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {CATEGORIES.map((cat) => {
                                            const isSelected = selectedFormCategories.includes(cat.id);

                                            return (
                                                <label
                                                    key={cat.id}
                                                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${isSelected
                                                        ? 'border-quepia-cyan/40 bg-quepia-cyan/10 text-white'
                                                        : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20'
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleCategorySelection(cat.id)}
                                                        className="h-4 w-4 rounded border-white/20 bg-black text-quepia-cyan focus:ring-quepia-cyan"
                                                    />
                                                    <span className="text-sm">{cat.label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {selectedFormCategories.map((categoryId, index) => (
                                            <button
                                                key={`selected-${categoryId}`}
                                                type="button"
                                                onClick={() => setPrimaryCategory(categoryId)}
                                                className={`rounded-full border px-3 py-1 text-xs transition-colors ${index === 0
                                                    ? 'border-quepia-cyan/40 bg-quepia-cyan/15 text-quepia-cyan'
                                                    : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white'
                                                    }`}
                                            >
                                                {getCategoryLabel(categoryId)}{index === 0 ? ' · Principal' : ''}
                                            </button>
                                        ))}
                                    </div>

                                    <p className="text-xs text-white/45">
                                        Podés asignar varias. La categoría principal se usa para destacados, enlaces y acentos visuales.
                                    </p>
                                </div>
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

                            {/* Galería */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Galería del proyecto
                                </label>
                                <div className="space-y-3">
                                    <p className="text-xs text-white/55">
                                        {existingGallery.length + pendingImages.length}/{MAX_GALLERY_IMAGES} imágenes
                                    </p>
                                    {existingGallery.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {existingGallery.map((imageUrl, index) => (
                                                <div key={`${imageUrl}-${index}`} className="relative rounded-lg overflow-hidden border border-white/10 bg-black/30">
                                                    <div className="relative aspect-[4/3]">
                                                        <Image
                                                            src={imageUrl}
                                                            alt={`Imagen ${index + 1}`}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                    <div className="p-2 flex items-center justify-between gap-2">
                                                        {index === 0 ? (
                                                            <span className="text-[10px] uppercase tracking-[0.16em] text-quepia-cyan">Portada</span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExistingImageAsCover(index)}
                                                                className="text-[10px] uppercase tracking-[0.16em] text-white/70 hover:text-white"
                                                            >
                                                                Usar portada
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => removeExistingGalleryImage(index)}
                                                            className="text-[10px] uppercase tracking-[0.16em] text-red-300 hover:text-red-200"
                                                        >
                                                            Quitar
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm text-white/45">
                                            Este proyecto todavía no tiene imágenes cargadas.
                                        </div>
                                    )}

                                    {pendingImages.length > 0 && (
                                        <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                                            <p className="text-xs uppercase tracking-[0.16em] text-white/55">Pendientes de subir</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {pendingImages.map((item) => (
                                                    <div key={item.id} className="relative rounded-lg overflow-hidden border border-white/10 bg-black/30">
                                                        <div className="relative aspect-[4/3]">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={item.previewUrl}
                                                                alt={item.file.name}
                                                                className="absolute inset-0 h-full w-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removePendingImage(item.id)}
                                                            className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-red-200 hover:text-red-100"
                                                            aria-label="Quitar imagen pendiente"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-quepia-cyan/50 transition-colors">
                                        <ImagePlus size={18} className="text-gray-400" />
                                        <span className="text-gray-400">
                                            Agregar imágenes
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                    </label>
                                    <p className="text-xs text-white/45">
                                        La primera imagen queda como portada en tarjetas y home.
                                    </p>
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
                                    onChange={(e) => setForm({ ...form, orden: parseInt(e.target.value, 10) || 0 })}
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
                                            {uploadProgress.total > 0
                                                ? `Subiendo ${uploadProgress.done}/${uploadProgress.total}...`
                                                : 'Guardando...'}
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
