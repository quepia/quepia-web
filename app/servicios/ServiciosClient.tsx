'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import type { Servicio } from '@/types/database';
import { getServiceIconByName } from '@/lib/service-icons';
import BrandDepthBackground from '@/components/ui/BrandDepthBackground';
import MarqueeSection from '@/components/home/MarqueeSection';

interface ServiciosClientProps {
  servicios: Servicio[];
}

const processSteps = [
  { step: '01', title: 'Descubrimiento', desc: 'Entendemos tu marca, objetivos y audiencia.' },
  { step: '02', title: 'Estrategia', desc: 'Diseñamos un plan creativo a medida.' },
  { step: '03', title: 'Creación', desc: 'Desarrollamos soluciones visuales impactantes.' },
  { step: '04', title: 'Entrega', desc: 'Implementamos y acompañamos el crecimiento.' },
];

function ServiceCard({ service, index }: { service: Servicio; index: number }) {
  const IconComponent = getServiceIconByName(service.icono);
  const relatedHref = service.categoria_trabajo
    ? `/trabajos?category=${service.categoria_trabajo}`
    : '/trabajos';
  const topFeatures = (service.features || []).slice(0, 3);

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-[24px] border border-white/[0.05] bg-[#070707]/90 p-6 backdrop-blur-[12px] transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.08] hover:shadow-[0_28px_80px_rgba(0,0,0,0.5)] md:p-7"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_30%,transparent_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-[radial-gradient(320px_circle_at_85%_8%,rgba(42,231,228,0.12),transparent_55%)]" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-5 flex items-start justify-between gap-4">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-white/35">
            {String(index + 1).padStart(2, '0')}
          </p>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-white/70">
            {IconComponent ? <IconComponent size={18} /> : null}
          </div>
        </div>

        <h3 className="font-display text-[1.18rem] font-medium leading-[1.15] tracking-[-0.015em] text-white md:text-[1.3rem]">
          {service.titulo}
        </h3>

        <p className="mt-3 text-sm leading-relaxed text-[#9ea0a8]">
          {service.descripcion_corta}
        </p>

        {topFeatures.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {topFeatures.map((feature) => (
              <span
                key={`${service.id}-${feature}`}
                className="rounded-full border border-white/[0.08] bg-white/[0.015] px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.12em] text-white/50"
              >
                {feature}
              </span>
            ))}
          </div>
        ) : null}

        <Link
          href={relatedHref}
          className="mt-7 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/58 transition-all duration-300 hover:gap-3 hover:text-white"
        >
          Ver proyectos
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </motion.article>
  );
}

export default function ServiciosClient({ servicios }: ServiciosClientProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <BrandDepthBackground variant="subtle" />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#0a0a0a_0%,#101010_42%,#0d0d0d_100%)]" />

      <div className="relative z-10">
        <section className="relative overflow-hidden pb-14 pt-28 md:pb-20 md:pt-32">
          <div className="pointer-events-none absolute left-1/2 top-0 z-0 h-screen w-screen -translate-x-1/2">
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full scale-[1.38] object-cover object-center opacity-[0.15]"
              src={encodeURI('/VIDEOS CARDS/ANIMACIONES QUEPIA.mp4')}
            />
            <div className="absolute inset-0 bg-[linear-gradient(95deg,rgba(10,10,10,0.94)_0%,rgba(10,10,10,0.82)_48%,rgba(10,10,10,0.9)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,rgba(42,231,228,0.08),transparent_45%)]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="max-w-3xl"
            >
              <p className="mb-5 text-xs uppercase tracking-[0.24em] text-white/48">
                Nuestros servicios
              </p>

              <h1 className="font-display text-[clamp(1.9rem,3.9vw,3.45rem)] font-medium leading-[1.06] tracking-[-0.02em] text-white">
                Soluciones creativas para marcas que quieren destacar.
              </h1>

              <p className="mt-5 max-w-2xl text-[0.98rem] leading-relaxed text-[#a1a1aa] md:text-[1.05rem]">
                Diseño, estrategia y ejecución que elevan tu presencia en el mercado.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/contacto"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[#2ae7e4]/35 bg-gradient-to-br from-[#2ae7e4] to-[#7cf2ef] px-6 text-xs font-semibold uppercase tracking-[0.08em] text-[#0a0a0a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(42,231,228,0.38),0_12px_36px_rgba(42,231,228,0.4)]"
                >
                  Hablemos
                </Link>
                <span className="text-xs uppercase tracking-[0.14em] text-white/52">
                  {servicios.length} servicios activos
                </span>
              </div>
            </motion.div>
          </div>
        </section>

        <MarqueeSection servicios={servicios} />

        <section className="py-14 md:py-20">
          <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <div className="mb-8 md:mb-10">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">
                Áreas de trabajo
              </p>
              <h2 className="max-w-3xl font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Servicios diseñados para resolver desafíos reales de marca.
              </h2>
            </div>

            {servicios.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {servicios.map((service, index) => (
                  <ServiceCard key={service.id} service={service} index={index} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center">
                <p className="text-sm text-white/50">No hay servicios configurados todavía.</p>
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-white/6 py-16 md:py-20">
          <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <div className="mb-8 md:mb-10">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">Proceso</p>
              <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Cómo trabajamos
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {processSteps.map((item, index) => (
                <motion.article
                  key={item.step}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
                  className="rounded-[20px] border border-white/[0.06] bg-[#0a0a0a]/55 p-5 backdrop-blur-[10px] transition-all duration-300 hover:border-[#2ae7e4]/20"
                >
                  <p className="font-mono text-[0.75rem] text-white/35">{item.step}</p>
                  <h3 className="mt-3 font-display text-[1.15rem] font-medium leading-[1.2] text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9ea0a8]">{item.desc}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden py-20 md:py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-[12%] top-[-34%] h-[30rem] w-[30rem] rounded-full bg-[#9b2c8a]/26 blur-[140px]" />
            <div className="absolute -right-[12%] bottom-[-36%] h-[30rem] w-[30rem] rounded-full bg-[#2ae7e4]/22 blur-[140px]" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative mx-auto w-full max-w-[980px] px-6 text-center md:px-12 lg:px-20"
          >
            <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.03] px-6 py-12 backdrop-blur-[12px] md:px-12">
              <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.6rem,3vw,2.4rem)] font-medium leading-[1.1] text-white">
                ¿Tenés un proyecto en mente?
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#a1a1aa] md:text-base">
                Cada proyecto es único. Contanos tu idea y diseñamos una solución a medida.
              </p>

              <Link
                href="/contacto"
                className="mt-8 inline-flex items-center gap-2 text-sm uppercase tracking-[0.1em] text-white/68 transition-all duration-300 hover:gap-3 hover:text-white"
              >
                Empezar conversación
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
