import { CONTACT_PHONE } from '@/lib/contact';
import JsonLd, { breadcrumbs } from '@/components/seo/JsonLd';
import type { Metadata } from 'next';
import ContactoClient from './ContactoClient';

export const metadata: Metadata = {
    title: 'Contacto en Villa Carlos Paz, Córdoba',
    description: 'Contactá a Quepia en Villa Carlos Paz, Córdoba, para gestión de redes sociales, producción audiovisual, diseño gráfico o branding.',
    alternates: {
        canonical: 'https://quepia.com/contacto',
    },
    openGraph: {
        title: 'Contacto en Villa Carlos Paz, Córdoba | Quepia',
        description: '¿Tenés un proyecto en mente? Contactanos y hagámoslo realidad. Coordinamos una primera conversación para definir el alcance.',
        url: 'https://quepia.com/contacto',
        images: [{ url: '/og-image.jpg', width: 1024, height: 537, alt: 'Contacto Quepia' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Contacto en Villa Carlos Paz, Córdoba | Quepia',
        description: 'Escribinos y coordinamos una propuesta para tu marca según las necesidades de tu proyecto.',
        images: ['/og-image.jpg'],
    },
};

const contactJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    url: 'https://quepia.com/contacto',
    name: 'Contacto | Quepia',
    description: 'Ponete en contacto con Quepia, consultora creativa de Villa Carlos Paz, Córdoba.',
    mainEntity: {
        '@type': 'LocalBusiness',
        '@id': 'https://quepia.com/#organization',
        name: 'Quepia',
        email: 'hola@quepia.com',
        telephone: CONTACT_PHONE,
        contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            email: 'hola@quepia.com',
            availableLanguage: 'Spanish',
        },
    },
};

export default function ContactoPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
            />
            <JsonLd data={breadcrumbs([{ name: 'Contacto', path: '/contacto' }])} />
            <ContactoClient />
        </>
    );
}
