import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, MapPin, Send, CheckCircle, Instagram, Linkedin } from 'lucide-react';
import Button from '../components/ui/Button';

const Contact: React.FC = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Estado del formulario (solo UI, sin lógica de envío)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    service: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulación de envío (la lógica real se implementará después)
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      // Reset después de mostrar el mensaje de éxito
      setTimeout(() => {
        setIsSubmitted(false);
        setFormData({ name: '', email: '', company: '', service: '', message: '' });
      }, 3000);
    }, 1500);
  };

  const services = [
    'Diseño Gráfico',
    'Diseño de Productos y Procesos',
    'Gestión de Redes Sociales',
    'Branding',
    'Cartelería',
    'Marketing',
    'Producción de Video',
    'Fotografía',
    'Diseño de Packaging',
    'Otro'
  ];

  return (
    <div className="relative min-h-screen pt-20 md:pt-24">
      {/* Glassmorphism content wrapper */}
      <div
        className="relative z-10 bg-black/50 backdrop-blur-xl min-h-screen"
        style={{ opacity: 1, visibility: 'visible' }}
      >
      <section className="py-12 md:py-20" style={{ opacity: 1, visibility: 'visible' }}>
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16">

            {/* Información de contacto */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-4 md:mb-6 leading-tight">
                Hablemos de tu{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-quepia-purple to-quepia-cyan">
                  próximo proyecto
                </span>
              </h1>
              <p className="text-gray-400 text-base md:text-lg mb-8 md:mb-12">
                Estamos listos para escuchar tus ideas y convertirlas en realidad.
                Completá el formulario o contactanos directamente.
              </p>

              <div className="space-y-6 md:space-y-8">
                {/* Email */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white shrink-0">
                    <Mail size={22} className="md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-white mb-1">Email</h3>
                    <a
                      href="mailto:hola@quepia.com"
                      className="text-gray-400 hover:text-quepia-cyan transition-colors text-sm md:text-base"
                    >
                      hola@quepia.com
                    </a>
                  </div>
                </div>

                {/* Ubicación */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-quepia-cyan to-quepia-purple flex items-center justify-center text-white shrink-0">
                    <MapPin size={22} className="md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-white mb-1">Ubicación</h3>
                    <p className="text-gray-400 text-sm md:text-base">
                      Villa Carlos Paz<br />
                      Córdoba, Argentina
                    </p>
                  </div>
                </div>
              </div>

              {/* Redes sociales */}
              <div className="mt-10 md:mt-12">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
                  Seguinos en redes
                </h3>
                <div className="flex gap-3">
                  <a
                    href="#"
                    className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-quepia-purple hover:scale-110 transition-all duration-300"
                  >
                    <Instagram size={20} />
                  </a>
                  <a
                    href="#"
                    className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-quepia-cyan hover:scale-110 transition-all duration-300"
                  >
                    <Linkedin size={20} />
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Formulario */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="bg-black/30 md:bg-black/40 backdrop-blur-sm p-6 md:p-8 lg:p-10 rounded-2xl border border-white/10">
                {isSubmitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12"
                  >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center">
                      <CheckCircle size={32} className="text-white" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                      ¡Mensaje enviado!
                    </h3>
                    <p className="text-gray-400 text-sm md:text-base">
                      Nos pondremos en contacto pronto.
                    </p>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
                    {/* Nombre */}
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-xs md:text-sm font-bold uppercase tracking-wider text-gray-400">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-white text-sm md:text-base placeholder-gray-500 focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan transition-all"
                        placeholder="Tu nombre completo"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-xs md:text-sm font-bold uppercase tracking-wider text-gray-400">
                        Email *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-white text-sm md:text-base placeholder-gray-500 focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan transition-all"
                        placeholder="tu@email.com"
                      />
                    </div>

                    {/* Empresa (opcional) */}
                    <div className="space-y-2">
                      <label htmlFor="company" className="text-xs md:text-sm font-bold uppercase tracking-wider text-gray-400">
                        Empresa <span className="text-gray-600">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        id="company"
                        name="company"
                        value={formData.company}
                        onChange={handleChange}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-white text-sm md:text-base placeholder-gray-500 focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan transition-all"
                        placeholder="Nombre de tu empresa"
                      />
                    </div>

                    {/* Servicio de interés */}
                    <div className="space-y-2">
                      <label htmlFor="service" className="text-xs md:text-sm font-bold uppercase tracking-wider text-gray-400">
                        Servicio de interés
                      </label>
                      <select
                        id="service"
                        name="service"
                        value={formData.service}
                        onChange={handleChange}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-white text-sm md:text-base focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan transition-all appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-quepia-dark">Seleccionar servicio...</option>
                        {services.map((service) => (
                          <option key={service} value={service} className="bg-quepia-dark">
                            {service}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mensaje */}
                    <div className="space-y-2">
                      <label htmlFor="message" className="text-xs md:text-sm font-bold uppercase tracking-wider text-gray-400">
                        Mensaje *
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        required
                        rows={4}
                        value={formData.message}
                        onChange={handleChange}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-white text-sm md:text-base placeholder-gray-500 focus:outline-none focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan transition-all resize-none"
                        placeholder="Contanos sobre tu proyecto..."
                      />
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full justify-center text-sm md:text-base py-3 md:py-4 mt-2"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="animate-spin mr-2">⏳</span>
                          Enviando...
                        </>
                      ) : (
                        <>
                          Enviar mensaje <Send size={18} className="ml-2" />
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-gray-500 text-center mt-4">
                      Al enviar este formulario, aceptás que nos contactemos con vos.
                    </p>
                  </form>
                )}
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Mapa o imagen decorativa */}
      <section className="py-12 md:py-20 border-t border-white/10" style={{ opacity: 1, visibility: 'visible' }}>
        <div className="container mx-auto px-4 md:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
            transition={{ duration: 0.5 }}
            style={{ opacity: mounted ? undefined : 1, visibility: 'visible' }}
          >
            <div className="inline-flex items-center gap-2 text-quepia-cyan mb-4">
              <MapPin size={20} />
              <span className="text-sm md:text-base font-medium">Villa Carlos Paz, Córdoba, Argentina</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-white mb-4">
              Desde las sierras de Córdoba para todo el país
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-sm md:text-base">
              Trabajamos de forma remota con clientes de todo Argentina y el mundo.
              La distancia no es un límite para la creatividad.
            </p>
          </motion.div>
        </div>
      </section>
      </div>{/* End glassmorphism wrapper */}
    </div>
  );
};

export default Contact;
