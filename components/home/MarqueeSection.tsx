'use client';

import React from 'react';
import type { Servicio } from '@/types/database';

interface MarqueeSectionProps {
  servicios?: Servicio[];
}

const fallbackItems = [
  'Identidad y Branding',
  'Social Media & Estrategia',
  'Producción Audiovisual',
  'Diseño Gráfico & Web',
  'Dirección Creativa',
  'Estrategia de Contenido',
];

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export default function MarqueeSection({ servicios = [] }: MarqueeSectionProps) {
  const serviceItems = (servicios.length > 0
    ? servicios.map((item) => item.titulo)
    : fallbackItems
  ).map(normalizeLabel);

  const leftTrackItems = [...serviceItems, ...serviceItems];
  const rightTrackItems = [...serviceItems.slice().reverse(), ...serviceItems.slice().reverse()];

  return (
    <section className="relative overflow-hidden py-12 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04)_18%,rgba(42,231,228,0.1)_50%,rgba(255,255,255,0.04)_82%,transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.03)_18%,rgba(155,44,138,0.08)_50%,rgba(255,255,255,0.03)_82%,transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_68%)]" />
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/82 to-transparent md:w-44" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a]/82 to-transparent md:w-44" />

      <div className="mb-5 overflow-hidden">
        <div className="marquee-track animate-marquee-left flex whitespace-nowrap">
          {leftTrackItems.map((item, index) => (
            <React.Fragment key={`left-${item}-${index}`}>
              <span className="mx-5 font-display text-[clamp(1.45rem,3.7vw,2.7rem)] font-normal tracking-[0.07em] text-[rgb(var(--text-white-soft-rgb)/0.085)] transition-colors duration-300 hover:text-[rgb(var(--text-white-soft-rgb)/0.18)]">
                {item}
              </span>
              <span className="mx-2 text-[#2ae7e4]/22">✦</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="marquee-track animate-marquee-right flex whitespace-nowrap">
          {rightTrackItems.map((item, index) => (
            <React.Fragment key={`right-${item}-${index}`}>
              <span className="mx-5 font-display text-[clamp(1.2rem,3.2vw,2.2rem)] font-normal tracking-[0.07em] text-[rgb(var(--text-white-soft-rgb)/0.05)] transition-colors duration-300 hover:text-[rgb(var(--text-white-soft-rgb)/0.13)]">
                {item}
              </span>
              <span className="mx-2 text-[rgb(var(--text-white-soft-rgb)/0.18)]">✦</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
