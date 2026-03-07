'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import HeroVideoBackground from './HeroVideoBackground';

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isHeroInView, setIsHeroInView] = useState(true);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeroInView(entry.isIntersecting);
      },
      { threshold: 0.2 },
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden pb-20 pt-28 md:pb-24 md:pt-32"
    >
      <div className="absolute inset-0 -z-30">
        <HeroVideoBackground active={isHeroInView} />
      </div>

      {/* Dark layers tuned so the background orb stays visible */}
      <div className="absolute inset-0 -z-20 bg-[#0a0a0a]/52" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(112deg,rgba(10,10,10,0.92)_0%,rgba(10,10,10,0.76)_42%,rgba(10,10,10,0.58)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="hero-ambient-glow hero-ambient-glow-purple" />
        <div className="hero-ambient-glow hero-ambient-glow-cyan" />
        <div className="hero-ambient-glow-center" />
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
        <div className="max-w-3xl">
          <p className="mb-6 text-xs uppercase tracking-[0.24em] text-[rgb(var(--text-white-soft-rgb)/0.55)]">
            Quepia Consultora Creativa
          </p>

          <h1 className="mb-6 text-balance font-display text-[clamp(1.8rem,3.8vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--text-primary)]">
            Diseñamos la identidad y estrategia de marcas que lideran el mañana.
          </h1>

          <p className="mb-10 max-w-xl text-base leading-relaxed text-[#a1a1aa] md:text-lg">
            Consultora creativa especializada en potenciar tu presencia digital a través de branding, contenido audiovisual y desarrollo estratégico.
          </p>

          <div className="flex flex-wrap items-center gap-5">
            <Link
              href="/contacto"
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#2ae7e4]/35 bg-gradient-to-br from-[#2ae7e4] to-[#7cf2ef] px-7 text-sm font-semibold uppercase tracking-[0.08em] text-[#0a0a0a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(42,231,228,0.38),0_14px_42px_rgba(42,231,228,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ae7e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              Iniciar un proyecto
            </Link>

            <span className="text-sm text-[rgb(var(--text-white-soft-rgb)/0.55)]">
              +40 proyectos entregados
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
