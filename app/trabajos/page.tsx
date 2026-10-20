import JsonLd, { breadcrumbs } from '@/components/seo/JsonLd';
import { correctProjectCopy } from '@/lib/seo/public-copy';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import WorksClient from './works-client';
import WorksLoading from './works-loading';
import { getPortfolioProjectsServer } from '@/lib/fetchConfigServer';
import { CATEGORIES } from '@/types/database';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Portfolio de Proyectos',
  description: 'Mirá nuestros trabajos de branding, diseño, videos para redes, coberturas de turismo y filmación con dron en Córdoba y Argentina.',
  alternates: {
    canonical: 'https://quepia.com/trabajos',
  },
  openGraph: {
    title: 'Portfolio | Quepia - Branding, Video y Dron',
    description: 'Branding, diseño, producción audiovisual y coberturas con dron para empresas de Córdoba y Argentina.',
    url: 'https://quepia.com/trabajos',
    images: [{ url: '/og-image.jpg', width: 1024, height: 537, alt: 'Portfolio Quepia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Portfolio de Proyectos | Quepia',
    description: 'Trabajos de branding, diseño, producción audiovisual y turismo realizados por Quepia.',
    images: ['/og-image.jpg'],
  },
};

const portfolioJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  url: 'https://quepia.com/trabajos',
  name: 'Portfolio de Proyectos | Quepia',
  description: 'Proyectos de branding, diseño, producción audiovisual y filmación con dron realizados por Quepia.',
  provider: {
    '@type': 'LocalBusiness',
    '@id': 'https://quepia.com/#organization',
    name: 'Quepia',
  },
};

interface TrabajosPageProps {
    searchParams?: Promise<{ category?: string }>;
}

export default function Page(props: TrabajosPageProps) {
    return <Suspense fallback={<WorksLoading />}><PortfolioContent {...props} /></Suspense>;
}

async function PortfolioContent({ searchParams }: TrabajosPageProps) {
    const params = await searchParams;
    const requestedCategory = params?.category ?? 'branding';
    const validCategory = CATEGORIES.find((category) => category.id === requestedCategory)?.id ?? CATEGORIES[0]?.id ?? 'branding';

    const proyectos = await getPortfolioProjectsServer().catch((error) => {
        console.error('Error fetching public portfolio:', error);
        return [];
    });

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioJsonLd) }}
            />
            <JsonLd data={breadcrumbs([{ name: 'Trabajos', path: '/trabajos' }])} />
            <WorksClient
                proyectos={proyectos.map(proyecto => correctProjectCopy(proyecto))}
                initialCategory={validCategory}
            />
        </>
    );
}
