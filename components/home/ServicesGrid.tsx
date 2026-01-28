'use client';

import React, { useState, useRef } from 'react';
import { Servicio } from '@/types/database';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface ServicesGridProps {
    servicios: Servicio[];
}

// Format number with leading zero
const formatNumber = (num: number): string => {
    return num.toString().padStart(2, '0');
};

// Individual service row - BASIC Agency inspired
function ServiceRow({
    service,
    index,
    isInView,
    isHovered,
    onHover,
    onLeave
}: {
    service: Servicio;
    index: number;
    isInView: boolean;
    isHovered: boolean;
    onHover: () => void;
    onLeave: () => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className="group"
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
        >
            {/* Top border */}
            <div className="relative h-px w-full overflow-hidden">
                <div className="absolute inset-0 bg-white/10" />
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-quepia-cyan to-quepia-purple"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: isHovered ? 1 : 0 }}
                    style={{ transformOrigin: 'left' }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
            </div>

            {/* Main row content */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full py-8 md:py-10 flex items-center justify-between gap-6 text-left cursor-pointer"
            >
                {/* Left side: Number + Title */}
                <div className="flex items-center gap-6 md:gap-10">
                    {/* Monospace number */}
                    <span className="font-mono text-sm text-white/40 w-8 transition-colors duration-300 group-hover:text-quepia-cyan">
                        {formatNumber(index + 1)}
                    </span>

                    {/* Service title */}
                    <motion.h3
                        className="font-display text-xl md:text-2xl lg:text-3xl font-medium text-white tracking-tight"
                        animate={{ x: isHovered ? 8 : 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {service.titulo}
                    </motion.h3>
                </div>

                {/* Right side: Arrow */}
                <motion.div
                    className="shrink-0 text-white/40 transition-colors duration-300 group-hover:text-white"
                    animate={{ x: isHovered ? 4 : 0, rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <ArrowRight size={20} />
                </motion.div>
            </button>

            {/* Expanded content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                            height: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
                            opacity: { duration: 0.3, delay: 0.1 }
                        }}
                        className="overflow-hidden"
                    >
                        <div className="pb-8 md:pb-10 pl-14 md:pl-[4.5rem] pr-8">
                            {/* Short description */}
                            <p className="text-white/50 text-base md:text-lg leading-relaxed max-w-2xl mb-4">
                                {service.descripcion_corta}
                            </p>

                            {/* Full description */}
                            <p className="text-white/40 text-sm md:text-base leading-relaxed max-w-2xl mb-6">
                                {service.descripcion}
                            </p>

                            {/* CTA Link */}
                            <Link
                                href="/servicios"
                                className="inline-flex items-center gap-2 text-quepia-cyan text-sm uppercase tracking-wider hover:gap-3 transition-all duration-300"
                            >
                                Conocer más
                                <ArrowUpRight size={14} />
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default function ServicesGrid({ servicios }: ServicesGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(containerRef, { once: true, margin: "-50px" });
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (!servicios || servicios.length === 0) {
        return (
            <div className="text-white/40 text-center py-12">
                No hay servicios disponibles
            </div>
        );
    }

    return (
        <section className="relative py-24 md:py-32">
            {/* Section header */}
            <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 mb-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                >
                    <span className="text-label text-white/40 block mb-4">Servicios</span>
                    <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white max-w-xl">
                        Lo que hacemos
                    </h2>
                </motion.div>
            </div>

            {/* Services list */}
            <div ref={containerRef} className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                {servicios.map((service, index) => (
                    <ServiceRow
                        key={service.id}
                        service={service}
                        index={index}
                        isInView={isInView}
                        isHovered={hoveredIndex === index}
                        onHover={() => setHoveredIndex(index)}
                        onLeave={() => setHoveredIndex(null)}
                    />
                ))}

                {/* Final border */}
                <motion.div
                    className="h-px w-full bg-white/10"
                    initial={{ scaleX: 0 }}
                    animate={isInView ? { scaleX: 1 } : { scaleX: 0 }}
                    style={{ transformOrigin: 'left' }}
                    transition={{ duration: 0.8, delay: servicios.length * 0.1 }}
                />
            </div>

            {/* View all services link */}
            <motion.div
                className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 mt-12"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3 }}
            >
                <Link
                    href="/servicios"
                    className="group cta-link text-white/60 hover:text-white"
                >
                    Ver todos los servicios
                    <ArrowRight size={14} className="cta-arrow" />
                </Link>
            </motion.div>
        </section>
    );
}
