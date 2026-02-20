import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Política de Privacidad',
    description: 'Política de privacidad de Quepia Creative Agency. Conocé cómo recopilamos, usamos y protegemos tu información personal.',
    alternates: {
        canonical: 'https://quepia.com/privacidad',
    },
    openGraph: {
        title: 'Política de Privacidad | Quepia',
        description: 'Conocé cómo Quepia recopila, usa y protege tu información personal.',
        url: 'https://quepia.com/privacidad',
        images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Política de Privacidad Quepia' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Política de Privacidad | Quepia',
        description: 'Cómo recopilamos, usamos y protegemos tu información en Quepia.',
        images: ['/og-image.jpg'],
    },
};

export default function PrivacidadPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white pt-32 pb-20">
            <div className="max-w-3xl mx-auto px-6">
                <h1 className="text-4xl font-display font-bold mb-4">Política de Privacidad</h1>
                <p className="text-white/40 text-sm mb-12">Última actualización: enero de 2025</p>

                <div className="space-y-10 text-white/70 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">1. Quiénes somos</h2>
                        <p>
                            Quepia Creative Agency (en adelante, &quot;Quepia&quot;, &quot;nosotros&quot; o &quot;nuestro&quot;) es una consultora
                            creativa con sede en Villa Carlos Paz, Córdoba, Argentina. Podés contactarnos en{' '}
                            <a href="mailto:hola@quepia.com" className="text-white underline underline-offset-4">
                                hola@quepia.com
                            </a>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">2. Información que recopilamos</h2>
                        <p>Recopilamos información únicamente cuando vos nos la proporcionás voluntariamente, por ejemplo:</p>
                        <ul className="mt-3 space-y-2 list-disc list-inside">
                            <li>Al completar el formulario de contacto (nombre, correo electrónico, mensaje).</li>
                            <li>Al comunicarte con nosotros por correo electrónico, WhatsApp o redes sociales.</li>
                            <li>Al solicitar una propuesta o cotización de servicios.</li>
                        </ul>
                        <p className="mt-3">
                            También podemos recopilar datos de uso anónimos (páginas visitadas, tiempo en el sitio) a través
                            de herramientas de analítica web para mejorar nuestro servicio.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">3. Cómo usamos tu información</h2>
                        <p>Usamos la información recopilada para:</p>
                        <ul className="mt-3 space-y-2 list-disc list-inside">
                            <li>Responder tus consultas y solicitudes de servicio.</li>
                            <li>Enviar presupuestos, propuestas y comunicaciones relacionadas con tu proyecto.</li>
                            <li>Mejorar nuestro sitio web y la experiencia del usuario.</li>
                            <li>Cumplir con obligaciones legales y contractuales.</li>
                        </ul>
                        <p className="mt-3">
                            No utilizamos tu información para enviar publicidad no solicitada ni la vendemos o cedemos a
                            terceros.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">4. Almacenamiento y seguridad</h2>
                        <p>
                            Tus datos se almacenan en servidores seguros con acceso restringido. Implementamos medidas técnicas
                            y organizativas razonables para proteger tu información contra accesos no autorizados, pérdida o
                            divulgación indebida.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">5. Tus derechos</h2>
                        <p>
                            Tenés derecho a acceder, rectificar, cancelar u oponerte al tratamiento de tus datos personales,
                            de conformidad con la Ley N.° 25.326 de Protección de Datos Personales de la República Argentina.
                            Para ejercer estos derechos, escribinos a{' '}
                            <a href="mailto:hola@quepia.com" className="text-white underline underline-offset-4">
                                hola@quepia.com
                            </a>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">6. Cookies</h2>
                        <p>
                            Nuestro sitio puede utilizar cookies técnicas necesarias para el funcionamiento básico de la página.
                            No utilizamos cookies de rastreo publicitario de terceros sin tu consentimiento.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">7. Cambios en esta política</h2>
                        <p>
                            Podemos actualizar esta política en cualquier momento. Te notificaremos los cambios significativos
                            publicando la nueva versión en esta página con la fecha de actualización correspondiente.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">8. Contacto</h2>
                        <p>
                            Si tenés preguntas sobre esta política de privacidad, podés escribirnos a{' '}
                            <a href="mailto:hola@quepia.com" className="text-white underline underline-offset-4">
                                hola@quepia.com
                            </a>{' '}
                            o llamarnos al{' '}
                            <a href="tel:+543513970227" className="text-white underline underline-offset-4">
                                +54 351 397 0227
                            </a>
                            .
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}
