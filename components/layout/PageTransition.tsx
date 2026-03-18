'use client';

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  // Skip animation for admin/auth routes
  const isAdminRoute = pathname?.startsWith('/admin');
  const isAuthRoute = pathname?.startsWith('/auth');
  const isSistemaRoute = pathname?.startsWith('/sistema');
  const isServicesRoute = pathname?.startsWith('/servicios');
  const isAboutRoute = pathname?.startsWith('/sobre-nosotros');
  const isContactRoute = pathname?.startsWith('/contacto');
  const skipAnimation = isAdminRoute || isAuthRoute || isSistemaRoute || isServicesRoute || isAboutRoute || isContactRoute;

  if (skipAnimation || prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{
          duration: 0.5,
          ease: [0.16, 1, 0.3, 1], // Smooth ease-out-expo
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
