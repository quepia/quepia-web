'use client';

import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { MapPin, Heart, Sparkles, Users, Instagram, Linkedin, Mail } from 'lucide-react';
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
        description: 'Creemos en devolver a la comunidad. Apoyamos proyectos locales y causas que importan.'
    }
];

// Animated words component
const AnimatedWords = ({ text, className = "" }: { text: string; className?: string }) => {
    const words = text.split(" ");
    return (
        <span className={className}>
            {words.map((word, index) => (
                <motion.span
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.5,
                        delay: 0.2 + index * 0.06,
                        ease: [0.16, 1, 0.3, 1],
                    }}
                    className="inline-block mr-[0.25em]"
                >
                    {word}{' '}
                </motion.span>
            ))}
        </span>
    );
};

// Statement section with large text
function StatementSection() {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    const words = [
        { text: "Creemos", highlight: false },
        { text: "que", highlight: false },
        { text: "cada", highlight: false },
        { text: "marca", highlight: true },
        { text: "tiene", highlight: false },
        { text: "una", highlight: false },
        { text: "historia", highlight: true },
        { text: "única", highlight: false },
        { text: "que", highlight: false },
        { text: "merece", highlight: false },
        { text: "ser", highlight: false },
        { text: "contada", highlight: true },
        { text: "con", highlight: false },
        { text: "excelencia.", highlight: false },
    ];

    return (
        <section ref={ref} className="relative py-32 md:py-48 overflow-hidden">
            {/* Animated background gradient */}
            <motion.div 
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 1 }}
            >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20">
                    <div 
                        className="absolute inset-0 rounded-full blur-[120px] animate-gradient"
                        style={{
                            background: 'radial-gradient(circle, rgba(42,231,228,0.15) 0%, rgba(136,16,120,0.1) 50%, transparent 70%)'
                        }}
                    />
                </div>
            </motion.div>

            <div className="relative z-10 max-w-[1000px] mx-auto px-6 md:px-12 lg:px-20">
                <div className="flex flex-col items-center text-center">
                    {/* Animated quote marks */}
                    <div className="relative mb-12">
                        <motion.span
                            className="text-[10rem] md:text-[14rem] leading-none text-white/[0.03] font-serif absolute -top-24 left-1/2 -translate-x-1/2 select-none"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={isInView ? { opacity: 1, scale: 1 } : {}}
                            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                        >
                            &ldquo;
                        </motion.span>
                        <motion.span
                            className="text-5xl md:text-7xl text-quepia-cyan/20 font-serif leading-none block"
                            initial={{ opacity: 0, y: 20 }}
                            animate={isInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.2 }}
                        >
                            &ldquo;
                        </motion.span>
                    </div>

                    {/* Main statement - word by word animation */}
                    <h2 className="font-display text-2xl md:text-4xl lg:text-5xl font-light leading-tight mb-16">
                        {words.map((word, index) => (
                            <motion.span
                                key={index}
                                className={`inline-block mr-[0.25em] ${
                                    word.highlight 
                                        ? 'text-transparent bg-clip-text bg-gradient-to-r from-quepia-cyan to-quepia-purple' 
                                        : 'text-white/90'
                                }`}
                                initial={{ opacity: 0, y: 40, rotateX: -40 }}
                                animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
                                transition={{
                                    duration: 0.7,
                                    delay: 0.3 + index * 0.05,
                                    ease: [0.16, 1, 0.3, 1]
                                }}
                            >
                                {word.text}
                            </motion.span>
                        ))}
                    </h2>

                    {/* Attribution */}
                    <motion.div
                        className="relative"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, delay: 1.2 }}
                    >
                        <div className="flex items-center gap-4">
                            <motion.div 
                                className="w-12 h-px bg-gradient-to-r from-transparent to-white/30"
                                initial={{ scaleX: 0 }}
                                animate={isInView ? { scaleX: 1 } : {}}
                                transition={{ duration: 0.8, delay: 1.4 }}
                                style={{ transformOrigin: 'left' }}
                            />
                            <span className="text-white/40 text-sm tracking-wider uppercase">
                                Quepia, Villa Carlos Paz
                            </span>
                            <motion.div 
                                className="w-12 h-px bg-gradient-to-l from-transparent to-white/30"
                                initial={{ scaleX: 0 }}
                                animate={isInView ? { scaleX: 1 } : {}}
                                transition={{ duration: 0.8, delay: 1.4 }}
                                style={{ transformOrigin: 'right' }}
                            />
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

