import { createPublicClient } from '@/lib/supabase/public';
import HomeCarousel from '@/components/home/HomeCarousel';
import ServicesGrid from '@/components/home/ServicesGrid';
import HeroSection from '@/components/home/HeroSection';
import StatementSection from '@/components/home/StatementSection';
import CTASection from '@/components/home/CTASection';
import MarqueeSection from '@/components/home/MarqueeSection';
import ProcessSection from '@/components/home/ProcessSection';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

export default async function Home() {
  const supabase = createPublicClient();
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
    <main className="relative min-h-screen bg-[#0a0a0a]">
      {/* ═══════════════════════════════════════════════════════════
          HERO SECTION — Impactful 3D Experience
          ═══════════════════════════════════════════════════════════ */}
      <HeroSection />

      {/* ═══════════════════════════════════════════════════════════
          MARQUEE SECTION — Dynamic text scroll
          ═══════════════════════════════════════════════════════════ */}
      <MarqueeSection />

      {/* ═══════════════════════════════════════════════════════════
          SERVICES SECTION — Interactive expandable list
          ═══════════════════════════════════════════════════════════ */}
      <ServicesGrid servicios={servicios || []} />

      {/* ═══════════════════════════════════════════════════════════
          STATEMENT SECTION — Philosophy with visual impact
          ═══════════════════════════════════════════════════════════ */}
      <StatementSection />

      {/* ═══════════════════════════════════════════════════════════
          PROCESS SECTION — How we work
          ═══════════════════════════════════════════════════════════ */}
      <ProcessSection />

      {/* ═══════════════════════════════════════════════════════════
          PROJECTS SECTION — Cinematic showcase
          ═══════════════════════════════════════════════════════════ */}
      {proyectos && proyectos.length > 0 && (
        <HomeCarousel proyectos={proyectos} />
      )}

      {/* ═══════════════════════════════════════════════════════════
          CTA SECTION — Final call to action
          ═══════════════════════════════════════════════════════════ */}
      <CTASection email={config.email_contacto} />
    </main>
  );
}
