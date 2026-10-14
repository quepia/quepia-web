import JsonLd, { breadcrumbs } from '@/components/seo/JsonLd';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Faq } from '@/components/seo/PublicContent';
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
      'Conocé los planes Esencial, Plus y Premium para tu marca.',
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

const quoteQuestions = [
  { q: '¿Cómo se calcula el presupuesto de un plan?', a: 'Cada propuesta se cotiza según el alcance: entregables, revisiones y producción necesaria. La cantidad de piezas, las plataformas y las tareas de publicación se acuerdan antes de empezar. Si necesitás fotografías o grabaciones nuevas, esa producción se evalúa según las jornadas, locaciones y entregables.' },
  { q: '¿Qué información enviar para pedir una propuesta?', a: 'Contanos el objetivo de tu marca, el rubro, la ciudad, los canales o piezas que necesitás y una fecha orientativa. Indicá también qué materiales de marca, fotografías o videos ya tenés. Con esa información podemos evaluar el alcance y los recursos necesarios.' },
  { q: '¿Puedo contratar un servicio sin elegir un plan?', a: 'Sí. Podés consultar por un servicio específico, como gestión de redes sociales, branding, diseño gráfico, fotografía o producción audiovisual. Revisamos los recursos disponibles y lo que necesita el proyecto; los servicios complementarios se acuerdan por separado.' },
  { q: '¿Puedo coordinar una propuesta desde Córdoba Capital?', a: 'Sí. Quepia tiene base en Villa Carlos Paz y trabaja con marcas de toda la provincia de Córdoba. Las reuniones, la planificación y las revisiones pueden coordinarse a distancia. Cuando hace falta una producción presencial, se acuerdan la jornada y los viáticos según la distancia.' },
] as const;

export default function PreciosPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <JsonLd data={breadcrumbs([{ name: 'Precios', path: '/precios' }])} />
      <PreciosClient>
        <Faq items={quoteQuestions} />
        <p className="mt-6 max-w-3xl leading-relaxed text-[#a1a1aa]">Si tu prioridad son las redes, revisá el <Link className="text-[#2ae7e4] underline underline-offset-4" href="/servicios/gestion-de-redes-sociales">alcance de la gestión de redes sociales</Link> para conocer las tareas, la coordinación y los casos publicados antes de pedir tu propuesta.</p>
      </PreciosClient>
    </>
  );
}
