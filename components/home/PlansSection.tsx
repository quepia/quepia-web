'use client';

import Link from 'next/link';
import DroneService from './DroneService';
import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const plans = [
  {
    name: 'Esencial',
    eyebrow: 'Base visual',
    description:
      'Para marcas que necesitan ordenar su presencia y empezar a comunicar con claridad.',
    accent: 'cyan',
    coverage: [
      'Diagnóstico inicial de marca',
      'Revisión de presencia digital',
      'Definición de línea visual base',
      'Organización de contenidos principales',
      'Diseño de piezas para redes',
      'Adaptación a formatos de Instagram',
      'Recomendaciones de mejora comunicacional',
    ],
  },
  {
    name: 'Plus',
    eyebrow: 'Presencia activa',
    description:
      'Para marcas que quieren mejorar su imagen, sostener contenido activo y comunicar con más estrategia.',
    accent: 'magenta',
    featured: true,
    coverage: [
      'Diagnóstico de marca y comunicación',
      'Dirección estética para redes',
      'Calendario mensual de contenidos',
      'Diseño de publicaciones y carruseles',
      'Diseño de historias para Instagram',
      'Redacción de copies para redes',
      'Propuestas de reels o piezas audiovisuales',
      'Reunión mensual de seguimiento',
    ],
  },
  {
    name: 'Premium',
    eyebrow: 'Ecosistema integral',
    description:
      'Para marcas que necesitan una presencia sólida, integral y preparada para crecer.',
    accent: 'mixed',
    coverage: [
      'Diagnóstico integral de marca',
      'Estrategia de comunicación digital',
      'Desarrollo de sistema visual para redes',
      'Calendario de contenidos mensual',
      'Diseño de publicaciones, carruseles e historias',
      'Piezas para campañas publicitarias',
      'Copies comerciales e ideas audiovisuales',
      'Adaptación de piezas para web o landing',
      'Seguimiento estratégico',
    ],
  },
];

const accentStyles = {
  cyan: {
    border: 'hover:border-[#2ae7e4]/45',
    glow: 'group-hover:shadow-[0_0_0_1px_rgba(42,231,228,0.18),0_28px_90px_rgba(42,231,228,0.1)]',
    chip: 'border-[#2ae7e4]/28 bg-[#2ae7e4]/8 text-[#9ff7f5]',
  },
  magenta: {
    border: 'hover:border-[#c026d3]/45',
    glow: 'group-hover:shadow-[0_0_0_1px_rgba(192,38,211,0.18),0_28px_90px_rgba(136,16,120,0.18)]',
    chip: 'border-[#c026d3]/32 bg-[#881078]/18 text-[#f0b7ee]',
  },
  mixed: {
    border: 'hover:border-white/20',
    glow: 'group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_28px_90px_rgba(42,231,228,0.08)]',
    chip: 'border-white/18 bg-white/[0.05] text-white/72',
  },
};

export default function PlansSection() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
        <div className="absolute left-[6%] top-[10%] h-[24rem] w-[24rem] rounded-full bg-[#2ae7e4]/10 blur-[130px]" />
        <div className="absolute right-[4%] bottom-[4%] h-[28rem] w-[28rem] rounded-full bg-[#881078]/22 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.055),transparent_34%),linear-gradient(180deg,rgba(5,5,5,0)_0%,rgba(5,5,5,0.52)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-10 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[rgb(var(--text-white-soft-rgb)/0.45)]">
              Planes comerciales
            </p>
            <h2 className="max-w-3xl font-display text-[clamp(1.8rem,3.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em] text-[color:var(--text-primary)]">
              Una estructura para alinear foco, alcance y crecimiento.
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-[#a1a1aa]">
            Conocé qué incluye cada plan y consultanos por una propuesta a medida de tu marca.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const style = accentStyles[plan.accent as keyof typeof accentStyles];

            return (
              <motion.article
                key={plan.name}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-90px' }}
                transition={{ duration: 0.48, delay: index * 0.07, ease: 'easeOut' }}
                className={`group relative flex h-full flex-col overflow-hidden rounded-[24px] border bg-[#060606]/78 p-6 backdrop-blur-[18px] transition-all duration-300 md:p-7 ${
                  plan.featured
                    ? 'border-[#2ae7e4]/22 shadow-[0_0_0_1px_rgba(42,231,228,0.1),0_28px_90px_rgba(0,0,0,0.5)]'
                    : 'border-white/10'
                } ${style.border} ${style.glow}`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),transparent_28%)] opacity-70" />
                <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)]" />

                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <span className={`rounded-full border px-3 py-1.5 text-[0.66rem] uppercase tracking-[0.2em] ${style.chip}`}>
                      {plan.eyebrow}
                    </span>
                    {plan.featured ? (
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#2ae7e4]/20 bg-[#2ae7e4]/10 text-[#2ae7e4]">
                        <Sparkles className="h-4 w-4" />
                      </span>
                    ) : null}
                  </div>

                  <h3 className="font-display text-[clamp(1.65rem,2.4vw,2.15rem)] font-semibold leading-[1.05] text-[color:var(--text-primary)]">
                    Plan {plan.name}
                  </h3>
                  <p className="mt-4 min-h-[5.25rem] text-[0.98rem] leading-relaxed text-[#a1a1aa]">
                    {plan.description}
                  </p>

                  <Link
                    href={`/contacto?plan=${encodeURIComponent(plan.name)}`}
                    className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 text-sm font-semibold uppercase tracking-[0.1em] text-[color:var(--text-primary)] transition-all duration-300 hover:border-[#2ae7e4]/45 hover:bg-[#2ae7e4]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ae7e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060606]"
                  >
                    Consultar precio
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>

                  <div className="my-7 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0.14),rgba(255,255,255,0.035))]" />

                  <div className="grid gap-7">
                    <PlanList title="Cobertura" items={plan.coverage} />
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>

        <DroneService />
      </div>
    </section>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
        {title}
      </h4>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-[#b5b5bb]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2ae7e4]/78" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
