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
  title: 'Quepia - Consultora Creativa',
  description: 'Quepia es una consultora creativa de Villa Carlos Paz, Córdoba, Argentina. Especialistas en diseño gráfico, branding, marketing, gestión de redes sociales, producción de video y fotografía.',
  keywords: ['consultora creativa', 'diseño gráfico', 'branding', 'marketing', 'redes sociales', 'Villa Carlos Paz', 'Córdoba', 'Argentina'],
  authors: [{ name: 'Quepia' }],
  openGraph: {
    type: 'website',
    title: 'Quepia - Consultora Creativa',
    description: 'Hacemos crecer tu identidad visual con innovación. Especialistas en diseño gráfico, branding, marketing y más.',
    locale: 'es_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quepia - Consultora Creativa',
    description: 'Hacemos crecer tu identidad visual con innovación.',
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
