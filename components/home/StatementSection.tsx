'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';

const words = [
  { text: "Creemos", highlight: false },
  { text: "que", highlight: false },
  { text: "cada", highlight: false },
  { text: "marca", highlight: true },
  { text: "tiene", highlight: false },
  { text: "una", highlight: false },
  { text: "historia", highlight: true },
  { text: "única", highlight: false },
  { text: "que", highlight: false },
  { text: "merece", highlight: false },
  { text: "ser", highlight: false },
  { text: "contada", highlight: true },
  { text: "con", highlight: false },
  { text: "excelencia.", highlight: false },
];

export default function StatementSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.9, 1, 0.9]);

  return (
    <section 
      ref={containerRef}
      className="relative py-32 md:py-48 lg:py-64 overflow-hidden"
    >
      {/* Animated background gradient */}
      <motion.div 
        className="absolute inset-0 pointer-events-none"
        style={{ y: backgroundY }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-30">
          <div 
            className="absolute inset-0 rounded-full blur-[120px] animate-gradient"
            style={{
              background: 'radial-gradient(circle, rgba(42,231,228,0.2) 0%, rgba(136,16,120,0.15) 50%, transparent 70%)'
            }}
          />
        </div>
      </motion.div>

      {/* Decorative lines */}
      <motion.div 
        className="absolute top-0 left-1/4 w-px h-32 bg-gradient-to-b from-transparent via-quepia-cyan/20 to-transparent"
        style={{ y: useTransform(scrollYProgress, [0, 1], [0, 100]) }}
      />
      <motion.div 
        className="absolute bottom-0 right-1/4 w-px h-32 bg-gradient-to-b from-transparent via-quepia-purple/20 to-transparent"
        style={{ y: useTransform(scrollYProgress, [0, 1], [0, -100]) }}
      />

      <motion.div 
        className="relative z-10 max-w-[1000px] mx-auto px-6 md:px-12 lg:px-20"
        style={{ opacity, scale }}
      >
        <div className="flex flex-col items-center text-center">
          {/* Animated quote marks */}
          <div className="relative mb-12">
            <motion.span
              className="text-[12rem] md:text-[16rem] leading-none text-white/[0.03] font-serif absolute -top-32 left-1/2 -translate-x-1/2 select-none"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              &ldquo;
            </motion.span>
            <motion.span
              className="text-6xl md:text-8xl text-quepia-cyan/20 font-serif leading-none block"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              &ldquo;
            </motion.span>
          </div>

          {/* Main statement - word by word animation */}
          <h2 className="font-display text-3xl md:text-5xl lg:text-6xl font-light leading-tight mb-16">
            {words.map((word, index) => (
              <motion.span
                key={index}
                className={`inline-block mr-[0.25em] ${
                  word.highlight 
                    ? 'text-transparent bg-clip-text bg-gradient-to-r from-quepia-cyan to-quepia-purple' 
                    : 'text-white/90'
                }`}
                initial={{ opacity: 0, y: 40, rotateX: -40 }}
                animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
                transition={{
                  duration: 0.7,
                  delay: 0.3 + index * 0.05,
                  ease: [0.16, 1, 0.3, 1]
                }}
              >
                {word.text}
              </motion.span>
            ))}
          </h2>

          {/* Attribution with animation */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 1.2 }}
          >
            <div className="flex items-center gap-4">
              <motion.div 
                className="w-12 h-px bg-gradient-to-r from-transparent to-white/30"
                initial={{ scaleX: 0 }}
                animate={isInView ? { scaleX: 1 } : {}}
                transition={{ duration: 0.8, delay: 1.4 }}
                style={{ transformOrigin: 'left' }}
              />
              <span className="text-white/40 text-sm tracking-wider uppercase">
                Quepia Creative Studio
              </span>
              <motion.div 
                className="w-12 h-px bg-gradient-to-l from-transparent to-white/30"
                initial={{ scaleX: 0 }}
                animate={isInView ? { scaleX: 1 } : {}}
                transition={{ duration: 0.8, delay: 1.4 }}
                style={{ transformOrigin: 'right' }}
              />
            </div>
          </motion.div>

          {/* Decorative elements */}
          <motion.div
            className="absolute -left-4 top-1/2 -translate-y-1/2 hidden lg:block"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 1.5 }}
          >
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full bg-quepia-cyan/30"
                  initial={{ scale: 0 }}
                  animate={isInView ? { scale: 1 } : {}}
                  transition={{ delay: 1.6 + i * 0.1 }}
                />
              ))}
            </div>
          </motion.div>

          <motion.div
            className="absolute -right-4 top-1/2 -translate-y-1/2 hidden lg:block"
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 1.5 }}
          >
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full bg-quepia-purple/30"
                  initial={{ scale: 0 }}
                  animate={isInView ? { scale: 1 } : {}}
                  transition={{ delay: 1.6 + i * 0.1 }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
