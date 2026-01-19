import { createClient } from '@/lib/supabase/server';
import { CATEGORIES } from '@/types/database';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import WorksGallery from '@/components/works/WorksGallery';

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

interface WorksPageProps {
    searchParams: Promise<{ category?: string }>;
}

export default async function WorksPage({ searchParams }: WorksPageProps) {
    const params = await searchParams;
    const activeCategory = params.category || 'branding';

    const supabase = await createClient();

    // Fetch all projects
    const { data: proyectos } = await supabase
        .from('proyectos')
        .select('*')
        .order('orden', { ascending: true })
        .order('fecha_creacion', { ascending: false });

    // Filter by category
    const filteredProyectos = proyectos?.filter(
        p => p.categoria === activeCategory
    ) || [];

    return (
        <div className="relative min-h-screen pt-20 md:pt-24">
            {/* Semi-transparent content wrapper */}
            <div className="relative z-10 bg-black/40 backdrop-blur-sm min-h-screen">
                {/* Hero Section */}
                <section className="py-8 md:py-12 text-center">
                    <div className="container mx-auto px-4 md:px-6">
                        <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4">
                            Nuestros{' '}
                            <span className="gradient-text">Trabajos</span>
                        </h1>
                        <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg">
                            Explorá nuestra galería de proyectos organizados por categoría.
                        </p>
                    </div>
                </section>

                {/* Tags Navigation */}
                <div className="sticky top-16 md:top-[72px] z-40 bg-black/80 backdrop-blur-md border-y border-white/10">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="flex gap-2 md:gap-3 py-4 overflow-x-auto scrollbar-hide">
                            {CATEGORIES.map((category) => (
                                <Link
                                    key={category.id}
                                    href={`/trabajos?category=${category.id}`}
                                    className={`flex-shrink-0 px-4 md:px-6 py-2 md:py-2.5 rounded-full text-sm md:text-base font-medium transition-all duration-300 ${activeCategory === category.id
                                            ? 'bg-gradient-to-r from-quepia-purple to-quepia-cyan text-white shadow-lg shadow-quepia-purple/30'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    {category.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <section className="py-8 md:py-12">
                    <div className="container mx-auto px-4 md:px-6">
                        {/* Category Header */}
                        <div className="mb-8 md:mb-12 text-center md:text-left">
                            <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">
                                {CATEGORIES.find(c => c.id === activeCategory)?.label || activeCategory}
                            </h2>
                        </div>

                        {/* Gallery */}
                        {filteredProyectos.length === 0 ? (
                            <div className="text-center py-16">
                                <p className="text-gray-400 text-lg mb-4">
                                    No hay proyectos en esta categoría todavía
                                </p>
                                <Link href="/contacto">
                                    <Button variant="outline">
                                        Contactanos para tu proyecto
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <WorksGallery proyectos={filteredProyectos} />
                        )}

                        {/* CTA */}
                        <div className="mt-12 text-center">
                            <p className="text-gray-400 mb-4">¿Te interesa este servicio?</p>
                            <Link href="/servicios">
                                <Button>
                                    Ver detalles del servicio <ArrowRight size={18} className="ml-2" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Bottom CTA */}
                <section className="py-16 md:py-24 border-t border-white/10">
                    <div className="container mx-auto px-4 md:px-6 text-center">
                        <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white">
                            ¿Querés un proyecto así para tu marca?
                        </h2>
                        <p className="text-gray-400 max-w-xl mx-auto mb-6 md:mb-8 text-sm md:text-base">
                            Contanos tu idea y creamos algo increíble juntos.
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
