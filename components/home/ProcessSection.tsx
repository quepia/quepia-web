'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Search, Lightbulb, Palette, Rocket } from 'lucide-react';

const processSteps = [
  {
    number: '01',
    title: 'Descubrimiento',
    description: 'Sumergimos en tu marca, analizamos tu mercado y definimos objetivos claros para el proyecto.',
    icon: Search,
    color: '#2AE7E4',
  },
  {
    number: '02',
    title: 'Estrategia',
    description: 'Desarrollamos un plan creativo sólido que alinee tu visión con las necesidades de tu audiencia.',
    icon: Lightbulb,
    color: '#3d7ea8',
  },
  {
    number: '03',
    title: 'Diseño',
    description: 'Creamos conceptos visuales únicos, refinándolos hasta lograr la perfección.',
    icon: Palette,
    color: '#7a3d8a',
  },
  {
    number: '04',
    title: 'Lanzamiento',
    description: 'Implementamos y entregamos, asegurando que cada detalle cumpla los más altos estándares.',
    icon: Rocket,
    color: '#881078',
  },
];

function ProcessCard({ step, index }: { step: typeof processSteps[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(cardRef, { once: true, margin: "-50px" });
  const Icon = step.icon;

  return (
    <motion.div
      ref={cardRef}
      className="relative group"
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.7,
        delay: index * 0.15,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {/* Connector line */}
      {index < processSteps.length - 1 && (
        <motion.div
          className="absolute top-16 left-full w-full h-px hidden lg:block"
          initial={{ scaleX: 0 }}
          animate={isInView ? { scaleX: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.5 + index * 0.15 }}
          style={{ 
            transformOrigin: 'left',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)'
          }}
        />
      )}

      {/* Card */}
      <div className="relative p-8 md:p-10 bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-sm overflow-hidden transition-all duration-500 hover:bg-white/[0.04] hover:border-white/10">
        {/* Glow effect on hover */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${step.color}10, transparent 70%)`
          }}
        />

        {/* Number */}
        <motion.span
          className="absolute top-6 right-6 font-display text-5xl md:text-6xl font-light text-white/5 group-hover:text-white/10 transition-colors duration-500"
          initial={{ opacity: 0, x: 20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: 0.3 + index * 0.15 }}
        >
          {step.number}
        </motion.span>

        {/* Icon */}
        <motion.div
          className="relative w-14 h-14 mb-6 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${step.color}15` }}
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Icon size={24} style={{ color: step.color }} />
        </motion.div>

        {/* Content */}
        <h3 className="font-display text-xl md:text-2xl font-medium text-white mb-3">
          {step.title}
        </h3>
        <p className="text-white/50 text-sm md:text-base leading-relaxed">
          {step.description}
        </p>

        {/* Bottom accent line */}
        <motion.div
          className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r"
          style={{ 
            background: `linear-gradient(90deg, ${step.color}, transparent)`,
          }}
          initial={{ width: '0%' }}
          animate={isInView ? { width: '100%' } : {}}
          transition={{ duration: 0.8, delay: 0.4 + index * 0.15 }}
        />
      </div>
    </motion.div>
  );
}

export default function ProcessSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section ref={containerRef} className="relative py-24 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] opacity-20 blur-[80px]"
          style={{
            background: 'radial-gradient(circle, rgba(136,16,120,0.2) 0%, transparent 70%)'
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
        {/* Section header */}
        <div className="text-center mb-16 md:mb-24">
          <motion.span
            className="text-label text-white/40 block mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            Proceso
          </motion.span>
          <motion.h2
            className="font-display text-3xl md:text-5xl lg:text-6xl font-light text-white max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Cómo{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-quepia-cyan to-quepia-purple">
              transformamos
            </span>{' '}
            ideas en realidad
          </motion.h2>
        </div>

        {/* Process grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {processSteps.map((step, index) => (
            <ProcessCard key={step.number} step={step} index={index} />
          ))}
        </div>

        {/* Progress indicator */}
        <div className="hidden lg:flex justify-center mt-16">
          <div className="relative w-1/2 h-px bg-white/10">
            <motion.div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-quepia-cyan to-quepia-purple"
              initial={{ width: '0%' }}
              animate={isInView ? { width: '100%' } : { width: '0%' }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
