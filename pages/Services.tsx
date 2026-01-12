import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Video, Camera, PenTool, Layout, Palette, Megaphone, Package, Layers,
  ChevronDown, CheckCircle, ArrowRight, X, Image
} from 'lucide-react';
import Button from '../components/ui/Button';
import { Link } from 'react-router-dom';
import { useModal } from '../context/ModalContext';

// Services data with worksCategory for deep linking to Works page
const services = [
  {
    id: 'diseno-grafico',
    worksCategory: 'diseno-grafico',
    icon: Palette,
    title: 'Diseño Gráfico',
    shortDesc: 'Creamos piezas visuales impactantes.',
    description: 'Desarrollamos identidades visuales completas, desde logotipos hasta materiales de marketing. Nuestro equipo combina creatividad y estrategia para crear diseños que comunican efectivamente tu mensaje y conectan con tu audiencia.',
    features: ['Diseño de logotipos', 'Material impreso', 'Diseño editorial', 'Ilustración digital', 'Infografías'],
  },
  {
    id: 'productos-procesos',
    worksCategory: 'productos',
    icon: Layout,
    title: 'Diseño de Productos y Procesos',
    shortDesc: 'Conceptualización y desarrollo integral.',
    description: 'Diseñamos productos funcionales y estéticos, optimizando procesos de producción. Desde el concepto inicial hasta el prototipo final, acompañamos cada etapa del desarrollo con un enfoque centrado en el usuario.',
    features: ['Conceptualización', 'Prototipado', 'Diseño industrial', 'Optimización de procesos', 'UX/UI'],
  },
  {
    id: 'redes-sociales',
    worksCategory: 'redes-sociales',
    icon: Megaphone,
    title: 'Gestión de Redes Sociales',
    shortDesc: 'Estrategia digital para tu marca.',
    description: 'Gestionamos tus redes sociales con contenido estratégico y creativo. Creamos calendarios de publicación, diseñamos posts atractivos y analizamos métricas para optimizar el alcance y engagement de tu comunidad.',
    features: ['Estrategia de contenido', 'Diseño de posts', 'Community management', 'Análisis de métricas', 'Campañas pagadas'],
  },
  {
    id: 'branding',
    worksCategory: 'branding',
    icon: Layers,
    title: 'Branding',
    shortDesc: 'Identidad visual coherente.',
    description: 'Construimos marcas memorables que conectan emocionalmente con tu público. Definimos personalidad de marca, tono de comunicación, paleta de colores y todos los elementos que hacen única tu identidad.',
    features: ['Identidad visual', 'Manual de marca', 'Naming', 'Estrategia de marca', 'Rebranding'],
  },
  {
    id: 'carteleria',
    worksCategory: 'carteleria',
    icon: PenTool,
    title: 'Cartelería',
    shortDesc: 'Soluciones visuales de gran formato.',
    description: 'Diseñamos y producimos cartelería impactante para puntos de venta, eventos y espacios comerciales. Trabajamos con diversos materiales y técnicas para maximizar la visibilidad de tu marca.',
    features: ['Señalética', 'Vinilos', 'Banners', 'Displays', 'Rotulación vehicular'],
  },
  {
    id: 'marketing',
    worksCategory: 'marketing',
    icon: Megaphone,
    title: 'Marketing',
    shortDesc: 'Estrategias que generan resultados.',
    description: 'Desarrollamos campañas de marketing integrales que combinan canales digitales y tradicionales. Desde la planificación estratégica hasta la ejecución, nos enfocamos en alcanzar tus objetivos comerciales.',
    features: ['Marketing digital', 'Email marketing', 'SEO/SEM', 'Publicidad tradicional', 'Estrategia 360°'],
  },
  {
    id: 'video',
    worksCategory: 'video',
    icon: Video,
    title: 'Producción de Video',
    shortDesc: 'Narrativas cinematográficas para tu marca.',
    description: 'Producimos contenido audiovisual de alta calidad: spots publicitarios, videos corporativos, contenido para redes sociales y más. Cada proyecto cuenta una historia que captura la esencia de tu marca.',
    features: ['Spots publicitarios', 'Videos corporativos', 'Reels y TikToks', 'Motion graphics', 'Drone FPV'],
  },
  {
    id: 'fotografia',
    worksCategory: 'fotografia',
    icon: Camera,
    title: 'Fotografía',
    shortDesc: 'Imágenes de alto impacto.',
    description: 'Realizamos sesiones fotográficas profesionales para productos, campañas publicitarias, retratos corporativos y estilo de vida. Capturamos la esencia visual que tu marca necesita para destacar.',
    features: ['Fotografía de producto', 'Retratos corporativos', 'Lifestyle', 'Eventos', 'Edición profesional'],
  },
  {
    id: 'packaging',
    worksCategory: 'packaging',
    icon: Package,
    title: 'Diseño de Packaging',
    shortDesc: 'Envases que venden.',
    description: 'Creamos packaging innovador que destaca en el punto de venta. Combinamos funcionalidad, sustentabilidad y diseño atractivo para que tu producto se distinga de la competencia.',
    features: ['Diseño estructural', 'Etiquetas', 'Cajas y envases', 'Packaging sustentable', 'Mockups 3D'],
  },
];

