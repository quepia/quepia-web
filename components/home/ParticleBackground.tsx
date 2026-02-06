'use client';

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { motion, useReducedMotion } from 'framer-motion';
import * as THREE from 'three';

// ── Hooks ──────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

function useIsLowPower() {
  const [isLowPower, setIsLowPower] = useState(false);
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setIsLowPower(battery.charging === false && battery.level < 0.2);
      });
    }
  }, []);
  return isLowPower;
}

function useDocumentVisible() {
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    handler();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return isVisible;
}

function usePerformanceHints() {
  const [hints, setHints] = useState({ saveData: false, lowCpu: false });
  useEffect(() => {
    const connection = (navigator as any).connection;
    const saveData = Boolean(connection?.saveData);
    const lowCpu = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
      ((navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4);
    setHints({ saveData, lowCpu: Boolean(lowCpu) });
  }, []);
  return hints;
}

// Shared mouse position (normalized -1..1)
const mouseState = { x: 0, y: 0, targetX: 0, targetY: 0 };

function useGlobalMouse() {
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseState.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseState.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
}

// Circular particle texture (generated once, reused by all particle systems)
function createCircleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const center = size / 2;
  const radius = size / 2;

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

let _circleTexture: THREE.Texture | null = null;
function getCircleTexture(): THREE.Texture {
  if (!_circleTexture) _circleTexture = createCircleTexture();
  return _circleTexture;
}

// ── Interactive Particles (Three.js) ───────────────────────────────

function Particles({ count = 400, isMobile, isLowPower, active }: {
  count?: number; isMobile: boolean; isLowPower: boolean; active: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const entranceProgress = useRef(0);
  const isActive = useRef(true);
  const rotationRef = useRef(0);

  const particleCount = isMobile || isLowPower ? Math.floor(count / 3) : count;

  // Store base positions for mouse interaction
  const basePositions = useRef<Float32Array | null>(null);

  const { positions, colors, speeds, sizes } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);

    const colorCyan = new THREE.Color('#2AE7E4');
    const colorCyanSoft = new THREE.Color('#5CF0ED');
    const colorPurple = new THREE.Color('#881078');
    const colorPurpleSoft = new THREE.Color('#B44AA8');
    const colorWhite = new THREE.Color('#d0f0ff');

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 1.5 + Math.random() * 5.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi) * 0.4;

      // More varied liquid-like color palette
      const colorMix = Math.random();
      const color = colorMix < 0.25 ? colorCyan
        : colorMix < 0.45 ? colorCyanSoft
        : colorMix < 0.65 ? colorPurple
        : colorMix < 0.82 ? colorPurpleSoft
        : colorWhite;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      speeds[i] = Math.random() * 0.4 + 0.1; // slower, more fluid
      sizes[i] = (Math.random() * 0.8 + 0.2);
    }

    basePositions.current = new Float32Array(positions);
    return { positions, colors, speeds, sizes };
  }, [particleCount]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  useFrame((state) => {
    if (!pointsRef.current || !isActive.current || !active) return;

    const time = state.clock.elapsedTime;

    // Entrance fade-in
    if (entranceProgress.current < 1) {
      entranceProgress.current = Math.min(entranceProgress.current + 0.012, 1);
      const easeOut = 1 - Math.pow(1 - entranceProgress.current, 2);
      if (pointsRef.current.material) {
        (pointsRef.current.material as THREE.PointsMaterial).opacity = 0.95 * easeOut;
      }
    }

    // Smooth mouse lerp
    mouseState.x += (mouseState.targetX - mouseState.x) * 0.05;
    mouseState.y += (mouseState.targetY - mouseState.y) * 0.05;

    // Gentle base rotation
    rotationRef.current += 0.0004;
    pointsRef.current.rotation.y = rotationRef.current;
    pointsRef.current.rotation.z = Math.sin(time * 0.08) * 0.03;

    // Mouse-influenced position offset
    const posAttr = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const base = basePositions.current!;

    // Convert mouse to 3D-ish coordinates for interaction
    const mx = mouseState.x * 4;
    const my = mouseState.y * 3;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const speed = speeds[i];

      // Base orbital drift
      const bx = base[i3];
      const by = base[i3 + 1];
      const bz = base[i3 + 2];

      // Fluid wave-like oscillation (multiple sine waves for organic feel)
      const wave1 = Math.sin(time * speed * 0.25 + i * 0.5) * 0.2;
      const wave2 = Math.cos(time * speed * 0.18 + i * 1.3) * 0.15;
      const wave3 = Math.sin(time * 0.15 + bx * 0.5 + by * 0.3) * 0.12;
      const ox = wave1 + wave3;
      const oy = wave2 + Math.sin(time * 0.12 + i * 0.8) * 0.1;

      // Mouse repulsion — wider, softer radius
      const dx = bx + ox - mx;
      const dy = by + oy - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const influence = Math.max(0, 1 - dist / 4.0);
      const pushStrength = influence * influence * 1.0;
      const pushX = dist > 0.01 ? (dx / dist) * pushStrength : 0;
      const pushY = dist > 0.01 ? (dy / dist) * pushStrength : 0;

      posAttr[i3] = bx + ox + pushX;
      posAttr[i3 + 1] = by + oy + pushY;
      posAttr[i3 + 2] = bz + Math.sin(time * speed * 0.15 + i * 0.6) * 0.08;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  useEffect(() => {
    return () => { isActive.current = false; };
  }, []);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        map={getCircleTexture()}
        size={isMobile ? 0.05 : 0.08}
        vertexColors
        transparent
        opacity={0}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Glow particles — larger, fewer, additive for bloom effect
function GlowParticles({ isMobile, active }: { isMobile: boolean; active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const isActive = useRef(true);
  const basePositions = useRef<Float32Array | null>(null);
  const count = isMobile ? 18 : 60;

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const colorCyan = new THREE.Color('#2AE7E4');
    const colorCyanSoft = new THREE.Color('#5CF0ED');
    const colorPurple = new THREE.Color('#881078');
    const colorPurpleSoft = new THREE.Color('#C060B0');

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 2.0 + Math.random() * 4.0;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi) * 0.3;

      const mix = Math.random();
      const color = mix < 0.3 ? colorCyan : mix < 0.55 ? colorCyanSoft : mix < 0.8 ? colorPurple : colorPurpleSoft;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    basePositions.current = new Float32Array(positions);
    return { positions, colors };
  }, [count]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  useFrame((state) => {
    if (!pointsRef.current || !isActive.current || !active) return;
    const time = state.clock.elapsedTime;

    // Slow fluid drift for glow particles
    const posAttr = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const base = basePositions.current!;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      posAttr[i3] = base[i3] + Math.sin(time * 0.12 + i * 0.9) * 0.25;
      posAttr[i3 + 1] = base[i3 + 1] + Math.cos(time * 0.1 + i * 0.7) * 0.2;
      posAttr[i3 + 2] = base[i3 + 2] + Math.sin(time * 0.08 + i * 1.1) * 0.1;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.rotation.y = time * 0.03;
  });

  useEffect(() => {
    return () => { isActive.current = false; };
  }, []);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        map={getCircleTexture()}
        size={isMobile ? 0.25 : 0.45}
        vertexColors
        transparent
        opacity={0.3}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── Three.js Scene ────────────────────────────────────────────────

function Scene({ active, isMobile, isLowPower }: { active: boolean; isMobile: boolean; isLowPower: boolean }) {
  return (
    <>
      <Particles count={500} isMobile={isMobile} isLowPower={isLowPower} active={active} />
      <GlowParticles isMobile={isMobile} active={active} />
    </>
  );
}

// ── Video Background Layer ────────────────────────────────────────

function VideoBackground({ active }: { active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (active) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [active]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Video element — brighter with glow */}
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
        preload="auto"
      />

      {/* Glow effect — soft radial light behind the liquid ball */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 45% at 50% 50%, rgba(42,231,228,0.15) 0%, rgba(136,16,120,0.08) 40%, transparent 70%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Color overlay with blend mode for brand tinting */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(42,231,228,0.1) 0%, rgba(74,74,154,0.12) 40%, rgba(136,16,120,0.1) 100%)',
          mixBlendMode: 'overlay',
        }}
      />

      {/* Radial vignette — hides watermark at edges */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 45%, rgba(10,10,10,0.5) 100%)',
        }}
      />

      {/* Extra bottom-edge darkening (watermarks often sit here) */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(10,10,10,0.8) 0%, rgba(10,10,10,0.2) 10%, transparent 30%)',
        }}
      />

      {/* Top edge darkening */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,10,10,0.35) 0%, transparent 18%)',
        }}
      />
    </div>
  );
}

