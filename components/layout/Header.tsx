'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Settings } from 'lucide-react';

const navLinks = [
    { name: 'Servicios', path: '/servicios' },
    { name: 'Trabajos', path: '/trabajos' },
    { name: 'Nosotros', path: '/sobre-nosotros' },
    { name: 'Contacto', path: '/contacto' },
];

const Header: React.FC = () => {
    const pathname = usePathname();
    const isHomePage = pathname === '/';
    const isClienteRoute = pathname?.startsWith('/cliente');
    const shouldCheckSession = !isClienteRoute && !pathname?.startsWith('/admin') && !pathname?.startsWith('/auth') && !pathname?.startsWith('/sistema');
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        if (!shouldCheckSession) {
            setIsLoggedIn(false);
            return;
        }

        let cancelled = false;
        let unsubscribe: (() => void) | undefined;
        let idleId: number | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const startSessionCheck = async () => {
            const { createClient } = await import('@/lib/supabase/client');
            if (cancelled) return;

            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!cancelled) {
                setIsLoggedIn(Boolean(session));
            }

            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
                if (!cancelled) {
                    setIsLoggedIn(Boolean(nextSession));
                }
            });

            unsubscribe = () => subscription.unsubscribe();
        };

        const supportsIdleCallback = typeof window.requestIdleCallback === 'function';

        if (supportsIdleCallback) {
            idleId = window.requestIdleCallback(() => {
                void startSessionCheck();
            }, { timeout: 1500 });
        } else {
            timeoutId = globalThis.setTimeout(() => {
                void startSessionCheck();
            }, 350);
        }

        return () => {
            cancelled = true;
            unsubscribe?.();
            if (idleId !== undefined && 'cancelIdleCallback' in window) {
                window.cancelIdleCallback(idleId);
            }
            if (timeoutId !== undefined) {
                globalThis.clearTimeout(timeoutId);
            }
        };
    }, [shouldCheckSession]);

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
                className="relative z-50 py-4"
                style={{
                    background: 'rgba(10, 10, 10, 0.85)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
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
                            priority={false}
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
                    : 'py-4'
                    }`}
                style={{
                    background: shouldBeTransparent
                        ? 'transparent'
                        : 'rgba(10, 10, 10, 0.85)',
                    backdropFilter: shouldBeTransparent ? 'none' : 'blur(20px)',
                    WebkitBackdropFilter: shouldBeTransparent ? 'none' : 'blur(20px)',
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
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
                            priority={isHomePage}
                        />
                    </Link>

                    {/* Desktop Navigation — Minimal BASIC style */}
                    <nav className="hidden md:flex items-center gap-10 lg:gap-12">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                href={link.path}
                                className={`text-nav transition-colors duration-300 ${pathname === link.path
                                    ? 'text-[color:var(--text-primary)]'
                                    : 'text-[rgb(var(--text-white-soft-rgb)/0.6)] hover:text-[color:var(--text-primary)]'
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
                                        : 'text-[rgb(var(--text-white-soft-rgb)/0.6)] hover:text-quepia-cyan'
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
                        className="md:hidden relative z-[9999] flex items-center gap-2 text-[rgb(var(--text-white-soft-rgb)/0.8)] hover:text-[color:var(--text-primary)] transition-colors"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                        aria-expanded={isMobileMenuOpen}
                    >
                        <span className="text-nav">
                            {isMobileMenuOpen ? 'Cerrar' : 'Menú'}
                        </span>
                        <span className={`w-2 h-2 rounded-full transition-colors ${isMobileMenuOpen ? 'bg-quepia-cyan' : 'bg-[color:var(--text-primary)]'
                            }`} />
                    </button>
                </div>
            </header>

            {/* Mobile Menu — Fullscreen Overlay (OUTSIDE header to avoid stacking context trap) */}
            <div
                className={`fixed inset-0 z-[9998] bg-[#0a0a0a] transition-[opacity,visibility] duration-300 md:hidden ${isMobileMenuOpen ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'
                    }`}
                aria-hidden={!isMobileMenuOpen}
            >
                <nav className="relative h-full flex flex-col items-start justify-center px-8 gap-6">
                    {navLinks.map((link, index) => (
                        <div
                            key={link.name}
                            className={`transition-all duration-300 ${isMobileMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                                }`}
                            style={{ transitionDelay: isMobileMenuOpen ? `${index * 60}ms` : '0ms' }}
                        >
                            <Link
                                href={link.path}
                                className={`font-display text-4xl font-light tracking-tight transition-colors ${pathname === link.path
                                    ? 'text-[color:var(--text-primary)]'
                                    : 'text-[rgb(var(--text-white-soft-rgb)/0.4)] hover:text-[color:var(--text-primary)]'
                                    }`}
                            >
                                {link.name}
                            </Link>
                        </div>
                    ))}

                    {isLoggedIn ? (
                        <div
                            className={`flex flex-col gap-4 transition-all duration-300 ${isMobileMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                                }`}
                            style={{ transitionDelay: isMobileMenuOpen ? `${navLinks.length * 60}ms` : '0ms' }}
                        >
                            <Link
                                href="/sistema"
                                className="font-display text-4xl font-light tracking-tight text-quepia-cyan/70 hover:text-quepia-cyan transition-colors flex items-center gap-3"
                            >
                                <Settings size={28} strokeWidth={1.5} />
                                Sistema
                            </Link>
                        </div>
                    ) : null}

                    <div
                        className={`absolute bottom-12 left-8 right-8 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'
                            }`}
                        style={{ transitionDelay: isMobileMenuOpen ? '180ms' : '0ms' }}
                    >
                        <p className="text-[rgb(var(--text-white-soft-rgb)/0.4)] text-sm mb-2">Contacto</p>
                        <a
                            href="mailto:hola@quepia.com"
                            className="text-[rgb(var(--text-white-soft-rgb)/0.6)] hover:text-[color:var(--text-primary)] transition-colors"
                        >
                            hola@quepia.com
                        </a>
                    </div>
                </nav>
            </div>
        </>
    );
};

export default Header;
