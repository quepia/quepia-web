import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import SectionWrapper from '@/components/ui/SectionWrapper';
import HomeCarousel from '@/components/home/HomeCarousel';
import ServicesGrid from '@/components/home/ServicesGrid';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();
  const config = await getSiteConfigServer();

  // Fetch featured projects
  const { data: proyectos } = await supabase
    .from('proyectos')
    .select('*')
    .eq('destacado', true)
    .order('orden', { ascending: true })
    .limit(6);

  // Fetch services
  const { data: servicios } = await supabase
    .from('servicios')
    .select('*')
    .order('orden', { ascending: true });

  return (
    <div className="relative">
      {/* Hero Section - Transparent background to show spheres */}
      <section className="relative z-10 min-h-screen w-full flex items-center justify-center px-4 py-20 md:py-0">
        <div className="w-full max-w-4xl mx-auto text-center glass-card p-6 sm:p-8 md:p-10">
          <h1 className="text-white font-black text-3xl sm:text-4xl md:text-6xl lg:text-7xl tracking-tighter mb-4 md:mb-6 leading-tight">
            {config.hero_titulo || 'CONSULTORÍA PARA MEJORAR.'}
          </h1>
          <div className="gradient-text text-xl sm:text-2xl md:text-4xl font-bold mb-6 md:mb-8">
            {config.hero_subtitulo || '(RE)inventá tu marca con Quepia'}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link href="/contacto">
              <Button className="w-full sm:w-auto">
                Contactanos <ArrowRight size={18} className="ml-2" />
              </Button>
            </Link>
            <Link href="/servicios">
              <Button variant="outline" className="w-full sm:w-auto">
                Nuestros Servicios
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Services Section - Semi-transparent backdrop */}
      <SectionWrapper className="relative z-10 py-16 md:py-24 bg-black/40 backdrop-blur-sm border-t border-white/10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white">
              Creamos desde cero
            </h2>
            <p className="text-gray-400 text-sm md:text-base">
              Tocá cada servicio para conocer más detalles
            </p>
          </div>

          <ServicesGrid servicios={servicios || []} />
        </div>
      </SectionWrapper>

      {/* Projects Carousel Section - Semi-transparent backdrop */}
      {proyectos && proyectos.length > 0 && (
        <SectionWrapper className="relative z-10 min-h-screen py-12 md:py-16 bg-black/50 backdrop-blur-sm border-t border-white/10 flex items-center">
          <div className="w-full px-4 md:px-8 lg:px-12">
            <div className="text-center max-w-3xl mx-auto mb-8 md:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-4 md:mb-6 text-white">
                Nuestros Trabajos
              </h2>
              <p className="text-gray-400 text-base md:text-xl">
                Explorá algunos de nuestros proyectos destacados
              </p>
            </div>

            <HomeCarousel proyectos={proyectos} />
          </div>
        </SectionWrapper>
      )}
    </div>
  );
}
