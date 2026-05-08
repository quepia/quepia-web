'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { trackLead } from '@/lib/marketing-analytics';

interface ContactFormCardProps {
  eyebrow?: string;
  title?: string;
  source?: string;
}

export default function ContactFormCard({
  eyebrow = 'Formulario',
  title = 'Envianos un mensaje.',
  source = 'contact_form',
}: ContactFormCardProps) {
  const [formState, setFormState] = useState({
    nombre: '',
    email: '',
    servicio: '',
    mensaje: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
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

      trackLead({
        email: formState.email,
        service: formState.servicio || 'contacto',
        source,
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error('Error sending contact form:', error);
      setSubmitError('No pudimos enviar el mensaje. Probá nuevamente en unos minutos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, delay: 0.05, ease: 'easeOut' }}
      className="rounded-[24px] border border-white/[0.05] bg-[#070707]/90 p-6 backdrop-blur-[12px] md:p-7"
    >
      <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">{eyebrow}</p>
      <h2 className="font-display text-[clamp(1.45rem,2.8vw,2.2rem)] font-medium leading-[1.12] text-white">
        {title}
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
  );
}
