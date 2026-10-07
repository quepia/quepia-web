import type { Metadata } from 'next';

export const localSearch = {
  'villa-carlos-paz': {
    description: 'Gestión de redes sociales, contenido orgánico, branding y producción audiovisual en Villa Carlos Paz. Quepia, consultora creativa con base en la ciudad.',
    summary: 'Quepia es una consultora creativa con base en Villa Carlos Paz, Córdoba, Argentina. Su servicio principal es la gestión de redes sociales y contenido orgánico para marcas. También realiza branding, diseño gráfico, fotografía, producción audiovisual y packaging. Las reuniones y revisiones pueden hacerse a distancia; las jornadas de producción se coordinan según el proyecto.',
    area: { '@type': 'City', name: 'Villa Carlos Paz', containedInPlace: { '@type': 'AdministrativeArea', name: 'Córdoba, Argentina' } },
    faq: [
      { q: '¿Dónde tiene base Quepia?', a: 'Quepia tiene base en Villa Carlos Paz, provincia de Córdoba, Argentina. Las reuniones presenciales se coordinan previamente por sus canales de contacto.' },
      { q: '¿Qué incluye la gestión de redes sociales en Villa Carlos Paz?', a: 'El alcance puede incluir estrategia de contenido orgánico, planificación y calendario, diseño de publicaciones, redacción y reels. Las plataformas, cantidades y tareas de publicación se acuerdan en la propuesta. La respuesta a mensajes y comentarios se define por separado.' },
      { q: '¿Quepia realiza fotografía y video para negocios de Carlos Paz?', a: 'Sí. Quepia coordina fotografía de producto e inmobiliaria y producción audiovisual para marcas. Las jornadas, espacios, entregables y condiciones se acuerdan antes de producir. Las tomas con dron se evalúan según cada locación.' },
      { q: '¿Cómo pedir un presupuesto para mi marca en Villa Carlos Paz?', a: 'Podés consultar por WhatsApp o desde el formulario de contacto. Compartí el rubro de tu negocio, los canales actuales, el objetivo, los materiales disponibles y la fecha orientativa. La propuesta se cotiza según alcance y producción necesaria.' },
    ],
  },
  cordoba: {
    description: 'Gestión de redes sociales, branding y producción audiovisual para marcas de Córdoba Capital y provincia. Quepia trabaja desde su base en Villa Carlos Paz.',
    summary: 'Quepia atiende marcas de Córdoba Capital y del resto de la provincia desde su base en Villa Carlos Paz. Ofrece gestión de redes sociales y contenido orgánico, branding, diseño gráfico, fotografía, producción audiovisual y packaging. La planificación y las revisiones se coordinan a distancia; para producciones presenciales se acuerdan locación, fechas y viáticos según distancia.',
    area: { '@type': 'AdministrativeArea', name: 'Provincia de Córdoba, Argentina', containsPlace: { '@type': 'City', name: 'Córdoba Capital' } },
    faq: [
      { q: '¿Quepia trabaja con empresas de Córdoba Capital?', a: 'Sí. Quepia trabaja con marcas de Córdoba Capital y otras localidades de la provincia desde su base en Villa Carlos Paz. La planificación, el diseño y las revisiones pueden coordinarse por videollamada.' },
      { q: '¿Puedo contratar gestión de redes sociales en Córdoba a distancia?', a: 'Sí. La estrategia de contenido orgánico, el calendario, el diseño y la revisión de piezas pueden realizarse a distancia. Si hace falta fotografía o video en tu negocio, se acuerda una jornada presencial y su presupuesto.' },
      { q: '¿Cómo se coordinan las producciones de fotos y video en Córdoba?', a: 'Antes de confirmar una jornada se definen la locación, los accesos, los horarios, los materiales y los entregables. Los traslados y viáticos se acuerdan según la distancia desde Villa Carlos Paz. La viabilidad de las tomas con dron se revisa para cada lugar.' },
      { q: '¿Qué información necesita Quepia para cotizar un proyecto en Córdoba?', a: 'Indicá la ciudad, el rubro, el objetivo, los canales o piezas que necesitás, los materiales disponibles y una fecha orientativa. Quepia prepara una propuesta según los entregables, las revisiones y la producción necesaria; no hay un precio único para todos los proyectos.' },
    ],
  },
} as const;

export function getLocalSearch(slug: string) {
  return slug === 'villa-carlos-paz' || slug === 'cordoba' ? localSearch[slug] : undefined;
}

export function localMetadata(slug: keyof typeof localSearch, title: string): Metadata {
  const { description } = localSearch[slug];
  const socialTitle = `${title} | Quepia`;
  const images = [{ url: '/og-image.jpg', alt: 'Quepia - Consultora Creativa, Villa Carlos Paz, Córdoba, Argentina' }];
  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: { type: 'website', locale: 'es_AR', siteName: 'Quepia - Consultora Creativa', title: socialTitle, description, url: `/${slug}`, images },
    twitter: { card: 'summary_large_image', title: socialTitle, description, images },
  };
}
