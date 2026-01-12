import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Linkedin, Twitter, Mail, MapPin } from 'lucide-react';
import Button from '../ui/Button';

const Footer: React.FC = () => {
  return (
    <footer className="w-full relative z-50 overflow-x-hidden">
      {/* Top CTA Section */}
      <div className="w-full bg-gradient-to-r from-quepia-purple to-quepia-cyan py-12 md:py-20 px-4 md:px-6">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
          <div className="text-center md:text-left">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold text-white mb-2">
              ¿Listo para crear algo increíble?
            </h2>
            <p className="text-white/90 text-base md:text-lg font-light">
              Llevemos tu marca al siguiente nivel visual.
            </p>
          </div>
          <Link to="/contacto" className="w-full sm:w-auto">
            <Button variant="white" className="w-full sm:w-auto text-base md:text-lg px-8 md:px-10 py-3 md:py-4">
              Hablemos
            </Button>
          </Link>
        </div>
      </div>

      {/* Bottom Content */}
      <div className="bg-quepia-dark pt-10 md:pt-16 pb-8 border-t border-white/5">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 mb-10 md:mb-16">
            {/* Column 1: Brand - full width on mobile */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4 md:mb-6">
                <img
                  src="/Logo_Quepia.svg"
                  alt="Quepia Logo"
                  className="h-8 md:h-9 w-auto object-contain"
                />
              </div>
              <p className="text-gray-400 leading-relaxed text-xs md:text-sm">
                Consultora especializada en contar historias visuales que conectan, inspiran y venden.
              </p>
            </div>

            {/* Column 2: Navigation */}
            <div>
              <h4 className="font-display font-bold text-white mb-4 md:mb-6 text-xs md:text-sm uppercase tracking-wider">Explora</h4>
              <ul className="space-y-2 md:space-y-3">
                {[
                  { name: 'Servicios', path: '/servicios' },
                  { name: 'Trabajos', path: '/trabajos' },
                  { name: 'Sobre Nosotros', path: '/sobre-nosotros' },
                  { name: 'Contacto', path: '/contacto' },
                ].map((item) => (
                  <li key={item.name}>
                    <Link
                      to={item.path}
                      className="text-gray-400 hover:text-quepia-cyan transition-colors text-xs md:text-sm"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Social */}
            <div>
              <h4 className="font-display font-bold text-white mb-4 md:mb-6 text-xs md:text-sm uppercase tracking-wider">Social</h4>
              <div className="flex gap-3 md:gap-4">
                {[
                  { Icon: Instagram, href: '#' },
                  { Icon: Linkedin, href: '#' },
                  { Icon: Twitter, href: '#' }
                ].map(({ Icon, href }, idx) => (
                  <a
                    key={idx}
                    href={href}
                    className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-quepia-cyan hover:text-quepia-dark transition-all duration-300"
                  >
                    <Icon size={16} className="md:w-[18px] md:h-[18px]" />
                  </a>
                ))}
              </div>
            </div>

            {/* Column 4: Contact */}
            <div>
              <h4 className="font-display font-bold text-white mb-4 md:mb-6 text-xs md:text-sm uppercase tracking-wider">Contacto</h4>
              <ul className="space-y-3 md:space-y-4">
                <li className="flex items-start gap-2 md:gap-3 text-gray-400 text-xs md:text-sm">
                  <Mail size={16} className="text-quepia-cyan shrink-0 mt-0.5 md:w-[18px] md:h-[18px]" />
                  <span className="break-all">hola@quepia.com</span>
                </li>
                <li className="flex items-start gap-2 md:gap-3 text-gray-400 text-xs md:text-sm">
                  <MapPin size={16} className="text-quepia-cyan shrink-0 mt-0.5 md:w-[18px] md:h-[18px]" />
                  <span>Villa Carlos Paz, Córdoba, Argentina.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-white/5 pt-6 md:pt-8 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-3 text-[10px] md:text-xs text-gray-600">
            <p>&copy; {new Date().getFullYear()} Quepia Agency. Todos los derechos reservados.</p>
            <div className="flex gap-4 md:gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacidad</a>
              <a href="#" className="hover:text-white transition-colors">Términos</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;