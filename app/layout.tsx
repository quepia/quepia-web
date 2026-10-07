import { CONTACT_PHONE } from '@/lib/contact';
import JsonLd from "@/components/seo/JsonLd";
import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import MarketingAnalytics from '@/components/analytics/MarketingAnalytics';
import ClientLayout from '@/components/layout/ClientLayout';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';
import { OFFICIAL_INSTAGRAM_URL } from '@/lib/instagram';
import { services } from '@/lib/seo/services';

export const metadata: Metadata = {
  metadataBase: new URL('https://quepia.com'),
  title: {
    default: 'Quepia - Consultora Creativa',
    template: '%s | Quepia'
  },
  description: 'Quepia es una consultora creativa de Villa Carlos Paz, Córdoba, Argentina. Gestión de redes sociales, estrategia de marca, contenido orgánico, diseño y branding.',
  verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION },
  authors: [{ name: 'Quepia - Consultora Creativa' }],
  creator: 'Quepia',
  publisher: 'Quepia',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: 'https://quepia.com',
    title: 'Quepia - (RE)INVENTÁ TU MARCA',
    description: 'Hacemos crecer tu identidad visual con innovación. Gestión de redes sociales, estrategia de marca, diseño gráfico, branding y producción audiovisual.',
    siteName: 'Quepia - Consultora Creativa',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200, // Ajusta según la imagen real si es necesario
        height: 630,
        alt: 'Quepia - Consultora Creativa: (RE)INVENTÁ TU MARCA',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quepia - (RE)INVENTÁ TU MARCA',
    description: 'Hacemos crecer tu identidad visual con innovación.',
    images: ['/og-image.jpg'],
  },
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch site config on the server
  const config = await getSiteConfigServer();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'ProfessionalService'],
    '@id': 'https://quepia.com/#organization',
    name: 'Quepia - Consultora Creativa',
    alternateName: 'Quepia',
    foundingDate: '2020',
    description: 'Consultora creativa de Villa Carlos Paz, Córdoba, Argentina. Especialistas en gestión de redes sociales, estrategia de marca y comunicación, contenido orgánico, diseño gráfico, branding, producción audiovisual y cobertura con dron.',
    url: 'https://quepia.com',
    logo: 'https://quepia.com/Logo_Quepia.svg',
    image: 'https://quepia.com/og-image.jpg',
    email: config.email_contacto || 'hola@quepia.com',
    telephone: CONTACT_PHONE,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Villa Carlos Paz',
      addressRegion: 'Córdoba',
      addressCountry: 'AR',
      ...(config.direccion ? { streetAddress: config.direccion } : {}),
    },
    sameAs: [OFFICIAL_INSTAGRAM_URL],
    knowsAbout: [
      'Gestión de redes sociales',
      'Contenido orgánico para redes sociales',
      'Producción audiovisual',
      'Filmación con dron',
      'Fotografía de producto e inmobiliaria',
      'Diseño gráfico',
      'Branding e identidad visual',
      'Estrategia de marca y comunicación',
      'Diseño de packaging',
    ],
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

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700&display=swap"
        />
        <link rel="stylesheet" href="https://use.typekit.net/egc1iei.css" />
        <JsonLd data={jsonLd} />
      </head>
      <body className="font-sans antialiased min-h-screen">
        <Suspense fallback={null}>
          <MarketingAnalytics />
        </Suspense>
        <ClientLayout config={config}>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
