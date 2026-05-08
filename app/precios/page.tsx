import type { Metadata } from 'next';
import PreciosClient from './PreciosClient';

export const metadata: Metadata = {
  title: 'Precios | Quepia - Consultora Creativa',
  description:
    'Planes comerciales de Quepia para ordenar, activar y escalar la presencia digital de tu marca.',
  alternates: {
    canonical: 'https://quepia.com/precios',
  },
  openGraph: {
    title: 'Precios | Quepia',
    description:
      'Conocé los planes Primer paso, Impulso y 360 para tu marca.',
    url: 'https://quepia.com/precios',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Planes Quepia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Precios | Quepia',
    description: 'Planes comerciales para marcas que quieren comunicar con más claridad.',
    images: ['/og-image.jpg'],
  },
};

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  url: 'https://quepia.com/precios',
  name: 'Precios | Quepia',
  description: 'Planes comerciales de Quepia para marcas en distintas etapas de crecimiento.',
};

export default function PreciosPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <PreciosClient />
    </>
  );
}
