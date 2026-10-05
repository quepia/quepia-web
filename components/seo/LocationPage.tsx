import Link from 'next/link';
import { locations, normalizedName } from '@/lib/seo/landing-pages';
import { services } from '@/lib/seo/services';
import { getPublicProjects } from '@/lib/seo/projects';
import { PublicShell, ContentSection, ContactCta, ProjectCards } from './PublicContent';
export default async function LocationPage({ slug }: { slug: string }) {
  const item = locations.find(item => item.slug === slug)!;
  const projects = (await getPublicProjects()).filter(project => {
    const city = normalizedName(project.ciudad || '');
    if (!city) return false;
    if (slug === 'villa-carlos-paz') return city.includes('carlos paz');
    if (slug === 'cordoba') return /cordoba|capital/.test(city);
    return /punilla|cosquin|la falda|capilla del monte|tanti|biaulet|huerta grande|valle hermoso/.test(city);
  });
  return <PublicShell title={item.title} path={`/${slug}`}>{item.sections.map(section => <ContentSection key={section.title} title={section.title}><p>{section.text}</p></ContentSection>)}<ContentSection title="Servicios disponibles"><div className="flex flex-wrap gap-5">{services.map(service => <Link className="text-[#2ae7e4]" key={service.slug} href={`/servicios/${service.slug}`}>{service.name}</Link>)}</div></ContentSection><section><h2 className="mb-6 font-display text-2xl">Proyectos de la zona</h2>{projects.length ? <ProjectCards projects={projects} /> : <p className="text-white/60">[COMPLETAR: casos de esta zona con ciudad confirmada]</p>}</section><ContactCta /></PublicShell>;
}
