'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { CATEGORIES } from '@/types/database';
import Link from 'next/link';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ArrowRight, ArrowUpRight, X } from 'lucide-react';
import { Proyecto } from '@/types/database';
import Image from 'next/image';

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
                    {word}
                </motion.span>
            ))}
        </span>
    );
};

// Featured Project Card - Full width cinematic
function FeaturedProject({ 
    proyecto, 
    index,
    onClick
}: { 
    proyecto: Proyecto; 
    index: number;
    onClick: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.8, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="group cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={onClick}
        >
            <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-xl overflow-hidden">
                {/* Background Image */}
                {proyecto.imagen_url ? (
                    <Image
                        src={proyecto.imagen_url}
                        alt={proyecto.titulo}
                        fill
                        className="object-cover transition-transform duration-700 ease-out"
                        style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)' }}
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-quepia-purple/30 to-quepia-cyan/30" />
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                
                {/* Subtle border glow on hover */}
                <motion.div 
                    className="absolute inset-0 rounded-xl border border-white/0 transition-colors duration-500"
                    animate={{ borderColor: isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0)' }}
                />

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10 lg:p-14">
                    {/* Category tag */}
                    <motion.span 
                        className="text-white/50 text-xs uppercase tracking-[0.2em] mb-3"
                        animate={{ y: isHovered ? -4 : 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {proyecto.categoria.replace('-', ' ')}
                    </motion.span>

                    {/* Title */}
                    <motion.h3 
                        className="font-display text-3xl md:text-5xl lg:text-6xl font-light text-white mb-4 max-w-3xl"
                        animate={{ y: isHovered ? -4 : 0 }}
                        transition={{ duration: 0.3, delay: 0.05 }}
                    >
                        {proyecto.titulo}
                    </motion.h3>

                    {/* Description */}
                    {proyecto.descripcion && (
                        <motion.p 
                            className="text-white/60 text-sm md:text-base max-w-xl mb-6 line-clamp-2"
                            animate={{ y: isHovered ? -4 : 0, opacity: isHovered ? 1 : 0.8 }}
                            transition={{ duration: 0.3, delay: 0.1 }}
                        >
                            {proyecto.descripcion}
                        </motion.p>
                    )}

                    {/* CTA */}
                    <motion.div 
                        className="inline-flex items-center gap-2 text-white/70 text-sm uppercase tracking-wider"
                        animate={{ y: isHovered ? -4 : 0 }}
                        transition={{ duration: 0.3, delay: 0.15 }}
                    >
                        <span className="border-b border-white/30 pb-0.5">Ver proyecto</span>
                        <ArrowUpRight size={14} className="transition-transform duration-300" style={{ transform: isHovered ? 'translate(2px, -2px)' : 'none' }} />
                    </motion.div>
                </div>

                {/* View indicator circle */}
                <motion.div
                    className="absolute top-6 right-6 w-16 h-16 rounded-full border border-white/20 flex items-center justify-center backdrop-blur-sm"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1 : 0.8 }}
                    transition={{ duration: 0.3 }}
                >
                    <span className="text-white text-xs uppercase tracking-wider">Ver</span>
                </motion.div>
            </div>
        </motion.div>
    );
}

// Secondary Project Card - Grid layout
function SecondaryProject({ 
    proyecto, 
    index,
    onClick
}: { 
    proyecto: Proyecto; 
    index: number;
    onClick: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-50px" });
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.6, delay: 0.2 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="group cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={onClick}
        >
            <div className="relative aspect-[4/5] rounded-xl overflow-hidden">
                {/* Background Image */}
                {proyecto.imagen_url ? (
                    <Image
                        src={proyecto.imagen_url}
                        alt={proyecto.titulo}
                        fill
                        className="object-cover transition-transform duration-700 ease-out"
                        style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)' }}
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-quepia-purple/30 to-quepia-cyan/30" />
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6">
                    <motion.span 
                        className="text-white/40 text-xs uppercase tracking-wider mb-2"
                        animate={{ y: isHovered ? -4 : 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {proyecto.categoria.replace('-', ' ')}
                    </motion.span>
                    <motion.h3 
                        className="font-display text-lg md:text-xl font-medium text-white mb-2"
                        animate={{ y: isHovered ? -4 : 0 }}
                        transition={{ duration: 0.3, delay: 0.05 }}
                    >
                        {proyecto.titulo}
                    </motion.h3>
                    <motion.div 
                        className="inline-flex items-center gap-1.5 text-white/50 text-xs uppercase tracking-wider"
                        animate={{ y: isHovered ? -4 : 0 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                    >
                        <span>Ver</span>
                        <ArrowUpRight size={12} />
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}

// Lightbox Modal
function Lightbox({ 
    proyecto, 
    onClose 
}: { 
    proyecto: Proyecto; 
    onClose: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 md:top-6 md:right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
                aria-label="Cerrar"
            >
                <X size={24} strokeWidth={2} />
            </button>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="max-w-5xl w-full"
                onClick={(e) => e.stopPropagation()}
            >
                {proyecto.imagen_url ? (
                    <div className="relative w-full h-[70vh] md:h-[80vh]">
                        <Image
                            src={proyecto.imagen_url}
                            alt={proyecto.titulo}
                            fill
                            className="object-contain rounded-2xl"
                        />
                    </div>
                ) : (
                    <div className="w-full h-[60vh] bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 rounded-2xl flex items-center justify-center">
                        <span className="text-gray-400 text-xl">Sin imagen</span>
                    </div>
                )}
                <div className="mt-6 text-center">
                    <span className="text-white/40 text-xs uppercase tracking-wider block mb-2">
                        {proyecto.categoria.replace('-', ' ')}
                    </span>
                    <h3 className="text-white text-xl md:text-2xl font-medium">
                        {proyecto.titulo}
                    </h3>
                    {proyecto.descripcion && (
                        <p className="text-white/50 mt-2 max-w-2xl mx-auto">
                            {proyecto.descripcion}
                        </p>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

export default function WorksPage() {
    const searchParams = useSearchParams();
    const activeCategory = searchParams?.get('category') || 'branding';
    const [proyectos, setProyectos] = useState<Proyecto[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState<Proyecto | null>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const isHeroInView = useInView(heroRef, { once: true });

    useEffect(() => {
        async function fetchProyectos() {
            setLoading(true);
            const supabase = createClient();
            const { data } = await supabase
                .from('proyectos')
                .select('*')
                .eq('categoria', activeCategory)
                .order('orden', { ascending: true })
                .order('fecha_creacion', { ascending: false });
            setProyectos(data || []);
            setLoading(false);
        }
        fetchProyectos();
    }, [activeCategory]);

    // Split projects: first one featured, rest in grid
    const featuredProject = proyectos[0];
    const secondaryProjects = proyectos.slice(1, 5);
    const remainingProjects = proyectos.slice(5, 6);

    return (
        <div className="relative">
            {/* Hero Section */}
            <section ref={heroRef} className="relative min-h-[60vh] flex items-center justify-center pt-20 overflow-hidden">
                {/* Background gradient */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-quepia-cyan/5 via-transparent to-transparent" />
                    <motion.div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] opacity-15"
                        animate={{ 
                            scale: [1, 1.2, 1],
                            rotate: [0, -5, 0]
                        }}
                        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <div 
                            className="absolute inset-0 rounded-full blur-3xl"
                            style={{
                                background: 'radial-gradient(circle, rgba(42,231,228,0.2) 0%, rgba(136,16,120,0.15) 50%, transparent 70%)'
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
                        Portfolio
                    </motion.span>

                    {/* Main heading */}
                    <h1 className="font-display text-hero text-white mb-8">
                        <AnimatedWords text="Nuestros trabajos" />
                    </h1>

                    {/* Subtitle */}
                    <motion.p
                        className="text-white/50 text-lg md:text-xl max-w-[600px] mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, delay: 0.4 }}
                    >
                        Explorá nuestra galería de proyectos organizados por categoría.
                    </motion.p>
                </div>
            </section>

            {/* Category Navigation - Sticky */}
            <motion.div
                className="sticky top-16 md:top-[72px] z-40 py-4 border-y border-white/5 backdrop-blur-xl"
                style={{ background: 'rgba(10, 10, 10, 0.8)' }}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
            >
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    <div className="flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide py-1">
                        {CATEGORIES.map((category, index) => (
                            <motion.div
                                key={category.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.3 + index * 0.05 }}
                            >
                                <Link
                                    href={`/trabajos?category=${category.id}`}
                                    className={`flex-shrink-0 px-5 md:px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                                        activeCategory === category.id
                                            ? 'bg-white text-black'
                                            : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    {category.label}
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Gallery Section */}
            <section className="py-16 md:py-24">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    {/* Category Header */}
                    <motion.div
                        className="mb-12 md:mb-16"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        key={activeCategory}
                    >
                        <span className="text-label text-white/40 block mb-3">Categoría</span>
                        <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white">
                            {CATEGORIES.find(c => c.id === activeCategory)?.label || activeCategory}
                        </h2>
                    </motion.div>

                    {/* Gallery Content */}
                    {loading ? (
                        <div className="space-y-6 md:space-y-8">
                            <div className="aspect-[16/9] md:aspect-[21/9] rounded-xl bg-white/5 animate-pulse" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="aspect-[4/5] rounded-xl bg-white/5 animate-pulse" />
                                ))}
                            </div>
                        </div>
                    ) : proyectos.length === 0 ? (
                        <motion.div
                            className="text-center py-20"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <p className="text-white/40 text-lg mb-6">
                                No hay proyectos en esta categoría todavía
                            </p>
                            <Link
                                href="/contacto"
                                className="group cta-link text-white/60 hover:text-white"
                            >
                                Contactanos para tu proyecto
                                <ArrowRight size={14} className="cta-arrow" />
                            </Link>
                        </motion.div>
                    ) : (
                        <div className="space-y-6 md:space-y-8">
                            {/* Featured Project - Full width */}
                            {featuredProject && (
                                <FeaturedProject 
                                    proyecto={featuredProject} 
                                    index={0} 
                                    onClick={() => setSelectedProject(featuredProject)}
                                />
                            )}

                            {/* Secondary Projects - 2-column grid */}
                            {secondaryProjects.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                    {secondaryProjects.map((proyecto, index) => (
                                        <SecondaryProject
                                            key={proyecto.id}
                                            proyecto={proyecto}
                                            index={index}
                                            onClick={() => setSelectedProject(proyecto)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Another Featured if available */}
                            {remainingProjects.length > 0 && (
                                <FeaturedProject 
                                    proyecto={remainingProjects[0]} 
                                    index={1}
                                    onClick={() => setSelectedProject(remainingProjects[0])}
                                />
                            )}
                        </div>
                    )}

                    {/* View Services CTA */}
                    {proyectos.length > 0 && (
                        <motion.div
                            className="mt-16 text-center"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                        >
                            <p className="text-white/40 mb-4">¿Te interesa este servicio?</p>
                            <Link
                                href="/servicios"
                                className="group cta-link text-white/60 hover:text-white"
                            >
                                Ver detalles del servicio
                                <ArrowRight size={14} className="cta-arrow" />
                            </Link>
                        </motion.div>
                    )}
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
                        ¿Querés un proyecto así?
                    </motion.h2>

                    <motion.p
                        className="text-white/50 text-lg max-w-[500px] mx-auto mb-12"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        Contanos tu idea y creamos algo increíble juntos.
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
                                Hablemos de tu proyecto
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

            {/* Lightbox */}
            <AnimatePresence>
                {selectedProject && (
                    <Lightbox 
                        proyecto={selectedProject} 
                        onClose={() => setSelectedProject(null)} 
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
