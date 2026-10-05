import type { MetadataRoute } from 'next';
import { services } from '@/lib/seo/services';
import { industries, locations } from '@/lib/seo/landing-pages';
import { getPublicProjects, projectSlug } from '@/lib/seo/projects';
export const revalidate = 300;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = ['', '/servicios', '/trabajos', '/sobre-nosotros', '/contacto', '/precios', '/privacidad', ...services.map(item => `/servicios/${item.slug}`), ...industries.map(item => `/rubros/${item.slug}`), ...locations.map(item => `/${item.slug}`)];
  // Sin fecha inventada: las páginas editoriales omiten lastmod hasta contar con un historial de publicación.
  const entries: MetadataRoute.Sitemap = paths.map(path => ({ url: `https://quepia.com${path}`, changeFrequency: 'monthly', priority: path === '' ? 1 : 0.7 }));
  return [...entries, ...(await getPublicProjects()).map(project => {
    const updated = project.updated_at || project.fecha_actualizacion;
    return { url: `https://quepia.com/trabajos/${projectSlug(project)}`, ...(updated && !Number.isNaN(Date.parse(updated)) ? { lastModified: updated } : {}), changeFrequency: 'monthly' as const, priority: 0.8 };
  })];
}
