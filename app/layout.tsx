import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Space_Grotesk, Work_Sans } from 'next/font/google';
import './globals.css';
import MarketingAnalytics from '@/components/analytics/MarketingAnalytics';
import ClientLayout from '@/components/layout/ClientLayout';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';
import { DEFAULT_INSTAGRAM_URL, getInstagramUrl } from '@/lib/instagram';

const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-work-sans',
  weight: ['400', '500', '600', '700', '800'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
  weight: ['500', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://quepia.com'),
  title: {
    default: 'Quepia - Consultora Creativa',
    template: '%s | Quepia'
  },
  description: 'Quepia es una consultora creativa de Villa Carlos Paz, Córdoba, Argentina. Transformamos marcas con estrategias de diseño, branding y marketing digital.',
  keywords: ['consultora creativa', 'diseño gráfico', 'branding', 'marketing digital', 'redes sociales', 'Villa Carlos Paz', 'Córdoba', 'Argentina', 'desarrollo web'],
  authors: [{ name: 'Quepia Creative Agency' }],
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
    description: 'Hacemos crecer tu identidad visual con innovación. Especialistas en diseño gráfico, branding, marketing y más.',
    siteName: 'Quepia Creative Agency',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200, // Ajusta según la imagen real si es necesario
        height: 630,
        alt: 'Quepia Creative Agency - (RE)INVENTÁ TU MARCA',
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
  const sameAs = [
    config.instagram ? getInstagramUrl(config.instagram) : DEFAULT_INSTAGRAM_URL,
    config.linkedin,
    config.behance,
    config.facebook,
    config.youtube,
    config.tiktok,
    config.twitter,
    config.google_maps,
  ].filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'ProfessionalService'],
    '@id': 'https://quepia.com/#organization',
    name: 'Quepia',
    alternateName: 'Quepia Creative Agency',
    description: 'Consultora creativa de Villa Carlos Paz, Córdoba, Argentina. Especialistas en diseño gráfico, branding, marketing digital, gestión de redes sociales y producción audiovisual.',
    url: 'https://quepia.com',
    logo: 'https://quepia.com/Logo_Quepia.svg',
    image: 'https://quepia.com/og-image.jpg',
    email: 'hola@quepia.com',
    telephone: '+54-351-397-0227',
    foundingDate: '2020',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Villa Carlos Paz',
      addressRegion: 'Córdoba',
      addressCountry: 'AR',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00',
    },
    sameAs: sameAs.length > 0 ? sameAs : [DEFAULT_INSTAGRAM_URL],
    areaServed: { '@type': 'Country', name: 'Argentina' },
    priceRange: '$$',
  };

  return (
    <html lang="es" className={`${workSans.variable} ${spaceGrotesk.variable}`}>
      <head>
        <meta name="theme-color" content="#0a0a0a" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
