import { PublicShell, ContactCta, ProjectCards } from '@/components/seo/PublicContent';
import { getPublicProjects } from '@/lib/seo/projects';
export const revalidate = 300;
export const metadata = { title: 'Gracias por tu consulta', robots: { index: false, follow: true }, alternates: { canonical: '/gracias' } };
export default async function Page() {
  return <PublicShell title="Gracias por tu consulta" intro="Si acabás de enviar el formulario, recibimos tu mensaje. Podés seguir la conversación por WhatsApp." path="/gracias"><ContactCta /><section><h2 className="mb-6 font-display text-2xl">Conocé nuestro trabajo</h2><ProjectCards projects={(await getPublicProjects()).slice(0, 3)} /></section></PublicShell>;
}
