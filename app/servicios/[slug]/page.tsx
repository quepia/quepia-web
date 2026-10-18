import ContactFormCard from '@/components/contact/ContactFormCard';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { services } from '@/lib/seo/services';
import { getPublicProjects, projectSlug } from '@/lib/seo/projects';
import { projectMatchesCategory } from '@/lib/project-categories';
import { PublicShell, ContentSection, ContactCta, ProjectCards, Faq } from '@/components/seo/PublicContent';
import JsonLd from '@/components/seo/JsonLd';
import SocialProof from '@/components/seo/SocialProof';
export const revalidate = 300;
export const dynamicParams = false;
export function generateStaticParams() { return services.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = services.find(item => item.slug === slug);
  if (!service) notFound();
  const socialTitle = `${service.title} | Quepia`;
  return {
    title: service.title,
    description: service.description,
    alternates: { canonical: `/servicios/${slug}` },
    openGraph: {
      type: 'website',
      locale: 'es_AR',
      siteName: 'Quepia - Consultora Creativa',
      title: socialTitle,
      description: service.description,
      url: `/servicios/${slug}`,
      images: [{ url: '/og-image.jpg', width: 1024, height: 537, alt: `${service.name}: Quepia - Consultora Creativa, Villa Carlos Paz, Córdoba` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: service.description,
      images: ['/og-image.jpg'],
    },
  };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = services.find(item => item.slug === slug);
  if (!service) notFound();
  const projects = (await getPublicProjects()).filter(project => projectMatchesCategory(project, service.category));
  const featuredProjects = projects.slice(0, 3);
  const serviceUrl = `https://quepia.com/servicios/${slug}`;
  const sections = service.sections.map(section => ({ ...section, id: `detalle-${section.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` }));
  return <PublicShell title={service.title} intro={service.description} path={`/servicios/${slug}`}>
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Service', '@id': `${serviceUrl}#service`, name: service.name, description: service.description, url: serviceUrl, provider: { '@id': 'https://quepia.com/#organization' }, areaServed: { '@type': 'AdministrativeArea', name: 'Provincia de Córdoba, Argentina' }, ...(slug === 'gestion-de-redes-sociales' && featuredProjects.length > 0 ? { subjectOf: featuredProjects.map(project => ({ '@type': 'WebPage', name: project.titulo, url: `https://quepia.com/trabajos/${projectSlug(project)}` })) } : {}) }} />
    <ContactCta service={service.name} />
    <Link href="#consulta" className="inline-flex min-h-11 items-center text-[#2ae7e4] underline underline-offset-4">Ir al formulario de este servicio →</Link>
    <nav aria-label="Índice del servicio" className="max-w-3xl rounded-2xl border border-white/10 p-5">
      <p className="mb-4 font-medium">En esta página</p>
      <ul className="grid gap-3 text-sm sm:grid-cols-2">{sections.map(section => <li key={section.id}><Link className="text-[#2ae7e4] underline underline-offset-4" href={`#${section.id}`}>{section.title}</Link></li>)}</ul>
    </nav>
    {projects.length > 0 && <section><h2 className="mb-6 font-display text-2xl">{slug === 'filmacion-con-dron-cordoba' ? 'Producciones audiovisuales relacionadas' : `Trabajos de ${service.name.toLowerCase()}`}</h2>{slug === 'filmacion-con-dron-cordoba' && <p className="mb-6 text-white/75">Conocé nuestro trabajo audiovisual. La incorporación de tomas aéreas se evalúa según cada locación y proyecto.</p>}<ProjectCards projects={featuredProjects} /></section>}
    {sections.map(section => <ContentSection key={section.id} id={section.id} title={section.title}><p>{section.text}</p></ContentSection>)}

    {slug === 'gestion-de-redes-sociales' ? <ContentSection title="Coordiná el servicio según tu ciudad">
      <p>Tenemos base en <Link className="text-[#2ae7e4] underline underline-offset-4" href="/villa-carlos-paz">Villa Carlos Paz</Link> y trabajamos con marcas de <Link className="text-[#2ae7e4] underline underline-offset-4" href="/cordoba">Córdoba Capital y la provincia</Link>. La planificación y las revisiones pueden hacerse a distancia. Si necesitás fotos o videos nuevos para tus redes, acordamos las jornadas y los traslados según el proyecto. Consultá en cada zona cómo coordinamos el trabajo y qué información compartir para pedir una propuesta.</p>
    </ContentSection> : null}

    <ContentSection title="Servicios y rubros relacionados"><div className="flex flex-wrap gap-5">{services.filter(item => item.slug !== slug).map(item => <Link className="text-[#2ae7e4]" key={item.slug} href={`/servicios/${item.slug}`}>{item.name}</Link>)}<Link href="/rubros/turismo-y-hoteleria">Turismo y hotelería</Link><Link href="/rubros/inmobiliarias">Inmobiliarias</Link><Link href="/rubros/gastronomia">Gastronomía</Link></div></ContentSection>
    <ContactFormCard initialService={service.slug} source={`service_${service.slug}`} title={`Consultá por ${service.name.toLowerCase()}`} /><Faq items={service.faq} /><SocialProof /><ContactCta service={service.name} />
  </PublicShell>;
}
