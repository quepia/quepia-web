'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Proyecto } from '@/types/database';
import { getProjectCoverImage } from '@/lib/project-images';
import { getCategoryLabel, getPrimaryProjectCategory, getProjectCategories } from '@/lib/project-categories';

interface HomeCarouselProps {
  proyectos: Proyecto[];
}

const impactFallbacks = [
  '+38% de leads calificados en 90 días.',
  'Incremento sostenido en reconocimiento de marca y engagement.',
  'Mayor claridad de posicionamiento con mejor conversión digital.',
];

function ProjectMockup({
  coverImage,
  title,
  priority = false,
}: {
  coverImage: string | null;
  title: string;
  priority?: boolean;
}) {
  const browserControls = [
    { name: 'close', className: 'bg-[#ff5f57] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]' },
    { name: 'minimize', className: 'bg-[#febc2e] shadow-[0_0_0_1px_rgba(0,0,0,0.2)]' },
    { name: 'maximize', className: 'bg-[#28c840] shadow-[0_0_0_1px_rgba(0,0,0,0.2)]' },
  ];

  return (
    <div className="w-full rounded-[22px] border border-white/10 bg-[#0f0f0f]/90 p-3 shadow-[0_24px_65px_rgba(0,0,0,0.5)]">
      <div className="mb-3 flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-2">
          {browserControls.map((control) => (
            <span
              key={control.name}
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${control.className}`}
            />
          ))}
        </div>
        <div className="h-2 w-20 rounded-full bg-white/8" aria-hidden="true" />
      </div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-[14px] border border-white/10 bg-[#161616]">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 92vw, (max-width: 1280px) 58vw, 800px"
            quality={72}
            priority={priority}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#9b2c8a]/35 to-[#2ae7e4]/30" />
        )}
      </div>
    </div>
  );
}

function CaseStudyCard({ proyecto, index }: { proyecto: Proyecto; index: number }) {
  const coverImage = getProjectCoverImage(proyecto);
  const services = [
    ...getProjectCategories(proyecto).map(getCategoryLabel),
    'Estrategia',
    'Producción',
  ];
  const impact = proyecto.descripcion?.trim() || impactFallbacks[index % impactFallbacks.length];
  const isOdd = index % 2 === 1;
  const primaryCategory = getPrimaryProjectCategory(proyecto);

  return (
    <article className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-[12px] md:p-8">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className={isOdd ? 'lg:order-2' : 'lg:order-1'}>
          <ProjectMockup
            coverImage={coverImage}
            title={proyecto.titulo}
            priority={index === 0}
          />
        </div>

        <div className={isOdd ? 'lg:order-1' : 'lg:order-2'}>
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[rgb(var(--text-white-soft-rgb)/0.45)]">
            Proyecto destacado
          </p>

          <h3 className="mb-4 font-display text-[clamp(1.5rem,2.6vw,2.2rem)] font-semibold leading-[1.15] text-[color:var(--text-primary)]">
            {proyecto.titulo}
          </h3>

          <div className="mb-5 flex flex-wrap gap-2.5">
            {services.map((service) => (
              <span
                key={`${proyecto.id}-${service}`}
                className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.08em] text-[rgb(var(--text-white-soft-rgb)/0.7)]"
              >
                {service}
              </span>
            ))}
          </div>

          <p className="mb-7 text-base leading-relaxed text-[#a1a1aa]">
            <span className="font-medium text-[rgb(var(--text-white-soft-rgb)/0.9)]">Impacto:</span> {impact}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/trabajos?category=${primaryCategory}`}
              className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.12em] text-[rgb(var(--text-white-soft-rgb)/0.65)] transition-all duration-300 hover:gap-3 hover:text-[#2ae7e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ae7e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              Ver caso completo
              <span aria-hidden="true">→</span>
            </Link>

            <Link
              href="/trabajos"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.14em] text-[rgb(var(--text-white-soft-rgb)/0.75)] transition-colors duration-300 hover:border-[#2ae7e4]/60 hover:text-[#2ae7e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ae7e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              Ver más trabajos
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HomeCarousel({ proyectos }: HomeCarouselProps) {
  if (!proyectos || proyectos.length === 0) {
    return null;
  }
  const featuredProjects = proyectos;

  return (
    <section className="relative isolate overflow-hidden py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[#0d0d10]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.02),transparent_28%),linear-gradient(180deg,rgba(22,22,26,0.56)_0%,rgba(14,14,18,0.12)_18%,rgba(10,10,12,0.38)_100%)]" />
        <div
          aria-hidden="true"
          className="absolute -left-[14%] top-[6%] h-[24rem] w-[24rem] rounded-full blur-[110px] md:h-[30rem] md:w-[30rem]"
          style={{ background: 'radial-gradient(circle, rgba(136,16,120,0.16) 0%, rgba(136,16,120,0.05) 34%, transparent 72%)' }}
        />
        <div
          aria-hidden="true"
          className="absolute right-[-10%] top-[14%] h-[21rem] w-[21rem] rounded-full blur-[105px] md:h-[27rem] md:w-[27rem]"
          style={{ background: 'radial-gradient(circle, rgba(42,231,228,0.14) 0%, rgba(42,231,228,0.04) 36%, transparent 72%)' }}
        />
        <div
          aria-hidden="true"
          className="absolute left-[28%] top-[32%] h-[18rem] w-[32rem] rounded-full blur-[120px]"
          style={{ background: 'linear-gradient(90deg, rgba(136,16,120,0.06) 0%, rgba(42,231,228,0.07) 52%, rgba(136,16,120,0.04) 100%)' }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-[8%] bottom-[10%] h-24 rounded-full blur-[70px]"
          style={{ background: 'linear-gradient(90deg, rgba(42,231,228,0.025), rgba(136,16,120,0.06), rgba(42,231,228,0.025))' }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
        <div className="mb-10 md:mb-14">
          <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[rgb(var(--text-white-soft-rgb)/0.45)]">
            Portafolio
          </p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em] text-[color:var(--text-primary)]">
            Casos de Éxito
          </h2>
        </div>

        <div className="space-y-6 md:space-y-8">
          {featuredProjects.map((proyecto, index) => (
            <CaseStudyCard key={proyecto.id} proyecto={proyecto} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
