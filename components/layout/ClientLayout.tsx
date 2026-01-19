'use client';

import React, { createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import GlassBackground from '@/components/ui/GlassBackground';
import { ModalProvider } from '@/context/ModalContext';

// Config Context
export const ConfigContext = createContext<Record<string, string>>({});

export const useConfig = () => useContext(ConfigContext);

export default function ClientLayout({
    children,
    config = {},
}: {
    children: React.ReactNode;
    config?: Record<string, string>;
}) {
    const pathname = usePathname();

    // Don't show Header/Footer/Background on admin and auth routes
    const isAdminRoute = pathname?.startsWith('/admin');
    const isAuthRoute = pathname?.startsWith('/auth');
    const hideLayout = isAdminRoute || isAuthRoute;

    const contextValue = config || {};

    if (hideLayout) {
        // Admin/Auth pages have their own layout (but we still provide config if needed)
        return (
            <ConfigContext.Provider value={contextValue}>
                <ModalProvider>
                    {children}
                </ModalProvider>
            </ConfigContext.Provider>
        );
    }

    // Public pages with Header, Footer, and animated background
    return (
        <ConfigContext.Provider value={contextValue}>
            <ModalProvider>
                {/* Global animated background */}
                <GlassBackground />

                <div className="relative z-10 flex flex-col min-h-screen">
                    <Header />
                    <main className="flex-grow">
                        {children}
                    </main>
                    <Footer />
                </div>
            </ModalProvider>
        </ConfigContext.Provider>
    );
}
