'use client';

import React from 'react';

const marqueeItems = [
  'BRAND STRATEGY',
  'DISEÑO GRÁFICO',
  'IDENTIDAD VISUAL',
  'WEB EXPERIENCE',
  'MOTION DESIGN',
  'CREATIVE DIRECTION',
];

export default function MarqueeSection() {
  const leftTrackItems = [...marqueeItems, ...marqueeItems];
  const rightTrackItems = [...marqueeItems.slice().reverse(), ...marqueeItems.slice().reverse()];

  return (
    <section className="relative py-16 md:py-24 overflow-hidden border-y border-white/5">
      {/* Gradient overlays for fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-32 md:w-64 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-32 md:w-64 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10 pointer-events-none" />

      {/* First marquee row - moves left */}
      <div className="mb-6 overflow-hidden">
        <div className="marquee-track animate-marquee-left flex whitespace-nowrap">
          {leftTrackItems.map((item, index) => (
            <React.Fragment key={`left-${index}`}>
              <span className="font-display text-4xl md:text-6xl lg:text-7xl font-light text-white/10 mx-4 md:mx-8">
                {item}
              </span>
              <span className="text-quepia-cyan/30 text-2xl md:text-4xl mx-4 md:mx-8">✦</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Second marquee row - moves right */}
      <div className="overflow-hidden">
        <div className="marquee-track animate-marquee-right flex whitespace-nowrap">
          {rightTrackItems.map((item, index) => (
            <React.Fragment key={`right-${index}`}>
              <span className="font-display text-4xl md:text-6xl lg:text-7xl font-light text-white/5 mx-4 md:mx-8">
                {item}
              </span>
              <span className="text-quepia-purple/30 text-2xl md:text-4xl mx-4 md:mx-8">✦</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
