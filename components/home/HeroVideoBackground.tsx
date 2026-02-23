'use client';

import { useEffect, useRef, useState } from 'react';

interface HeroVideoBackgroundProps {
  active?: boolean;
}

export default function HeroVideoBackground({ active = true }: HeroVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldUseVideo, setShouldUseVideo] = useState(true);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = Boolean(connection?.saveData);
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cpuCores = navigator.hardwareConcurrency ?? 8;
    const lowCpu = cpuCores <= 4 || deviceMemory <= 4;

    if (prefersReducedMotion || saveData || lowCpu) {
      setShouldUseVideo(false);
    }
  }, []);

  useEffect(() => {
    if (!videoRef.current || !shouldUseVideo) return;

    if (active) {
      videoRef.current.play().catch(() => {});
      return;
    }

    videoRef.current.pause();
  }, [active, shouldUseVideo]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {shouldUseVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: 'blur(0.3px) brightness(0.9) contrast(1.15) saturate(1.4)',
          }}
          src="/hero-bg.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #2AE7E4 0%, #881078 45%, #0a0a0a 75%)',
          }}
        />
      )}

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
