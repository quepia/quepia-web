import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientLayout from '@/components/layout/ClientLayout';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://quepia-web.vercel.app'), // Reemplaza con tu dominio real si tienes uno propio
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
    url: 'https://quepia-web.vercel.app',
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

  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased min-h-screen`}>
        <ClientLayout config={config}>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
