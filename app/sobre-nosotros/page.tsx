import type { Metadata } from 'next';
import { getTeamMembersServer } from '@/lib/fetchConfigServer';
import AboutClient from '@/components/about/AboutClient';

export const metadata: Metadata = {
    title: 'Sobre Nosotros',
    description: 'Conocé al equipo de Quepia. Somos una consultora creativa de Villa Carlos Paz, Córdoba, apasionada por transformar marcas en experiencias visuales memorables.',
    alternates: {
        canonical: 'https://quepia.com/sobre-nosotros',
    },
    openGraph: {
        title: 'El equipo detrás de Quepia | Villa Carlos Paz',
        description: 'Conocé a Lautaro y Camila, el equipo creativo de Quepia. Apasionados por transformar marcas en experiencias visuales memorables.',
        url: 'https://quepia.com/sobre-nosotros',
        images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Equipo Quepia' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Sobre Nosotros | Quepia',
        description: 'Conocé al equipo creativo detrás de Quepia y nuestra forma de trabajo.',
        images: ['/og-image.jpg'],
    },
};

const teamJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: 'https://quepia.com/sobre-nosotros',
    name: 'Sobre Nosotros | Quepia',
    description: 'Consultora creativa fundada en 2020 en Villa Carlos Paz, Córdoba, Argentina.',
    mainEntity: {
        '@type': 'Organization',
        '@id': 'https://quepia.com/#organization',
        name: 'Quepia',
        foundingDate: '2020',
        employee: [
            {
                '@type': 'Person',
                name: 'Lautaro López Labrin',
                jobTitle: 'Director Creativo',
                worksFor: { '@type': 'Organization', name: 'Quepia' },
            },
            {
                '@type': 'Person',
                name: 'Camila De Angelis',
                jobTitle: 'Diseñadora',
                worksFor: { '@type': 'Organization', name: 'Quepia' },
            },
        ],
    },
};

export default async function AboutPage() {
    const team = await getTeamMembersServer();

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(teamJsonLd) }}
            />
            <AboutClient team={team} />
        </>
    );
}
