import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface SectionWrapperProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  delay?: number;
}

const SectionWrapper: React.FC<SectionWrapperProps> = ({
  children,
  className = "",
  id = "",
  delay = 0
}) => {
  const [mounted, setMounted] = useState(false);

  // Ensure content is visible immediately on mount
  useEffect(() => {
    // Very short delay to trigger animation, but content is always visible via fallback
    const timer = setTimeout(() => {
      setMounted(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: Math.min(delay, 0.3) }}
      className={`w-full ${className}`}
      // Fallback: ensure visibility even if animation fails
      style={{
        opacity: mounted ? undefined : 1,
        visibility: 'visible',
        transform: mounted ? undefined : 'translateY(0)'
      }}
    >
      {children}
    </motion.section>
  );
};

export default SectionWrapper;
