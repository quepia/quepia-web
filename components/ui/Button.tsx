import React from 'react';
import { motion } from 'framer-motion';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'white';
  children: React.ReactNode;
  className?: string;
}

const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  children, 
  className = '', 
  onAnimationStart,
  onAnimationEnd,
  onAnimationIteration,
  ...props 
}) => {
  const baseStyles = "px-8 py-3 rounded-full font-display font-bold text-sm uppercase tracking-wider transition-all duration-300 inline-flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-gradient-to-r from-quepia-purple to-quepia-cyan text-white shadow-lg hover:shadow-quepia-purple/50",
    outline: "border-2 border-white text-white hover:bg-quepia-cyan/20 hover:border-quepia-cyan",
    white: "bg-white text-quepia-dark hover:bg-gray-200"
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
};

export default Button;