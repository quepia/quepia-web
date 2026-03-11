'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useConfig } from './ClientLayout';
import { getInstagramUrl } from '@/lib/instagram';

const Footer: React.FC = () => {
    const config = useConfig();
    const currentYear = new Date().getFullYear();

    const socialLinks = [
        { name: 'Instagram', url: config.instagram ? getInstagramUrl(config.instagram) : undefined },
        { name: 'LinkedIn', url: config.linkedin },
        { name: 'Behance', url: config.behance },
        { name: 'Google Maps', url: config.google_maps || config.google_business },
    ].filter(link => link.url);

    return (
        <footer className="w-full relative z-50 bg-[#0a0a0a] border-t border-white/5">
            <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                {/* Main footer content */}
                <div className="py-16 md:py-20 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
                    {/* Left column: Brand info */}
                    <div>
                        <Link href="/" className="inline-block mb-6">
                            <Image
                                src="/Logo_Quepia.svg"
                                alt="Quepia"
                                width={100}
                                height={28}
                                className="h-6 w-auto object-contain"
                            />
                        </Link>

                        <p className="text-[rgb(var(--text-white-soft-rgb)/0.4)] text-sm leading-relaxed mb-6 max-w-xs">
                            Consultora Creativa
                        </p>

                        <p className="text-[rgb(var(--text-white-soft-rgb)/0.4)] text-sm">
                            {config.direccion || 'Villa Carlos Paz, Argentina'}
                        </p>
                    </div>

                    {/* Right column: Links */}
                    <div className="flex flex-col md:items-end">
                        {/* Social links as text */}
                        <div className="space-y-3 mb-8">
                            {socialLinks.map((link) => (
                                <a
                                    key={link.name}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-[rgb(var(--text-white-soft-rgb)/0.6)] hover:text-[color:var(--text-primary)] transition-colors duration-300 text-sm"
                                >
                                    {link.name}
                                </a>
                            ))}
                        </div>

                        {/* Email */}
                        <a
                            href={`mailto:${config.email_contacto || 'hola@quepia.com'}`}
                            className="text-[rgb(var(--text-white-soft-rgb)/0.6)] hover:text-[color:var(--text-primary)] transition-colors duration-300 text-sm"
                        >
                            {config.email_contacto || 'hola@quepia.com'}
                        </a>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="py-6 border-t border-white/5 flex flex-col gap-4">
                    <p className="text-[rgb(var(--text-white-soft-rgb)/0.25)] text-xs text-center">
                        Diseñado en Villa Carlos Paz, Córdoba para el mundo.
                    </p>

                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-[rgb(var(--text-white-soft-rgb)/0.3)] text-xs">
                        &copy; {currentYear} {config.nombre_empresa || 'Quepia'}
                    </p>

                    <div className="flex items-center gap-6">
                        <Link
                            href="/privacidad"
                            className="text-[rgb(var(--text-white-soft-rgb)/0.3)] hover:text-[rgb(var(--text-white-soft-rgb)/0.6)] transition-colors duration-300 text-xs"
                        >
                            Privacidad
                        </Link>
                        <Link
                            href="/terminos"
                            className="text-[rgb(var(--text-white-soft-rgb)/0.3)] hover:text-[rgb(var(--text-white-soft-rgb)/0.6)] transition-colors duration-300 text-xs"
                        >
                            Legal
                        </Link>
                    </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
