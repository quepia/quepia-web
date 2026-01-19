'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Instagram, Linkedin, Twitter, Mail, MapPin, Facebook, Youtube } from 'lucide-react';
import Button from '../ui/Button';
import { useConfig } from './ClientLayout';

const Footer: React.FC = () => {
    const config = useConfig();
    const currentYear = new Date().getFullYear();

    return (
        <footer className="w-full relative z-50 overflow-x-hidden">
            {/* Top CTA Section */}
            <div className="w-full bg-gradient-to-r from-quepia-purple to-quepia-cyan py-12 md:py-20 px-4 md:px-6">
                <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
                    <div className="text-center md:text-left">
                        <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-2">
                            {config.cta_footer || '¿Listo para crear algo increíble?'}
                        </h2>
                        <p className="text-white/90 text-base md:text-lg font-light">
                            {config.cta_footer_subtitulo || 'Llevemos tu marca al siguiente nivel visual.'}
                        </p>
                    </div>
                    <Link href="/contacto" className="w-full sm:w-auto">
                        <Button variant="outline" className="w-full sm:w-auto text-base md:text-lg px-8 md:px-10 py-3 md:py-4 !bg-white !text-quepia-dark !border-white hover:!bg-white/90">
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
                                <Image
                                    src="/Logo_Quepia.svg"
                                    alt="Quepia Logo"
                                    width={120}
                                    height={36}
                                    className="h-8 md:h-9 w-auto object-contain"
                                />
                            </div>
                            <p className="text-gray-400 leading-relaxed text-xs md:text-sm">
                                {config.descripcion_corta || 'Consultora especializada en contar historias visuales que conectan, inspiran y venden.'}
                            </p>
                        </div>

                        {/* Column 2: Navigation */}
                        <div>
                            <h4 className="font-bold text-white mb-4 md:mb-6 text-xs md:text-sm uppercase tracking-wider">Explora</h4>
                            <ul className="space-y-2 md:space-y-3">
                                {[
                                    { name: 'Servicios', path: '/servicios' },
                                    { name: 'Trabajos', path: '/trabajos' },
                                    { name: 'Sobre Nosotros', path: '/sobre-nosotros' },
                                    { name: 'Contacto', path: '/contacto' },
                                ].map((item) => (
                                    <li key={item.name}>
                                        <Link
                                            href={item.path}
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
                            <h4 className="font-bold text-white mb-4 md:mb-6 text-xs md:text-sm uppercase tracking-wider">Social</h4>
                            <div className="flex flex-wrap gap-3 md:gap-4">
                                {config.instagram && (
                                    <SocialLink href={config.instagram} icon={Instagram} />
                                )}
                                {config.linkedin && (
                                    <SocialLink href={config.linkedin} icon={Linkedin} />
                                )}
                                {config.facebook && (
                                    <SocialLink href={config.facebook} icon={Facebook} />
                                )}
                                {config.twitter && (
                                    <SocialLink href={config.twitter} icon={Twitter} />
                                )}
                                {config.youtube && (
                                    <SocialLink href={config.youtube} icon={Youtube} />
                                )}
                            </div>
                        </div>

                        {/* Column 4: Contact */}
                        <div>
                            <h4 className="font-bold text-white mb-4 md:mb-6 text-xs md:text-sm uppercase tracking-wider">Contacto</h4>
                            <ul className="space-y-3 md:space-y-4">
                                <li className="flex items-start gap-2 md:gap-3 text-gray-400 text-xs md:text-sm">
                                    <Mail size={16} className="text-quepia-cyan shrink-0 mt-0.5" />
                                    <span className="break-all">{config.email_contacto || 'quepiacomunicacion@gmail.com'}</span>
                                </li>
                                <li className="flex items-start gap-2 md:gap-3 text-gray-400 text-xs md:text-sm">
                                    <MapPin size={16} className="text-quepia-cyan shrink-0 mt-0.5" />
                                    <span>{config.direccion || 'Villa Carlos Paz, Córdoba, Argentina.'}</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Copyright */}
                    <div className="border-t border-white/5 pt-6 md:pt-8 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-3 text-[10px] md:text-xs text-gray-600">
                        <p>&copy; {currentYear} {config.nombre_empresa || 'Quepia Agency'}. Todos los derechos reservados.</p>
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

const SocialLink = ({ href, icon: Icon }: { href: string; icon: any }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-quepia-cyan hover:text-quepia-dark transition-all duration-300"
    >
        <Icon size={16} />
    </a>
);

export default Footer;
