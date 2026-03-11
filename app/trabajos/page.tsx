import type { Metadata } from 'next';
import WorksClient from './works-client';
import { createPublicClient } from '@/lib/supabase/public';
import { CATEGORIES } from '@/types/database';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Portfolio de Proyectos',
  description: 'Mirá nuestros proyectos de branding, diseño gráfico e identidad visual para empresas de Córdoba y Argentina.',
  alternates: {
    canonical: 'https://quepia.com/trabajos',
  },
  openGraph: {
    title: 'Portfolio | Quepia - Proyectos de Branding y Diseño',
    description: 'Proyectos de branding, identidad visual y diseño gráfico para empresas de Córdoba y toda Argentina.',
    url: 'https://quepia.com/trabajos',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Portfolio Quepia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Portfolio de Proyectos | Quepia',
    description: 'Casos reales de branding, diseño e identidad visual desarrollados por Quepia.',
    images: ['/og-image.jpg'],
  },
};

const portfolioJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  url: 'https://quepia.com/trabajos',
  name: 'Portfolio de Proyectos | Quepia',
  description: 'Proyectos de branding, diseño gráfico e identidad visual realizados por Quepia.',
  provider: {
    '@type': 'LocalBusiness',
    '@id': 'https://quepia.com/#organization',
    name: 'Quepia',
  },
};

interface TrabajosPageProps {
    searchParams?: Promise<{ category?: string }>;
}

export default async function Page({ searchParams }: TrabajosPageProps) {
    const params = await searchParams;
    const requestedCategory = params?.category ?? 'branding';
    const validCategory = CATEGORIES.find((category) => category.id === requestedCategory)?.id ?? CATEGORIES[0]?.id ?? 'branding';

    const supabase = createPublicClient();
    const { data: proyectos } = await supabase
        .from('proyectos')
        .select('*')
        .order('orden', { ascending: true })
        .order('fecha_creacion', { ascending: false });

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioJsonLd) }}
            />
            <WorksClient
                proyectos={proyectos || []}
                initialCategory={validCategory}
            />
        </>
    );
}
