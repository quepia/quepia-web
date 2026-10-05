import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import ContactFormEmail from '@/components/emails/ContactFormEmail';
import { services } from '@/lib/seo/services';
import { budgetOptions, startOptions, planOptions } from '@/lib/seo/contact-options';
const schema = z.object({
  name: z.string().trim().min(1).max(120), email: z.email().max(254), company: z.string().trim().min(1).max(160), city: z.string().trim().min(1).max(120),
  service: z.string().refine(value => value === 'otro' || services.some(item => item.slug === value)),
  budget: z.string().refine(value => budgetOptions.includes(value)), start: z.string().refine(value => startOptions.includes(value)),
  plan: z.string().refine(value => value === '' || planOptions.includes(value)), message: z.string().trim().min(10).max(5000), website: z.string().max(0), source: z.string().max(100).optional(),
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
    const service = services.find(item => item.slug === data.service)?.name || 'Otro / varios servicios';
    const message = `Empresa/marca: ${data.company}\nCiudad: ${data.city}\nPresupuesto: ${data.budget}\nInicio: ${data.start}\nPlan: ${data.plan || 'Sin plan'}\n\n${data.message}`;
    const html = await render(ContactFormEmail({ name: data.name, email: data.email, service, message }));
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: (process.env.EMAIL_FROM || process.env.RESEND_FROM)!, to: process.env.CONTACT_FORM_TO || 'hola@quepia.com', replyTo: data.email, subject: `Consulta web: ${data.company} · ${service}`, html });
    if (result.error || !result.data?.id) return NextResponse.json({ error: 'No se pudo enviar' }, { status: 502 });
    return NextResponse.json({ success: true, id: result.data.id });
  } catch { return NextResponse.json({ error: 'No se pudo enviar' }, { status: 500 }); }
}
