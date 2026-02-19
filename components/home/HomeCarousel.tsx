'use client';

import React, { useRef } from 'react';
import { Proyecto } from '@/types/database';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { getProjectCoverImage } from '@/lib/project-images';

interface HomeCarouselProps {
    proyectos: Proyecto[];
}

// Featured Project Card - Full width, cinematic
function FeaturedProject({ proyecto, index }: { proyecto: Proyecto; index: number }) {
    const coverImage = getProjectCoverImage(proyecto);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: index * 0.1 }}
        >
            <Link href={`/trabajos?category=${proyecto.categoria}`}>
                <div className="group relative aspect-[16/9] md:aspect-[21/9] rounded-lg overflow-hidden cursor-pointer">
                    {/* Background Image */}
                    {coverImage ? (
                        <Image
                            src={coverImage}
                            alt={proyecto.titulo}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
                        />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-quepia-purple/30 to-quepia-cyan/30" />
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Content */}
                    <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10 lg:p-14">
                        {/* Category tag */}
                        <span className="text-white/50 text-xs uppercase tracking-wider mb-3">
                            {proyecto.categoria.replace('-', ' ')}
                        </span>

                        {/* Title */}
                        <h3 className="font-display text-2xl md:text-4xl lg:text-5xl font-medium text-white mb-3 max-w-2xl">
                            {proyecto.titulo}
                        </h3>

                        {/* Description */}
                        {proyecto.descripcion && (
                            <p className="text-white/60 text-sm md:text-base max-w-xl mb-6 line-clamp-2">
                                {proyecto.descripcion}
                            </p>
                        )}

                        {/* CTA */}
                        <div className="inline-flex items-center gap-2 text-white/70 text-sm uppercase tracking-wider group-hover:text-white group-hover:gap-3 transition-all duration-300">
                            Ver proyecto
                            <ArrowUpRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

// Secondary Project Card - Smaller, grid layout
function SecondaryProject({ proyecto, index }: { proyecto: Proyecto; index: number }) {
    const coverImage = getProjectCoverImage(proyecto);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
        >
            <Link href={`/trabajos?category=${proyecto.categoria}`}>
                <div className="group relative aspect-[4/5] rounded-lg overflow-hidden cursor-pointer">
                    {/* Background Image */}
                    {coverImage ? (
                        <Image
                            src={coverImage}
                            alt={proyecto.titulo}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 45vw, 600px"
                        />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-quepia-purple/30 to-quepia-cyan/30" />
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* Content */}
                    <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6">
                        <span className="text-white/40 text-xs uppercase tracking-wider mb-2">
                            {proyecto.categoria.replace('-', ' ')}
                        </span>
                        <h3 className="font-display text-lg md:text-xl font-medium text-white mb-2">
                            {proyecto.titulo}
                        </h3>
                        <div className="inline-flex items-center gap-1.5 text-white/50 text-xs uppercase tracking-wider group-hover:text-white/80 group-hover:gap-2 transition-all duration-300">
                            Ver
                            <ArrowUpRight size={12} />
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

export default function HomeCarousel({ proyectos }: HomeCarouselProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(containerRef, { once: true, margin: "-50px" });

    if (!proyectos || proyectos.length === 0) {
        return null;
    }

    // Split projects: first one featured, rest in grid
    const featuredProject = proyectos[0];
    const secondaryProjects = proyectos.slice(1, 5); // Max 4 secondary projects
    const remainingProjects = proyectos.slice(5, 6); // One more featured if available

    return (
        <section ref={containerRef} className="py-24 md:py-32">
            {/* Section header */}
            <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 mb-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.6 }}
                >
                    <span className="text-label text-white/40 block mb-4">Proyectos</span>
                    <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white max-w-xl">
                        Trabajos destacados
                    </h2>
                </motion.div>
            </div>

            <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 space-y-6 md:space-y-8">
                {/* Featured Project - Full width */}
                <FeaturedProject proyecto={featuredProject} index={0} />

                {/* Secondary Projects - 2-column grid */}
                {secondaryProjects.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                        {secondaryProjects.map((proyecto, index) => (
                            <SecondaryProject
                                key={proyecto.id}
                                proyecto={proyecto}
                                index={index}
                            />
                        ))}
                    </div>
                )}

                {/* Another Featured if available */}
                {remainingProjects.length > 0 && (
                    <FeaturedProject proyecto={remainingProjects[0]} index={1} />
                )}
            </div>

            {/* View all projects link */}
            <motion.div
                className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 mt-12"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3 }}
            >
                <Link
                    href="/trabajos"
                    className="group cta-link text-white/60 hover:text-white"
                >
                    Ver todos los proyectos
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className="cta-arrow"
                    >
                        <path
                            d="M1 7H13M13 7L7 1M13 7L7 13"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </Link>
            </motion.div>
        </section>
    );
}
