'use client';

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
    variant?: 'primary' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    children: React.ReactNode;
    className?: string;
}

const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    children,
    className = '',
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black';

    const variants = {
        primary: 'bg-gradient-to-r from-quepia-purple to-quepia-cyan text-white hover:shadow-lg hover:shadow-quepia-purple/30 hover:scale-[1.02]',
        outline: 'bg-transparent border border-white/20 text-white hover:bg-white/10 hover:border-quepia-cyan',
        ghost: 'bg-transparent text-white hover:bg-white/10',
    };

    const sizes = {
        sm: 'px-4 py-2 text-sm',
        md: 'px-6 py-3 text-base',
        lg: 'px-8 py-4 text-lg',
        icon: 'h-10 w-10 p-0',
    };

    return (
        <motion.button
            whileHover={{ scale: variant === 'primary' ? 1.02 : 1 }}
            whileTap={{ scale: 0.98 }}
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            {children}
        </motion.button>
    );
};

export default Button;
