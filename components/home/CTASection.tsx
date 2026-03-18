import Link from 'next/link';

interface CTASectionProps {
  email?: string;
}

export default function CTASection({ email = 'hola@quepia.com' }: CTASectionProps) {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[10%] top-[-28%] h-[34rem] w-[34rem] rounded-full bg-[#9b2c8a]/34 blur-[150px]" />
        <div className="absolute -right-[12%] bottom-[-36%] h-[34rem] w-[34rem] rounded-full bg-[#2ae7e4]/32 blur-[150px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0.4)_0%,rgba(10,10,10,0.72)_100%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1050px] px-6 text-center md:px-12 lg:px-20">
        <div className="rounded-[26px] border border-white/12 bg-white/[0.04] px-6 py-12 backdrop-blur-[14px] md:px-12 md:py-16">
          <h2 className="mx-auto max-w-3xl font-display text-[clamp(2rem,4.1vw,3.6rem)] font-medium leading-[1.08] tracking-[-0.02em] text-[color:var(--text-primary)]">
            ¿Listo para elevar la presencia de tu marca?
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#a1a1aa] md:text-lg">
            Te mostramos una ruta concreta para avanzar con claridad estratégica y ejecución premium.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/contacto"
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#2ae7e4]/35 bg-gradient-to-br from-[#2ae7e4] to-[#7cf2ef] px-8 text-sm font-semibold uppercase tracking-[0.08em] text-[#0a0a0a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(42,231,228,0.38),0_14px_42px_rgba(42,231,228,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ae7e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              Hablemos hoy
            </Link>

            <a
              href={`mailto:${email}`}
              className="text-sm uppercase tracking-[0.12em] text-[rgb(var(--text-white-soft-rgb)/0.65)] transition-colors duration-300 hover:text-[color:var(--text-primary)]"
            >
              {email}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
