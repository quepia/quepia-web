import type { CSSProperties } from 'react';

const methodColumns = [
  {
    title: 'Descubrimiento',
    description:
      'Analizamos tu mercado y entendemos el núcleo de tu negocio.',
  },
  {
    title: 'Estrategia',
    description:
      'Diseñamos un plan de acción a medida, alineando creatividad con objetivos comerciales.',
  },
  {
    title: 'Ejecución',
    description:
      'Implementamos soluciones visuales y digitales con los más altos estándares de calidad.',
  },
];

const ambientVideoMask: CSSProperties = {
  WebkitMaskImage:
    'radial-gradient(128% 110% at 50% 42%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.94) 36%, rgba(255,255,255,0.72) 58%, rgba(255,255,255,0.24) 80%, transparent 100%)',
  maskImage:
    'radial-gradient(128% 110% at 50% 42%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.94) 36%, rgba(255,255,255,0.72) 58%, rgba(255,255,255,0.24) 80%, transparent 100%)',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
};

export default function ProcessSection() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-[-12%] inset-y-[-6%] overflow-hidden" style={ambientVideoMask}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_34%_48%,rgba(42,231,228,0.14),transparent_26%),radial-gradient(circle_at_66%_46%,rgba(155,44,138,0.16),transparent_30%),linear-gradient(140deg,rgba(255,255,255,0.02),rgba(255,255,255,0)_54%)] blur-[10px]" />
          <div className="absolute inset-[10%_22%_12%_22%] rounded-full border border-white/10 opacity-55" />
          <div className="absolute inset-[18%_28%_20%_28%] rounded-full border border-white/6 opacity-50" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(42,231,228,0.08)_0%,rgba(155,44,138,0.06)_28%,rgba(5,5,5,0)_56%,rgba(5,5,5,0.62)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.98)_12%,rgba(5,5,5,0.68)_28%,rgba(5,5,5,0.22)_50%,rgba(5,5,5,0.68)_72%,rgba(5,5,5,0.98)_88%,#050505_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#050505_0%,rgba(5,5,5,0.82)_10%,rgba(5,5,5,0.26)_34%,rgba(5,5,5,0.18)_66%,rgba(5,5,5,0.9)_90%,#050505_100%)]" />
        <div className="absolute left-1/2 top-[18%] h-[12rem] w-[34rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(42,231,228,0.08)_0%,rgba(155,44,138,0.06)_38%,transparent_72%)] blur-[48px]" />
      </div>

      <div className="pointer-events-none absolute -left-[16%] top-[6%] h-[28rem] w-[28rem] rounded-full bg-[#9b2c8a]/18 blur-[140px]" />
      <div className="pointer-events-none absolute -right-[14%] bottom-[0%] h-[28rem] w-[28rem] rounded-full bg-[#2ae7e4]/14 blur-[140px]" />
      <div className="pointer-events-none absolute inset-x-0 top-[12%] h-[1px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
        <div className="mb-10 md:mb-14">
          <h2 className="max-w-3xl font-display text-[clamp(1.8rem,3.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em] text-[color:var(--text-primary)]">
            No solo diseñamos, construimos sistemas.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {methodColumns.map((column, index) => (
            <article
              key={column.title}
              className="rounded-[20px] border border-white/10 bg-[#0a0a0a]/50 p-7 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-[#2ae7e4]/45 hover:shadow-[0_0_0_1px_rgba(42,231,228,0.22),0_18px_50px_rgba(0,0,0,0.45)] md:p-8"
            >
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[rgb(var(--text-white-soft-rgb)/0.45)]">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mb-4 font-display text-[clamp(1.2rem,2vw,1.6rem)] font-semibold leading-[1.2] text-[color:var(--text-primary)]">
                {column.title}
              </h3>
              <p className="text-base leading-relaxed text-[#a1a1aa]">
                {column.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
