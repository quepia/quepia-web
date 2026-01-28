'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface AnimatedSectionProps {
    children: React.ReactNode;
    className?: string;
    delay?: number;
}

interface AnimatedTitleProps {
    title: string;
    subtitle?: string;
    className?: string;
    align?: 'left' | 'center';
}

// Animated section wrapper with fade-in effect
export function AnimatedSection({ children, className = '', delay = 0 }: AnimatedSectionProps) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-80px" });

    return (
        <motion.div
            ref={ref}
            className={className}
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{
                duration: 0.7,
                delay,
                ease: [0.25, 0.4, 0.25, 1],
            }}
        >
            {children}
        </motion.div>
    );
}

// Animated section title - BASIC/DEPT® style with massive typography
export function AnimatedTitle({ title, subtitle, className = '', align = 'left' }: AnimatedTitleProps) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-50px" });

    return (
        <div
            ref={ref}
            className={`mb-10 md:mb-14 lg:mb-16 ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}
        >
            {/* Massive title */}
            <div className="overflow-hidden">
                <motion.h2
                    className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl
                               font-black text-white leading-[0.95] tracking-tight uppercase"
                    initial={{ opacity: 0, y: 80 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{
                        duration: 0.8,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                >
                    {title}
                </motion.h2>
            </div>

            {/* Subtitle with elegant tracking */}
            {subtitle && (
                <motion.p
                    className="text-white/40 text-xs sm:text-sm md:text-base font-light uppercase tracking-[0.2em] mt-4 md:mt-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                    {subtitle}
                </motion.p>
            )}
        </div>
    );
}