interface AboutClientProps {
    team: Equipo[];
}

export default function AboutClient({ team }: AboutClientProps) {
    const heroRef = useRef<HTMLDivElement>(null);
    const isHeroInView = useInView(heroRef, { once: true });

    return (
        <div className="relative">
            {/* Hero Section */}
            <section ref={heroRef} className="relative min-h-[70vh] flex items-center justify-center pt-20 overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-quepia-purple/5 via-transparent to-transparent" />
                    <motion.div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-15"
                        animate={{ 
                            scale: [1, 1.1, 1],
                            rotate: [0, 5, 0]
                        }}
                        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <div 
                            className="absolute inset-0 rounded-full blur-3xl"
                            style={{
                                background: 'radial-gradient(circle, rgba(136,16,120,0.2) 0%, rgba(42,231,228,0.1) 50%, transparent 70%)'
                            }}
                        />
                    </motion.div>
                </div>

                <div className="relative z-10 max-w-[1200px] mx-auto px-6 md:px-12 lg:px-20 text-center">
                    {/* Label */}
                    <motion.span
                        className="text-label text-white/40 block mb-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6 }}
                    >
                        Sobre Nosotros
                    </motion.span>

                    {/* Main heading */}
                    <h1 className="font-display text-hero text-white mb-8">
                        <AnimatedWords text="Más que una agencia," />
                        <br />
                        <span className="text-white/80">
                            <AnimatedWords text="somos tu equipo creativo" />
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <motion.p
                        className="text-white/50 text-lg md:text-xl max-w-[700px] mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6, delay: 0.5 }}
                    >
                        Nacimos para transformar ideas en experiencias visuales que conectan, inspiran y generan resultados.
                    </motion.p>
                </div>

                {/* Scroll indicator */}
                <motion.div
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
                    initial={{ opacity: 0 }}
                    animate={isHeroInView ? { opacity: 1 } : {}}
                    transition={{ delay: 0.8, duration: 0.5 }}
                >
                    <motion.div
                        className="flex flex-col items-center gap-2 cursor-pointer group"
                        animate={{ y: [0, 5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <span className="text-white/25 text-[10px] uppercase tracking-[0.3em] group-hover:text-white/40 transition-colors">
                            Scroll
                        </span>
                        <div className="w-px h-6 bg-gradient-to-b from-white/25 to-transparent group-hover:from-white/40 transition-colors" />
                    </motion.div>
                </motion.div>
            </section>

            {/* Statement Section */}
            <StatementSection />

            {/* Our Story Section */}
            <section className="py-24 md:py-32 border-t border-white/5">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                        {/* Image */}
                        <motion.div
                            initial={{ opacity: 0, x: -40 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.7 }}
                            className="relative order-2 lg:order-1"
                        >
                            <div className="relative rounded-2xl overflow-hidden border border-white/5">
                                <div className="aspect-[4/3] bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 flex items-center justify-center">
                                    <span className="text-white/20 text-lg">Villa Carlos Paz</span>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                <div className="absolute bottom-6 left-6 flex items-center gap-2 text-white">
                                    <MapPin size={18} className="text-quepia-cyan" />
                                    <span className="text-sm font-medium">Villa Carlos Paz, Córdoba, Argentina</span>
                                </div>
                            </div>

                            {/* Decorative glow effects */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-quepia-purple/20 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-quepia-cyan/20 rounded-full blur-3xl pointer-events-none" />
                        </motion.div>

                        {/* Text */}
                        <motion.div
                            initial={{ opacity: 0, x: 40 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.7, delay: 0.1 }}
                            className="order-1 lg:order-2"
                        >
                            <span className="text-label text-white/40 block mb-4">Nuestra historia</span>
                            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white mb-8">
                                Desde las sierras
                                <span className="block">de Córdoba</span>
                            </h2>

                            <div className="space-y-5 text-white/60 leading-relaxed">
                                <p>
                                    <strong className="text-white">Quepia</strong> nació en las sierras de Córdoba, en la hermosa{' '}
                                    <strong className="text-quepia-cyan">Villa Carlos Paz</strong>. Lo que comenzó como un sueño
                                    compartido entre amigos apasionados por el diseño y la comunicación, hoy es una consultora
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
                                    proyectos locales y creemos en el poder del diseño para generar cambio positivo.
                                </p>
                            </div>

                            {/* Stats */}
                            <motion.div
                                className="grid grid-cols-3 gap-6 mt-12"
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, delay: 0.3 }}
                            >
                                {[
                                    { number: '50+', label: 'Proyectos' },
                                    { number: '4', label: 'Años' },
                                    { number: '100%', label: 'Pasión' }
                                ].map((stat, index) => (
                                    <div key={stat.label} className="text-center">
                                        <motion.span
                                            className="font-display text-3xl md:text-4xl font-light text-white block"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                                        >
                                            {stat.number}
                                        </motion.span>
                                        <span className="text-white/40 text-xs uppercase tracking-wider">{stat.label}</span>
                                    </div>
                                ))}
                            </motion.div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Team Section */}
            <section className="py-24 md:py-32 border-t border-white/5">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    {/* Section Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-16 md:mb-20"
                    >
                        <span className="text-label text-white/40 block mb-4">Equipo</span>
                        <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white mb-6">
                            Conocé al equipo
                        </h2>
                        <p className="text-white/50 max-w-[500px] mx-auto">
                            Las personas detrás de cada proyecto, idea y solución creativa.
                        </p>
                    </motion.div>

                    {/* Team Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                        {team.map((member, index) => (
                            <motion.div
                                key={member.id}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, delay: index * 0.15 }}
                                className="group"
                            >
                                <div className="liquid-glass overflow-hidden">
                                    {/* Image */}
                                    <div className="relative aspect-[4/5] overflow-hidden">
                                        {member.imagen_url ? (
                                            <Image
                                                src={member.imagen_url}
                                                alt={member.nombre}
                                                fill
                                                className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 480px"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 flex items-center justify-center text-white/40">
                                                <span className="text-lg">{member.nombre.charAt(0)}</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

                                        {/* Social links overlay */}
                                        <div className="absolute bottom-6 left-6 right-6 flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                                            {member.instagram && (
                                                <a
                                                    href={member.instagram}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-quepia-purple hover:scale-110 transition-all duration-300"
                                                >
                                                    <Instagram size={20} />
                                                </a>
                                            )}
                                            {member.linkedin && (
                                                <a
                                                    href={member.linkedin}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-quepia-cyan hover:scale-110 transition-all duration-300"
                                                >
                                                    <Linkedin size={20} />
                                                </a>
                                            )}
                                            {member.email && (
                                                <a
                                                    href={`mailto:${member.email}`}
                                                    className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-quepia-purple hover:scale-110 transition-all duration-300"
                                                >
                                                    <Mail size={20} />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="p-6 md:p-8">
                                        <h3 className="font-display text-xl md:text-2xl font-light text-white mb-1">
                                            {member.nombre}
                                        </h3>
                                        <p className="text-quepia-cyan text-sm font-medium mb-4">
                                            {member.rol}
                                        </p>
                                        <p className="text-white/50 text-sm leading-relaxed">
                                            {member.bio}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Values Section */}
            <section className="py-24 md:py-32 border-t border-white/5">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    {/* Section Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-16 md:mb-20"
                    >
                        <span className="text-label text-white/40 block mb-4">Filosofía</span>
                        <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-light text-white mb-6">
                            Nuestros valores
                        </h2>
                        <p className="text-white/50 max-w-[500px] mx-auto">
                            Los principios que guían cada decisión y cada proyecto que emprendemos.
                        </p>
                    </motion.div>

                    {/* Values Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {values.map((value, index) => (
                            <motion.div
                                key={value.title}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.6, delay: index * 0.1 }}
                                className="group"
                            >
                                <div className="p-8 md:p-10 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-500 h-full">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-quepia-purple/20 to-quepia-cyan/20 flex items-center justify-center text-white/70 group-hover:text-quepia-cyan transition-colors mb-6">
                                        <value.icon size={26} />
                                    </div>
                                    <h3 className="font-display text-xl md:text-2xl font-light text-white mb-4">
                                        {value.title}
                                    </h3>
                                    <p className="text-white/50 leading-relaxed">
                                        {value.description}
                                    </p>
                                </div>
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
                        ¿Querés trabajar con nosotros?
                    </motion.h2>

                    <motion.p
                        className="text-white/50 text-lg max-w-[500px] mx-auto mb-12"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        Nos encantaría conocer tu proyecto y ver cómo podemos ayudarte a alcanzar tus objetivos.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        <Link
                            href="/contacto"
                            className="group inline-flex items-center gap-3 text-xl md:text-2xl text-white hover:text-quepia-cyan transition-colors duration-300"
                        >
                            <span className="border-b border-white/30 group-hover:border-quepia-cyan pb-1 transition-colors duration-300">
                                Contactanos
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
                        </Link>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
