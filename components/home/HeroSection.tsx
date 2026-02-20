'use client';

import React, { useRef, useState } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
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
    initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    transition={{
      duration: 0.8,
      delay,
      ease: [0.16, 1, 0.3, 1],
    }}
  >
    {children}
  </motion.div>
);

// Interactive hover word — each word lifts, glows, and shifts color on hover
const HoverWord = ({ word, delay }: { word: string; delay: number }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.span
      initial={{ opacity: 0, y: 25, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="inline-block mr-[0.25em] cursor-default relative"
      style={{ perspective: '600px' }}
    >
      <motion.span
        className="inline-block"
        animate={{
          y: isHovered ? -4 : 0,
          scale: isHovered ? 1.05 : 1,
          color: isHovered ? '#2AE7E4' : 'inherit',
        }}
        transition={{
          duration: 0.3,
          ease: [0.16, 1, 0.3, 1],
        }}
        style={{
          textShadow: isHovered
            ? '0 0 20px rgba(42,231,228,0.6), 0 0 40px rgba(42,231,228,0.3), 0 4px 12px rgba(0,0,0,0.4)'
            : '0 0 0px transparent',
          transition: 'text-shadow 0.3s ease',
        }}
      >
        {word}{' '}
      </motion.span>
    </motion.span>
  );
};

// Animated text word by word with hover interactions
const AnimatedWords = ({ text, className = "", baseDelay = 0.2 }: {
  text: string; className?: string; baseDelay?: number;
}) => {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, index) => (
        <HoverWord key={index} word={word} delay={baseDelay + index * 0.07} />
      ))}
    </span>
  );
};

// Animated letter-by-letter for the highlight line
const AnimatedLetters = ({ text, className = "", baseDelay = 0.2 }: {
  text: string; className?: string; baseDelay?: number;
}) => {
  const letters = text.split("");
  return (
    <span className={className}>
      {letters.map((letter, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: 0.4,
            delay: baseDelay + index * 0.03,
            ease: [0.16, 1, 0.3, 1],
          }}
          whileHover={{
            y: -3,
            scale: 1.15,
            color: '#2AE7E4',
            textShadow: '0 0 25px rgba(42,231,228,0.7), 0 0 50px rgba(136,16,120,0.4)',
            transition: { duration: 0.2 },
          }}
          className="inline-block cursor-default"
          style={{ minWidth: letter === ' ' ? '0.25em' : undefined }}
        >
          {letter === ' ' ? '\u00A0' : letter}
        </motion.span>
      ))}
    </span>
  );
};

export default function HeroSection({ subtitle }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(containerRef, { margin: "-20% 0px" });
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
      {/* Video + Particles Background — semi-transparent so GlassBackground shows through */}
      <div className="absolute inset-0 z-0 opacity-80">
        <ParticleBackground active={isHeroInView} />
      </div>

      {/* Gradient overlays for text readability */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/70 via-[#0a0a0a]/20 to-transparent hidden md:block" />
        <div className="absolute inset-0 bg-[#0a0a0a]/15 md:hidden" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/60 via-transparent to-[#0a0a0a]/20" />
      </div>

      <motion.div
        style={{ opacity }}
        className="relative z-10 w-full max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16 pt-24 pb-32"
      >
        <div className="flex flex-col items-center text-center md:items-start md:text-left max-w-2xl mx-auto md:mx-0">
          {/* Brand Label */}
          <AnimatedElement delay={0.1} className="mb-4">
            <span className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/50">
              <motion.span
                className="w-6 h-px bg-gradient-to-r from-quepia-cyan to-transparent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'left' }}
              />
              Quepia Consultora
            </span>
          </AnimatedElement>

          {/* Hero Headline */}
          <div className="mb-5">
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-light text-white leading-[1.1] tracking-tight">
              <AnimatedWords text="Consultora creativa" baseDelay={0.15} />
              <br />
              <span className="text-white/90">
                <AnimatedWords text="para marcas" baseDelay={0.35} />
              </span>
              <br />
              <span className="relative inline-block">
                <AnimatedLetters text="que impactan" baseDelay={0.5} />
                <motion.span
                  className="absolute -bottom-1 left-0 w-full h-[2px] bg-gradient-to-r from-quepia-cyan to-quepia-purple"
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: 1.0, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: 'left' }}
                />
              </span>
            </h1>
          </div>

          {/* Subtitle */}
          <AnimatedElement delay={0.7}>
            <p className="text-white/50 text-sm md:text-base max-w-md leading-relaxed mb-8">
              {subtitle || "Transformamos ideas en identidades visuales que conectan, comunican y perduran."}
            </p>
          </AnimatedElement>

          {/* CTA */}
          <AnimatedElement delay={0.9}>
            <Link
              href="/contacto"
              className="group relative inline-flex items-center gap-3 text-sm uppercase tracking-[0.12em] text-white/80 hover:text-white transition-all duration-300"
            >
              <motion.span
                className="border-b border-white/30 group-hover:border-quepia-cyan pb-1 transition-colors duration-300"
                whileHover={{
                  textShadow: '0 0 15px rgba(42,231,228,0.5)',
                }}
              >
                Iniciar Proyecto
              </motion.span>
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
          <AnimatedElement delay={1.1} className="mt-10">
            <div className="flex items-center gap-2 text-white/30 text-xs tracking-wider">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Villa Carlos Paz, Argentina
            </div>
          </AnimatedElement>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.5 }}
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
