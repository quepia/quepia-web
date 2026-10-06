import JsonLd, { breadcrumbs } from '@/components/seo/JsonLd';
import type { Metadata } from 'next';
import { services } from '@/lib/seo/services';
import ServiciosClient from './ServiciosClient';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Servicios creativos para empresas de Córdoba',
  description: 'Diseño gráfico, branding, gestión de redes sociales, video, fotografía y cobertura con dron. Consultora creativa en Villa Carlos Paz, Córdoba.',
  alternates: {
    canonical: 'https://quepia.com/servicios',
  },
  openGraph: {
    title: 'Servicios | Quepia - Diseño, Branding y Marketing',
    description: 'Diseño gráfico, branding, redes sociales, video, fotografía y cobertura con dron. Llevamos tu marca al siguiente nivel en Córdoba y toda Argentina.',
    url: 'https://quepia.com/servicios',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Servicios Quepia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Servicios de Diseño y Branding | Quepia',
    description: 'Branding, diseño gráfico, redes sociales, video, fotografía y cobertura con dron para marcas en Córdoba y Argentina.',
    images: ['/og-image.jpg'],
  },
};

const serviciosJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  serviceType: 'Gestión de redes sociales',
  url: 'https://quepia.com/servicios/gestion-de-redes-sociales',
  provider: {
    '@type': 'ProfessionalService',
    '@id': 'https://quepia.com/#organization',
    name: 'Quepia - Consultora Creativa',
  },
  areaServed: [
    { '@type': 'City', name: 'Villa Carlos Paz' },
    { '@type': 'Place', name: 'Valle de Punilla' },
    { '@type': 'City', name: 'Córdoba' },
    { '@type': 'AdministrativeArea', name: 'Provincia de Córdoba, Argentina' },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Servicios de Quepia - Consultora Creativa',
    itemListElement: services.map(service => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: service.name, url: `https://quepia.com/servicios/${service.slug}` },
    })),
  },
};

export default async function ServiciosPage() {
    // Pendiente de decisión comercial: email marketing, SEO/SEM y diseño industrial.
    // Se omiten del catálogo público hasta confirmar que se ofrecen.
    const servicios = services.map((service, orden) => ({
      id: service.slug, titulo: service.name, descripcion_corta: service.sections[0].text,
      descripcion: service.description, icono: 'Palette', categoria_trabajo: service.category,
      features: service.sections.slice(1, 4).map(section => section.title), orden,
    }));

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(serviciosJsonLd) }}
            />
            <JsonLd data={breadcrumbs([{ name: 'Servicios', path: '/servicios' }])} />
            <ServiciosClient servicios={servicios || []} />
        </>
    );
}
