'use client';

import { useEffect, useRef, useState } from 'react';

interface HeroVideoBackgroundProps {
  active?: boolean;
}

// Use the newer loop with a distinct URL so production does not keep serving the stale cached asset.
const HERO_LOOP_SRC = '/LOOP%20FONDO%20QUEPIA.prproj.mp4';

export default function HeroVideoBackground({ active = true }: HeroVideoBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInView, setIsInView] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    if (active && isInView) {
      videoRef.current.play().catch(() => {});
      return;
    }

    videoRef.current.pause();
  }, [active, isInView]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover object-center"
        src={HERO_LOOP_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 45% at 50% 50%, rgba(42,231,228,0.15) 0%, rgba(136,16,120,0.08) 40%, transparent 70%)',
          mixBlendMode: 'screen',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(42,231,228,0.1) 0%, rgba(74,74,154,0.12) 40%, rgba(136,16,120,0.1) 100%)',
          mixBlendMode: 'overlay',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 45%, rgba(10,10,10,0.5) 100%)',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(10,10,10,0.8) 0%, rgba(10,10,10,0.2) 10%, transparent 30%)',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,10,10,0.35) 0%, transparent 18%)',
        }}
      />
    </div>
  );
}
