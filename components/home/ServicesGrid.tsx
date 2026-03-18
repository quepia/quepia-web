import Link from 'next/link';
import type { Servicio } from '@/types/database';

interface ServicesGridProps {
  servicios: Servicio[];
}

interface ExpertiseCardConfig {
  title: string;
  description: string;
  label: string;
  hoverGlow: string;
  accent: string;
  gridTint: string;
}

interface ExpertiseCardProps {
  card: ExpertiseCardConfig;
  index: number;
  relatedHref: string;
}

const expertiseCards: ExpertiseCardConfig[] = [
  {
    title: 'Identidad y Branding',
    description:
      'Construimos marcas sólidas, memorables y con propósito que conectan genuinamente con tu audiencia.',
    label: 'Sistema de marca',
    hoverGlow: 'rgba(244, 106, 210, 0.12)',
    accent: 'linear-gradient(135deg, rgba(244,106,210,0.28) 0%, rgba(136,16,120,0.14) 100%)',
    gridTint: 'rgba(244, 106, 210, 0.08)',
  },
  {
    title: 'Social Media & Estrategia',
    description:
      'No solo publicamos. Creamos comunidades activas y estrategias digitales orientadas a la conversión.',
    label: 'Comunidad & performance',
    hoverGlow: 'rgba(42, 231, 228, 0.12)',
    accent: 'linear-gradient(135deg, rgba(42,231,228,0.24) 0%, rgba(11,37,43,0.1) 100%)',
    gridTint: 'rgba(42, 231, 228, 0.08)',
  },
  {
    title: 'Producción Audiovisual',
    description:
      'Capturamos la esencia de tu proyecto con fotografía de alto nivel y edición de video dinámica.',
    label: 'Foto, video, edición',
    hoverGlow: 'rgba(255, 138, 91, 0.12)',
    accent: 'linear-gradient(135deg, rgba(255,138,91,0.26) 0%, rgba(56,24,18,0.1) 100%)',
    gridTint: 'rgba(255, 138, 91, 0.08)',
  },
  {
    title: 'Diseño de Productos y Packaging',
    description:
      'Diseñamos piezas, envases y experiencias de producto con criterio estratégico para destacar en góndola, comunicar valor y reforzar la identidad de marca.',
    label: 'Producto & empaque',
    hoverGlow: 'rgba(141, 255, 182, 0.12)',
    accent: 'linear-gradient(135deg, rgba(141,255,182,0.24) 0%, rgba(26,44,33,0.12) 100%)',
    gridTint: 'rgba(141, 255, 182, 0.08)',
  },
];

export default function ServicesGrid({ servicios }: ServicesGridProps) {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 bottom-0 bg-[#010101]" />
        <div className="absolute left-1/2 top-1/2 h-[42rem] w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-[42px] bg-[#000000] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_80px_200px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.015)]" />
        <div className="absolute inset-x-[4%] top-10 bottom-10 rounded-[40px] bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.02),transparent_26%),linear-gradient(180deg,#020202_0%,#000000_100%)]" />
        <div className="absolute inset-x-[8%] top-16 bottom-16 rounded-[36px] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.012),transparent_36%)] opacity-80" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
        <div className="mb-10 md:mb-14">
          <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[rgb(var(--text-white-soft-rgb)/0.45)]">
            Áreas de expertise
          </p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em] text-[color:var(--text-primary)]">
            Capacidades estratégicas para construir marcas con impacto real.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {expertiseCards.map((card, index) => {
            const cmsService = servicios[index];
            const relatedHref = cmsService?.categoria_trabajo
              ? `/trabajos?category=${cmsService.categoria_trabajo}`
              : '/servicios';

            return (
              <ExpertiseCard
                key={card.title}
                card={card}
                index={index}
                relatedHref={relatedHref}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ExpertiseCard({ card, index, relatedHref }: ExpertiseCardProps) {
  return (
    <div>
      <article
        className="group relative overflow-hidden rounded-[26px] border border-white/5 bg-[#040404]/95 p-7 shadow-[0_30px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-[8px] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-white/10 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.035),0_38px_100px_rgba(0,0,0,0.72)] md:min-h-[450px] md:p-10"
        style={{ transitionDelay: `${index * 30}ms` }}
      >
        <div aria-hidden="true" className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(255,255,255,0.06),transparent_24%),linear-gradient(145deg,rgba(255,255,255,0.03),transparent_42%,rgba(255,255,255,0.02)_100%)]" />
          <div
            className="absolute -right-10 top-[-6%] h-56 w-56 rounded-full blur-[92px]"
            style={{ background: card.hoverGlow }}
          />
          <div
            className="absolute bottom-10 right-8 h-36 w-36 rounded-[28px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            style={{ background: card.accent }}
          />
          <div
            className="absolute inset-[18%_8%_14%_50%] rounded-[30px] border border-white/6 opacity-80"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0.035), transparent 38%, rgba(255,255,255,0.01) 100%), linear-gradient(90deg, ${card.gridTint} 0%, transparent 100%)`,
            }}
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_24%,transparent_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,2,2,0.9)_0%,rgba(2,2,2,0.82)_42%,rgba(2,2,2,0.58)_66%,rgba(2,2,2,0.76)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_85%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.34)_58%,rgba(0,0,0,0.82)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-[0.03]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(360px circle at 50% 50%, ${card.hoverGlow} 0%, rgba(255,255,255,0.04) 18%, transparent 58%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)] opacity-45" />
        <div
          aria-hidden="true"
          className="absolute inset-[12%_7%_12%_48%] rounded-[34px] border border-dashed border-white/8"
        />

        <div className="relative z-10 flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--text-white-soft-rgb)/0.38)]">
              {String(index + 1).padStart(2, '0')}
            </p>
            <span
              className="rounded-full border border-white/55 bg-white/[0.02] px-3 py-1.5 text-[0.64rem] uppercase tracking-[0.24em] text-[rgb(var(--text-white-soft-rgb)/0.55)]"
            >
              {card.label}
            </span>
          </div>

          <div className="mt-6 md:max-w-[54%]">
            <h3 className="mb-4 font-display text-[clamp(1.6rem,2.7vw,2.35rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-[color:var(--text-primary)]">
              {card.title}
            </h3>

            <p className="text-[1.02rem] leading-relaxed text-[#9a9aa1]">
              {card.description}
            </p>
          </div>

          <Link
            href={relatedHref}
            className="mt-8 inline-flex items-center gap-2 text-sm uppercase tracking-[0.12em] text-[rgb(var(--text-white-soft-rgb)/0.55)] transition-all duration-300 hover:gap-3 hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505] md:mt-auto md:max-w-[54%] md:pt-16"
          >
            Ver proyectos relacionados
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </article>
    </div>
  );
}
