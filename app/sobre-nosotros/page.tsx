import JsonLd, { breadcrumbs } from '@/components/seo/JsonLd';
import type { Metadata } from 'next';
import { getTeamMembersServer } from '@/lib/fetchConfigServer';
import AboutClient from '@/components/about/AboutClient';

export const dynamic = 'force-dynamic';

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

export default async function AboutPage() {
    const team = await getTeamMembersServer();
    const people = team.map(member => ({
        '@type': 'Person',
        name: member.nombre,
        jobTitle: member.rol,
        worksFor: { '@id': 'https://quepia.com/#organization' },
    }));
    const teamJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        url: 'https://quepia.com/sobre-nosotros',
        name: 'Sobre Nosotros | Quepia - Consultora Creativa',
        description: 'Consultora creativa de Villa Carlos Paz, Córdoba, Argentina, desde 2020.',
        mainEntity: {
            '@type': 'Organization',
            '@id': 'https://quepia.com/#organization',
            name: 'Quepia - Consultora Creativa',
            foundingDate: '2020',
            ...(people.length ? {
                employee: people,
                founder: people.filter((_, index) => /fundador/i.test(team[index].rol)),
            } : {}),
        },
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(teamJsonLd) }}
            />
            <JsonLd data={breadcrumbs([{ name: 'Sobre nosotros', path: '/sobre-nosotros' }])} />
            <AboutClient team={team} />
        </>
    );
}
