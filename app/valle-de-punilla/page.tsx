import LocationPage from '@/components/seo/LocationPage';
import type { Metadata } from 'next';
import { locations } from '@/lib/seo/landing-pages';
const item = locations.find(item => item.slug === 'valle-de-punilla')!;
export const revalidate = 300;
const description = 'Diseño, fotografía y producción audiovisual para marcas del Valle de Punilla, Córdoba. Quepia coordina proyectos desde Villa Carlos Paz.';
const socialTitle = `${item.title} | Quepia`;
const images = [{ url: '/og-image.jpg', alt: 'Quepia - Consultora Creativa: servicios para el Valle de Punilla, Córdoba' }];
export const metadata: Metadata = {
  title: item.title,
  description,
  alternates: { canonical: '/valle-de-punilla' },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'Quepia - Consultora Creativa',
    title: socialTitle,
    description,
    url: '/valle-de-punilla',
    images,
  },
  twitter: { card: 'summary_large_image', title: socialTitle, description, images },
};
export default function Page() { return <LocationPage slug="valle-de-punilla" />; }
