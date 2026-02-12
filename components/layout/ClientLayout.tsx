'use client';

import React, { createContext, useContext } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PageTransition from '@/components/layout/PageTransition';
import { ModalProvider } from '@/context/ModalContext';
import { ToastProvider } from '@/components/ui/toast-provider';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import type { SiteConfig } from '@/lib/fetchConfig';

const GlassBackground = dynamic(() => import('@/components/ui/GlassBackground'), {
    ssr: false,
    loading: () => <div className="fixed inset-0 z-0 bg-[#050505]" />,
});

// Config Context
export const ConfigContext = createContext<SiteConfig>({});

export const useConfig = () => useContext(ConfigContext);

export default function ClientLayout({
    children,
    config = {},
}: {
    children: React.ReactNode;
    config?: SiteConfig;
}) {
    const pathname = usePathname();

    // Don't show Header/Footer/Background on admin, auth, and sistema routes
    const isAdminRoute = pathname?.startsWith('/admin');
    const isAuthRoute = pathname?.startsWith('/auth');
    const isSistemaRoute = pathname?.startsWith('/sistema');
    const isClienteRoute = pathname?.startsWith('/cliente');
    const hideLayout = isAdminRoute || isAuthRoute || isSistemaRoute;

    const contextValue = config || {};

    if (hideLayout) {
        // Admin/Auth/Sistema pages have their own layout
        return (
            <ConfigContext.Provider value={contextValue}>
                <ToastProvider>
                    <ConfirmProvider>
                        <ModalProvider>
                            {children}
                        </ModalProvider>
                    </ConfirmProvider>
                </ToastProvider>
            </ConfigContext.Provider>
        );
    }

    // Client portal: Header only (no Footer, no GlassBackground)
    if (isClienteRoute) {
        return (
            <ConfigContext.Provider value={contextValue}>
                <ToastProvider>
                    <ConfirmProvider>
                        <ModalProvider>
                            <div className="relative z-10 flex flex-col min-h-screen">
                                <Header />
                                <main className="flex-grow">
                                    {children}
                                </main>
                            </div>
                        </ModalProvider>
                    </ConfirmProvider>
                </ToastProvider>
            </ConfigContext.Provider>
        );
    }

    // Public pages with Header, Footer, and animated background
    return (
        <ConfigContext.Provider value={contextValue}>
            <ToastProvider>
                <ConfirmProvider>
                    <ModalProvider>
                        {/* Global animated background */}
                        <GlassBackground />

                        <div className="relative z-10 flex flex-col min-h-screen">
                            <Header />
                            <main className="flex-grow">
                                <PageTransition>
                                    {children}
                                </PageTransition>
                            </main>
                            <Footer />
                        </div>
                    </ModalProvider>
                </ConfirmProvider>
            </ToastProvider>
        </ConfigContext.Provider>
    );
}
