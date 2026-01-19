'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Servicio, ServicioInsert, SERVICE_ICONS, CATEGORIES } from '@/types/database';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import * as Icons from 'lucide-react';

function ServiciosContent() {
    const searchParams = useSearchParams();
    const [servicios, setServicios] = useState<Servicio[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState<ServicioInsert>({
        titulo: '',
        descripcion_corta: '',
        descripcion: '',
        icono: 'Palette',
        categoria_trabajo: null,
        features: [],
        orden: 0,
    });
    const [featuresText, setFeaturesText] = useState('');

    const fetchServicios = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('servicios')
            .select('*')
            .order('orden', { ascending: true });

        if (error) {
            console.error('Error fetching servicios:', error);
        } else {
            setServicios(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchServicios();
    }, [fetchServicios]);

    // Open modal if action=new in URL
    useEffect(() => {
        if (searchParams.get('action') === 'new') {
            setModalOpen(true);
        }
    }, [searchParams]);

    const resetForm = () => {
        setForm({
            titulo: '',
            descripcion_corta: '',
            descripcion: '',
            icono: 'Palette',
            categoria_trabajo: null,
            features: [],
            orden: 0,
        });
        setFeaturesText('');
        setEditingId(null);
    };

    const openNewModal = () => {
        resetForm();
        setModalOpen(true);
    };

    const openEditModal = (servicio: Servicio) => {
        setForm({
            titulo: servicio.titulo,
            descripcion_corta: servicio.descripcion_corta,
            descripcion: servicio.descripcion,
            icono: servicio.icono,
            categoria_trabajo: servicio.categoria_trabajo,
            features: servicio.features,
            orden: servicio.orden,
        });
        setFeaturesText(servicio.features.join('\n'));
        setEditingId(servicio.id);
        setModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const supabase = createClient();
            const features = featuresText
                .split('\n')
                .map(f => f.trim())
                .filter(f => f.length > 0);

            const data = {
                ...form,
                features,
            };

            if (editingId) {
                const { error } = await supabase
                    .from('servicios')
                    .update(data)
                    .eq('id', editingId);

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('servicios')
                    .insert(data);

                if (error) throw error;
            }

            await fetchServicios();
            setModalOpen(false);
            resetForm();
        } catch (error) {
            console.error('Error saving servicio:', error);
            alert('Error al guardar el servicio');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const supabase = createClient();

            const { error } = await supabase
                .from('servicios')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await fetchServicios();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting servicio:', error);
            alert('Error al eliminar el servicio');
        }
    };

    const getIcon = (iconName: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const IconComponent = (Icons as any)[iconName];
        return IconComponent ? <IconComponent size={20} /> : null;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-quepia-cyan" />
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Servicios</h1>
                    <p className="text-gray-400">Gestiona los servicios que ofrece Quepia</p>
                </div>
                <Button onClick={openNewModal} className="flex items-center gap-2">
                    <Plus size={20} />
                    Nuevo Servicio
                </Button>
            </div>

            {/* Grid */}
            {servicios.length === 0 ? (
                <div className="admin-card p-12 text-center">
                    <p className="text-gray-400 mb-4">No hay servicios todavía</p>
                    <Button onClick={openNewModal} variant="outline">
                        Crear primer servicio
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servicios.map((servicio) => (
                        <div key={servicio.id} className="admin-card p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
                                    {getIcon(servicio.icono)}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(servicio)}
                                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(servicio.id)}
                                        className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-1">{servicio.titulo}</h3>
                            <p className="text-gray-400 text-sm line-clamp-2">{servicio.descripcion_corta}</p>
                            {servicio.features.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1">
                                    {servicio.features.slice(0, 3).map((f, i) => (
                                        <span key={i} className="px-2 py-0.5 text-xs bg-white/5 rounded-full text-gray-400">
                                            {f}
                                        </span>
                                    ))}
                                    {servicio.features.length > 3 && (
                                        <span className="px-2 py-0.5 text-xs bg-white/5 rounded-full text-gray-400">
                                            +{servicio.features.length - 3}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4">
                    <div className="w-full max-w-lg admin-card p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingId ? 'Editar Servicio' : 'Nuevo Servicio'}
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
                                    className="admin-input"
                                    placeholder="Nombre del servicio"
                                />
                            </div>

                            {/* Descripción Corta */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Descripción Corta *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.descripcion_corta}
                                    onChange={(e) => setForm({ ...form, descripcion_corta: e.target.value })}
                                    className="admin-input"
                                    placeholder="Breve descripción"
                                />
                            </div>

                            {/* Icono */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Icono
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {SERVICE_ICONS.map((iconName) => (
                                        <button
                                            key={iconName}
                                            type="button"
                                            onClick={() => setForm({ ...form, icono: iconName })}
                                            className={`p-3 rounded-lg flex items-center justify-center transition-all ${form.icono === iconName
                                                ? 'bg-gradient-to-br from-quepia-purple to-quepia-cyan text-white'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            {getIcon(iconName)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Categoría de Trabajo */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Categoría de Trabajo (para enlace)
                                </label>
                                <select
                                    value={form.categoria_trabajo || ''}
                                    onChange={(e) => setForm({ ...form, categoria_trabajo: e.target.value || null })}
                                    className="admin-input"
                                >
                                    <option value="">Sin enlace</option>
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Descripción */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Descripción Completa *
                                </label>
                                <textarea
                                    required
                                    value={form.descripcion}
                                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                                    className="admin-input min-h-[100px]"
                                    placeholder="Descripción detallada del servicio"
                                />
                            </div>

                            {/* Features */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Características (una por línea)
                                </label>
                                <textarea
                                    value={featuresText}
                                    onChange={(e) => setFeaturesText(e.target.value)}
                                    className="admin-input min-h-[100px]"
                                    placeholder="Diseño de logotipos&#10;Material impreso&#10;Diseño editorial"
                                />
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
                                    className="admin-input"
                                    placeholder="0"
                                />
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
                <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4">
                    <div className="w-full max-w-sm admin-card p-6">
                        <h3 className="text-xl font-bold text-white mb-2">¿Eliminar servicio?</h3>
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
                                className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/30 transition-colors font-medium"
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

export default function ServiciosPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-quepia-cyan" />
            </div>
        }>
            <ServiciosContent />
        </Suspense>
    );
}
