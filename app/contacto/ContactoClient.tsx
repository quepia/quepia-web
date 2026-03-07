'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Clock, Instagram, Mail, MapPin, Phone, Send } from 'lucide-react';
import type { SiteConfig } from '@/lib/fetchConfig';
import { useConfig } from '@/components/layout/ClientLayout';
import BrandDepthBackground from '@/components/ui/BrandDepthBackground';
import MarqueeSection from '@/components/home/MarqueeSection';

const faqItems = [
  {
    q: '¿Cuál es el tiempo de respuesta?',
    a: 'Respondemos en menos de 24 horas hábiles con próximos pasos claros para avanzar.',
  },
  {
    q: '¿Trabajan con clientes de otras ciudades?',
    a: 'Sí. Coordinamos todo el proceso de forma remota por videollamada y herramientas colaborativas.',
  },
  {
    q: '¿Cómo se organiza el pago?',
    a: 'Generalmente trabajamos con una seña inicial y el saldo por hitos definidos según alcance.',
  },
];

export default function ContactoClient() {
  const config = useConfig() as SiteConfig;
  const [formState, setFormState] = useState({
    nombre: '',
    email: '',
    servicio: '',
    mensaje: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const contactInfo = [
    {
      icon: Mail,
      label: 'Email',
      value: config?.email_contacto || 'quepiacomunicacion@gmail.com',
      href: `mailto:${config?.email_contacto || 'quepiacomunicacion@gmail.com'}`,
    },
    {
      icon: Phone,
      label: 'WhatsApp',
      value: config?.telefono || 'Enviar mensaje',
      href: config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}` : '#',
    },
    {
      icon: Instagram,
      label: 'Instagram',
      value: '@quepia.ok',
      href: config?.instagram || '#',
    },
    {
      icon: MapPin,
      label: 'Ubicación',
      value: config?.direccion || 'Villa Carlos Paz, Córdoba',
    },
    {
      icon: Clock,
      label: 'Horario',
      value: `${config?.horario_dias || 'Lunes a Viernes'}, ${config?.horario_horas || '9:00 - 18:00'}`,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'contact_form',
          data: {
            name: formState.nombre,
            email: formState.email,
            service: formState.servicio,
            message: formState.mensaje,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Error al enviar el mensaje');
      }

      setIsSubmitted(true);
    } catch (error) {
      console.error('Error sending contact form:', error);
      setSubmitError('No pudimos enviar el mensaje. Probá nuevamente en unos minutos.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <p className="mb-5 text-xs uppercase tracking-[0.24em] text-white/48">Contacto</p>

              <h1 className="font-display text-[clamp(1.9rem,3.9vw,3.45rem)] font-medium leading-[1.06] tracking-[-0.02em] text-white">
                Hablemos de tu proyecto y armemos una ruta clara para avanzar.
              </h1>

              <p className="mt-5 max-w-2xl text-[0.98rem] leading-relaxed text-[#a1a1aa] md:text-[1.05rem]">
                Contanos en qué etapa estás y te devolvemos una propuesta concreta para empezar con foco.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href={`mailto:${config?.email_contacto || 'quepiacomunicacion@gmail.com'}`}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[#2ae7e4]/35 bg-gradient-to-br from-[#2ae7e4] to-[#7cf2ef] px-6 text-xs font-semibold uppercase tracking-[0.08em] text-[#0a0a0a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(42,231,228,0.38),0_12px_36px_rgba(42,231,228,0.4)]"
                >
                  Escribir ahora
                </a>
                <span className="text-xs uppercase tracking-[0.14em] text-white/52">Respuesta en menos de 24hs</span>
              </div>
            </motion.div>
          </div>
        </section>

        <MarqueeSection />

        <section className="py-14 md:py-20">
          <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 px-6 md:px-12 lg:grid-cols-2 lg:gap-8 lg:px-20">
            <motion.article
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="rounded-[24px] border border-white/[0.05] bg-[#070707]/90 p-6 backdrop-blur-[12px] md:p-7"
            >
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">Canales directos</p>
              <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Elegí cómo querés contactarnos.
              </h2>

              <div className="mt-6 space-y-3">
                {contactInfo.map((item) => {
                  const Icon = item.icon;
                  const isLink = item.href && item.href !== '#';

                  const content = (
                    <div className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.04]">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-white/70">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">{item.label}</p>
                        <p className="mt-1 truncate text-sm text-white/80">{item.value}</p>
                      </div>
                      {isLink ? <ArrowUpRight size={14} className="text-white/35 transition-colors group-hover:text-quepia-cyan" /> : null}
                    </div>
                  );

                  if (isLink) {
                    return (
                      <a
                        key={item.label}
                        href={item.href}
                        target={item.href?.startsWith('http') ? '_blank' : undefined}
                        rel={item.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="block"
                      >
                        {content}
                      </a>
                    );
                  }

                  return <div key={item.label}>{content}</div>;
                })}
              </div>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, delay: 0.05, ease: 'easeOut' }}
              className="rounded-[24px] border border-white/[0.05] bg-[#070707]/90 p-6 backdrop-blur-[12px] md:p-7"
            >
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">Formulario</p>
              <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Envianos un mensaje.
              </h2>

              {isSubmitted ? (
                <div className="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-10 text-center">
                  <div className="mx-auto mb-4 w-fit rounded-full bg-quepia-cyan/15 p-3 text-quepia-cyan">
                    <Send size={18} />
                  </div>
                  <h3 className="font-display text-xl text-white">¡Mensaje enviado!</h3>
                  <p className="mt-2 text-sm text-[#9ea0a8]">Te respondemos dentro de las próximas 24 horas.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-white/45">Nombre</span>
                      <input
                        type="text"
                        value={formState.nombre}
                        onChange={(e) => setFormState((s) => ({ ...s, nombre: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-quepia-cyan/50"
                        placeholder="Tu nombre"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-white/45">Email</span>
                      <input
                        type="email"
                        value={formState.email}
                        onChange={(e) => setFormState((s) => ({ ...s, email: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-quepia-cyan/50"
                        placeholder="tu@email.com"
                        required
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-white/45">Servicio</span>
                    <select
                      value={formState.servicio}
                      onChange={(e) => setFormState((s) => ({ ...s, servicio: e.target.value }))}
                      className="w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-quepia-cyan/50"
                    >
                      <option value="" className="bg-[#0a0a0a]">Seleccioná una opción</option>
                      <option value="branding" className="bg-[#0a0a0a]">Branding</option>
                      <option value="diseno-grafico" className="bg-[#0a0a0a]">Diseño Gráfico</option>
                      <option value="video" className="bg-[#0a0a0a]">Producción Audiovisual</option>
                      <option value="marketing" className="bg-[#0a0a0a]">Marketing Digital</option>
                      <option value="otro" className="bg-[#0a0a0a]">Otro</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-white/45">Mensaje</span>
                    <textarea
                      value={formState.mensaje}
                      onChange={(e) => setFormState((s) => ({ ...s, mensaje: e.target.value }))}
                      className="min-h-[140px] w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-quepia-cyan/50"
                      placeholder="Contanos sobre tu proyecto..."
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#2ae7e4]/35 bg-gradient-to-br from-[#2ae7e4] to-[#7cf2ef] px-6 text-xs font-semibold uppercase tracking-[0.08em] text-[#0a0a0a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(42,231,228,0.38),0_12px_36px_rgba(42,231,228,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        Enviar mensaje
                        <Send size={14} />
                      </>
                    )}
                  </button>

                  {submitError ? (
                    <p className="text-sm text-red-300/90">{submitError}</p>
                  ) : null}
                </form>
              )}
            </motion.article>
          </div>
        </section>

        <section className="border-t border-white/6 py-16 md:py-20">
          <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <div className="mb-8 md:mb-10">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">FAQ</p>
              <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
                Preguntas frecuentes.
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {faqItems.map((faq, index) => (
                <motion.article
                  key={faq.q}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }}
                  className="rounded-[20px] border border-white/[0.06] bg-[#0a0a0a]/55 p-5 backdrop-blur-[10px]"
                >
                  <h3 className="font-display text-[1.15rem] font-medium leading-[1.2] text-white">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9ea0a8]">{faq.a}</p>
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
                ¿Querés que revisemos tu proyecto juntos?
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#a1a1aa] md:text-base">
                Podés escribirnos por mail o WhatsApp y coordinamos una primera conversación.
              </p>

              <a
                href={`mailto:${config?.email_contacto || 'quepiacomunicacion@gmail.com'}`}
                className="mt-8 inline-flex items-center gap-2 text-sm uppercase tracking-[0.1em] text-white/68 transition-all duration-300 hover:gap-3 hover:text-white"
              >
                {config?.email_contacto || 'quepiacomunicacion@gmail.com'}
                <ArrowUpRight size={14} />
              </a>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
