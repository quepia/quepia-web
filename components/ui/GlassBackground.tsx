'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, MeshTransmissionMaterial, Float } from '@react-three/drei';
import { Physics, RigidBody, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useModal } from '@/context/ModalContext';

const COLORS = {
    purple: '#881078',
    cyan: '#2AE7E4',
    purpleNeon: '#c41aab',
    cyanNeon: '#00ffff',
};

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(media.matches);
        update();
        if (media.addEventListener) {
            media.addEventListener('change', update);
            return () => media.removeEventListener('change', update);
        }
        media.addListener(update);
        return () => media.removeListener(update);
    }, []);

    return reduced;
}

function useDocumentVisible() {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const handleVisibilityChange = () => setIsVisible(!document.hidden);
        handleVisibilityChange();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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

// Glass Sphere component with physics
function GlassSphere({ position, color, scale, paused, lowPower }: { position: [number, number, number], color: string, scale: number, paused: boolean, lowPower: boolean }) {
    const ref = useRef<RapierRigidBody>(null);
    const vec = new THREE.Vector3();

    useFrame((state) => {
        if (!ref.current || paused) return;

        const { x, y } = state.pointer;
        const { width, height } = state.viewport;
        const mouseVec = vec.set((x * width) / 2, (y * height) / 2, 0);

        const currentPos = ref.current.translation();
        const spherePos = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);
        const dist = spherePos.distanceTo(mouseVec);

        if (dist < 6) {
            const dir = spherePos.sub(mouseVec).normalize();
            const force = (6 - dist) * 0.5;
            ref.current.applyImpulse({ x: dir.x * force, y: dir.y * force, z: 0 }, true);
        }
    });

    return (
        <Float speed={paused ? 0 : 1.5} rotationIntensity={paused ? 0 : 1} floatIntensity={paused ? 0 : 2}>
            <RigidBody ref={ref} position={position} colliders="ball" linearDamping={2} angularDamping={1}>
                <mesh scale={scale}>
                    <sphereGeometry args={[1, lowPower ? 16 : 24, lowPower ? 16 : 24]} />
                    <MeshTransmissionMaterial
                        resolution={lowPower ? 64 : 128}
                        thickness={0.5}
                        roughness={0.1}
                        transmission={1}
                        ior={1.2}
                        chromaticAberration={0.01}
                        color={color}
                        samples={lowPower ? 1 : 2}
                        backside={false}
                    />
                </mesh>
            </RigidBody>
        </Float>
    );
}

// Desktop 3D Background
function DesktopBackground({ paused, lowPower }: { paused: boolean; lowPower: boolean }) {
    const sphereCount = lowPower ? 3 : 5;
    const spheres = useMemo(() => Array.from({ length: sphereCount }, (_, i) => ({
        position: [
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 5
        ] as [number, number, number],
        color: i % 2 === 0 ? COLORS.purple : COLORS.cyan,
        scale: 2.5 + Math.random() * 2
    })), [sphereCount]);

    return (
        <Canvas
            dpr={[1, lowPower ? 1.1 : 1.5]}
            camera={{ position: [0, 0, 20], fov: 50 }}
            gl={{
                antialias: false,
                alpha: false,
                powerPreference: lowPower ? 'low-power' : 'high-performance',
                stencil: false,
            }}
            frameloop={paused ? 'demand' : 'always'}
        >
            <Environment preset="city" />
            <ambientLight intensity={0.6} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />
            <pointLight position={[-10, -10, 5]} intensity={0.5} color={COLORS.cyan} />

            <Physics gravity={[0, 0, 0]} paused={paused}>
                {spheres.map((props, i) => <GlassSphere key={i} {...props} paused={paused} lowPower={lowPower} />)}
            </Physics>
        </Canvas>
    );
}

// Mobile CSS Background
function MobileBackground({ opacity }: { opacity: number }) {
    return (
        <div
            className="absolute inset-0 overflow-hidden transition-opacity duration-300 pointer-events-none"
            style={{ opacity, willChange: 'opacity' }}
        >
            {/* Magenta orb - top left */}
            <div
                className="absolute rounded-full mix-blend-screen animate-blob"
                style={{
                    width: '150vw',
                    height: '150vw',
                    top: '-40%',
                    left: '-40%',
                    background: `radial-gradient(circle, ${COLORS.purpleNeon} 0%, ${COLORS.purple} 40%, transparent 70%)`,
                    filter: 'blur(80px)',
                    opacity: 0.9,
                    willChange: 'transform',
                }}
            />

            {/* Cyan orb - center right */}
            <div
                className="absolute rounded-full mix-blend-screen animate-blob animation-delay-2000"
                style={{
                    width: '140vw',
                    height: '140vw',
                    top: '20%',
                    right: '-40%',
                    background: `radial-gradient(circle, ${COLORS.cyanNeon} 0%, ${COLORS.cyan} 40%, transparent 70%)`,
                    filter: 'blur(80px)',
                    opacity: 0.85,
                    willChange: 'transform',
                }}
            />

            {/* Magenta orb - bottom left - darker */}
            <div
                className="absolute rounded-full mix-blend-screen animate-blob animation-delay-4000"
                style={{
                    width: '130vw',
                    height: '130vw',
                    bottom: '-30%',
                    left: '-30%',
                    background: `radial-gradient(circle, ${COLORS.purple} 0%, transparent 70%)`,
                    filter: 'blur(90px)',
                    opacity: 0.9,
                    willChange: 'transform',
                }}
            />
        </div>
    );
}

export default function GlassBackground() {
    const [isMobile, setIsMobile] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [bgOpacity, setBgOpacity] = useState(1);
    const { isModalOpen } = useModal();
    const prefersReducedMotion = usePrefersReducedMotion();
    const isVisible = useDocumentVisible();
    const { saveData, lowCpu } = usePerformanceHints();
    const isLowPower = prefersReducedMotion || saveData || lowCpu;

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        setMounted(true);
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Dynamic scroll-based opacity for mobile
    useEffect(() => {
        if (!isMobile) return;

        let rafId = 0;
        const handleScroll = () => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                const scrollY = window.scrollY;
                const windowHeight = window.innerHeight || 1;
                const scrollProgress = Math.min(scrollY / windowHeight, 1);
                const newOpacity = 1 - (scrollProgress * 0.65);
                setBgOpacity(newOpacity);
                rafId = 0;
            });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafId) window.cancelAnimationFrame(rafId);
        };
    }, [isMobile]);

    // Prevent flash during SSR
    if (!mounted) {
        return <div className="fixed inset-0 z-0 bg-[#050505]" />;
    }

    const shouldUseWebgl = !isMobile && !isLowPower;
    const paused = isModalOpen || !isVisible || prefersReducedMotion;

    return (
        <div className="fixed inset-0 z-0 bg-[#050505]">
            {shouldUseWebgl ? (
                <DesktopBackground paused={paused} lowPower={isLowPower} />
            ) : (
                <MobileBackground opacity={isModalOpen ? 0.3 : bgOpacity} />
            )}
        </div>
    );
}
