'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useScroll, useTransform, MotionValue } from 'framer-motion';
import * as THREE from 'three';

// Check if device is mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
}

// Custom shader material for the gradient sphere
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uScrollProgress;
  
  // Simplex noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    // Displace vertices based on noise - reduced for mobile
    float noise = snoise(position * 1.5 + uTime * 0.2);
    float displacement = noise * (0.12 + uScrollProgress * 0.08);
    
    vec3 newPosition = position + normal * displacement;
    vPosition = newPosition;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uTime;
  uniform float uScrollProgress;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    // Create flowing gradient based on position and time
    float gradient1 = sin(vPosition.x * 2.0 + uTime * 0.3) * 0.5 + 0.5;
    float gradient2 = cos(vPosition.y * 2.0 + uTime * 0.2) * 0.5 + 0.5;
    float gradient3 = sin(vPosition.z * 2.0 + uTime * 0.4) * 0.5 + 0.5;
    
    // Mix colors based on gradients
    vec3 color = mix(uColor1, uColor2, gradient1);
    color = mix(color, uColor3, gradient2 * 0.3);
    
    // Add scroll-based color shift
    color = mix(color, uColor2, uScrollProgress * 0.4);
    
    // Fresnel effect for edge glow
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - dot(viewDirection, vNormal), 3.0);
    
    // Emissive glow
    vec3 glow = uColor1 * fresnel * 0.8;
    
    // Pulse effect
    float pulse = sin(uTime * 0.5) * 0.1 + 0.9;
    
    gl_FragColor = vec4((color + glow) * pulse, 1.0);
  }
`;

// Animated sphere mesh
function AnimatedSphere({ scrollProgress, isMobile }: { scrollProgress: MotionValue<number>; isMobile: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const scrollValue = useTransform(scrollProgress, [0, 1], [0, 1]);

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return;
    
    // Continuous rotation
    meshRef.current.rotation.y += isMobile ? 0.001 : 0.002;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    
    // Update shader uniforms
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uScrollProgress.value = scrollValue.get();
    
    // Scale based on scroll
    const scale = 1 + scrollValue.get() * 0.3;
    meshRef.current.scale.setScalar(scale);
  });

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScrollProgress: { value: 0 },
        uColor1: { value: new THREE.Color('#2AE7E4') },
        uColor2: { value: new THREE.Color('#881078') },
        uColor3: { value: new THREE.Color('#ffffff') },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
    });
  }, []);

  // Smaller scale on mobile
  const baseScale = isMobile ? 1.0 : (viewport.width > 6 ? 1.8 : 1.2);

  return (
    <mesh ref={meshRef} material={material} scale={baseScale}>
      <icosahedronGeometry args={[1, isMobile ? 32 : 64]} />
    </mesh>
  );
}

// Particles around the sphere
function Particles({ scrollProgress, isMobile }: { scrollProgress: MotionValue<number>; isMobile: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const scrollValue = useTransform(scrollProgress, [0, 1], [0, 1]);

  // Fewer particles on mobile
  const particleCount = isMobile ? 50 : 100;
  
  // Create geometry with positions attribute
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 2 + Math.random() * 1.5;
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return geo;
  }, [particleCount]);

  useFrame(() => {
    if (!pointsRef.current) return;
    
    pointsRef.current.rotation.y += 0.001;
    pointsRef.current.rotation.z = scrollValue.get() * Math.PI * 0.5;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={isMobile ? 0.02 : 0.03}
        color="#2AE7E4"
        transparent
        opacity={isMobile ? 0.4 : 0.6}
        sizeAttenuation
      />
    </points>
  );
}

// Main 3D scene
function Scene() {
  const { scrollYProgress } = useScroll();
  const isMobile = useIsMobile();

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <AnimatedSphere scrollProgress={scrollYProgress} isMobile={isMobile} />
      <Particles scrollProgress={scrollYProgress} isMobile={isMobile} />
    </>
  );
}

// CSS fallback for mobile/low-power devices
function GradientSphereFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative w-64 h-64 md:w-96 md:h-96">
        {/* Animated gradient orb fallback */}
        <div 
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #2AE7E4 0%, #881078 50%, #0a0a0a 70%)',
            filter: 'blur(40px)',
            animation: 'blob 7s infinite'
          }}
        />
        <div 
          className="absolute inset-4 rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle at 70% 70%, #881078 0%, #2AE7E4 50%, transparent 70%)',
            filter: 'blur(30px)',
            animation: 'blob 7s infinite 2s'
          }}
        />
      </div>
    </div>
  );
}

// Main component
export default function GradientSphere() {
  const isMobile = useIsMobile();
  const [webglFailed, setWebglFailed] = useState(false);

  // Check WebGL support
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglFailed(true);
      }
    } catch {
      setWebglFailed(true);
    }
  }, []);

  // Use fallback on mobile or if WebGL fails
  if (isMobile || webglFailed) {
    return <GradientSphereFallback />;
  }

  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        dpr={[1, 1.5]} // Limit DPR for performance
        gl={{ 
          antialias: false, // Disable antialias for performance
          alpha: true,
          powerPreference: 'high-performance'
        }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
