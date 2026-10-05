'use client';
import { useEffect, useRef, useState } from 'react';
export default function AmbientVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || window.matchMedia('(max-width: 767px), (prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (visible) ref.current?.play().catch(() => {}); else ref.current?.pause(); }, [visible]);
  return <video ref={ref} className={className} src={visible ? src : undefined} poster="/images/video-poster.webp" muted loop playsInline preload="none" aria-hidden="true" />;
}
