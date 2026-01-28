'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Dynamically import the 3D background component (no SSR)
const ParticleBackground = dynamic(() => import('./ParticleBackground'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-transparent" />
  ),
});

interface HeroSectionProps {
  subtitle?: string;
}

// Staggered animation component
const AnimatedElement = ({
  children,
  delay,
  className = ""
}: {
  children: React.ReactNode;
  delay: number;
  className?: string;
}) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{
      duration: 0.7,
      delay,
      ease: [0.16, 1, 0.3, 1],
    }}
  >
    {children}
  </motion.div>
);

// Animated text word by word
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

export default function HeroSection({ subtitle }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen w-full flex items-center overflow-hidden"
    >
      {/* Global GlassBackground visible through transparency */}
      
      {/* Three.js Background with Chrome Sphere - semi-transparent */}
      <div className="absolute inset-0 z-0 opacity-70">
        <ParticleBackground />
      </div>

      {/* Very subtle gradient overlay so GlassBackground shows through */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/70 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/60 via-transparent to-[#0a0a0a]/20" />
      </div>

      <motion.div
        style={{ opacity }}
        className="relative z-10 w-full max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16 pt-24 pb-32"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          
          {/* Left Content - Text */}
          <div className="flex flex-col items-start text-left">
            {/* Brand Label */}
            <AnimatedElement delay={0.1} className="mb-4">
              <span className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/50">
                <span className="w-6 h-px bg-gradient-to-r from-quepia-cyan to-transparent" />
                Quepia Consultora
              </span>
            </AnimatedElement>

            {/* Hero Headline - Smaller sizes */}
            <div className="mb-5">
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-light text-white leading-[1.1] tracking-tight">
                <AnimatedWords text="Consultora creativa" />
                <br />
                <span className="text-white/90">
                  <AnimatedWords text="para marcas" />
                </span>
                <br />
                <span className="relative inline-block">
                  <AnimatedWords text="que impactan" />
                  <motion.span
                    className="absolute -bottom-1 left-0 w-full h-[2px] bg-gradient-to-r from-quepia-cyan to-quepia-purple"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'left' }}
                  />
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <AnimatedElement delay={0.6}>
              <p className="text-white/50 text-sm md:text-base max-w-md leading-relaxed mb-8">
                {subtitle || "Transformamos ideas en identidades visuales que conectan, comunican y perduran."}
              </p>
            </AnimatedElement>

            {/* CTA */}
            <AnimatedElement delay={0.8}>
              <Link 
                href="/contacto"
                className="group inline-flex items-center gap-3 text-sm uppercase tracking-[0.12em] text-white/80 hover:text-white transition-all duration-300"
              >
                <span className="border-b border-white/30 group-hover:border-quepia-cyan pb-1 transition-colors duration-300">
                  Iniciar Proyecto
                </span>
                <motion.svg
                  width="14"
                  height="14"
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
            </AnimatedElement>

            {/* Location */}
            <AnimatedElement delay={1} className="mt-10">
              <div className="flex items-center gap-2 text-white/30 text-xs tracking-wider">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Villa Carlos Paz, Argentina
              </div>
            </AnimatedElement>
          </div>

          {/* Right side - Space for 3D Sphere */}
          <div className="hidden lg:block h-[400px]" />
        </div>
      </motion.div>

      {/* Scroll Indicator - Fixed at bottom */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        <motion.div
          className="flex flex-col items-center gap-2 cursor-pointer group"
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
        >
          <span className="text-white/25 text-[10px] uppercase tracking-[0.3em] group-hover:text-white/40 transition-colors">
            Scroll
          </span>
          <div className="w-px h-6 bg-gradient-to-b from-white/25 to-transparent group-hover:from-white/40 transition-colors" />
        </motion.div>
      </motion.div>
    </section>
  );
}
