'use client';

import React, { useState, useEffect } from 'react';
import { Proyecto, CATEGORIES } from '@/types/database';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

interface HomeCarouselProps {
    proyectos: Proyecto[];
}

const GRADIENT_COLORS = [
    'from-quepia-purple to-quepia-cyan',
    'from-quepia-cyan to-emerald-500',
    'from-quepia-purple to-pink-500',
    'from-amber-500 to-quepia-purple',
    'from-quepia-cyan to-blue-600',
];

export default function HomeCarousel({ proyectos }: HomeCarouselProps) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const itemsPerSlide = isMobile ? 1 : 3;
    const totalSlides = Math.ceil(proyectos.length / itemsPerSlide);

    const nextSlide = () => {
        setCurrentSlide((prev) => (prev + 1) % totalSlides);
    };

    const prevSlide = () => {
        setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
    };

    useEffect(() => {
        setCurrentSlide(0);
    }, [isMobile]);

    return (
        <div className="relative max-w-[1600px] mx-auto">
            {/* Navigation Buttons */}
            <button
                onClick={prevSlide}
                className="absolute -left-2 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-16 md:h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-quepia-cyan/30 transition-all duration-300 shadow-xl"
            >
                <ChevronLeft size={24} />
            </button>
            <button
                onClick={nextSlide}
                className="absolute -right-2 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-16 md:h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-quepia-cyan/30 transition-all duration-300 shadow-xl"
            >
                <ChevronRight size={24} />
            </button>

            {/* Carousel */}
            <div className="overflow-hidden py-4 md:py-6 px-6 md:px-12">
                <motion.div
                    animate={{ x: `-${currentSlide * 100}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="flex"
                >
                    {isMobile ? (
                        proyectos.map((proyecto, index) => (
                            <div key={proyecto.id} className="flex-shrink-0 w-full px-2">
                                <Link href={`/trabajos?category=${proyecto.categoria}`}>
                                    <motion.div whileTap={{ scale: 0.98 }} className="cursor-pointer group relative">
                                        <div className={`aspect-[3/4] rounded-2xl bg-gradient-to-br ${GRADIENT_COLORS[index % GRADIENT_COLORS.length]} flex items-end justify-center relative overflow-hidden shadow-2xl`}>
                                            {proyecto.imagen_url && (
                                                <Image
                                                    src={proyecto.imagen_url}
                                                    alt={proyecto.titulo}
                                                    fill
                                                    className="object-cover opacity-30"
                                                />
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                                            <div className="relative z-10 text-center p-6 pb-8">
                                                <h3 className="text-white font-bold text-xl mb-2">{proyecto.titulo}</h3>
                                                <p className="text-white/80 text-sm mb-3 line-clamp-2">{proyecto.descripcion}</p>
                                                <div className="inline-flex items-center gap-2 text-quepia-cyan font-medium">
                                                    <span>Ver trabajos</span>
                                                    <ArrowRight size={16} />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </Link>
                            </div>
                        ))
                    ) : (
                        Array.from({ length: totalSlides }).map((_, slideGroup) => (
                            <div key={slideGroup} className="flex-shrink-0 w-full grid grid-cols-3 gap-6 lg:gap-8 pr-4">
                                {proyectos.slice(slideGroup * 3, slideGroup * 3 + 3).map((proyecto, index) => (
                                    <Link key={proyecto.id} href={`/trabajos?category=${proyecto.categoria}`}>
                                        <motion.div
                                            whileHover={{ scale: 1.03, y: -8 }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                            className="cursor-pointer group relative hover:z-10"
                                        >
                                            <div className={`aspect-[4/5] rounded-3xl bg-gradient-to-br ${GRADIENT_COLORS[(slideGroup * 3 + index) % GRADIENT_COLORS.length]} flex items-end justify-center relative overflow-hidden shadow-2xl`}>
                                                {proyecto.imagen_url && (
                                                    <Image
                                                        src={proyecto.imagen_url}
                                                        alt={proyecto.titulo}
                                                        fill
                                                        className="object-cover opacity-30 group-hover:opacity-40 transition-opacity duration-500"
                                                    />
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent group-hover:from-black/60 transition-all duration-500" />
                                                <div className="relative z-10 text-center p-8 pb-10">
                                                    <h3 className="text-white font-bold text-2xl lg:text-3xl mb-3">{proyecto.titulo}</h3>
                                                    <p className="text-white/80 text-base mb-4 line-clamp-2">{proyecto.descripcion}</p>
                                                    <div className="inline-flex items-center gap-2 text-quepia-cyan font-medium group-hover:gap-4 transition-all duration-300">
                                                        <span>Ver trabajos</span>
                                                        <ArrowRight size={18} />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </Link>
                                ))}
                            </div>
                        ))
                    )}
                </motion.div>
            </div>

            {/* Indicators */}
            <div className="flex justify-center gap-2 md:gap-3 mt-6 md:mt-10">
                {Array.from({ length: totalSlides }).map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`h-2 md:h-3 rounded-full transition-all duration-300 ${currentSlide === idx ? 'bg-quepia-cyan w-8 md:w-12' : 'bg-white/30 hover:bg-white/50 w-2 md:w-3'
                            }`}
                    />
                ))}
            </div>
        </div>
    );
}
