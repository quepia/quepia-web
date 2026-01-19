'use client';

import React from 'react';

interface SectionWrapperProps {
    children: React.ReactNode;
    className?: string;
    id?: string;
}

const SectionWrapper: React.FC<SectionWrapperProps> = ({ children, className = '', id }) => {
    return (
        <section id={id} className={`relative ${className}`}>
            {children}
        </section>
    );
};

export default SectionWrapper;
