'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight, Settings } from 'lucide-react';
import Button from '../ui/Button';
import { createClient } from '@/lib/supabase/client';

const navLinks = [
    { name: 'Servicios', path: '/servicios' },
    { name: 'Trabajos', path: '/trabajos' },
    { name: 'Sobre Nosotros', path: '/sobre-nosotros' },
    { name: 'Contacto', path: '/contacto' },
];

const Header: React.FC = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const pathname = usePathname();
    const supabase = createClient();

    // Check if we're on the home page
    const isHomePage = pathname === '/';

    // Check auth state
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
    }, [supabase.auth]);

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
    }, [pathname]);

    // Block body scroll when mobile menu is open
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

    // Header is transparent ONLY on Home page at top (scrollY=0)
    const shouldBeTransparent = isHomePage && !isScrolled;

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${shouldBeTransparent ? 'bg-transparent py-6' : 'bg-quepia-dark/90 backdrop-blur-sm py-4 shadow-lg'
                }`}
        >
            <div className="container mx-auto px-6 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="relative z-[9999]">
                    <Image
                        src="/Logo_Quepia.svg"
                        alt="Quepia Logo"
                        width={120}
                        height={36}
                        className="h-8 md:h-9 w-auto object-contain"
                        priority
                    />
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.path}
                            className={`text-sm font-medium transition-colors hover:text-quepia-cyan ${pathname === link.path ? 'text-quepia-cyan' : 'text-gray-300'
                                }`}
                        >
                            {link.name}
                        </Link>
                    ))}

                    {/* Admin link - only visible when logged in */}
                    {isLoggedIn && (
                        <Link
                            href="/admin"
                            className={`text-sm font-medium transition-colors hover:text-quepia-cyan flex items-center gap-1.5 ${pathname?.startsWith('/admin') ? 'text-quepia-cyan' : 'text-gray-300'
                                }`}
                        >
                            <Settings size={16} />
                            Admin
                        </Link>
                    )}

                    <Link href="/contacto">
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

            {/* Mobile Menu Overlay */}
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
                                    href={link.path}
                                    className="text-2xl font-bold text-white hover:text-quepia-cyan transition-colors"
                                >
                                    {link.name}
                                </Link>
                            ))}

                            {/* Admin link in mobile menu - only visible when logged in */}
                            {isLoggedIn && (
                                <Link
                                    href="/admin"
                                    className="text-2xl font-bold text-quepia-cyan hover:text-white transition-colors flex items-center gap-2"
                                >
                                    <Settings size={24} />
                                    Panel Admin
                                </Link>
                            )}

                            <Link href="/contacto" className="mt-4">
                                <Button className="w-full text-lg px-10">
                                    Hablemos <ArrowRight size={18} className="ml-2" />
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
