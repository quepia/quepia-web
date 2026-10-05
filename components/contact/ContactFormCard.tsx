'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { services } from '@/lib/seo/services';
import { startOptions, planOptions } from '@/lib/seo/contact-options';
import { readCampaign } from '@/lib/seo/campaign-attribution';
import { trackLead } from '@/lib/marketing-analytics';
const fieldClass = 'w-full rounded-xl border border-white/30 bg-[#111111] px-4 py-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-quepia-cyan';
export default function ContactFormCard({ eyebrow = 'Formulario', title = 'Envianos un mensaje.', source = 'contact_form', initialService = '' }: { eyebrow?: string; title?: string; source?: string; initialService?: string }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [form, setForm] = useState({ name: '', email: '', contactMethod: 'email', whatsapp: '', company: '', city: '', start: '', plan: '', service: initialService, message: '', website: '' });
  const [showPlan, setShowPlan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('servicio') || initialService;
    const service = services.find(item => item.slug === requested || item.name === requested || item.category === requested)?.slug || '';
    const plan = params.get('plan') || '';
    const validPlan = planOptions.includes(plan);
    setShowPlan(validPlan);
    setForm(previous => ({ ...previous, service, plan: validPlan ? plan : '' }));
  }, [initialService]);
  const change = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true); setError('');
    try {
      const response = await fetch('/contacto/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, email: form.contactMethod === 'email' ? form.email : '', whatsapp: form.contactMethod === 'whatsapp' ? form.whatsapp : '', source, attribution: readCampaign() }) });
      const result = await response.json();
      if (!response.ok || result.success !== true || !result.id) throw new Error('No pudimos enviar el mensaje. Revisá tus datos, probá nuevamente o escribinos por WhatsApp.');
      // Track only after the server confirms provider acceptance. Reloading /gracias cannot repeat this event.
      try { trackLead({ service: form.service, source }); } catch { /* Analytics must never block a received inquiry. */ }
      router.push('/gracias');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No pudimos enviar el mensaje.');
      submitting.current = false;
      setLoading(false);
    }
  }
  return <article id="consulta" className="scroll-mt-24 rounded-[24px] border border-white/15 bg-[#070707]/90 p-6 md:p-7"><p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/70">{eyebrow}</p><h2 className="font-display text-2xl text-white">{title}</h2><form onSubmit={submit} aria-busy={loading} className="mt-6 space-y-4">
    <label className="block text-sm text-white/85">Nombre<input autoComplete="name" className={`${fieldClass} mt-2`} required maxLength={120} value={form.name} onChange={e => change('name', e.target.value)} /></label>
    <fieldset><legend className="text-sm text-white/85">¿Cómo te contactamos?</legend><div className="mt-2 flex gap-6">{['email', 'whatsapp'].map(method => <label key={method} className="flex min-h-11 items-center gap-2 text-sm text-white"><input type="radio" name="contactMethod" checked={form.contactMethod === method} onChange={() => change('contactMethod', method)} />{method === 'email' ? 'Email' : 'WhatsApp'}</label>)}</div></fieldset>
    {form.contactMethod === 'email' ? <label className="block text-sm text-white/85">Email<input autoComplete="email" className={`${fieldClass} mt-2`} type="email" required maxLength={254} value={form.email} onChange={e => change('email', e.target.value)} /></label> : <label className="block text-sm text-white/85">Número de WhatsApp<input autoComplete="tel" className={`${fieldClass} mt-2`} type="tel" required pattern="[+0-9 ()-]{8,30}" maxLength={30} value={form.whatsapp} onChange={e => change('whatsapp', e.target.value)} aria-describedby="phone-help" /><span id="phone-help" className="mt-2 block text-xs text-white/70">Incluí código de país y área. Ejemplo: +54 9 351 123 4567.</span></label>}
    <label className="block text-sm text-white/85">Servicio<select className={`${fieldClass} mt-2`} required value={form.service} onChange={e => change('service', e.target.value)}><option value="">Seleccioná un servicio</option>{services.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}<option value="asesoramiento">No sé / necesito asesoramiento</option><option value="otro">Otro / varios servicios</option></select></label>
    {showPlan && <label className="block text-sm text-white/85">Plan (opcional)<select className={`${fieldClass} mt-2`} value={form.plan} onChange={e => change('plan', e.target.value)}><option value="">Sin plan seleccionado</option>{planOptions.map(plan => <option key={plan}>{plan}</option>)}</select></label>}
    <label className="block text-sm text-white/85">Mensaje<textarea className={`${fieldClass} mt-2 min-h-[100px]`} required minLength={10} maxLength={5000} value={form.message} onChange={e => change('message', e.target.value)} placeholder="Contanos brevemente qué necesitás (al menos 10 caracteres)." /></label>
    <details className="text-sm text-white/80"><summary className="cursor-pointer py-3">Sumar información opcional</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">{([{ key: 'company', label: 'Empresa o marca', max: 160 }, { key: 'city', label: 'Ciudad', max: 120 }] as const).map(field => <label key={field.key} className="block">{field.label}<input className={`${fieldClass} mt-2`} maxLength={field.max} value={form[field.key]} onChange={e => change(field.key, e.target.value)} /></label>)}<label className="block">Fecha de inicio orientativa<select className={`${fieldClass} mt-2`} value={form.start} onChange={e => change('start', e.target.value)}><option value="">A definir</option>{startOptions.map(option => <option key={option}>{option}</option>)}</select></label></div></details>
    <label className="hidden" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => change('website', e.target.value)} /></label>
    <p className="text-xs leading-relaxed text-white/75">Usamos estos datos para responder tu consulta. <a className="underline" href="/privacidad">Política de privacidad</a>.</p>
    <p className="text-sm leading-relaxed text-white/75">Revisamos tu consulta, coordinamos una primera conversación y definimos el alcance de la propuesta.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button disabled={loading} type="submit" className="min-h-11 rounded-full bg-[#2ae7e4] px-6 py-3 font-medium text-black disabled:opacity-50">{loading ? 'Enviando…' : 'Enviar consulta'}</button>
  </form></article>;
}
