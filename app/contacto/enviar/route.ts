import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import ContactFormEmail from '@/components/emails/ContactFormEmail';
import { services } from '@/lib/seo/services';
import { startOptions, planOptions } from '@/lib/seo/contact-options';
const phone = z.string().trim().max(30).refine(value => /^[+0-9 ()-]+$/.test(value) && value.replace(/\D/g, '').length >= 8 && value.replace(/\D/g, '').length <= 15);
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  contactMethod: z.enum(['email', 'whatsapp']).default('email'),
  email: z.union([z.email().max(254), z.literal('')]).default(''),
  whatsapp: z.union([phone, z.literal('')]).default(''),
  company: z.string().trim().max(160).default(''), city: z.string().trim().max(120).default(''),
  service: z.string().refine(value => ['otro', 'asesoramiento'].includes(value) || services.some(item => item.slug === value)),
  start: z.string().refine(value => value === '' || startOptions.includes(value)).default(''),
  plan: z.string().refine(value => value === '' || planOptions.includes(value)).default(''),
  message: z.string().trim().min(10).max(5000), website: z.string().max(0).default(''), source: z.string().max(100).optional(),
  attribution: z.object(Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid'].map(key => [key, z.string().max(200).optional()]))).optional(),
}).superRefine((data, context) => {
  if (data.contactMethod === 'email' && !data.email) context.addIssue({ code: 'custom', path: ['email'], message: 'Ingresá tu email' });
  if (data.contactMethod === 'whatsapp' && !data.whatsapp) context.addIssue({ code: 'custom', path: ['whatsapp'], message: 'Ingresá tu WhatsApp' });
});
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origen inválido' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 20000) return NextResponse.json({ error: 'Mensaje demasiado largo' }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Revisá los campos del formulario' }, { status: 400 });
  if (!process.env.RESEND_API_KEY || !(process.env.EMAIL_FROM || process.env.RESEND_FROM)) return NextResponse.json({ error: 'El envío no está disponible' }, { status: 503 });
  const data = parsed.data;
  try {
    const service = services.find(item => item.slug === data.service)?.name || (data.service === 'asesoramiento' ? 'Necesito asesoramiento' : 'Otro / varios servicios');
    const message = `Empresa/marca: ${data.company || 'No indicada'}\nCiudad: ${data.city || 'No indicada'}\nInicio: ${data.start || 'A definir'}\nPlan: ${data.plan || 'Sin plan'}\nOrigen: ${data.source || 'contact_form'}\nCampaña: ${JSON.stringify(data.attribution || {})}\n\n${data.message}`;
    const html = await render(ContactFormEmail({ name: data.name, email: data.contactMethod === 'email' ? data.email : data.whatsapp, contactMethod: data.contactMethod, service, message }));
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: (process.env.EMAIL_FROM || process.env.RESEND_FROM)!, to: process.env.CONTACT_FORM_TO || 'hola@quepia.com', ...(data.contactMethod === 'email' ? { replyTo: data.email } : {}), subject: `Consulta web: ${data.company || data.name} · ${service}`, html });
    if (result.error || !result.data?.id) return NextResponse.json({ error: 'No se pudo enviar' }, { status: 502 });
    return NextResponse.json({ success: true, id: result.data.id });
  } catch { return NextResponse.json({ error: 'No se pudo enviar' }, { status: 500 }); }
}
