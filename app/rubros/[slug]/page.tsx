import type { Metadata } from 'next';
import Link from 'next/link';
import JsonLd from '@/components/seo/JsonLd';
import { notFound } from 'next/navigation';
import { industries, normalizedName } from '@/lib/seo/landing-pages';
import { services } from '@/lib/seo/services';
import { getPublicProjects } from '@/lib/seo/projects';
import { PublicShell, ContentSection, ContactCta, ProjectCards } from '@/components/seo/PublicContent';
export const revalidate = 300;
export function generateStaticParams() { return industries.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = industries.find(item => item.slug === slug);
  if (!item) notFound();
  const socialTitle = `${item.title} | Quepia`;
  const images = [{ url: '/og-image.jpg', alt: `${item.title} - Quepia` }];
  return {
    title: item.title,
    description: item.description,
    alternates: { canonical: `/rubros/${slug}` },
    openGraph: { type: 'website', locale: 'es_AR', siteName: 'Quepia - Consultora Creativa', title: socialTitle, description: item.description, url: `/rubros/${slug}`, images },
    twitter: { card: 'summary_large_image', title: socialTitle, description: item.description, images },
  };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = industries.find(item => item.slug === slug);
  if (!item) notFound();
  const projects = (await getPublicProjects()).filter(project => item.names.some(name => normalizedName(project.titulo).includes(normalizedName(name))));
  return <PublicShell title={item.title} path={`/rubros/${slug}`} intro={item.summary}>
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebPage', '@id': `https://quepia.com/rubros/${slug}#webpage`, url: `https://quepia.com/rubros/${slug}`, name: item.title, description: item.summary, about: { '@id': 'https://quepia.com/#organization' }, inLanguage: 'es-AR' }} />
    {item.sections.map(section => <ContentSection key={section.title} title={section.title}><p>{section.text}</p></ContentSection>)}<section><h2 className="mb-6 font-display text-2xl">Casos del rubro</h2>{projects.length ? <ProjectCards projects={projects} /> : <p>Contanos qué necesitás y conversamos sobre un alcance para tu negocio.</p>}</section><ContentSection title="Servicios para tu marca"><div className="flex flex-wrap gap-5">{services.map(service => <Link key={service.slug} className="text-[#2ae7e4]" href={`/servicios/${service.slug}`}>{service.name}</Link>)}</div></ContentSection><ContentSection title="Dónde trabajamos"><p>Coordinamos proyectos desde nuestra base en <Link className="text-[#2ae7e4]" href="/villa-carlos-paz">Villa Carlos Paz</Link> para <Link className="text-[#2ae7e4]" href="/cordoba">Córdoba Capital y la provincia</Link>. Consultá las formas de coordinación y producción en cada zona.</p></ContentSection><ContactCta /></PublicShell>;
}
