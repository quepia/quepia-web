import type { Metadata } from 'next';
import Link from 'next/link';
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
  return { title: item.title, description: item.sections[0].text.slice(0, 155), alternates: { canonical: `/rubros/${slug}` } };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = industries.find(item => item.slug === slug);
  if (!item) notFound();
  const projects = (await getPublicProjects()).filter(project => item.names.some(name => normalizedName(project.titulo).includes(normalizedName(name))));
  return <PublicShell title={item.title} path={`/rubros/${slug}`}>{item.sections.map(section => <ContentSection key={section.title} title={section.title}><p>{section.text}</p></ContentSection>)}<section><h2 className="mb-6 font-display text-2xl">Casos del rubro</h2>{projects.length ? <ProjectCards projects={projects} /> : <p>Contanos qué necesitás y conversamos sobre un alcance para tu negocio.</p>}</section><ContentSection title="Servicios para tu marca"><div className="flex flex-wrap gap-5">{services.map(service => <Link key={service.slug} className="text-[#2ae7e4]" href={`/servicios/${service.slug}`}>{service.name}</Link>)}</div></ContentSection><ContactCta /></PublicShell>;
}
