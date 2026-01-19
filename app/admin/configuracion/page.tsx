'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Configuracion, CONFIG_CATEGORIES } from '@/types/database';
import { Save, Loader2, Check } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function ConfiguracionPage() {
    const [config, setConfig] = useState<Configuracion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);
    const [editedValues, setEditedValues] = useState<Record<string, string>>({});

    const fetchConfig = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('configuracion')
            .select('*')
            .order('categoria')
            .order('orden', { ascending: true });

        if (error) {
            console.error('Error fetching config:', error);
        } else {
            console.log('Fetched config data:', data); // Debug
            setConfig(data || []);
            // Initialize edited values
            const initial: Record<string, string> = {};
            data?.forEach(item => {
                initial[item.clave] = item.valor;
            });
            setEditedValues(initial);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleChange = (clave: string, valor: string) => {
        setEditedValues(prev => ({ ...prev, [clave]: valor }));
    };

    const handleSave = async (item: Configuracion) => {
        const newValue = editedValues[item.clave];
        if (newValue === item.valor) return;

        setSaving(item.clave);
        const supabase = createClient();

        const { error } = await supabase
            .from('configuracion')
            .update({ valor: newValue, fecha_actualizacion: new Date().toISOString() })
            .eq('id', item.id);

        if (error) {
            console.error('Error saving:', error);
            alert('Error al guardar');
        } else {
            setSaved(item.clave);
            setTimeout(() => setSaved(null), 2000);
            fetchConfig();
        }
        setSaving(null);
    };

    // Group items by category from types
    const groupedConfig: { id: string; label: string; items: Configuracion[] }[] = CONFIG_CATEGORIES.map(cat => ({
        ...cat,
        items: config.filter(c => c.categoria === cat.id)
    })).filter(cat => cat.items.length > 0);

    // Add items that don't match any category
    const uncategorized = config.filter(c => !CONFIG_CATEGORIES.some(cat => cat.id === c.categoria));
    if (uncategorized.length > 0) {
        groupedConfig.push({
            id: 'otros',
            label: 'Otros / Sin Categoría',
            items: uncategorized
        });
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-quepia-cyan" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    Configuración del Sitio
                </h1>
                <p className="text-gray-400">
                    Gestiona la información de contacto, horarios, redes sociales y textos del sitio
                </p>
            </div>

            <div className="space-y-8">
                {groupedConfig.map(category => (
                    <div key={category.id} className="admin-card p-6">
                        <h2 className="text-lg font-bold text-white mb-6 pb-3 border-b border-white/10">
                            {category.label}
                        </h2>

                        <div className="space-y-4">
                            {category.items.map(item => (
                                <div key={item.id} className="flex flex-col md:flex-row md:items-start gap-3">
                                    <div className="md:w-1/3">
                                        <label className="block text-sm font-medium text-white">
                                            {item.clave.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                        </label>
                                        {item.descripcion && (
                                            <p className="text-xs text-gray-500 mt-1">{item.descripcion}</p>
                                        )}
                                    </div>

                                    <div className="flex-1 flex gap-2">
                                        {item.tipo === 'textarea' ? (
                                            <textarea
                                                value={editedValues[item.clave] || ''}
                                                onChange={(e) => handleChange(item.clave, e.target.value)}
                                                className="admin-input flex-1 min-h-[80px]"
                                                rows={3}
                                            />
                                        ) : (
                                            <input
                                                type={item.tipo === 'email' ? 'email' : item.tipo === 'url' ? 'url' : 'text'}
                                                value={editedValues[item.clave] || ''}
                                                onChange={(e) => handleChange(item.clave, e.target.value)}
                                                className="admin-input flex-1"
                                                placeholder={item.tipo === 'url' ? 'https://...' : ''}
                                            />
                                        )}

                                        <button
                                            onClick={() => handleSave(item)}
                                            disabled={saving === item.clave || editedValues[item.clave] === item.valor}
                                            className={`px-3 py-2 rounded-lg transition-all shrink-0 ${saved === item.clave
                                                ? 'bg-green-500/20 text-green-400'
                                                : editedValues[item.clave] !== item.valor
                                                    ? 'bg-quepia-cyan/20 text-quepia-cyan hover:bg-quepia-cyan/30'
                                                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                                }`}
                                        >
                                            {saving === item.clave ? (
                                                <Loader2 size={18} className="animate-spin" />
                                            ) : saved === item.clave ? (
                                                <Check size={18} />
                                            ) : (
                                                <Save size={18} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {config.length === 0 && (
                    <div className="admin-card p-8 text-center">
                        <p className="text-gray-400 mb-4">
                            No hay configuración cargada todavía.
                        </p>
                        <p className="text-sm text-gray-500">
                            Ejecuta el archivo <code className="text-quepia-cyan">supabase-config.sql</code> en tu base de datos.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
