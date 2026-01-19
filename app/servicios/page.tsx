import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import ServicesPageGrid from '@/components/services/ServicesPageGrid';

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

export default async function ServiciosPage() {
    const supabase = await createClient();

    const { data: servicios } = await supabase
        .from('servicios')
        .select('*')
        .order('orden', { ascending: true });

    return (
        <div className="relative min-h-screen pt-20 md:pt-24">
            {/* Semi-transparent content wrapper */}
            <div className="relative z-10 bg-black/40 backdrop-blur-sm min-h-screen">
                {/* Hero Section */}
                <section className="py-12 md:py-20 text-center container mx-auto px-4 md:px-6">
                    <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-4 md:mb-6">
                        Nuestros{' '}
                        <span className="gradient-text">Servicios</span>
                    </h1>
                    <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-xl">
                        Soluciones creativas integrales para elevar tu marca.
                    </p>
                </section>

                {/* Services Grid */}
                <section className="container mx-auto px-4 md:px-6 pb-16 md:pb-24">
                    {servicios && servicios.length > 0 ? (
                        <ServicesPageGrid servicios={servicios} />
                    ) : (
                        <div className="text-center py-16">
                            <p className="text-gray-400 text-lg mb-4">
                                No hay servicios configurados todavía
                            </p>
                        </div>
                    )}
                </section>

                {/* CTA Final */}
                <section className="py-16 md:py-24 border-t border-white/10">
                    <div className="container mx-auto px-4 md:px-6 text-center">
                        <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white">
                            ¿No encontrás lo que buscás?
                        </h2>
                        <p className="text-gray-400 max-w-xl mx-auto mb-6 md:mb-8 text-sm md:text-base">
                            Cada proyecto es único. Contanos tu idea y diseñamos una solución a medida.
                        </p>
                        <Link href="/contacto">
                            <Button size="lg">
                                Hablemos de tu proyecto <ArrowRight size={18} className="ml-2" />
                            </Button>
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
}
