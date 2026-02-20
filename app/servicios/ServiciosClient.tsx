'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { Servicio } from '@/types/database';
import * as Icons from 'lucide-react';

interface ServiciosClientProps {
    servicios: Servicio[];
}

// Animated words component
const AnimatedWords = ({ text, className = "" }: { text: string; className?: string }) => {
    const words = text.split(" ");
    return (
        <span className={className}>
            {words.map((word, index) => (
                <motion.span
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.5,
                        delay: 0.2 + index * 0.06,
                        ease: [0.16, 1, 0.3, 1],
                    }}
                    className="inline-block mr-[0.25em]"
                >
                    {word}{' '}
                </motion.span>
            ))}
        </span>
    );
};

// Service Card Component - Asymmetric Grid Style
function ServiceCard({ 
    service, 
    index, 
    isLarge = false 
}: { 
    service: Servicio; 
    index: number; 
    isLarge?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-50px" });
    const [isHovered, setIsHovered] = useState(false);
    
    // Get icon component
    const getIcon = (iconName: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const IconComponent = (Icons as any)[iconName];
        return IconComponent ? <IconComponent size={isLarge ? 32 : 24} /> : null;
    };

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className={`group relative ${isLarge ? 'md:col-span-2 md:row-span-2' : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className={`relative h-full glass-card overflow-hidden transition-all duration-500 ${
                isHovered ? 'bg-white/[0.05] border-white/15' : ''
            }`}>
                {/* Number badge */}
                <div className="absolute top-6 left-6 z-10">
                    <span className="font-mono text-xs text-white/40">
                        {String(index + 1).padStart(2, '0')}
                    </span>
                </div>

                {/* Content */}
                <div className={`p-6 md:p-8 flex flex-col h-full ${isLarge ? 'min-h-[300px] md:min-h-[400px]' : 'min-h-[200px]'}`}>
                    {/* Icon */}
                    <div className={`rounded-xl bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 flex items-center justify-center text-white/70 mb-6 transition-all duration-500 ${
                        isHovered ? 'scale-110 from-quepia-purple/30 to-quepia-cyan/30 text-white' : ''
                    } ${isLarge ? 'w-16 h-16' : 'w-12 h-12'}`}>
                        {getIcon(service.icono)}
                    </div>

                    {/* Title */}
                    <h3 className={`font-display font-medium text-white mb-3 transition-colors duration-300 ${
                        isHovered ? 'text-quepia-cyan' : ''
                    } ${isLarge ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl'}`}>
                        {service.titulo}
                    </h3>

                    {/* Description */}
                    <p className={`text-white/50 leading-relaxed flex-grow ${isLarge ? 'text-base md:text-lg' : 'text-sm md:text-base'}`}>
                        {service.descripcion_corta}
                    </p>

                    {/* Arrow indicator */}
                    <div className="mt-6 flex items-center gap-2 text-white/40 group-hover:text-white transition-colors duration-300">
                        <span className="text-xs uppercase tracking-wider">Explorar</span>
                        <motion.div
                            animate={{ x: isHovered ? 4 : 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ArrowUpRight size={14} />
                        </motion.div>
                    </div>
                </div>

                {/* Hover gradient overlay */}
                <motion.div 
                    className="absolute inset-0 bg-gradient-to-t from-quepia-purple/10 via-transparent to-transparent pointer-events-none"
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.4 }}
                />
            </div>
        </motion.div>
    );
}

export default function ServiciosClient({ servicios }: ServiciosClientProps) {
    const heroRef = useRef<HTMLDivElement>(null);
    const isHeroInView = useInView(heroRef, { once: true });

    return (
        <div className="relative">
            {/* Hero Section */}
            <section ref={heroRef} className="relative min-h-[70vh] flex items-center justify-center pt-20 overflow-hidden">
                {/* Background gradient */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-quepia-purple/5 via-transparent to-transparent" />
                    <motion.div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20"
                        animate={{ 
                            scale: [1, 1.1, 1],
                            rotate: [0, 5, 0]
                        }}
                        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <div 
                            className="absolute inset-0 rounded-full blur-3xl animate-gradient"
                            style={{
                                background: 'radial-gradient(circle, rgba(42,231,228,0.15) 0%, rgba(136,16,120,0.15) 50%, transparent 70%)'
                            }}
                        />
                    </motion.div>
                </div>

                <div className="relative z-10 max-w-[1200px] mx-auto px-6 md:px-12 lg:px-20 text-center">
                    {/* Label */}
                    <motion.span
                        className="text-label text-white/40 block mb-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6 }}
                    >
                        Nuestros Servicios
                    </motion.span>

                    {/* Main heading */}
                    <h1 className="font-display text-hero text-white mb-8">
                        <AnimatedWords text="Soluciones creativas" />
                        <br />
                        <span className="text-white/80">
                            <AnimatedWords text="para marcas que destacan" />
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <motion.p
                        className="text-white/50 text-lg md:text-xl max-w-[600px] mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, delay: 0.5 }}
                    >
                        Diseño, estrategia y ejecución que elevan tu presencia en el mercado.
                    </motion.p>
                </div>

                {/* Scroll indicator */}
                <motion.div
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
                    initial={{ opacity: 0 }}
                    animate={isHeroInView ? { opacity: 1 } : {}}
                    transition={{ delay: 0.8, duration: 0.5 }}
                >
                    <motion.div
                        className="flex flex-col items-center gap-2 cursor-pointer group"
                        animate={{ y: [0, 5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <span className="text-white/25 text-[10px] uppercase tracking-[0.3em] group-hover:text-white/40 transition-colors">
                            Scroll
                        </span>
                        <div className="w-px h-6 bg-gradient-to-b from-white/25 to-transparent group-hover:from-white/40 transition-colors" />
                    </motion.div>
                </motion.div>
            </section>

            {/* Services Grid Section */}
            <section className="py-16 md:py-24">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    {servicios.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                            {servicios.map((service, index) => (
                                <ServiceCard 
                                    key={service.id} 
                                    service={service} 
                                    index={index}
                                    isLarge={index === 0} // First service is featured
                                />
                            ))}
                        </div>
                    ) : (
                        <motion.div
                            className="text-center py-16"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <p className="text-white/40 text-lg mb-4">
                                No hay servicios configurados todavía
                            </p>
                        </motion.div>
                    )}
                </div>
            </section>

            {/* Process Section - How we work */}
            <section className="py-24 md:py-32 border-t border-white/5">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    <motion.div
                        className="text-center mb-16 md:mb-20"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="text-label text-white/40 block mb-4">Proceso</span>
                        <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white">
                            Cómo trabajamos
                        </h2>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6">
                        {[
                            { step: '01', title: 'Descubrimiento', desc: 'Entendemos tu marca, objetivos y audiencia.' },
                            { step: '02', title: 'Estrategia', desc: 'Diseñamos un plan creativo a medida.' },
                            { step: '03', title: 'Creación', desc: 'Desarrollamos soluciones visuales impactantes.' },
                            { step: '04', title: 'Entrega', desc: 'Implementamos y acompañamos el crecimiento.' },
                        ].map((item, index) => (
                            <motion.div
                                key={item.step}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, delay: index * 0.1 }}
                                className="relative"
                            >
                                <span className="font-mono text-4xl md:text-5xl text-white/10 block mb-4">
                                    {item.step}
                                </span>
                                <h3 className="font-display text-xl md:text-2xl font-medium text-white mb-3">
                                    {item.title}
                                </h3>
                                <p className="text-white/50 text-sm leading-relaxed">
                                    {item.desc}
                                </p>
                                
                                {/* Connector line */}
                                {index < 3 && (
                                    <div className="hidden md:block absolute top-8 left-full w-full h-px">
                                        <div className="w-full h-full bg-gradient-to-r from-white/10 to-transparent" />
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative py-32 md:py-48 overflow-hidden">
                {/* Gradient background */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20">
                        <div
                            className="absolute inset-0 rounded-full blur-3xl animate-gradient"
                            style={{
                                background: 'radial-gradient(circle, rgba(42,231,228,0.3) 0%, rgba(136,16,120,0.3) 50%, transparent 70%)'
                            }}
                        />
                    </div>
                </div>

                <div className="relative z-10 max-w-[900px] mx-auto px-6 md:px-12 lg:px-20 text-center">
                    <motion.h2
                        className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white mb-6"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                    >
                        ¿Tenés un proyecto en mente?
                    </motion.h2>

                    <motion.p
                        className="text-white/50 text-lg max-w-[500px] mx-auto mb-12"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        Cada proyecto es único. Contanos tu idea y diseñamos una solución a medida.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        <Link
                            href="/contacto"
                            className="group inline-flex items-center gap-3 text-xl md:text-2xl text-white hover:text-quepia-cyan transition-colors duration-300"
                        >
                            <span className="border-b border-white/30 group-hover:border-quepia-cyan pb-1 transition-colors duration-300">
                                Hablemos
                            </span>
                            <motion.svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                className="transition-transform duration-300 group-hover:translate-x-1"
                            >
                                <path
                                    d="M1 8H15M15 8L8 1M15 8L8 15"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </motion.svg>
                        </Link>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
