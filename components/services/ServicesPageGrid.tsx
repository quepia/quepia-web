'use client';

import React, { useState } from 'react';
import { Servicio } from '@/types/database';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle, X, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { getServiceIconByName } from '@/lib/service-icons';

interface ServicesPageGridProps {
    servicios: Servicio[];
}

export default function ServicesPageGrid({ servicios }: ServicesPageGridProps) {
    const [selectedService, setSelectedService] = useState<Servicio | null>(null);

    const getIcon = (iconName: string) => {
        const IconComponent = getServiceIconByName(iconName);
        return IconComponent ? <IconComponent size={24} /> : null;
    };

    return (
        <>
            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
                {servicios.map((service, index) => (
                    <motion.button
                        key={service.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3) }}
                        onClick={() => setSelectedService(service)}
                        className="w-full text-left glass-card p-5 md:p-6 transition-all duration-300 group"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform">
                                {getIcon(service.icono)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg md:text-xl font-bold text-white mb-1 group-hover:text-quepia-cyan transition-colors">
                                    {service.titulo}
                                </h3>
                                <p className="text-gray-400 text-sm md:text-base line-clamp-2">
                                    {service.descripcion_corta}
                                </p>
                            </div>
                            <ArrowRight size={20} className="text-gray-500 group-hover:text-quepia-cyan group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Service Detail Modal */}
            <AnimatePresence>
                {selectedService && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md overflow-y-auto"
                        onClick={() => setSelectedService(null)}
                    >
                        <button
                            onClick={() => setSelectedService(null)}
                            className="fixed top-4 right-4 md:top-6 md:right-6 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10"
                            aria-label="Cerrar"
                        >
                            <X size={24} strokeWidth={2.5} />
                        </button>
                        <div className="min-h-screen flex items-center justify-center p-4 md:p-8 pt-16">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                transition={{ duration: 0.3 }}
                                className="w-full max-w-3xl glass-card p-6 md:p-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Icon and Title */}
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
                                        {getIcon(selectedService.icono)}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl md:text-4xl font-bold text-white">
                                            {selectedService.titulo}
                                        </h2>
                                        <p className="text-quepia-cyan text-sm md:text-base mt-1">
                                            {selectedService.descripcion_corta}
                                        </p>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-gray-300 text-base md:text-lg leading-relaxed mb-8">
                                    {selectedService.descripcion}
                                </p>

                                {/* Features */}
                                {selectedService.features && selectedService.features.length > 0 && (
                                    <div className="mb-8">
                                        <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">
                                            Lo que incluye
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {selectedService.features.map((feature, idx) => (
                                                <div key={idx} className="flex items-center gap-3 text-gray-300">
                                                    <CheckCircle size={18} className="text-quepia-cyan shrink-0" />
                                                    <span className="text-sm md:text-base">{feature}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* CTAs */}
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <Link href="/contacto" className="flex-1">
                                        <Button className="w-full justify-center">
                                            Cotizar servicio <ArrowRight size={18} className="ml-2" />
                                        </Button>
                                    </Link>
                                    {selectedService.categoria_trabajo && (
                                        <Link href={`/trabajos?category=${selectedService.categoria_trabajo}`} className="flex-1">
                                            <button className="w-full px-6 py-3 rounded-full bg-white/10 hover:bg-quepia-cyan/20 border border-white/20 hover:border-quepia-cyan text-white transition-all flex items-center justify-center gap-2">
                                                <ImageIcon size={18} />
                                                Ver trabajos
                                            </button>
                                        </Link>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
