import type { Metadata } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import HomeCarousel from '@/components/home/HomeCarousel';
import ServicesGrid from '@/components/home/ServicesGrid';
import HeroSection from '@/components/home/HeroSection';
import CTASection from '@/components/home/CTASection';
import MarqueeSection from '@/components/home/MarqueeSection';
import ProcessSection from '@/components/home/ProcessSection';
import BrandDepthBackground from '@/components/ui/BrandDepthBackground';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Quepia - Consultora Creativa | Villa Carlos Paz, Córdoba',
  description: 'Quepia es una consultora creativa de Villa Carlos Paz, Córdoba. Transformamos marcas con diseño gráfico, branding y marketing digital.',
  alternates: {
    canonical: 'https://quepia.com',
  },
  openGraph: {
    title: 'Quepia - (RE)INVENTÁ TU MARCA',
    description: 'Hacemos crecer tu identidad visual con innovación. Especialistas en diseño gráfico, branding y marketing digital en Córdoba, Argentina.',
    url: 'https://quepia.com',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Quepia Creative Agency' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quepia - (RE)INVENTÁ TU MARCA',
    description: 'Hacemos crecer tu identidad visual con innovación. Especialistas en diseño gráfico y branding en Córdoba.',
    images: ['/og-image.jpg'],
  },
};

export default async function Home() {
  const supabase = createPublicClient();
  const config = await getSiteConfigServer();

  const [{ data: proyectos }, { data: servicios }] = await Promise.all([
    supabase
      .from('proyectos')
      .select('*')
      .eq('destacado', true)
      .order('orden', { ascending: true }),
    supabase
      .from('servicios')
      .select('*')
      .order('orden', { ascending: true }),
  ]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-[color:var(--text-primary)]">
      <BrandDepthBackground variant="subtle" />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#0a0a0a_0%,#101010_42%,#0d0d0d_100%)]" />

      <div className="relative z-10">
        <section id="hero">
          <HeroSection />
        </section>

        <section
          id="social-proof"
          className="pt-4"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}
        >
          <MarqueeSection servicios={servicios || []} />
        </section>

        <section
          id="expertise"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '1100px' }}
        >
          <ServicesGrid servicios={servicios || []} />
        </section>

        <section
          id="case-studies"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '1200px' }}
        >
          {proyectos && proyectos.length > 0 && (
            <HomeCarousel proyectos={proyectos} />
          )}
        </section>

        <section
          id="method"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '900px' }}
        >
          <ProcessSection />
        </section>

        <section
          id="final-cta"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '600px' }}
        >
          <CTASection email={config.email_contacto} />
        </section>
      </div>
    </main>
  );
}
