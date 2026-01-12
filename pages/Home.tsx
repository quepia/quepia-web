import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Video, Camera, PenTool, Layout, Palette, Megaphone, Package, Layers } from 'lucide-react';
import Button from '../components/ui/Button';
import SectionWrapper from '../components/ui/SectionWrapper';
import { worksData, WorkCategory } from '../data/worksData';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [expandedService, setExpandedService] = useState<number | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detectar tamaño de pantalla para el carrusel
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Servicios con descripciones desplegables (sin duplicar Cartelería)
  const services = [
    {
      icon: Palette,
      title: 'Diseño Gráfico',
      desc: 'Creamos piezas visuales impactantes.',
      details: 'Desarrollamos identidades visuales completas, desde logotipos hasta materiales de marketing. Nuestro equipo combina creatividad y estrategia para crear diseños que comunican efectivamente tu mensaje y conectan con tu audiencia.'
    },
    {
      icon: Layout,
      title: 'Diseño de Productos y Procesos',
      desc: 'Conceptualización y desarrollo integral.',
      details: 'Diseñamos productos funcionales y estéticos, optimizando procesos de producción. Desde el concepto inicial hasta el prototipo final, acompañamos cada etapa del desarrollo con un enfoque centrado en el usuario.'
    },
    {
      icon: Megaphone,
      title: 'Gestión de Redes Sociales',
      desc: 'Estrategia digital para tu marca.',
      details: 'Gestionamos tus redes sociales con contenido estratégico y creativo. Creamos calendarios de publicación, diseñamos posts atractivos y analizamos métricas para optimizar el alcance y engagement de tu comunidad.'
    },
    {
      icon: Layers,
      title: 'Branding',
      desc: 'Identidad visual coherente.',
      details: 'Construimos marcas memorables que conectan emocionalmente con tu público. Definimos personalidad de marca, tono de comunicación, paleta de colores y todos los elementos que hacen única tu identidad.'
    },
    {
      icon: PenTool,
      title: 'Cartelería',
      desc: 'Soluciones visuales de gran formato.',
      details: 'Diseñamos y producimos cartelería impactante para puntos de venta, eventos y espacios comerciales. Trabajamos con diversos materiales y técnicas para maximizar la visibilidad de tu marca.'
    },
    {
      icon: Megaphone,
      title: 'Marketing',
      desc: 'Estrategias que generan resultados.',
      details: 'Desarrollamos campañas de marketing integrales que combinan canales digitales y tradicionales. Desde la planificación estratégica hasta la ejecución, nos enfocamos en alcanzar tus objetivos comerciales.'
    },
    {
      icon: Video,
      title: 'Producción de Video',
      desc: 'Narrativas cinematográficas para tu marca.',
      details: 'Producimos contenido audiovisual de alta calidad: spots publicitarios, videos corporativos, contenido para redes sociales y más. Cada proyecto cuenta una historia que captura la esencia de tu marca.'
    },
    {
      icon: Camera,
      title: 'Fotografía',
      desc: 'Imágenes de alto impacto.',
      details: 'Realizamos sesiones fotográficas profesionales para productos, campañas publicitarias, retratos corporativos y estilo de vida. Capturamos la esencia visual que tu marca necesita para destacar.'
    },
    {
      icon: Package,
      title: 'Diseño de Packaging',
      desc: 'Envases que venden.',
      details: 'Creamos packaging innovador que destaca en el punto de venta. Combinamos funcionalidad, sustentabilidad y diseño atractivo para que tu producto se distinga de la competencia.'
    },
  ];

  // Dynamic carousel items from worksData (first 5 categories)
  const carouselCategories: WorkCategory[] = ['branding', 'diseno-grafico', 'video', 'fotografia', 'packaging'];
  const carouselItems = carouselCategories.map((cat, idx) => ({
    id: cat,
    title: worksData[cat].title,
    description: worksData[cat].description,
    previewImage: worksData[cat].images[0].src,
    color: [
      'from-quepia-purple to-quepia-cyan',
      'from-quepia-cyan to-emerald-500',
      'from-quepia-purple to-pink-500',
      'from-amber-500 to-quepia-purple',
      'from-quepia-cyan to-blue-600',
    ][idx],
  }));

  // Calcular total de slides según el dispositivo
  const itemsPerSlide = isMobile ? 1 : 3;
  const totalSlides = Math.ceil(carouselItems.length / itemsPerSlide);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  // Reset slide cuando cambia el modo móvil/desktop
  useEffect(() => {
    setCurrentSlide(0);
  }, [isMobile]);

  const handleCarouselClick = (categoryId: string) => {
    navigate(`/trabajos?category=${categoryId}`);
  };

  const toggleService = (index: number) => {
    setExpandedService(expandedService === index ? null : index);
  };

  return (
    <div className="relative">
      {/* Hero Section Principal */}
      <section className="relative z-10 min-h-screen w-full flex items-center justify-center px-4 py-20 md:py-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-4xl mx-auto text-center bg-black/60 md:bg-black/20 backdrop-blur-sm p-6 sm:p-8 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-white/10 shadow-2xl shadow-black/50"
        >
          <h1 className="text-white font-black text-3xl sm:text-4xl md:text-6xl lg:text-7xl tracking-tighter mb-4 md:mb-6 leading-tight drop-shadow-lg">
            CONSULTORÍA PARA MEJORAR.
          </h1>
          <p className="text-transparent bg-clip-text bg-gradient-to-r from-quepia-purple to-quepia-cyan text-xl sm:text-2xl md:text-4xl font-bold mb-6 md:mb-8">
            (RE)inventá tu marca con Quepia
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pointer-events-auto">
            <Link to="/contacto" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto shadow-lg shadow-quepia-purple/20">
                Contactanos <ArrowRight size={18} className="ml-2" />
              </Button>
            </Link>
            <Link to="/servicios" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto bg-black/40 border-white/20 hover:bg-quepia-cyan/20 hover:border-quepia-cyan hover:text-white"
              >
                Nuestros Servicios
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* 3. Sección Creamos desde cero - Servicios Desplegables */}
      <SectionWrapper className="relative z-10 py-16 md:py-24 bg-black/30 md:bg-black/60 backdrop-blur-[2px] md:backdrop-blur-sm border-t border-white/10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold mb-4 md:mb-6 text-white">Creamos desde cero</h2>
            <p className="text-gray-400 text-sm md:text-base">Tocá cada servicio para conocer más detalles</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {services.map((service, idx) => (
              <motion.div
                key={idx}
                layout
                className="bg-zinc-900/50 rounded-xl md:rounded-2xl border border-white/5 hover:border-quepia-cyan/50 active:border-quepia-cyan/50 transition-all duration-300 overflow-hidden"
              >
                <button
                  onClick={() => toggleService(idx)}
                  className="w-full p-4 md:p-6 text-left flex items-start justify-between gap-3 md:gap-4"
                >
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white shrink-0">
                      <service.icon size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-bold font-display text-white">{service.title}</h3>
                      <p className="text-gray-400 text-xs md:text-sm mt-1">{service.desc}</p>
                    </div>
                  </div>
                  <motion.div
                    animate={{ rotate: expandedService === idx ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-quepia-cyan shrink-0 mt-1"
                  >
                    <ChevronDown size={18} className="md:w-5 md:h-5" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {expandedService === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 md:px-6 pb-4 md:pb-6 pt-2 border-t border-white/5">
                        <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
                          {service.details}
                        </p>
                        <Link
                          to="/servicios"
                          className="inline-flex items-center gap-2 text-quepia-cyan text-xs md:text-sm font-medium mt-3 md:mt-4 hover:underline"
                        >
                          Ver más <ArrowRight size={14} />
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </SectionWrapper>

      {/* 4. Carrusel de Ejemplos - Sección de impacto */}
      <SectionWrapper className="relative z-10 min-h-screen py-12 md:py-16 bg-black/30 md:bg-black/90 backdrop-blur-[2px] md:backdrop-blur-sm border-t border-white/10 flex items-center">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-8 md:mb-12">
            <h2 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-display font-bold mb-4 md:mb-6 text-white">Nuestros Trabajos</h2>
            <p className="text-gray-400 text-base md:text-xl">Explorá algunos de nuestros proyectos destacados</p>
          </div>

          <div className="relative max-w-[1600px] mx-auto">
            {/* Botones de navegación */}
            <button
              onClick={prevSlide}
              className="absolute -left-2 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-16 md:h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-quepia-cyan/30 active:scale-95 md:hover:scale-110 transition-all duration-300 shadow-xl"
            >
              <ChevronLeft size={24} className="md:w-8 md:h-8" />
            </button>
            <button
              onClick={nextSlide}
              className="absolute -right-2 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-16 md:h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-quepia-cyan/30 active:scale-95 md:hover:scale-110 transition-all duration-300 shadow-xl"
            >
              <ChevronRight size={24} className="md:w-8 md:h-8" />
            </button>

            {/* Carrusel Responsive - with padding fix for last card */}
            <div className="overflow-hidden py-4 md:py-6 px-6 md:px-12">
              <motion.div
                animate={{ x: `-${currentSlide * 100}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="flex"
              >
                {/* Mobile: 1 item por slide */}
                {isMobile ? (
                  carouselItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex-shrink-0 w-full px-2"
                      style={{ paddingRight: index === carouselItems.length - 1 ? '24px' : '8px' }}
                    >
                      <motion.div
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleCarouselClick(item.id)}
                        className="cursor-pointer group relative"
                      >
                        <div className={`aspect-[3/4] rounded-2xl bg-gradient-to-br ${item.color} flex items-end justify-center relative overflow-hidden shadow-2xl`}>
                          {/* Preview image background */}
                          <img
                            src={item.previewImage}
                            alt={item.title}
                            className="absolute inset-0 w-full h-full object-cover opacity-30"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                          <div className="relative z-10 text-center p-6 pb-8">
                            <h3 className="text-white font-bold text-xl mb-2">{item.title}</h3>
                            <p className="text-white/80 text-sm mb-3 line-clamp-2">{item.description}</p>
                            <div className="inline-flex items-center gap-2 text-quepia-cyan font-medium">
                              <span>Ver trabajos</span>
                              <ArrowRight size={16} />
                            </div>
                          </div>
                          <div className="absolute inset-0 rounded-2xl border-2 border-white/10" />
                        </div>
                      </motion.div>
                    </div>
                  ))
                ) : (
                  /* Desktop: 3 items por slide with proper spacing */
                  Array.from({ length: totalSlides }).map((_, slideGroup) => (
                    <div key={slideGroup} className="flex-shrink-0 w-full grid grid-cols-3 gap-6 lg:gap-8 pr-4">
                      {carouselItems.slice(slideGroup * 3, slideGroup * 3 + 3).map((item) => (
                        <motion.div
                          key={item.id}
                          whileHover={{ scale: 1.03, y: -8 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          onClick={() => handleCarouselClick(item.id)}
                          className="cursor-pointer group relative hover:z-10"
                        >
                          <div className={`aspect-[4/5] rounded-3xl bg-gradient-to-br ${item.color} flex items-end justify-center relative overflow-hidden shadow-2xl`}>
                            {/* Preview image background */}
                            <img
                              src={item.previewImage}
                              alt={item.title}
                              className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent group-hover:from-black/60 transition-all duration-500" />
                            <div className="relative z-10 text-center p-8 pb-10">
                              <h3 className="text-white font-bold text-2xl lg:text-3xl mb-3">{item.title}</h3>
                              <p className="text-white/80 text-base mb-4 line-clamp-2">{item.description}</p>
                              <div className="inline-flex items-center gap-2 text-quepia-cyan font-medium group-hover:gap-4 transition-all duration-300">
                                <span>Ver trabajos</span>
                                <ArrowRight size={18} />
                              </div>
                            </div>
                            <div className="absolute inset-0 rounded-3xl border-2 border-transparent group-hover:border-white/30 transition-all duration-300" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ))
                )}
              </motion.div>
            </div>

            {/* Indicadores dinámicos */}
            <div className="flex justify-center gap-2 md:gap-3 mt-6 md:mt-10">
              {Array.from({ length: totalSlides }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-2 md:h-3 rounded-full transition-all duration-300 ${
                    currentSlide === idx ? 'bg-quepia-cyan w-8 md:w-12' : 'bg-white/30 hover:bg-white/50 w-2 md:w-3'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </SectionWrapper>
    </div>
  );
};

export default Home;
