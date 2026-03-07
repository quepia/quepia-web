'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ArrowUpRight, Heart, Sparkles, Users, MapPin, Instagram, Linkedin, Mail } from 'lucide-react';
import type { Equipo } from '@/types/database';
import BrandDepthBackground from '@/components/ui/BrandDepthBackground';
import MarqueeSection from '@/components/home/MarqueeSection';

interface AboutClientProps {
  team: Equipo[];
}

const values = [
  {
    icon: Sparkles,
    title: 'Creatividad Estratégica',
    description: 'Unimos diseño y negocio para construir marcas con dirección clara y ejecución consistente.',
  },
  {
    icon: Users,
    title: 'Trabajo Colaborativo',
    description: 'Te involucramos en cada etapa para que cada decisión refleje tu visión y objetivos.',
  },
  {
    icon: Heart,
    title: 'Compromiso Real',
    description: 'Acompañamos cada proyecto con foco en calidad, impacto y crecimiento sostenido.',
  },
];

function TeamCard({ member, index }: { member: Equipo; index: number }) {
  const initials = member.nombre
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: 'easeOut' }}
      className="group overflow-hidden rounded-[24px] border border-white/[0.05] bg-[#070707]/90 backdrop-blur-[12px]"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {member.imagen_url ? (
          <Image
            src={member.imagen_url}
            alt={member.nombre}
            fill
            className="object-cover grayscale transition-all duration-700 group-hover:grayscale-0"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 420px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(42,231,228,0.16),rgba(136,16,120,0.2))] text-4xl font-semibold text-white/70">
            {initials}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_38%,rgba(0,0,0,0.72)_100%)]" />

        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 opacity-0 transition-all duration-300 group-hover:opacity-100">
          {member.instagram ? (
            <a href={member.instagram} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/15 bg-black/40 p-2 text-white/70 transition-colors hover:text-quepia-cyan">
              <Instagram size={14} />
            </a>
          ) : null}
          {member.linkedin ? (
            <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/15 bg-black/40 p-2 text-white/70 transition-colors hover:text-quepia-cyan">
              <Linkedin size={14} />
            </a>
          ) : null}
          {member.email ? (
            <a href={`mailto:${member.email}`} className="rounded-full border border-white/15 bg-black/40 p-2 text-white/70 transition-colors hover:text-quepia-cyan">
              <Mail size={14} />
            </a>
          ) : null}
        </div>
      </div>

      <div className="p-6 md:p-7">
        <h3 className="font-display text-[1.35rem] leading-[1.1] text-white">{member.nombre}</h3>
        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-quepia-cyan">{member.rol}</p>
        <p className="mt-4 text-sm leading-relaxed text-[#9ea0a8]">{member.bio}</p>
      </div>
    </motion.article>
  );
}

export default function AboutClient({ team }: AboutClientProps) {
  const teamToRender = team?.length ? team : [];

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
              className="absolute inset-0 h-full w-full scale-[1.38] object-cover object-center opacity-[0.14]"
              src={encodeURI('/VIDEOS CARDS/ANIMACIONES QUEPIA.mp4')}
            />
            <div className="absolute inset-0 bg-[linear-gradient(95deg,rgba(10,10,10,0.95)_0%,rgba(10,10,10,0.82)_48%,rgba(10,10,10,0.9)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,rgba(42,231,228,0.08),transparent_45%)]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="max-w-3xl"
            >
              <p className="mb-5 text-xs uppercase tracking-[0.24em] text-white/48">Sobre nosotros</p>

              <h1 className="font-display text-[clamp(1.9rem,3.9vw,3.45rem)] font-medium leading-[1.06] tracking-[-0.02em] text-white">
                Más que una agencia: un equipo creativo enfocado en resultados.
              </h1>

              <p className="mt-5 max-w-2xl text-[0.98rem] leading-relaxed text-[#a1a1aa] md:text-[1.05rem]">
                Desde Villa Carlos Paz, trabajamos con marcas que buscan una identidad sólida,
                diferenciación real y crecimiento sostenido.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/contacto"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[#2ae7e4]/35 bg-gradient-to-br from-[#2ae7e4] to-[#7cf2ef] px-6 text-xs font-semibold uppercase tracking-[0.08em] text-[#0a0a0a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(42,231,228,0.38),0_12px_36px_rgba(42,231,228,0.4)]"
                >
                  Empezar proyecto
                </Link>
                <span className="text-xs uppercase tracking-[0.14em] text-white/52">Equipo de {teamToRender.length || 2} personas</span>
              </div>
            </motion.div>
          </div>
        </section>

        <MarqueeSection />

        <section className="py-14 md:py-20">
          <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-8 px-6 md:px-12 lg:grid-cols-2 lg:gap-10 lg:px-20">
            <motion.article
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="overflow-hidden rounded-[24px] border border-white/[0.05] bg-[#070707]/90"
            >
              <div className="relative aspect-[5/4]">
                <Image
                  src="/images/villa-carlos-paz.avif"
                  alt="Vista aérea de Villa Carlos Paz, Córdoba"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_40%,rgba(0,0,0,0.7)_100%)]" />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 text-sm text-white/85">
                  <MapPin size={16} className="text-quepia-cyan" />
                  Villa Carlos Paz, Córdoba
                </div>
              </div>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, delay: 0.06, ease: 'easeOut' }}
              className="rounded-[24px] border border-white/[0.05] bg-[#070707]/90 p-7 backdrop-blur-[12px] md:p-8"
            >
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">Nuestra historia</p>
              <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Diseñamos marcas con visión de largo plazo.
              </h2>

              <div className="mt-5 space-y-4 text-sm leading-relaxed text-[#9ea0a8]">
                <p>
                  En Quepia integramos estrategia, diseño y ejecución para crear sistemas de marca claros,
                  consistentes y memorables.
                </p>
                <p>
                  Trabajamos en equipo con cada cliente para traducir objetivos de negocio en decisiones creativas
                  concretas y medibles.
                </p>
                <p>
                  Nuestro enfoque combina sensibilidad estética con criterio comercial para construir valor real.
                </p>
              </div>
            </motion.article>
          </div>
        </section>

        <section className="border-t border-white/6 py-16 md:py-20">
          <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <div className="mb-8 md:mb-10">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">Equipo</p>
              <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Las personas detrás de cada proyecto.
              </h2>
            </div>

            {teamToRender.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {teamToRender.map((member, index) => (
                  <TeamCard key={member.id} member={member} index={index} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center">
                <p className="text-sm text-white/50">No hay miembros del equipo configurados todavía.</p>
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-white/6 py-16 md:py-20">
          <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <div className="mb-8 md:mb-10">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">Filosofía</p>
              <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Cómo trabajamos en cada etapa.
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {values.map((value, index) => (
                <motion.article
                  key={value.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
                  className="rounded-[20px] border border-white/[0.06] bg-[#0a0a0a]/55 p-6 backdrop-blur-[10px]"
                >
                  <div className="w-fit rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-white/70">
                    <value.icon size={18} />
                  </div>
                  <h3 className="mt-4 font-display text-[1.15rem] font-medium leading-[1.2] text-white">{value.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9ea0a8]">{value.description}</p>
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
                ¿Listo para construir tu próxima etapa de marca?
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#a1a1aa] md:text-base">
                Trabajamos con foco estratégico, diseño sólido y ejecución consistente para que tu marca avance.
              </p>

              <Link
                href="/contacto"
                className="mt-8 inline-flex items-center gap-2 text-sm uppercase tracking-[0.1em] text-white/68 transition-all duration-300 hover:gap-3 hover:text-white"
              >
                Hablar con Quepia
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
