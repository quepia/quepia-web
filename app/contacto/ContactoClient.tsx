'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Mail, MapPin, Instagram, Clock, Phone, Send, LucideIcon } from 'lucide-react';
import type { SiteConfig } from '@/lib/fetchConfig';
import { useConfig } from '@/components/layout/ClientLayout';
import BrandDepthBackground from '@/components/ui/BrandDepthBackground';

// Contact info card component
function ContactCard({
    item,
    index
}: {
    item: {
        icon: LucideIcon;
        label: string;
        value: string;
        href?: string;
    };
    index: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true });
    const [isHovered, setIsHovered] = useState(false);
    const Icon = item.icon;
    const isLink = item.href && item.href !== '#';

    const content = (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
            className={`group p-5 rounded-xl border border-white/5 bg-white/[0.02] transition-all duration-300 ${isLink ? 'hover:bg-white/[0.05] hover:border-white/10 cursor-pointer' : ''
                }`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center gap-5">
                <motion.div
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 flex items-center justify-center text-white/70 shrink-0"
                    animate={{
                        scale: isHovered && isLink ? 1.1 : 1,
                        background: isHovered && isLink
                            ? 'linear-gradient(135deg, rgba(136,16,120,0.3), rgba(42,231,228,0.3))'
                            : 'linear-gradient(135deg, rgba(136,16,120,0.2), rgba(42,231,228,0.2))'
                    }}
                    transition={{ duration: 0.3 }}
                >
                    <Icon size={22} />
                </motion.div>
                <div className="flex-1 min-w-0">
                    <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{item.label}</p>
                    <p className={`text-white font-medium truncate transition-colors duration-300 ${isLink && isHovered ? 'text-quepia-cyan' : ''
                        }`}>
                        {item.value}
                    </p>
                </div>
                {isLink && (
                    <motion.div
                        animate={{ x: isHovered ? 4 : 0, opacity: isHovered ? 1 : 0.5 }}
                        transition={{ duration: 0.3 }}
                    >
                        <ArrowUpRight size={16} className="text-white/40" />
                    </motion.div>
                )}
            </div>
        </motion.div>
    );

    if (isLink) {
        return (
            <a
                href={item.href}
                target={item.href?.startsWith('http') ? '_blank' : undefined}
                rel={item.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="block"
            >
                {content}
            </a>
        );
    }

    return content;
}

export default function ContactoClient() {
    const config = useConfig() as SiteConfig;
    const [formState, setFormState] = useState({
        nombre: '',
        email: '',
        servicio: '',
        mensaje: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const heroRef = useRef<HTMLDivElement>(null);
    const isHeroInView = useInView(heroRef, { once: true });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'contact_form',
                    to: 'quepiacomunicacion@gmail.com', // Explicitly set recipient
                    data: {
                        name: formState.nombre,
                        email: formState.email,
                        service: formState.servicio,
                        message: formState.mensaje
                    }
                }),
            });

            if (!response.ok) {
                throw new Error('Error al enviar el mensaje');
            }

            setIsSubmitted(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    const contactInfo = [
        {
            icon: Mail,
            label: 'Email',
            value: config?.email_contacto || 'quepiacomunicacion@gmail.com',
            href: `mailto:${config?.email_contacto || 'quepiacomunicacion@gmail.com'}`,
        },
        {
            icon: Phone,
            label: 'WhatsApp',
            value: config?.telefono || 'Enviar mensaje',
            href: config?.whatsapp ? `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}` : '#',
        },
        {
            icon: Instagram,
            label: 'Instagram',
            value: '@quepia.ok',
            href: config?.instagram || '#',
        },
        {
            icon: MapPin,
            label: 'Ubicación',
            value: config?.direccion || 'Villa Carlos Paz, Córdoba',
        },
        {
            icon: Clock,
            label: 'Horario',
            value: `${config?.horario_dias || 'Lunes a Viernes'}, ${config?.horario_horas || '9:00 - 18:00'}`,
        }
    ];

    return (
        <div className="relative">
            <BrandDepthBackground />

            {/* Hero Section */}
            <section ref={heroRef} className="relative min-h-[60vh] flex items-center justify-center pt-20 overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-quepia-purple/5 via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-quepia-cyan/5 via-transparent to-transparent" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] opacity-15">
                        <div
                            className="absolute inset-0 rounded-full blur-[90px]"
                            style={{
                                background: 'radial-gradient(circle, rgba(42,231,228,0.2) 0%, rgba(136,16,120,0.15) 50%, transparent 70%)'
                            }}
                        />
                    </div>
                </div>

                <div className="relative z-10 max-w-[1200px] mx-auto px-6 md:px-12 lg:px-20 text-center">
                    {/* Label */}
                    <motion.span
                        className="text-label text-white/40 block mb-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6 }}
                    >
                        Contacto
                    </motion.span>

                    {/* Main heading */}
                    <motion.h1
                        className="font-display text-hero text-white mb-8"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        style={{ willChange: 'transform, opacity' }}
                    >
                        Hablemos de
                        <br />
                        <span className="text-white/80">
                            tu proyecto
                        </span>
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        className="text-white/50 text-lg md:text-xl max-w-[600px] mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        ¿Tenés una idea en mente? Contanos y hagámosla realidad juntos.
                    </motion.p>
                </div>
            </section>

            {/* Contact Grid */}
            <section className="py-16 md:py-24">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
                        {/* Left: Contact Info */}
                        <div>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6 }}
                            >
                                <span className="text-label text-white/40 block mb-4">Información</span>
                                <h2 className="font-display text-2xl md:text-3xl font-light text-white mb-4">
                                    Estamos para ayudarte
                                </h2>
                                <p className="text-white/50 mb-10 max-w-md">
                                    Elegí el canal que prefieras. Respondemos en menos de 24 horas.
                                </p>
                            </motion.div>

                            <div className="space-y-3">
                                {contactInfo.map((item, index) => (
                                    <ContactCard key={item.label} item={item} index={index} />
                                ))}
                            </div>

                            {/* Quick Email CTA */}
                            <motion.div
                                className="mt-10"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, delay: 0.6 }}
                            >
                                <p className="text-white/40 text-sm mb-3">O escribinos directamente a</p>
                                <a
                                    href={`mailto:${config?.email_contacto || 'quepiacomunicacion@gmail.com'}`}
                                    className="group cta-link text-white hover:text-quepia-cyan"
                                >
                                    {config?.email_contacto || 'quepiacomunicacion@gmail.com'}
                                    <ArrowRight size={14} className="cta-arrow" />
                                </a>
                            </motion.div>
                        </div>

                        {/* Right: Contact Form */}
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                        >
                            <div className="liquid-glass p-8 md:p-10">
                                <span className="text-label text-white/40 block mb-4">Formulario</span>
                                <h3 className="font-display text-2xl md:text-3xl font-light text-white mb-8">
                                    Envianos un mensaje
                                </h3>

                                {isSubmitted ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="py-16 text-center"
                                    >
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: "spring", delay: 0.1 }}
                                            className="w-16 h-16 rounded-full bg-gradient-to-br from-quepia-cyan/30 to-quepia-purple/30 flex items-center justify-center mx-auto mb-6"
                                        >
                                            <Send size={24} className="text-quepia-cyan" />
                                        </motion.div>
                                        <h4 className="font-display text-xl text-white mb-2">¡Mensaje enviado!</h4>
                                        <p className="text-white/50">Nos pondremos en contacto pronto.</p>
                                    </motion.div>
                                ) : (
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-white/60 text-sm mb-2">Nombre</label>
                                                <input
                                                    type="text"
                                                    value={formState.nombre}
                                                    onChange={(e) => setFormState(s => ({ ...s, nombre: e.target.value }))}
                                                    className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-quepia-cyan/50 transition-colors"
                                                    placeholder="Tu nombre"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-white/60 text-sm mb-2">Email</label>
                                                <input
                                                    type="email"
                                                    value={formState.email}
                                                    onChange={(e) => setFormState(s => ({ ...s, email: e.target.value }))}
                                                    className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-quepia-cyan/50 transition-colors"
                                                    placeholder="tu@email.com"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-white/60 text-sm mb-2">Servicio de interés</label>
                                            <select
                                                value={formState.servicio}
                                                onChange={(e) => setFormState(s => ({ ...s, servicio: e.target.value }))}
                                                className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-lg text-white focus:outline-none focus:border-quepia-cyan/50 transition-colors appearance-none cursor-pointer"
                                                style={{ backgroundImage: 'none' }}
                                            >
                                                <option value="" className="bg-[#0a0a0a]">Seleccioná una opción</option>
                                                <option value="branding" className="bg-[#0a0a0a]">Branding</option>
                                                <option value="diseno-grafico" className="bg-[#0a0a0a]">Diseño Gráfico</option>
                                                <option value="video" className="bg-[#0a0a0a]">Producción de Video</option>
                                                <option value="fotografia" className="bg-[#0a0a0a]">Fotografía</option>
                                                <option value="marketing" className="bg-[#0a0a0a]">Marketing</option>
                                                <option value="redes-sociales" className="bg-[#0a0a0a]">Redes Sociales</option>
                                                <option value="packaging" className="bg-[#0a0a0a]">Packaging</option>
                                                <option value="otro" className="bg-[#0a0a0a]">Otro</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-white/60 text-sm mb-2">Mensaje</label>
                                            <textarea
                                                value={formState.mensaje}
                                                onChange={(e) => setFormState(s => ({ ...s, mensaje: e.target.value }))}
                                                className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-quepia-cyan/50 transition-colors min-h-[140px] resize-none"
                                                placeholder="Contanos sobre tu proyecto..."
                                                required
                                            />
                                        </div>

                                        <motion.button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full py-4 bg-white text-black font-medium rounded-lg flex items-center justify-center gap-2 hover:bg-quepia-cyan transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                                    Enviando...
                                                </>
                                            ) : (
                                                <>
                                                    Enviar mensaje
                                                    <Send size={18} />
                                                </>
                                            )}
                                        </motion.button>
                                    </form>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-24 md:py-32 border-t border-white/5">
                <div className="max-w-[1000px] mx-auto px-6 md:px-12 lg:px-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-16"
                    >
                        <span className="text-label text-white/40 block mb-4">FAQ</span>
                        <h2 className="font-display text-3xl md:text-4xl font-light text-white">
                            Preguntas frecuentes
                        </h2>
                    </motion.div>

                    <div className="space-y-4">
                        {[
                            {
                                q: '¿Cuál es el tiempo de entrega promedio?',
                                a: 'Depende del alcance del proyecto. Un branding completo puede tomar 4-6 semanas, mientras que piezas individuales de diseño suelen estar listas en 3-5 días hábiles.'
                            },
                            {
                                q: '¿Trabajan con clientes de otras ciudades?',
                                a: '¡Por supuesto! Trabajamos con marcas de todo el país. Las reuniones se realizan vía videollamada y el proceso es 100% remoto.'
                            },
                            {
                                q: '¿Cómo se manejan los pagos?',
                                a: 'Generalmente trabajamos con un 50% de seña al iniciar el proyecto y el 50% restante contra entrega. Aceptamos transferencia bancaria y Mercado Pago.'
                            },
                        ].map((faq, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                            >
                                <h3 className="font-display text-lg text-white mb-2">{faq.q}</h3>
                                <p className="text-white/50 text-sm leading-relaxed">{faq.a}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative py-32 md:py-48 overflow-hidden">
                {/* Gradient background */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20">
                        <div
                            className="absolute inset-0 rounded-full blur-3xl animate-gradient"
                            style={{
                                background: 'radial-gradient(circle, rgba(42,231,228,0.3) 0%, rgba(136,16,120,0.3) 50%, transparent 70%)'
                            }}
                        />
                    </div>
                </div>

                <div className="relative z-10 max-w-[900px] mx-auto px-6 md:px-12 lg:px-20 text-center">
                    <motion.h2
                        className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white mb-6"
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                    >
                        ¿Listo para empezar?
                    </motion.h2>

                    <motion.p
                        className="text-white/50 text-lg max-w-[500px] mx-auto mb-6"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        {config?.email_contacto || 'quepiacomunicacion@gmail.com'}
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        <a
                            href={`mailto:${config?.email_contacto || 'quepiacomunicacion@gmail.com'}`}
                            className="group inline-flex items-center gap-3 text-xl md:text-2xl text-white hover:text-quepia-cyan transition-colors duration-300"
                        >
                            <span className="border-b border-white/30 group-hover:border-quepia-cyan pb-1 transition-colors duration-300">
                                Escribinos
                            </span>
                            <motion.svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                className="transition-transform duration-300 group-hover:translate-x-1"
                            >
                                <path
                                    d="M1 8H15M15 8L8 1M15 8L8 15"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </motion.svg>
                        </a>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
