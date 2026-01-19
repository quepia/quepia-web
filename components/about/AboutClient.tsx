'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, Heart, Sparkles, Users, Instagram, Linkedin, Mail, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Image from 'next/image';
import { Equipo } from '@/types/database';

// Company values
const values = [
    {
        icon: Sparkles,
        title: 'Creatividad sin límites',
        description: 'Cada proyecto es una oportunidad para innovar y sorprender. No seguimos tendencias, las creamos.'
    },
    {
        icon: Users,
        title: 'Cercanía con el cliente',
        description: 'Trabajamos codo a codo con vos. Tu visión es nuestra guía, tu éxito es nuestro objetivo.'
    },
    {
        icon: Heart,
        title: 'Compromiso social',
        description: 'Creemos en devolver a la comunidad. Apoyamos proyectos locales y causas que importen.'
    }
];

interface AboutClientProps {
    team: Equipo[];
}

export default function AboutClient({ team }: AboutClientProps) {
    return (
        <div className="relative min-h-screen pt-20 md:pt-24 overflow-hidden">
            {/* Semi-transparent content wrapper */}
            <div className="relative z-10 bg-black/40 backdrop-blur-sm min-h-screen">
                {/* Hero Section */}
                <section className="py-12 md:py-20">
                    <div className="container mx-auto px-4 md:px-6">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="text-center max-w-4xl mx-auto"
                        >
                            <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-6 md:mb-8 leading-tight">
                                Más que una{' '}
                                <span className="gradient-text">
                                    agencia
                                </span>
                                , somos tu equipo creativo.
                            </h1>
                            <p className="text-gray-300 text-base md:text-xl leading-relaxed">
                                Nacimos para transformar ideas en experiencias visuales que conectan, inspiran y generan resultados.
                            </p>
                        </motion.div>
                    </div>
                </section>

                {/* Our Story */}
                <section className="py-12 md:py-20 border-y border-white/10 bg-black/30">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16 items-center">
                            {/* Image */}
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, delay: 0.1 }}
                                className="relative order-2 lg:order-1"
                            >
                                <div className="relative rounded-2xl overflow-hidden border border-white/10">
                                    <Image
                                        src="https://placehold.co/600x400/1a1a1a/444/png?text=Villa+Carlos+Paz"
                                        alt="Villa Carlos Paz, Córdoba"
                                        width={600}
                                        height={400}
                                        className="w-full h-auto"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                    <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 flex items-center gap-2 text-white">
                                        <MapPin size={18} className="text-quepia-cyan" />
                                        <span className="text-sm md:text-base font-medium">Villa Carlos Paz, Córdoba, Argentina</span>
                                    </div>
                                </div>

                                {/* Decorative elements */}
                                <div className="absolute -top-4 -right-4 w-24 h-24 md:w-32 md:h-32 bg-quepia-purple/30 rounded-full blur-3xl" />
                                <div className="absolute -bottom-4 -left-4 w-24 h-24 md:w-32 md:h-32 bg-quepia-cyan/30 rounded-full blur-3xl" />
                            </motion.div>

                            {/* Text */}
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.6, delay: 0.2 }}
                                className="order-1 lg:order-2"
                            >
                                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 md:mb-6 text-white">
                                    Nuestra Historia
                                </h2>
                                <div className="space-y-4 text-gray-300 text-sm md:text-base leading-relaxed">
                                    <p>
                                        <strong className="text-white">Quepia</strong> nació en las sierras de Córdoba, en la hermosa{' '}
                                        <strong className="text-quepia-cyan">Villa Carlos Paz</strong>. Lo que comenzó como un sueño
                                        compartido entre dos amigos apasionados por el diseño y la comunicación, hoy es una consultora
                                        creativa que trabaja con marcas de todo el país.
                                    </p>
                                    <p>
                                        Creemos que cada marca tiene una historia única que merece ser contada con autenticidad y
                                        creatividad. No somos solo ejecutores; somos <strong className="text-white">socios estratégicos</strong>{' '}
                                        en el crecimiento de tu negocio.
                                    </p>
                                    <p>
                                        Nuestro compromiso va más allá de lo comercial. Somos{' '}
                                        <strong className="text-quepia-purple">personas socialmente involucradas</strong>, apoyamos
                                        proyectos locales y creemos en el poder del diseño para generar cambio positivo en nuestra comunidad.
                                    </p>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-4 mt-8 md:mt-10">
                                    <div className="text-center">
                                        <h3 className="text-2xl md:text-4xl font-bold text-white">50+</h3>
                                        <p className="text-xs md:text-sm text-gray-400 uppercase tracking-wide">Proyectos</p>
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-2xl md:text-4xl font-bold text-white">4</h3>
                                        <p className="text-xs md:text-sm text-gray-400 uppercase tracking-wide">Años</p>
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-2xl md:text-4xl font-bold text-white">100%</h3>
                                        <p className="text-xs md:text-sm text-gray-400 uppercase tracking-wide">Pasión</p>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Team */}
                <section className="py-12 md:py-24">
                    <div className="container mx-auto px-4 md:px-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="text-center mb-10 md:mb-16"
                        >
                            <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-4 text-white">
                                Conocé al equipo
                            </h2>
                            <p className="text-gray-400 max-w-xl mx-auto text-sm md:text-base">
                                Las personas detrás de cada proyecto, idea y solución creativa.
                            </p>
                        </motion.div>

                        {/* Team Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">
                            {team.map((member, index) => (
                                <motion.div
                                    key={member.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    className="group"
                                >
                                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden hover:border-quepia-cyan/50 transition-colors duration-300">
                                        {/* Image */}
                                        <div className="relative aspect-[4/5] overflow-hidden">
                                            {member.imagen_url ? (
                                                <Image
                                                    src={member.imagen_url}
                                                    alt={member.nombre}
                                                    fill
                                                    className="object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-white/10 flex items-center justify-center text-gray-400">
                                                    Sin Imagen
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

                                            {/* Social links overlay */}
                                            <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                {member.instagram && (
                                                    <a
                                                        href={member.instagram}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-quepia-purple transition-colors"
                                                    >
                                                        <Instagram size={18} />
                                                    </a>
                                                )}
                                                {member.linkedin && (
                                                    <a
                                                        href={member.linkedin}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-quepia-cyan transition-colors"
                                                    >
                                                        <Linkedin size={18} />
                                                    </a>
                                                )}
                                                {member.email && (
                                                    <a
                                                        href={`mailto:${member.email}`}
                                                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-quepia-purple transition-colors"
                                                    >
                                                        <Mail size={18} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="p-4 md:p-6">
                                            <h3 className="text-lg md:text-xl font-bold text-white mb-1">
                                                {member.nombre}
                                            </h3>
                                            <p className="text-quepia-cyan text-xs md:text-sm font-medium mb-3">
                                                {member.rol}
                                            </p>
                                            <p className="text-gray-400 text-xs md:text-sm leading-relaxed">
                                                {member.bio}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Values */}
                <section className="py-12 md:py-20 border-t border-white/10 bg-black/30">
                    <div className="container mx-auto px-4 md:px-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="text-center mb-10 md:mb-16"
                        >
                            <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-4 text-white">
                                Nuestros Valores
                            </h2>
                            <p className="text-gray-400 max-w-xl mx-auto text-sm md:text-base">
                                Los principios que guían cada decisión y cada proyecto que emprendemos.
                            </p>
                        </motion.div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                            {values.map((value, index) => (
                                <motion.div
                                    key={value.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: index * 0.1 }}
                                    className="bg-white/5 backdrop-blur-sm p-6 md:p-8 rounded-xl md:rounded-2xl border border-white/5 hover:border-quepia-cyan/30 transition-colors duration-300"
                                >
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white mb-4 md:mb-6">
                                        <value.icon size={24} />
                                    </div>
                                    <h3 className="text-lg md:text-xl font-bold text-white mb-2 md:mb-3">
                                        {value.title}
                                    </h3>
                                    <p className="text-gray-400 text-sm md:text-base leading-relaxed">
                                        {value.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-16 md:py-24">
                    <div className="container mx-auto px-4 md:px-6 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                        >
                            <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white">
                                ¿Querés trabajar con nosotros?
                            </h2>
                            <p className="text-gray-400 max-w-xl mx-auto mb-6 md:mb-8 text-sm md:text-base">
                                Nos encantaría conocer tu proyecto y ver cómo podemos ayudarte a alcanzar tus objetivos.
                            </p>
                            <Link href="/contacto">
                                <Button className="text-base md:text-lg px-8 md:px-10 py-3 md:py-4">
                                    Contactanos <ArrowRight size={18} className="ml-2" />
                                </Button>
                            </Link>
                        </motion.div>
                    </div>
                </section>
            </div>
        </div>
    );
}
