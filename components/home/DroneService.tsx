import Link from 'next/link';
import { ArrowUpRight, Drone } from 'lucide-react';

export default function DroneService() {
  return (
        <div className="mt-10 border-t border-white/10 pt-10 md:mt-14 md:pt-14">
          <h2 className="mb-6 font-display text-2xl font-medium tracking-[-0.02em] text-[color:var(--text-primary)] md:text-3xl">
            Otros servicios
          </h2>
          <article className="flex flex-col gap-6 rounded-[24px] border border-white/10 bg-[#060606]/78 p-6 backdrop-blur-[18px] md:flex-row md:items-center md:p-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#2ae7e4]/20 bg-[#2ae7e4]/10 text-[#2ae7e4]">
              <Drone className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-xl font-semibold text-[color:var(--text-primary)] md:text-2xl">
                Cobertura con dron
              </h3>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#a1a1aa]">
                Sumá otra perspectiva a tu proyecto con imágenes y videos aéreos. Contanos qué necesitás y armamos una propuesta a medida.
              </p>
            </div>
            <Link
              href="/contacto"
              aria-label="Consultar precio de cobertura con dron"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-[color:var(--text-primary)] transition-all duration-300 hover:border-[#2ae7e4]/45 hover:bg-[#2ae7e4]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ae7e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060606]"
            >
              Consultar precio
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        </div>
  );
}
