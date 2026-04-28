import type { Metadata } from 'next';
import Link from 'next/link';
import BrandDepthBackground from '@/components/ui/BrandDepthBackground';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';

export const metadata: Metadata = {
  title: 'Política de Privacidad',
  description:
    'Política de Privacidad de Quepia conforme a la Ley 25.326 de Protección de los Datos Personales de la República Argentina.',
  alternates: {
    canonical: 'https://quepia.com/privacidad',
  },
  openGraph: {
    title: 'Política de Privacidad | Quepia',
    description:
      'Conocé cómo Quepia recopila, utiliza, protege y conserva tus datos personales conforme a la normativa argentina.',
    url: 'https://quepia.com/privacidad',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Política de Privacidad Quepia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Política de Privacidad | Quepia',
    description: 'Tratamiento de datos personales en Quepia conforme a la Ley 25.326.',
    images: ['/og-image.jpg'],
  },
};

const privacyJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  url: 'https://quepia.com/privacidad',
  name: 'Política de Privacidad | Quepia',
  description:
    'Política de Privacidad de Quepia conforme a la Ley 25.326 de Protección de los Datos Personales.',
  isPartOf: {
    '@type': 'WebSite',
    name: 'Quepia',
    url: 'https://quepia.com',
  },
  about: {
    '@type': 'Thing',
    name: 'Protección de datos personales',
  },
};

const dataTypes = [
  'Datos identificatorios y de contacto: nombre, apellido, email, teléfono, empresa, rol o información similar que nos compartas.',
  'Información vinculada a consultas, presupuestos, propuestas, briefings, proyectos, aprobaciones, mensajes o archivos enviados por vos o tu organización.',
  'Datos de navegación y uso del sitio, como páginas visitadas, interacciones, dispositivo, navegador, dirección IP aproximada, cookies o tecnologías similares.',
  'Información necesaria para gestionar relaciones comerciales, facturación, soporte, administración interna y cumplimiento de obligaciones legales.',
];

const purposes = [
  'Responder consultas, preparar presupuestos, coordinar reuniones y brindar nuestros servicios creativos, digitales y de comunicación.',
  'Gestionar proyectos, propuestas, entregables, revisiones, aprobaciones, comunicaciones y acceso a espacios de cliente cuando correspondan.',
  'Mejorar el sitio, analizar su funcionamiento, medir campañas y comprender el interés en nuestros servicios.',
  'Enviar comunicaciones comerciales o informativas relacionadas con Quepia, siempre que exista base legal o consentimiento y con posibilidad de solicitar la baja.',
  'Cumplir obligaciones legales, contables, fiscales, administrativas, contractuales o requerimientos de autoridades competentes.',
];

const principles = [
  'Recolectamos datos por medios lícitos, leales y transparentes.',
  'Tratamos datos adecuados, pertinentes y no excesivos en relación con las finalidades informadas.',
  'No utilizamos los datos para fines distintos o incompatibles con los que motivaron su obtención.',
  'Adoptamos medidas técnicas y organizativas razonables para proteger la confidencialidad, integridad y disponibilidad de la información.',
  'Conservamos los datos durante el tiempo necesario para cumplir las finalidades correspondientes, atender obligaciones legales o defender derechos.',
];

const rights = [
  'Acceso: conocer si tratamos datos personales tuyos y solicitar información sobre ellos.',
  'Rectificación o actualización: pedir la corrección de datos inexactos, incompletos o desactualizados.',
  'Supresión o confidencialidad: solicitar la eliminación, bloqueo o tratamiento confidencial cuando corresponda legalmente.',
  'Revocación de consentimiento: retirar autorizaciones otorgadas para tratamientos que dependan de tu consentimiento.',
];

