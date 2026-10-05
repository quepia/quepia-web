import { caseStudy } from '@/lib/seo/case-studies';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicProjects, projectSlug } from '@/lib/seo/projects';
import { getProjectGalleryImages } from '@/lib/project-images';
import { getProjectCategoryLabels, projectMatchesCategory } from '@/lib/project-categories';
import { services } from '@/lib/seo/services';
import { PublicShell, ContentSection, ContactCta } from '@/components/seo/PublicContent';
import JsonLd from '@/components/seo/JsonLd';
export const revalidate = 300;
export async function generateStaticParams() { return (await getPublicProjects()).map(project => ({ slug: projectSlug(project) })); }
async function getProject(slug: string) { return (await getPublicProjects()).find(project => projectSlug(project) === slug); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const description = project.descripcion?.slice(0, 160) || `${project.titulo}: proyecto de ${getProjectCategoryLabels(project).join(', ')} realizado por Quepia, Villa Carlos Paz, Córdoba, Argentina.`;
  return { title: `${project.titulo} | Caso de ${getProjectCategoryLabels(project).join(', ')}`, description, alternates: { canonical: `/trabajos/${slug}` }, openGraph: { title: project.titulo, description, url: `/trabajos/${slug}`, images: getProjectGalleryImages(project).slice(0, 1) } };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const labels = getProjectCategoryLabels(project);
  const study = caseStudy(project);
  return <PublicShell title={project.titulo} path={`/trabajos/${slug}`}>
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'CreativeWork', name: project.titulo, description: project.descripcion || undefined, url: `https://quepia.com/trabajos/${slug}`, creator: { '@id': 'https://quepia.com/#organization' }, image: getProjectGalleryImages(project), dateModified: project.updated_at || project.fecha_actualizacion || undefined }} />
    <ContentSection title="El proyecto"><p className="whitespace-pre-line">{project.descripcion || 'Explorá los servicios realizados y las imágenes del proyecto.'}</p></ContentSection>
    {study?.map(section => <ContentSection key={section.title} title={section.title}><p>{section.text}</p></ContentSection>)}
    <ContentSection title="Servicios realizados"><p>{labels.join(' · ')}</p>{project.ciudad && <p className="mt-3">Ciudad del cliente: {project.ciudad}</p>}</ContentSection>
    <div className="grid gap-6 md:grid-cols-2">{getProjectGalleryImages(project).map((src, index) => <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-2xl"><Image src={src} alt={`${project.titulo}: ${labels.join(', ')}${project.ciudad ? ` en ${project.ciudad}` : ''}, imagen ${index + 1}`} fill sizes="(max-width: 768px) 90vw, 550px" className="object-contain" priority={index === 0} /></div>)}</div>
    <ContentSection title="Conocé estos servicios"><div className="flex flex-wrap gap-5">{services.filter(service => projectMatchesCategory(project, service.category)).map(service => <Link key={service.slug} className="text-[#2ae7e4]" href={`/servicios/${service.slug}`}>{service.name}</Link>)}<Link href="/trabajos">Todos los proyectos</Link></div></ContentSection>
    <ContactCta service={labels.join(', ')} />
  </PublicShell>;
}
