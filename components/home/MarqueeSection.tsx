'use client';

import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

const marqueeItems = [
  'BRAND STRATEGY',
  'DISEÑO GRÁFICO',
  'IDENTIDAD VISUAL',
  'WEB EXPERIENCE',
  'MOTION DESIGN',
  'CREATIVE DIRECTION',
];

export default function MarqueeSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const x1 = useTransform(scrollYProgress, [0, 1], ["0%", "-25%"]);
  const x2 = useTransform(scrollYProgress, [0, 1], ["-25%", "0%"]);

  return (
    <section 
      ref={containerRef}
      className="relative py-16 md:py-24 overflow-hidden border-y border-white/5"
    >
      {/* Gradient overlays for fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-32 md:w-64 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-32 md:w-64 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10 pointer-events-none" />

      {/* First marquee row - moves left */}
      <motion.div 
        className="flex whitespace-nowrap mb-6"
        style={{ x: x1 }}
      >
        {[...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems].map((item, index) => (
          <React.Fragment key={index}>
            <span className="font-display text-4xl md:text-6xl lg:text-7xl font-light text-white/10 mx-4 md:mx-8">
              {item}
            </span>
            <span className="text-quepia-cyan/30 text-2xl md:text-4xl mx-4 md:mx-8">✦</span>
          </React.Fragment>
        ))}
      </motion.div>

      {/* Second marquee row - moves right */}
      <motion.div 
        className="flex whitespace-nowrap"
        style={{ x: x2 }}
      >
        {[...marqueeItems.slice().reverse(), ...marqueeItems.slice().reverse(), ...marqueeItems.slice().reverse(), ...marqueeItems.slice().reverse()].map((item, index) => (
          <React.Fragment key={index}>
            <span className="font-display text-4xl md:text-6xl lg:text-7xl font-light text-white/5 mx-4 md:mx-8">
              {item}
            </span>
            <span className="text-quepia-purple/30 text-2xl md:text-4xl mx-4 md:mx-8">✦</span>
          </React.Fragment>
        ))}
      </motion.div>
    </section>
  );
}
