import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Términos y Condiciones',
    description: 'Términos y condiciones de uso de los servicios de Quepia Creative Agency, consultora creativa de Villa Carlos Paz, Córdoba, Argentina.',
    alternates: {
        canonical: 'https://quepia.com/terminos',
    },
    openGraph: {
        title: 'Términos y Condiciones | Quepia',
        description: 'Términos y condiciones de uso de los servicios de Quepia Creative Agency.',
        url: 'https://quepia.com/terminos',
        images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Términos y Condiciones Quepia' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Términos y Condiciones | Quepia',
        description: 'Condiciones de uso de los servicios de Quepia Creative Agency.',
        images: ['/og-image.jpg'],
    },
};

export default function TerminosPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white pt-32 pb-20">
            <div className="max-w-3xl mx-auto px-6">
                <h1 className="text-4xl font-display font-bold mb-4">Términos y Condiciones</h1>
                <p className="text-white/40 text-sm mb-12">Última actualización: enero de 2025</p>

                <div className="space-y-10 text-white/70 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">1. Aceptación de los términos</h2>
                        <p>
                            Al acceder y utilizar el sitio web de Quepia Creative Agency (quepia.com) y/o contratar nuestros
                            servicios, aceptás estos Términos y Condiciones en su totalidad. Si no estás de acuerdo con alguna
                            de las condiciones aquí establecidas, te pedimos que no utilices nuestro sitio ni nuestros
                            servicios.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">2. Descripción de los servicios</h2>
                        <p>
                            Quepia Creative Agency ofrece servicios de diseño gráfico, branding e identidad visual, gestión de
                            redes sociales, producción audiovisual, fotografía, marketing digital y diseño web. Las condiciones
                            específicas de cada proyecto se detallan en la propuesta comercial acordada con el cliente.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">3. Presupuestos y pagos</h2>
                        <ul className="space-y-2 list-disc list-inside">
                            <li>Los presupuestos tienen una validez de 15 días corridos desde su emisión.</li>
                            <li>
                                El inicio de cada proyecto está condicionado al pago del anticipo acordado en la propuesta
                                comercial.
                            </li>
                            <li>
                                Los plazos de entrega comienzan a contar desde la acreditación del anticipo y la recepción de
                                los materiales requeridos.
                            </li>
                            <li>
                                Las modificaciones fuera del alcance original del proyecto pueden generar costos adicionales,
                                que serán informados previamente.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">4. Propiedad intelectual</h2>
                        <p>
                            Los trabajos entregados por Quepia son de exclusiva propiedad del cliente una vez abonado el total
                            del servicio. Quepia se reserva el derecho de incluir los trabajos realizados en su portfolio y
                            materiales de comunicación, salvo acuerdo de confidencialidad expreso.
                        </p>
                        <p className="mt-3">
                            El cliente garantiza tener los derechos de uso de los materiales (imágenes, textos, logos)
                            entregados a Quepia para la realización del proyecto. Quepia no se responsabiliza por el uso
                            indebido de materiales protegidos por derechos de autor.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">5. Revisiones y aprobaciones</h2>
                        <p>
                            Cada proyecto incluye un número de revisiones según lo especificado en la propuesta. Las
                            revisiones adicionales serán presupuestadas por separado. La aprobación de cada etapa por parte del
                            cliente es necesaria para avanzar a la siguiente.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">6. Plazos de entrega</h2>
                        <p>
                            Quepia se compromete a respetar los plazos acordados en la propuesta. Los plazos pueden verse
                            afectados por demoras en la entrega de materiales o aprobaciones por parte del cliente. En estos
                            casos, Quepia notificará la nueva fecha estimada de entrega.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">7. Limitación de responsabilidad</h2>
                        <p>
                            Quepia no será responsable por daños indirectos, incidentales o consecuentes derivados del uso de
                            los materiales entregados. Nuestra responsabilidad máxima se limita al monto total facturado por el
                            servicio en cuestión.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">8. Modificaciones</h2>
                        <p>
                            Quepia se reserva el derecho de modificar estos Términos y Condiciones en cualquier momento. Los
                            cambios serán publicados en esta página con la fecha de actualización. El uso continuado del sitio
                            o de nuestros servicios luego de dichos cambios implica la aceptación de los nuevos términos.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">9. Jurisdicción</h2>
                        <p>
                            Estos Términos y Condiciones se rigen por las leyes de la República Argentina. Ante cualquier
                            controversia, las partes se someten a la jurisdicción de los tribunales ordinarios de la ciudad de
                            Villa Carlos Paz, Córdoba, con renuncia expresa a cualquier otro fuero.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-3">10. Contacto</h2>
                        <p>
                            Para consultas sobre estos términos, podés escribirnos a{' '}
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
