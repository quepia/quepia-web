'use client';

import React, { useState } from 'react';
import { Proyecto } from '@/types/database';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import Image from 'next/image';

interface WorksGalleryProps {
    proyectos: Proyecto[];
}

export default function WorksGallery({ proyectos }: WorksGalleryProps) {
    const [selectedImage, setSelectedImage] = useState<Proyecto | null>(null);

    return (
        <>
            {/* Image Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {proyectos.map((proyecto, index) => (
                    <motion.div
                        key={proyecto.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="group cursor-pointer"
                        onClick={() => setSelectedImage(proyecto)}
                    >
                        <div className="relative aspect-[4/3] rounded-xl md:rounded-2xl overflow-hidden border border-white/10 group-hover:border-quepia-cyan/50 transition-all duration-300">
                            {proyecto.imagen_url ? (
                                <Image
                                    src={proyecto.imagen_url}
                                    alt={proyecto.titulo}
                                    fill
                                    className="object-cover transform group-hover:scale-105 transition-transform duration-500"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 flex items-center justify-center">
                                    <span className="text-gray-500">Sin imagen</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                                <p className="text-white font-medium text-sm md:text-base">{proyecto.titulo}</p>
                            </div>
                            {/* Hover indicator */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                    <ArrowRight size={20} className="text-white" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setSelectedImage(null)}
                    >
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-4 right-4 md:top-6 md:right-6 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10"
                            aria-label="Cerrar"
                        >
                            <X size={24} strokeWidth={2.5} />
                        </button>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="max-w-5xl w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {selectedImage.imagen_url ? (
                                <div className="relative w-full h-[80vh]">
                                    <Image
                                        src={selectedImage.imagen_url}
                                        alt={selectedImage.titulo}
                                        fill
                                        className="object-contain rounded-2xl"
                                    />
                                </div>
                            ) : (
                                <div className="w-full h-[60vh] bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 rounded-2xl flex items-center justify-center">
                                    <span className="text-gray-400 text-xl">Sin imagen</span>
                                </div>
                            )}
                            <p className="text-white text-center mt-4 text-lg font-medium">
                                {selectedImage.titulo}
                            </p>
                            {selectedImage.descripcion && (
                                <p className="text-gray-400 text-center mt-2 max-w-2xl mx-auto">
                                    {selectedImage.descripcion}
                                </p>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