function PolicySection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/10 py-10 md:py-12">
      <p className="text-label mb-4 text-quepia-cyan">{eyebrow}</p>
      <h2 className="font-display text-2xl font-light leading-tight text-[color:var(--text-primary)] md:text-3xl">
        {title}
      </h2>
      <div className="mt-6 space-y-5 text-sm leading-7 text-[rgb(var(--text-white-soft-rgb)/0.68)] md:text-base">
        {children}
      </div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-quepia-cyan" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function PrivacidadPage() {
  const config = await getSiteConfigServer();
  const contactEmail = config.email_contacto || 'hola@quepia.com';
  const companyName = config.nombre_empresa || 'Quepia';
  const updatedAt = '28 de abril de 2026';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(privacyJsonLd) }}
      />

      <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-[color:var(--text-primary)]">
        <BrandDepthBackground variant="subtle" />
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#0a0a0a_0%,#101010_48%,#0b0b0b_100%)]" />

        <div className="relative z-10 mx-auto max-w-[1180px] px-6 pb-24 pt-32 md:px-12 md:pb-32 md:pt-44 lg:px-20">
          <header className="grid gap-10 border-b border-white/10 pb-12 md:grid-cols-[minmax(0,1fr)_320px] md:pb-16">
            <div>
              <p className="text-label mb-6 text-quepia-cyan">Privacidad y datos personales</p>
              <h1 className="font-display text-4xl font-light leading-none text-[color:var(--text-primary)] md:text-6xl">
                Política de Privacidad
              </h1>
              <p className="mt-8 max-w-3xl text-base leading-8 text-[rgb(var(--text-white-soft-rgb)/0.7)] md:text-lg">
                Esta política explica cómo {companyName} recopila, utiliza, conserva y protege datos personales en el sitio web, formularios de contacto, comunicaciones, propuestas, proyectos y servicios asociados.
              </p>
            </div>

            <aside className="self-end rounded-lg border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-[rgb(var(--text-white-soft-rgb)/0.42)]">
                Vigencia
              </p>
              <p className="mt-3 text-sm leading-6 text-[rgb(var(--text-white-soft-rgb)/0.72)]">
                Última actualización: {updatedAt}
              </p>
              <p className="mt-5 text-xs leading-6 text-[rgb(var(--text-white-soft-rgb)/0.5)]">
                Basada en la Ley 25.326 de Protección de los Datos Personales y normativa complementaria aplicable en la República Argentina.
              </p>
            </aside>
          </header>

          <div className="mx-auto max-w-4xl">
            <PolicySection eyebrow="01" title="Alcance">
              <p>
                Esta Política de Privacidad se aplica al tratamiento de datos realizado por {companyName} en relación con el sitio web quepia.com, sus formularios, canales de contacto, procesos comerciales, área de cliente, propuestas, servicios y comunicaciones vinculadas.
              </p>
              <p>
                Al utilizar el sitio, enviar una consulta, contratar servicios o interactuar con nuestros canales, aceptás que tus datos sean tratados conforme a esta política, la Ley 25.326 y sus normas reglamentarias o complementarias.
              </p>
            </PolicySection>

            <PolicySection eyebrow="02" title="Datos personales que podemos recopilar">
              <p>
                Se consideran datos personales toda información referida a personas humanas o de existencia ideal determinadas o determinables. Podemos recopilar datos provistos directamente por vos, generados durante el uso del sitio o necesarios para desarrollar la relación profesional.
              </p>
              <BulletList items={dataTypes} />
              <p>
                No solicitamos datos sensibles salvo que resulten estrictamente necesarios para un proyecto específico y cuenten con una base legal válida o tu consentimiento informado.
              </p>
            </PolicySection>

            <PolicySection eyebrow="03" title="Finalidades del tratamiento">
              <p>
                Utilizamos los datos personales únicamente para fines determinados, explícitos y legítimos, vinculados con la actividad de {companyName} y la prestación de sus servicios.
              </p>
              <BulletList items={purposes} />
            </PolicySection>

            <PolicySection eyebrow="04" title="Principios de protección aplicados">
              <p>
                Nuestro tratamiento de datos busca respetar los principios de licitud, calidad, finalidad, consentimiento, información, seguridad y confidencialidad previstos por la Ley 25.326.
              </p>
              <BulletList items={principles} />
            </PolicySection>

            <PolicySection eyebrow="05" title="Cookies, analítica y tecnologías similares">
              <p>
                El sitio puede utilizar cookies, píxeles, identificadores u otras tecnologías similares para recordar preferencias, mejorar la experiencia de navegación, medir el rendimiento del sitio y analizar interacciones con nuestras comunicaciones o campañas.
              </p>
              <p>
                Podés configurar tu navegador para bloquear, eliminar o limitar cookies. Algunas funciones del sitio podrían verse afectadas si se deshabilitan ciertas tecnologías necesarias para su funcionamiento.
              </p>
            </PolicySection>

            <PolicySection eyebrow="06" title="Cesión, proveedores y transferencias">
              <p>
                Podemos compartir datos personales con proveedores que nos ayudan a operar el sitio, alojar información, enviar correos, gestionar formularios, medir analítica, administrar proyectos, facturar o prestar servicios técnicos. Estos terceros deben tratar la información conforme a instrucciones, obligaciones de confidencialidad y medidas de seguridad razonables.
              </p>
              <p>
                También podremos comunicar datos cuando exista obligación legal, requerimiento judicial o administrativo, necesidad de proteger derechos propios o de terceros, o consentimiento del titular. No vendemos bases de datos personales.
              </p>
              <p>
                Si un proveedor procesa información fuera de Argentina, procuramos que el tratamiento mantenga estándares adecuados de protección y se limite a las finalidades previstas.
              </p>
            </PolicySection>

            <PolicySection eyebrow="07" title="Seguridad y confidencialidad">
              <p>
                Adoptamos medidas técnicas y organizativas razonables para evitar la adulteración, pérdida, consulta, acceso o tratamiento no autorizado de datos personales. El acceso interno se limita a quienes necesitan la información para cumplir sus tareas profesionales o contractuales.
              </p>
              <p>
                Aun así, ningún sistema conectado a Internet puede garantizar seguridad absoluta. Si detectamos un incidente relevante, actuaremos para mitigarlo y cumplir con las comunicaciones que correspondan según la normativa aplicable.
              </p>
            </PolicySection>

            <PolicySection eyebrow="08" title="Conservación de la información">
              <p>
                Conservamos los datos personales mientras sean necesarios para responder consultas, desarrollar proyectos, mantener relaciones comerciales, cumplir obligaciones legales, contables o fiscales, resolver disputas, prevenir abusos o defender derechos.
              </p>
              <p>
                Cuando los datos dejen de ser necesarios o pertinentes para las finalidades informadas, serán eliminados, anonimizados o conservados únicamente cuando exista una obligación o interés legítimo que lo justifique.
              </p>
            </PolicySection>

            <PolicySection eyebrow="09" title="Tus derechos">
              <p>
                Como titular de datos, podés ejercer gratuitamente los derechos reconocidos por la Ley 25.326, previa acreditación de identidad.
              </p>
              <BulletList items={rights} />
              <p>
                Para ejercerlos, escribinos a{' '}
                <a className="text-quepia-cyan hover:text-[color:var(--text-primary)]" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>{' '}
                indicando el derecho que querés ejercer y la información necesaria para verificar tu identidad y tramitar la solicitud.
              </p>
              <p>
                El derecho de acceso será respondido dentro de los plazos previstos por la Ley 25.326. Las solicitudes de rectificación, actualización o supresión serán atendidas dentro del plazo legal correspondiente, salvo que exista obligación de conservar los datos o una excepción aplicable.
              </p>
            </PolicySection>

            <PolicySection eyebrow="10" title="Autoridad de control">
              <p>
                La Agencia de Acceso a la Información Pública es la autoridad de aplicación y órgano de control de la Ley 25.326 en Argentina. Si considerás que no se respetaron tus derechos, podés recurrir a los mecanismos de denuncia o consulta previstos por ese organismo.
              </p>
              <p>
                Referencias oficiales:{' '}
                <a
                  className="text-quepia-cyan hover:text-[color:var(--text-primary)]"
                  href="https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/norma.htm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ley 25.326 en Infoleg
                </a>{' '}
                y{' '}
                <a
                  className="text-quepia-cyan hover:text-[color:var(--text-primary)]"
                  href="https://www.argentina.gob.ar/aaip/datospersonales"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Agencia de Acceso a la Información Pública
                </a>
                .
              </p>
            </PolicySection>

            <PolicySection eyebrow="11" title="Cambios en esta política">
              <p>
                Podemos actualizar esta Política de Privacidad para reflejar cambios normativos, técnicos, comerciales o de funcionamiento del sitio y los servicios. La versión vigente será la publicada en esta página, con indicación de su fecha de actualización.
              </p>
              <p>
                Si los cambios fueran sustanciales, procuraremos comunicarlos por medios razonables cuando corresponda.
              </p>
            </PolicySection>

            <div className="mt-4 flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-[color:var(--text-primary)]">Consultas sobre privacidad</p>
                <p className="mt-2 text-sm text-[rgb(var(--text-white-soft-rgb)/0.58)]">
                  Escribinos desde el mismo email vinculado a tu consulta o proyecto.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center justify-center rounded-full border border-quepia-cyan/50 px-5 py-3 text-sm text-quepia-cyan transition-colors hover:border-quepia-cyan hover:bg-quepia-cyan/10"
                >
                  {contactEmail}
                </a>
                <Link
                  href="/contacto"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm text-[rgb(var(--text-white-soft-rgb)/0.72)] transition-colors hover:border-white/25 hover:text-[color:var(--text-primary)]"
                >
                  Ir a contacto
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
