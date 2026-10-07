import Link from 'next/link';
import { locations, normalizedName } from '@/lib/seo/landing-pages';
import JsonLd from './JsonLd';
import { getLocalSearch } from '@/lib/seo/local-search';
import { services } from '@/lib/seo/services';
import { getPublicProjects } from '@/lib/seo/projects';
import { PublicShell, ContentSection, ContactCta, ProjectCards, Faq } from './PublicContent';
export default async function LocationPage({ slug }: { slug: string }) {
  const item = locations.find(item => item.slug === slug)!;
  const local = getLocalSearch(slug);
  const allProjects = await getPublicProjects();
  const projects = allProjects.filter(project => {
    const city = normalizedName(project.ciudad || '');
    if (!city) return false;
    if (slug === 'villa-carlos-paz') return city.includes('carlos paz');
    if (slug === 'cordoba') return /cordoba|capital/.test(city);
    return /punilla|cosquin|la falda|capilla del monte|tanti|biaulet|huerta grande|valle hermoso/.test(city);
  });
  return <PublicShell title={item.title} path={`/${slug}`} intro={local?.summary}>
    {local ? <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Service', '@id': `https://quepia.com/${slug}#services`, name: item.title, description: local.summary, url: `https://quepia.com/${slug}`, provider: { '@id': 'https://quepia.com/#organization' }, areaServed: local.area, serviceType: services.map(service => service.name) }} /> : null}
    {item.sections.map(section => <ContentSection key={section.title} title={section.title}><p>{section.text}</p></ContentSection>)}<ContentSection title="Servicios disponibles"><div className="flex flex-wrap gap-5">{services.map(service => <Link className="text-[#2ae7e4]" key={service.slug} href={`/servicios/${service.slug}`}>{service.name}</Link>)}</div></ContentSection><section><h2 className="mb-6 font-display text-2xl">{projects.length ? "Proyectos de la zona" : "Conocé nuestro trabajo"}</h2>{!projects.length && <p className="mb-6 text-white/70">Una selección de nuestro portfolio para conocer cómo trabajamos.</p>}<ProjectCards projects={(projects.length ? projects : allProjects).slice(0, 3)} /></section>{local ? <Faq items={local.faq} /> : null}<ContactCta /></PublicShell>;
}
