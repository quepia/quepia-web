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
    {item.sections.map(section => <ContentSection key={section.title} title={section.title}><p>{section.text}</p></ContentSection>)}<ContentSection title="Servicios disponibles"><p className="mb-5">Nuestro servicio principal es la <Link className="text-[#2ae7e4]" href="/servicios/gestion-de-redes-sociales">gestión de redes sociales y community manager</Link>: planificación, diseño, redacción y publicación de contenido orgánico para tu marca.</p><div className="flex flex-wrap gap-5">{services.map(service => <Link className="text-[#2ae7e4]" key={service.slug} href={`/servicios/${service.slug}`}>{service.name}</Link>)}</div></ContentSection>{local ? <ContentSection title="Contenido según tu rubro"><div className="space-y-4">
      <p>Para <Link className="text-[#2ae7e4]" href="/rubros/turismo-y-hoteleria">turismo y hotelería</Link>, organizamos contenido orgánico para redes, fotografía y video de espacios y servicios. La página del rubro reúne el alcance y el caso publicado de Hotel Bahía Norte.</p>
      <p>En <Link className="text-[#2ae7e4]" href="/rubros/inmobiliarias">comunicación para inmobiliarias</Link>, podés consultar cómo se coordinan imágenes de propiedades y materiales comerciales, y explorar el trabajo de Inmobiliaria Noe García Roñoni.</p>
      <p>Para <Link className="text-[#2ae7e4]" href="/rubros/gastronomia">marcas gastronómicas</Link>, reunimos fotografía de producto, contenido para redes e identidad, con el caso de Mike Donas como referencia.</p>
    </div></ContentSection> : null}<section><h2 className="mb-6 font-display text-2xl">{projects.length ? "Proyectos de la zona" : "Conocé nuestro trabajo"}</h2>{!projects.length && <p className="mb-6 text-white/70">Una selección de nuestro portfolio para conocer cómo trabajamos.</p>}<ProjectCards projects={(projects.length ? projects : allProjects).slice(0, 3)} /></section>{local ? <Faq items={local.faq} /> : null}<ContactCta /></PublicShell>;
}