// Service Card Component - Simple, always visible
function ServiceCard({ service, onSelect }: { service: typeof services[0], onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white/5 hover:bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-quepia-cyan/50 p-5 md:p-6 transition-all duration-300 group"
      style={{ opacity: 1, visibility: 'visible' }}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform">
          <service.icon size={24} className="md:w-7 md:h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg md:text-xl font-bold font-display text-white mb-1 group-hover:text-quepia-cyan transition-colors">
            {service.title}
          </h3>
          <p className="text-gray-400 text-sm md:text-base line-clamp-2">
            {service.shortDesc}
          </p>
        </div>
        <ArrowRight size={20} className="text-gray-500 group-hover:text-quepia-cyan group-hover:translate-x-1 transition-all shrink-0 mt-1" />
      </div>
    </button>
  );
}

// Service type with worksCategory
type ServiceType = typeof services[0];

// Full-screen Service Detail Modal
function ServiceModal({ service, onClose }: { service: ServiceType | null, onClose: () => void }) {
  const { openModal, closeModal } = useModal();

  useEffect(() => {
    if (service) {
      document.body.style.overflow = 'hidden';
      openModal();
    } else {
      document.body.style.overflow = '';
      closeModal();
    }
    return () => {
      document.body.style.overflow = '';
      closeModal();
    };
  }, [service, openModal, closeModal]);

  if (!service) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      {/* Close button with safe area padding for notch/dynamic island */}
      <button
        onClick={onClose}
        className="fixed right-4 md:right-6 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10 shadow-lg"
        style={{ top: 'max(env(safe-area-inset-top, 16px), 16px)' }}
        aria-label="Cerrar"
      >
        <X size={24} strokeWidth={2.5} />
      </button>
      <div
        className="min-h-screen flex items-center justify-center p-4 md:p-8"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 16px), 64px)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-3xl border border-white/20 p-6 md:p-10 relative"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Icon and Title */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
              <service.icon size={32} className="md:w-10 md:h-10" />
            </div>
            <div>
              <h2 className="text-2xl md:text-4xl font-display font-bold text-white">
                {service.title}
              </h2>
              <p className="text-quepia-cyan text-sm md:text-base mt-1">
                {service.shortDesc}
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-300 text-base md:text-lg leading-relaxed mb-8">
            {service.description}
          </p>

          {/* Features */}
          <div className="mb-8">
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">
              Lo que incluye
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {service.features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-3 text-gray-300">
                  <CheckCircle size={18} className="text-quepia-cyan shrink-0" />
                  <span className="text-sm md:text-base">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/contacto" className="flex-1">
              <Button className="w-full justify-center text-base py-3.5">
                Cotizar servicio <ArrowRight size={18} className="ml-2" />
              </Button>
            </Link>
            <Link to={`/trabajos?category=${service.worksCategory}`} className="flex-1">
              <button className="w-full px-6 py-3.5 rounded-full bg-white/10 hover:bg-quepia-cyan/20 border border-white/20 hover:border-quepia-cyan text-white transition-all text-base flex items-center justify-center gap-2">
                <Image size={18} />
                Ver trabajos
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

const Services: React.FC = () => {
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure content is visible immediately on mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative min-h-screen pt-20 md:pt-24">
      {/* Glassmorphism content wrapper */}
      <div
        className="relative z-10 bg-black/50 backdrop-blur-sm min-h-screen"
        style={{ opacity: 1, visibility: 'visible' }}
      >
        {/* Hero Section - Always visible */}
        <section
          className="py-12 md:py-20 text-center container mx-auto px-4 md:px-6"
          style={{ opacity: 1, visibility: 'visible' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-display font-bold mb-4 md:mb-6">
              Nuestros{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-quepia-purple to-quepia-cyan">
                Servicios
              </span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-xl">
              Soluciones creativas integrales para elevar tu marca.
            </p>
          </motion.div>
        </section>

        {/* Services Grid - Full width, clean layout */}
        <section
          className="container mx-auto px-4 md:px-6 pb-16 md:pb-24"
          style={{ opacity: 1, visibility: 'visible' }}
        >
          <div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5"
            style={{ opacity: 1, visibility: 'visible' }}
          >
            {services.map((service, index) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3) }}
                style={{ opacity: mounted ? 1 : undefined, visibility: 'visible' }}
              >
                <ServiceCard
                  service={service}
                  onSelect={() => setSelectedService(service)}
                />
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Final */}
        <section
          className="py-16 md:py-24 border-t border-white/10"
          style={{ opacity: 1, visibility: 'visible' }}
        >
          <div className="container mx-auto px-4 md:px-6 text-center">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold mb-4 md:mb-6 text-white">
              ¿No encontrás lo que buscás?
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto mb-6 md:mb-8 text-sm md:text-base">
              Cada proyecto es único. Contanos tu idea y diseñamos una solución a medida.
            </p>
            <Link to="/contacto">
              <Button className="text-base md:text-lg px-8 md:px-10 py-3 md:py-4">
                Hablemos de tu proyecto <ArrowRight size={18} className="ml-2" />
              </Button>
            </Link>
          </div>
        </section>
      </div>

      {/* Service Detail Modal */}
      {selectedService && (
        <ServiceModal
          service={selectedService}
          onClose={() => setSelectedService(null)}
        />
      )}
    </div>
  );
};

export default Services;
