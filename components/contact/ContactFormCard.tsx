'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { services } from '@/lib/seo/services';
import { budgetOptions, startOptions, planOptions } from '@/lib/seo/contact-options';
const fieldClass = 'w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-sm text-white outline-none focus:border-quepia-cyan/50';
export default function ContactFormCard({ eyebrow = 'Formulario', title = 'Envianos un mensaje.', source = 'contact_form' }: { eyebrow?: string; title?: string; source?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', company: '', city: '', budget: '', start: '', plan: '', service: '', message: '', website: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('servicio') || '';
    const service = services.find(item => item.slug === requested || item.name === requested || item.category === requested)?.slug || '';
    const plan = params.get('plan') || '';
    setForm(previous => ({ ...previous, service, plan: planOptions.includes(plan) ? plan : '' }));
  }, []);
  const change = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/contacto/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, source }) });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('No pudimos enviar el mensaje. Probá nuevamente o escribinos por WhatsApp.');
      sessionStorage.setItem('quepia-lead', JSON.stringify({ service: form.service, source, id: result.id }));
      router.push('/gracias');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos enviar el mensaje.'); }
    finally { setLoading(false); }
  }
  return <article className="rounded-[24px] border border-white/[0.05] bg-[#070707]/90 p-6 md:p-7"><p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">{eyebrow}</p><h2 className="font-display text-2xl text-white">{title}</h2><form onSubmit={submit} className="mt-6 space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">{([{ key: 'name', label: 'Nombre', type: 'text', max: 120 }, { key: 'email', label: 'Email', type: 'email', max: 254 }, { key: 'company', label: 'Empresa o marca', type: 'text', max: 160 }, { key: 'city', label: 'Ciudad', type: 'text', max: 120 }] as const).map(field => <label key={field.key} className="block text-sm text-white/70">{field.label}<input className={`${fieldClass} mt-2`} type={field.type} required maxLength={field.max} value={form[field.key]} onChange={e => change(field.key, e.target.value)} /></label>)}</div>
    <label className="block text-sm text-white/70">Servicio<select className={`${fieldClass} mt-2`} required value={form.service} onChange={e => change('service', e.target.value)}><option value="">Seleccioná un servicio</option>{services.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}<option value="otro">Otro / varios servicios</option></select></label>
    <div className="grid gap-4 sm:grid-cols-2">{([{ key: 'budget', label: 'Rango de presupuesto', options: budgetOptions }, { key: 'start', label: '¿Cuándo querés arrancar?', options: startOptions }] as const).map(field => <label key={field.key} className="block text-sm text-white/70">{field.label}<select className={`${fieldClass} mt-2`} required value={form[field.key]} onChange={e => change(field.key, e.target.value)}><option value="">Seleccioná una opción</option>{field.options.map(option => <option key={option}>{option}</option>)}</select></label>)}</div>
    <label className="block text-sm text-white/70">Plan (opcional)<select className={`${fieldClass} mt-2`} value={form.plan} onChange={e => change('plan', e.target.value)}><option value="">Sin plan seleccionado</option>{planOptions.map(plan => <option key={plan}>{plan}</option>)}</select></label>
    <label className="block text-sm text-white/70">Mensaje<textarea className={`${fieldClass} mt-2 min-h-[140px]`} required minLength={10} maxLength={5000} value={form.message} onChange={e => change('message', e.target.value)} placeholder="Contanos qué necesitás..." /></label>
    <label className="hidden" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => change('website', e.target.value)} /></label>
    <p className="text-xs text-white/50">Usamos estos datos para responder tu consulta. <a className="underline" href="/privacidad">Política de privacidad</a>.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button disabled={loading} type="submit" className="rounded-full bg-[#2ae7e4] px-6 py-3 font-medium text-black disabled:opacity-50">{loading ? 'Enviando…' : 'Enviar consulta'}</button>
  </form></article>;
}