// ── Mobile Background (full-screen video, no Three.js) ───────────

function MobileVideoBackground({ active }: { active: boolean }) {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <VideoBackground active={active} />
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────

interface ParticleBackgroundProps {
  active?: boolean;
}

export default function ParticleBackground({ active = true }: ParticleBackgroundProps) {
  const isMobile = useIsMobile();
  const isLowPower = useIsLowPower();
  const prefersReducedMotion = useReducedMotion();
  const isVisible = useDocumentVisible();
  const { saveData, lowCpu } = usePerformanceHints();
  const [webglFailed, setWebglFailed] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useGlobalMouse();

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) setWebglFailed(true);
    } catch {
      setWebglFailed(true);
    }
  }, []);

  const shouldUseWebgl = !isMobile && !isLowPower && !prefersReducedMotion && !saveData && !lowCpu && !webglFailed;
  const isActive = active && isVisible;

  // Mobile / low-power → video-only (no Three.js particles)
  if (!shouldUseWebgl) {
    return <MobileVideoBackground active={isActive} />;
  }

  return (
    <motion.div
      className="absolute inset-0 w-full h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: isReady ? 1 : 0 }}
      transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Layer 1: Looping video background */}
      <VideoBackground active={isActive} />

      {/* Layer 2: Interactive Three.js particles */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 7], fov: 45 }}
          dpr={[1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1.5)]}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
          }}
          style={{ background: 'transparent' }}
          frameloop={isActive ? 'always' : 'demand'}
        >
          <Scene active={isActive} isMobile={isMobile} isLowPower={isLowPower} />
        </Canvas>
      </div>
    </motion.div>
  );
}
