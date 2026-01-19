'use client';

import React, { useState } from 'react';
import { Servicio } from '@/types/database';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowRight, Video, Camera, PenTool, Layout, Palette, Megaphone, Package, Layers } from 'lucide-react';
import Link from 'next/link';

// Icon mapping inside the client component
const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    Palette, Layout, Megaphone, Layers, PenTool, Video, Camera, Package,
};

interface ServicesGridProps {
    servicios: Servicio[];
}

export default function ServicesGrid({ servicios }: ServicesGridProps) {
    const [expandedService, setExpandedService] = useState<string | null>(null);

    const toggleService = (id: string) => {
        setExpandedService(expandedService === id ? null : id);
    };

    const getIcon = (iconName: string) => {
        const IconComponent = iconMap[iconName] || iconMap['Palette'];
        return IconComponent;
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {servicios.map((service) => {
                const IconComponent = getIcon(service.icono);
                return (
                    <motion.div
                        key={service.id}
                        layout
                        className="glass-card overflow-hidden"
                    >
                        <button
                            onClick={() => toggleService(service.id)}
                            className="w-full p-4 md:p-6 text-left flex items-start justify-between gap-3 md:gap-4"
                        >
                            <div className="flex items-start gap-3 md:gap-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white shrink-0">
                                    <IconComponent size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base md:text-lg font-bold text-white">
                                        {service.titulo}
                                    </h3>
                                    <p className="text-gray-400 text-xs md:text-sm mt-1">
                                        {service.descripcion_corta}
                                    </p>
                                </div>
                            </div>
                            <motion.div
                                animate={{ rotate: expandedService === service.id ? 180 : 0 }}
                                transition={{ duration: 0.3 }}
                                className="text-quepia-cyan shrink-0 mt-1"
                            >
                                <ChevronDown size={18} />
                            </motion.div>
                        </button>

                        <AnimatePresence>
                            {expandedService === service.id && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 md:px-6 pb-4 md:pb-6 pt-2 border-t border-white/5">
                                        <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
                                            {service.descripcion}
                                        </p>
                                        <Link
                                            href="/servicios"
                                            className="inline-flex items-center gap-2 text-quepia-cyan text-xs md:text-sm font-medium mt-3 md:mt-4 hover:underline"
                                        >
                                            Ver más <ArrowRight size={14} />
                                        </Link>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                );
            })}
        </div>
    );
}
