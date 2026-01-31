'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const navLinks = [
    { name: 'Servicios', path: '/servicios' },
    { name: 'Trabajos', path: '/trabajos' },
    { name: 'Nosotros', path: '/sobre-nosotros' },
    { name: 'Contacto', path: '/contacto' },
];

const Header: React.FC = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const pathname = usePathname();
    const supabase = useMemo(() => createClient(), []);

    const isHomePage = pathname === '/';
    const isClienteRoute = pathname?.startsWith('/cliente');

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setIsLoggedIn(!!session);
        };
        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setIsLoggedIn(!!session);
        });

        return () => subscription.unsubscribe();
    }, [supabase]);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [pathname]);

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

    const shouldBeTransparent = isHomePage && !isScrolled;

    // On /cliente routes, render a minimal non-fixed header (logo only, no nav/menu)
    if (isClienteRoute) {
        return (
            <header
                className="relative z-50 py-4 border-b border-white/5"
                style={{
                    background: 'rgba(10, 10, 10, 0.85)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                }}
            >
                <div className="container mx-auto px-6 flex items-center">
                    <Link href="/">
                        <Image
                            src="/Logo_Quepia.svg"
                            alt="Quepia"
                            width={110}
                            height={32}
                            className="h-7 md:h-8 w-auto object-contain"
                            priority
                        />
                    </Link>
                </div>
            </header>
        );
    }

    return (
        <>
            <header
                className={`fixed top-0 left-0 right-0 z-[9999] transition-all duration-500 ${shouldBeTransparent
                    ? 'py-4 md:py-6'
                    : 'py-4 border-b border-white/5'
                    }`}
                style={{
                    background: shouldBeTransparent
                        ? 'transparent'
                        : 'rgba(10, 10, 10, 0.85)',
                    backdropFilter: shouldBeTransparent ? 'none' : 'blur(20px)',
                    WebkitBackdropFilter: shouldBeTransparent ? 'none' : 'blur(20px)',
                }}
            >
                <div className="container mx-auto px-6 flex items-center justify-between">
                    {/* Logo */}
                    <Link href="/" className="relative z-[9999]">
                        <Image
                            src="/Logo_Quepia.svg"
                            alt="Quepia"
                            width={110}
                            height={32}
                            className="h-7 md:h-8 w-auto object-contain"
                            priority
                        />
                    </Link>

                    {/* Desktop Navigation — Minimal BASIC style */}
                    <nav className="hidden md:flex items-center gap-10 lg:gap-12">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                href={link.path}
                                className={`text-nav transition-colors duration-300 ${pathname === link.path
                                    ? 'text-white'
                                    : 'text-white/60 hover:text-white'
                                    }`}
                            >
                                {link.name}
                            </Link>
                        ))}

                        {/* Admin/Sistema link - only visible when logged in */}
                        {isLoggedIn && (
                            <div className="flex items-center gap-4">
                                <Link
                                    href="/sistema"
                                    className={`text-nav transition-colors duration-300 flex items-center gap-1.5 ${pathname?.startsWith('/sistema')
                                        ? 'text-quepia-cyan'
                                        : 'text-white/60 hover:text-quepia-cyan'
                                        }`}
                                >
                                    <Settings size={14} />
                                    Sistema
                                </Link>

                            </div>
                        )}
                    </nav>

                    {/* Mobile Toggle — Circular indicator style */}
                    <button
                        className="md:hidden relative z-[9999] flex items-center gap-2 text-white/80 hover:text-white transition-colors"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                    >
                        <span className="text-nav">
                            {isMobileMenuOpen ? 'Cerrar' : 'Menú'}
                        </span>
                        <span className={`w-2 h-2 rounded-full transition-colors ${isMobileMenuOpen ? 'bg-quepia-cyan' : 'bg-white'
                            }`} />
                    </button>
                </div>
            </header>

            {/* Mobile Menu — Fullscreen Overlay (OUTSIDE header to avoid stacking context trap) */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <div
                        className="md:hidden fixed inset-0 z-[9998] bg-[#0a0a0a]"
                    >
                        <nav className="h-full flex flex-col items-start justify-center px-8 gap-6">
                            {navLinks.map((link, index) => (
                                <motion.div
                                    key={link.name}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ delay: index * 0.08, duration: 0.3 }}
                                >
                                    <Link
                                        href={link.path}
                                        className={`font-display text-4xl font-light tracking-tight transition-colors ${pathname === link.path
                                            ? 'text-white'
                                            : 'text-white/40 hover:text-white'
                                            }`}
                                    >
                                        {link.name}
                                    </Link>
                                </motion.div>
                            ))}

                            {isLoggedIn && (
                                <div className="flex flex-col gap-4">
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ delay: navLinks.length * 0.08, duration: 0.3 }}
                                    >
                                        <Link
                                            href="/sistema"
                                            className="font-display text-4xl font-light tracking-tight text-quepia-cyan/70 hover:text-quepia-cyan transition-colors flex items-center gap-3"
                                        >
                                            <Settings size={28} strokeWidth={1.5} />
                                            Sistema
                                        </Link>
                                    </motion.div>

                                </div>
                            )}

                            {/* Contact info at bottom */}
                            <motion.div
                                className="absolute bottom-12 left-8 right-8"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ delay: 0.3, duration: 0.3 }}
                            >
                                <p className="text-white/40 text-sm mb-2">Contacto</p>
                                <a
                                    href="mailto:hola@quepia.com"
                                    className="text-white/60 hover:text-white transition-colors"
                                >
                                    hola@quepia.com
                                </a>
                            </motion.div>
                        </nav>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default Header;
