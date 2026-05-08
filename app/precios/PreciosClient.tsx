'use client';

import { motion } from 'framer-motion';
import BrandDepthBackground from '@/components/ui/BrandDepthBackground';
import PlansSection from '@/components/home/PlansSection';
import ContactFormCard from '@/components/contact/ContactFormCard';

export default function PreciosClient() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <BrandDepthBackground variant="subtle" />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#0a0a0a_0%,#101010_42%,#0d0d0d_100%)]" />

      <div className="relative z-10">
        <section className="relative overflow-hidden pb-10 pt-28 md:pb-14 md:pt-32">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-[-12%] top-[-28%] h-[30rem] w-[30rem] rounded-full bg-[#881078]/24 blur-[145px]" />
            <div className="absolute right-[-10%] top-[12%] h-[28rem] w-[28rem] rounded-full bg-[#2ae7e4]/14 blur-[135px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.055),transparent_34%)]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="max-w-4xl"
            >
              <p className="mb-5 text-xs uppercase tracking-[0.24em] text-white/48">
                Precios
              </p>
              <h1 className="font-display text-[clamp(2.05rem,5.6vw,5rem)] font-medium leading-[1.02] tracking-[-0.02em] text-white">
                Planes para ordenar, activar y escalar tu presencia digital.
              </h1>
              <p className="mt-6 max-w-2xl text-[1rem] leading-relaxed text-[#a1a1aa] md:text-[1.08rem]">
                Una base clara para entender alcance, foco y punto de partida. Cada propuesta se ajusta según la etapa de la marca y los objetivos comerciales.
              </p>
            </motion.div>
          </div>
        </section>

        <PlansSection />

        <section id="consulta" className="relative overflow-hidden py-16 md:py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-px w-full -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
            <div className="absolute -left-[14%] top-[4%] h-[28rem] w-[28rem] rounded-full bg-[#2ae7e4]/10 blur-[140px]" />
            <div className="absolute -right-[10%] bottom-[-20%] h-[28rem] w-[28rem] rounded-full bg-[#881078]/20 blur-[150px]" />
          </div>

          <div className="relative z-10 mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-8 px-6 md:px-12 lg:grid-cols-[0.85fr_1fr] lg:px-20">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="flex flex-col justify-center"
            >
              <p className="mb-4 text-xs uppercase tracking-[0.24em] text-white/45">
                Consulta
              </p>
              <h2 className="font-display text-[clamp(1.8rem,3.6vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.02em] text-white">
                Contanos qué plan te interesa y armamos una propuesta concreta.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#a1a1aa]">
                Usamos el mismo formulario de contacto para centralizar consultas y responder con próximos pasos claros.
              </p>
            </motion.div>

            <ContactFormCard
              eyebrow="Formulario"
              title="Solicitá tu propuesta."
              source="pricing_form"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
