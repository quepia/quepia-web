import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import Button from '../ui/Button';


const Header: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Check if we're on the home page
  const isHomePage = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Bloquear scroll del body cuando el menú móvil está abierto
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const navLinks = [
    { name: 'Servicios', path: '/servicios' },
    { name: 'Trabajos', path: '/trabajos' },
    { name: 'Sobre Nosotros', path: '/sobre-nosotros' },
    { name: 'Contacto', path: '/contacto' },
  ];

  // Header is transparent ONLY on Home page at top (scrollY=0)
  // All other pages always have solid/blurred background
  const shouldBeTransparent = isHomePage && !isScrolled;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        shouldBeTransparent ? 'bg-transparent py-6' : 'bg-quepia-dark/90 backdrop-blur-sm py-4 shadow-lg'
      }`}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="relative z-[9999]">
          <img
            src="/Logo_Quepia.svg"
            alt="Quepia Logo"
            className="h-8 md:h-9 w-auto object-contain"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className={`text-sm font-medium transition-colors hover:text-quepia-cyan ${
                location.pathname === link.path ? 'text-quepia-cyan' : 'text-gray-300'
              }`}
            >
              {link.name}
            </Link>
          ))}
          <Link to="/contacto">
            <Button className="ml-4 text-xs px-6 py-2">Hablemos</Button>
          </Link>
        </nav>

        {/* Mobile Toggle */}
        <button
          className="md:hidden relative z-[9999] text-white p-2"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu Overlay - Fuera del container para posicionamiento correcto */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="md:hidden"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100dvh',
              zIndex: 9998,
              backgroundColor: '#050505',
            }}
          >
            <nav className="h-full flex flex-col items-center justify-center gap-8 text-center">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.path}
                  className="text-2xl font-display font-bold text-white hover:text-quepia-cyan transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              <Link to="/contacto" className="mt-4">
                <Button className="w-full text-lg px-10">
                  Hablemos <ArrowRight size={18} />
                </Button>
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;