import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, MeshTransmissionMaterial, Float } from '@react-three/drei';
import { Physics, RigidBody, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useModal } from '../../context/ModalContext';

const COLORS = {
  purple: '#881078',
  cyan: '#2AE7E4',
  purpleNeon: '#c41aab',
  cyanNeon: '#00ffff',
};

// ============================================
// DESKTOP: Componentes Three.js
// ============================================

function GlassSphere({ position, color, scale, paused }: { position: [number, number, number], color: string, scale: number, paused: boolean }) {
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
          <sphereGeometry args={[1, 24, 24]} />
          <MeshTransmissionMaterial
            resolution={128}
            thickness={0.5}
            roughness={0.1}
            transmission={1}
            ior={1.2}
            chromaticAberration={0.01}
            color={color}
            samples={2}
            backside={false}
          />
        </mesh>
      </RigidBody>
    </Float>
  );
}

// Fondo 3D para Desktop
function DesktopBackground({ paused }: { paused: boolean }) {
  const spheres = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    position: [
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 5
    ] as [number, number, number],
    color: i % 2 === 0 ? COLORS.purple : COLORS.cyan,
    scale: 2.5 + Math.random() * 2
  })), []);

  const dpr: [number, number] = [1, Math.min(window.devicePixelRatio, 1.5)];

  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 0, 20], fov: 50 }}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
      }}
      performance={{ min: 0.3 }}
      frameloop={paused ? 'demand' : 'always'}
    >
      <Environment preset="city" />
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={1.5} />
      <pointLight position={[-10, -10, 5]} intensity={0.5} color={COLORS.cyan} />

      <Physics gravity={[0, 0, 0]} paused={paused}>
        {spheres.map((props, i) => <GlassSphere key={i} {...props} paused={paused} />)}
      </Physics>
    </Canvas>
  );
}

// ============================================
// MOBILE: Fondo CSS con blur reducido para mejor rendimiento
// ============================================

function MobileBackground({ opacity }: { opacity: number }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden transition-opacity duration-300"
      style={{ opacity, willChange: 'opacity' }}
    >
      {/* Orbe Magenta GRANDE - arriba izquierda (principal) - blur reducido */}
      <div
        className="absolute rounded-full"
        style={{
          width: '120vw',
          height: '120vw',
          top: '-40%',
          left: '-40%',
          background: `radial-gradient(circle, ${COLORS.purpleNeon} 0%, ${COLORS.purple} 30%, transparent 60%)`,
          filter: 'blur(30px)',
          opacity: 0.85,
          willChange: 'transform',
        }}
      />

      {/* Orbe Cyan GRANDE - centro derecha (principal) */}
      <div
        className="absolute rounded-full"
        style={{
          width: '100vw',
          height: '100vw',
          top: '20%',
          right: '-30%',
          background: `radial-gradient(circle, ${COLORS.cyanNeon} 0%, ${COLORS.cyan} 35%, transparent 60%)`,
          filter: 'blur(25px)',
          opacity: 0.8,
          willChange: 'transform',
        }}
      />

      {/* Orbe Magenta - abajo izquierda */}
      <div
        className="absolute rounded-full"
        style={{
          width: '90vw',
          height: '90vw',
          bottom: '-20%',
          left: '-20%',
          background: `radial-gradient(circle, ${COLORS.purpleNeon} 0%, ${COLORS.purple} 40%, transparent 65%)`,
          filter: 'blur(28px)',
          opacity: 0.75,
          willChange: 'transform',
        }}
      />

      {/* Orbe Cyan - arriba derecha */}
      <div
        className="absolute rounded-full"
        style={{
          width: '80vw',
          height: '80vw',
          top: '-15%',
          right: '-25%',
          background: `radial-gradient(circle, ${COLORS.cyanNeon} 0%, ${COLORS.cyan} 35%, transparent 60%)`,
          filter: 'blur(22px)',
          opacity: 0.7,
          willChange: 'transform',
        }}
      />
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function GlassBackground() {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(1);

  // Get modal state to pause animations when modal is open
  let isModalOpen = false;
  try {
    const modal = useModal();
    isModalOpen = modal.isModalOpen;
  } catch {
    // Context not available yet (during initial render)
  }

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    setMounted(true);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Dynamic scroll-based opacity for mobile background
  useEffect(() => {
    if (!isMobile) return;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;

      // Fade from 100% at top to 35% after scrolling 1 viewport height
      const scrollProgress = Math.min(scrollY / windowHeight, 1);
      const newOpacity = 1 - (scrollProgress * 0.65); // 1 -> 0.35
      setBgOpacity(newOpacity);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Set initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  // Evitar flash de contenido incorrecto durante SSR/hidratación
  if (!mounted) {
    return <div className="fixed inset-0 z-0 bg-[#050505]" />;
  }

  return (
    <div className="fixed inset-0 z-0 bg-[#050505]">
      {isMobile ? (
        // Móvil: Fondo CSS puro con blur reducido
        <MobileBackground opacity={isModalOpen ? 0.3 : bgOpacity} />
      ) : (
        // Desktop: Animación Three.js con pausa cuando modal está abierto
        <DesktopBackground paused={isModalOpen} />
      )}
    </div>
  );
}
