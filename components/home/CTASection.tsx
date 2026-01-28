'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import Link from 'next/link';

interface CTASectionProps {
  email?: string;
}

export default function CTASection({ email = 'hola@quepia.com' }: CTASectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const rotate = useTransform(scrollYProgress, [0, 1], [0, 360]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1, 0.8]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);

  return (
    <section ref={containerRef} className="relative py-32 md:py-48 lg:py-64 overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Rotating gradient orb */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] md:w-[800px] md:h-[800px]"
          style={{ rotate, scale }}
        >
          <div 
            className="absolute inset-0 rounded-full blur-[100px] opacity-30"
            style={{
              background: 'conic-gradient(from 0deg, #2AE7E4, #881078, #2AE7E4)'
            }}
          />
        </motion.div>

        {/* Secondary orbs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-[80px]"
          style={{
            background: 'radial-gradient(circle, rgba(42,231,228,0.15) 0%, transparent 70%)',
            x: useTransform(scrollYProgress, [0, 1], [0, 50]),
            y: useTransform(scrollYProgress, [0, 1], [0, -30]),
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-[80px]"
          style={{
            background: 'radial-gradient(circle, rgba(136,16,120,0.15) 0%, transparent 70%)',
            x: useTransform(scrollYProgress, [0, 1], [0, -50]),
            y: useTransform(scrollYProgress, [0, 1], [0, 30]),
          }}
        />
      </div>

      {/* Floating geometric shapes */}
      <motion.div
        className="absolute top-20 left-10 w-4 h-4 border border-quepia-cyan/30 rotate-45 hidden md:block"
        animate={{ 
          y: [0, -20, 0],
          rotate: [45, 90, 45]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-32 right-20 w-6 h-6 border border-quepia-purple/30 rounded-full hidden md:block"
        animate={{ 
          y: [0, 20, 0],
          scale: [1, 1.2, 1]
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 right-10 w-3 h-3 bg-quepia-cyan/20 rotate-12 hidden md:block"
        animate={{ 
          rotate: [12, 180, 12],
          opacity: [0.2, 0.5, 0.2]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div 
        className="relative z-10 max-w-[1000px] mx-auto px-6 md:px-12 lg:px-20 text-center"
        style={{ opacity }}
      >
        {/* Pre-title */}
        <motion.span
          className="text-label text-white/40 block mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          ¿Listo para empezar?
        </motion.span>

        {/* Main heading */}
        <motion.h2
          className="font-display text-4xl md:text-6xl lg:text-7xl font-light text-white mb-8 leading-tight"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.1 }}
        >
          Transformemos tu
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-quepia-cyan via-white to-quepia-purple">
            marca juntos
          </span>
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          className="text-white/50 text-lg md:text-xl max-w-lg mx-auto mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Cada gran marca comienza con una conversación. 
          Hablemos sobre tu próximo proyecto.
        </motion.p>

        {/* CTA Button */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link
            href="/contacto"
            className="group relative inline-flex items-center gap-4 px-10 py-5 overflow-hidden"
          >
            {/* Button background */}
            <span className="absolute inset-0 bg-gradient-to-r from-quepia-cyan to-quepia-purple transition-transform duration-500 group-hover:scale-105" />
            <span className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
            
            {/* Button text */}
            <span className="relative font-medium text-black text-lg uppercase tracking-wider">
              Iniciar Proyecto
            </span>
            
            {/* Arrow icon */}
            <motion.svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="relative text-black"
              whileHover={{ x: 5 }}
            >
              <path
                d="M4 10H16M16 10L10 4M16 10L10 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          </Link>
        </motion.div>

        {/* Contact info */}
        <motion.div
          className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <a
            href={`mailto:${email}`}
            className="group flex items-center gap-3 text-white/40 hover:text-white/70 transition-colors duration-300"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span className="text-sm">{email}</span>
          </a>
          
          <span className="hidden md:block w-1 h-1 rounded-full bg-white/20" />
          
          <span className="text-white/40 text-sm">
            Villa Carlos Paz, Argentina
          </span>
        </motion.div>
      </motion.div>
    </section>
  );
}
