import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Button from '../components/ui/Button';
import { worksData, categories, WorkCategory } from '../data/worksData';
import { useModal } from '../context/ModalContext';

// Lightbox component for image preview
function Lightbox({ image, onClose }: { image: { src: string; title: string } | null; onClose: () => void }) {
  const { openModal, closeModal } = useModal();

  useEffect(() => {
    if (image) {
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
  }, [image, openModal, closeModal]);

  if (!image) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Close button with safe area padding for notch/dynamic island */}
      <button
        onClick={onClose}
        className="absolute right-4 md:right-6 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10 shadow-lg"
        style={{ top: 'max(env(safe-area-inset-top, 16px), 16px)' }}
        aria-label="Cerrar"
      >
        <X size={24} strokeWidth={2.5} />
      </button>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="max-w-5xl w-full"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={image.src}
          alt={image.title}
          className="w-full h-auto max-h-[80vh] object-contain rounded-2xl"
        />
        <p className="text-white text-center mt-4 text-lg font-medium">{image.title}</p>
      </motion.div>
    </motion.div>
  );
}

const Works: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ src: string; title: string } | null>(null);
  const tagsContainerRef = useRef<HTMLDivElement>(null);

  // Get active category from URL or default to first
  const categoryParam = searchParams.get('category');
  const [activeCategory, setActiveCategory] = useState<WorkCategory>(
    categoryParam && worksData[categoryParam as WorkCategory]
      ? categoryParam as WorkCategory
      : 'branding'
  );

  // Update active category when URL changes
  useEffect(() => {
    if (categoryParam && worksData[categoryParam as WorkCategory]) {
      setActiveCategory(categoryParam as WorkCategory);
      // Scroll tag into view
      setTimeout(() => {
        const activeTag = document.getElementById(`tag-${categoryParam}`);
        activeTag?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }, 100);
    }
  }, [categoryParam]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCategoryChange = (categoryId: WorkCategory) => {
    setActiveCategory(categoryId);
    setSearchParams({ category: categoryId });
  };

  const currentWork = worksData[activeCategory];

  // Scroll tags left/right
  const scrollTags = (direction: 'left' | 'right') => {
    if (tagsContainerRef.current) {
      const scrollAmount = 200;
      tagsContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="relative min-h-screen pt-20 md:pt-24">
      {/* Glassmorphism content wrapper */}
      <div
        className="relative z-10 bg-black/50 backdrop-blur-sm min-h-screen"
        style={{ opacity: 1, visibility: 'visible' }}
      >
        {/* Hero Section */}
        <section className="py-8 md:py-12 text-center" style={{ opacity: 1, visibility: 'visible' }}>
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold mb-4">
                Nuestros{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-quepia-purple to-quepia-cyan">
                  Trabajos
                </span>
              </h1>
              <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg">
                Explorá nuestra galería de proyectos organizados por categoría.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Sticky Tags Navigation */}
        <div className="sticky top-16 md:top-[72px] z-40 bg-black/80 backdrop-blur-sm border-y border-white/10">
          <div className="container mx-auto px-4 md:px-6 relative">
            {/* Scroll buttons for desktop */}
            <button
              onClick={() => scrollTags('left')}
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 backdrop-blur items-center justify-center text-white hover:bg-quepia-purple/50 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => scrollTags('right')}
              className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 backdrop-blur items-center justify-center text-white hover:bg-quepia-purple/50 transition-colors"
            >
              <ChevronRight size={20} />
            </button>

            {/* Tags container with hidden scrollbar */}
            <div
              ref={tagsContainerRef}
              className="flex gap-2 md:gap-3 py-4 overflow-x-auto md:mx-12 scrollbar-hide"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              <style>{`
                .scrollbar-hide::-webkit-scrollbar {
                  display: none;
                }
              `}</style>
              {categories.map((category) => (
                <button
                  key={category.id}
                  id={`tag-${category.id}`}
                  onClick={() => handleCategoryChange(category.id as WorkCategory)}
                  className={`flex-shrink-0 px-4 md:px-6 py-2 md:py-2.5 rounded-full text-sm md:text-base font-medium transition-all duration-300 ${
                    activeCategory === category.id
                      ? 'bg-gradient-to-r from-quepia-purple to-quepia-cyan text-white shadow-lg shadow-quepia-purple/30'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <section className="py-8 md:py-12" style={{ opacity: 1, visibility: 'visible' }}>
          <div className="container mx-auto px-4 md:px-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Category Header */}
                <div className="mb-8 md:mb-12 text-center md:text-left">
                  <h2 className="text-2xl md:text-4xl font-display font-bold text-white mb-3">
                    {currentWork.title}
                  </h2>
                  <p className="text-gray-400 text-base md:text-lg max-w-2xl">
                    {currentWork.description}
                  </p>
                </div>

                {/* Image Gallery Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {currentWork.images.map((image, index) => (
                    <motion.div
                      key={image.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: mounted ? 1 : 0, scale: mounted ? 1 : 0.95 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="group cursor-pointer"
                      onClick={() => setSelectedImage(image)}
                      style={{ opacity: mounted ? undefined : 1, visibility: 'visible' }}
                    >
                      <div className="relative aspect-[4/3] rounded-xl md:rounded-2xl overflow-hidden border border-white/10 group-hover:border-quepia-cyan/50 transition-all duration-300">
                        <img
                          src={image.src}
                          alt={image.title}
                          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                          <p className="text-white font-medium text-sm md:text-base">{image.title}</p>
                        </div>
                        {/* Hover indicator */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <ArrowRight size={20} className="text-white" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* CTA to Services */}
                <div className="mt-12 text-center">
                  <p className="text-gray-400 mb-4">¿Te interesa este servicio?</p>
                  <Link to="/servicios">
                    <Button className="text-base">
                      Ver detalles del servicio <ArrowRight size={18} className="ml-2" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* Bottom CTA */}
        <section
          className="py-16 md:py-24 border-t border-white/10"
          style={{ opacity: 1, visibility: 'visible' }}
        >
          <div className="container mx-auto px-4 md:px-6 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
              transition={{ duration: 0.5 }}
              style={{ opacity: mounted ? undefined : 1, visibility: 'visible' }}
            >
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold mb-4 md:mb-6 text-white">
                ¿Querés un proyecto así para tu marca?
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto mb-6 md:mb-8 text-sm md:text-base">
                Contanos tu idea y creamos algo increíble juntos.
              </p>
              <Link to="/contacto">
                <Button className="text-base md:text-lg px-8 md:px-10 py-3 md:py-4">
                  Hablemos de tu proyecto <ArrowRight size={18} className="ml-2" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <Lightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Works;
