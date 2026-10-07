import { CONTACT_PHONE } from '@/lib/contact';
import JsonLd, { breadcrumbs } from '@/components/seo/JsonLd';
import type { Metadata } from 'next';
import ContactoClient from './ContactoClient';

export const metadata: Metadata = {
    title: 'Contacto',
    description: 'Contactate con Quepia, consultora creativa de Villa Carlos Paz, Córdoba. Hablemos de tu proyecto de diseño, branding o marketing.',
    alternates: {
        canonical: 'https://quepia.com/contacto',
    },
    openGraph: {
        title: 'Contacto | Quepia - Consultora Creativa',
        description: '¿Tenés un proyecto en mente? Contactanos y hagámoslo realidad. Coordinamos una primera conversación para definir el alcance.',
        url: 'https://quepia.com/contacto',
        images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Contacto Quepia' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Contacto | Quepia',
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
