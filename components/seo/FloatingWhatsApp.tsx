'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { services } from '@/lib/seo/services';
import { isTrackableRoute } from '@/lib/marketing-analytics';
import { whatsappUrl } from '@/lib/contact';
export default function FloatingWhatsApp() {
  const pathname = usePathname();
  const [formVisible, setFormVisible] = useState(false);
  useEffect(() => {
    const form = document.getElementById('consulta');
    if (!form) { setFormVisible(false); return; }
    const observer = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting));
    observer.observe(form);
    return () => observer.disconnect();
  }, [pathname]);
  if (!isTrackableRoute(pathname) || pathname === '/contacto' || formVisible) return null;
  const service = services.find(item => pathname === `/servicios/${item.slug}`)?.name;
  return <a href={whatsappUrl(service)} data-service={service || 'general'} aria-label={`Consultá por WhatsApp${service ? ` sobre ${service}` : ''}`} className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full border border-[#2ae7e4]/30 bg-[#101010] px-4 py-3 text-sm text-[#2ae7e4] shadow-xl hover:bg-[#1a1a1a]"><MessageCircle size={20} /><span className="hidden sm:inline">WhatsApp</span></a>;
}
