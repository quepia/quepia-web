'use client';

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { motion, useReducedMotion } from 'framer-motion';
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

// Check if device is low power mode
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
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
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

// Simplex noise function for vertex shader
const simplexNoise = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i  = floor(v + dot(v, C.yyy));
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
    vec3  ns = n_ * D.wyz - D.xzx;
    
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
`;

// Perfect sphere with cursor-based deformation only
function GradientSphere({ isMobile, isLowPower, active }: { isMobile: boolean; isLowPower: boolean; active: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();
  const entranceProgress = useRef(0);
  const isActive = useRef(true);
  
  // Mouse tracking
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetMouseRef = useRef({ x: 0, y: 0 });
  const cursorProximityRef = useRef(0);
  
  // Store base position to prevent scroll jumps
  const basePositionRef = useRef(new THREE.Vector3(viewport.width * 0.16, 0, 0));

  const material = useMemo(() => {
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;
      uniform float uTime;
      uniform float uCursorProximity;
      uniform vec2 uCursorPos;
      
      ${simplexNoise}
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        
        // Only deform when cursor is near - based on proximity
        float deformStrength = uCursorProximity * 0.15;
        
        // Create deformation pattern
        float noise = snoise(position * 2.0 + uTime * 0.5);
        float displacement = noise * deformStrength;
        
        vec3 newPosition = position + normal * displacement;
        vPosition = newPosition;
        
        vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      uniform vec3 uColorCyan;
      uniform vec3 uColorPurple;
      uniform vec3 uColorMid;
      uniform vec3 uColorHighlight;
      uniform float uTime;
      uniform float uPulseSpeed;
      uniform float uCursorProximity;
      
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;
      
      void main() {
        // Create dynamic color waves
        float wave1 = sin(vPosition.x * 3.0 + uTime * 0.8) * 0.5 + 0.5;
        float wave2 = cos(vPosition.y * 3.0 + uTime * 0.6 + 1.0) * 0.5 + 0.5;
        float wave3 = sin(vPosition.z * 3.0 + uTime * 0.4 + 2.0) * 0.5 + 0.5;
        
        // Combine waves for complex color mixing
        float mixFactor = (wave1 + wave2 + wave3) / 3.0;
        
        // Primary gradient: Cyan to Purple with dynamic mixing
        vec3 baseColor = mix(uColorCyan, uColorPurple, mixFactor);
        
        // Add mid-tone transitions for smoother color journey
        float midMix = sin(uTime * 0.5) * 0.5 + 0.5;
        baseColor = mix(baseColor, uColorMid, midMix * 0.3);
        
        // Secondary color waves for more variation
        float secondaryWave = sin(vPosition.x * 5.0 + vPosition.y * 3.0 + uTime * 1.2) * 0.5 + 0.5;
        baseColor = mix(baseColor, uColorCyan, secondaryWave * 0.2);
        
        float tertiaryWave = cos(vPosition.z * 4.0 + vPosition.x * 2.0 + uTime * 0.9) * 0.5 + 0.5;
        baseColor = mix(baseColor, uColorPurple, tertiaryWave * 0.2);
        
        // Highlight when cursor is near
        baseColor = mix(baseColor, uColorHighlight, uCursorProximity * 0.3);
        
        // Metallic/Fresnel effect
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5);
        
        // Specular highlight with animation
        vec3 lightDir = normalize(vec3(sin(uTime * 0.3) * 2.0, 2.0, 3.0));
        vec3 halfDir = normalize(lightDir + viewDir);
        float specAngle = max(dot(halfDir, vNormal), 0.0);
        float specular = pow(specAngle, 32.0) * 0.8;
        
        // Animated rim light
        float rim = pow(1.0 - abs(dot(viewDir, vNormal)), 3.0);
        
        // Pulsing glow effect
        float pulse = sin(uTime * uPulseSpeed) * 0.1 + 0.9;
        
        // Combine all effects
        vec3 finalColor = baseColor * (0.7 + fresnel * 0.5) * pulse;
        finalColor += uColorHighlight * specular * 1.5;
        finalColor += uColorCyan * rim * 1.5;
        finalColor += uColorPurple * fresnel * 0.3;
        
        gl_FragColor = vec4(finalColor, 0.95);
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms: {
        uColorCyan: { value: new THREE.Color('#2AE7E4') },
        uColorPurple: { value: new THREE.Color('#881078') },
        uColorMid: { value: new THREE.Color('#4A4A9A') },
        uColorHighlight: { value: new THREE.Color('#ffffff') },
        uTime: { value: 0 },
        uCursorProximity: { value: 0 },
        uCursorPos: { value: new THREE.Vector2(0, 0) },
        uPulseSpeed: { value: 0.5 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
    });
  }, []);

  // Mouse position tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse to -1 to 1
      targetMouseRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      };
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame((state) => {
    if (!meshRef.current || !isActive.current || !active) return;

    const time = state.clock.elapsedTime;
    const mesh = meshRef.current;

    // Entrance animation
    if (entranceProgress.current < 1) {
      entranceProgress.current = Math.min(entranceProgress.current + 0.015, 1);
      const easeOut = 1 - Math.pow(1 - entranceProgress.current, 4);
      mesh.scale.setScalar(baseScale * easeOut);
    }

    // Update shader time
    material.uniforms.uTime.value = time;

    // Smooth floating animation (independent of scroll)
    const floatY = Math.sin(time * 0.5) * 0.15 + Math.sin(time * 0.3) * 0.08;
    
    // Smooth mouse parallax with lerp
    mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.04;
    mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.04;

    // Calculate cursor proximity to sphere for deformation
    // Sphere is at viewport.width * 0.16, estimate sphere position on screen
    const sphereScreenX = 0.32; // Approximate normalized screen position (right side)
    const sphereScreenY = 0;
    
    const dx = mouseRef.current.x - sphereScreenX;
    const dy = mouseRef.current.y - sphereScreenY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Proximity is high when close (0-1 range, 1 = very close)
    const targetProximity = Math.max(0, 1 - distance * 2);
    cursorProximityRef.current += (targetProximity - cursorProximityRef.current) * 0.05;
    
    material.uniforms.uCursorProximity.value = cursorProximityRef.current;
    material.uniforms.uCursorPos.value.set(mouseRef.current.x, mouseRef.current.y);

    // Position calculation - STABLE, not affected by scroll
    // Use base position plus subtle parallax
    const parallaxX = mouseRef.current.x * 0.2;
    const parallaxY = mouseRef.current.y * 0.1 + floatY;

    // Smooth position update
    mesh.position.x += (basePositionRef.current.x + parallaxX - mesh.position.x) * 0.05;
    mesh.position.y += (basePositionRef.current.y + parallaxY - mesh.position.y) * 0.05;
    mesh.position.z = basePositionRef.current.z;
    
    // Subtle rotation
    mesh.rotation.y = Math.sin(time * 0.1) * 0.1 + mouseRef.current.x * 0.05;
    mesh.rotation.z = Math.cos(time * 0.08) * 0.05;
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActive.current = false;
      material.dispose();
    };
  }, [material]);

  const baseScale = isMobile ? 1.4 : Math.min(viewport.width * 0.24, 2.4);
  const segments = isMobile || isLowPower ? 48 : 64;

  return (
    <mesh
      ref={meshRef}
      material={material}
      position={[basePositionRef.current.x, 0, 0]}
      scale={0}
    >
      <sphereGeometry args={[1, segments, segments]} />
    </mesh>
  );
}

// Particles with orbital motion
function Particles({ count = 48, isMobile, isLowPower, active }: { count?: number; isMobile: boolean; isLowPower: boolean; active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const entranceProgress = useRef(0);
  const isActive = useRef(true);
  const rotationRef = useRef(0);

  const particleCount = isMobile || isLowPower ? Math.floor(count / 3) : count;

  const { positions, colors, speeds } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);

    const colorCyan = new THREE.Color('#2AE7E4');
    const colorPurple = new THREE.Color('#881078');
    const colorWhite = new THREE.Color('#ffffff');

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 1.8 + Math.random() * 2.5;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const colorMix = Math.random();
      const color = colorMix < 0.45 ? colorCyan : colorMix < 0.8 ? colorPurple : colorWhite;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      speeds[i] = Math.random() * 0.5 + 0.2;
    }

    return { positions, colors, speeds };
  }, [particleCount, isMobile, isLowPower]);

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
        (pointsRef.current.material as THREE.PointsMaterial).opacity = 0.6 * easeOut;
      }
    }

    // Gentle rotation - consistent speed, no scroll dependency
    rotationRef.current += 0.0003;
    pointsRef.current.rotation.y = rotationRef.current;
    pointsRef.current.rotation.z = Math.sin(time * 0.1) * 0.05;

    // Subtle particle movement
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const speed = speeds[i];
      positions[i3 + 1] += Math.sin(time * speed * 0.5 + i) * 0.001;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      isActive.current = false;
    };
  }, []);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={isMobile ? 0.025 : 0.035}
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

// Orbiting ring
function OrbitRing({ isMobile, isLowPower, active }: { isMobile: boolean; isLowPower: boolean; active: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();
  const rotationRef = useRef(0);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColorCyan: { value: new THREE.Color('#2AE7E4') },
        uColorPurple: { value: new THREE.Color('#881078') },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColorCyan;
        uniform vec3 uColorPurple;
        uniform float uTime;
        varying vec2 vUv;
        
        void main() {
          float angle = atan(vUv.y - 0.5, vUv.x - 0.5) / (2.0 * 3.14159) + 0.5;
          float gradient = sin(angle * 6.28 + uTime) * 0.5 + 0.5;
          vec3 color = mix(uColorCyan, uColorPurple, gradient);
          float alpha = 0.3 * (1.0 - abs(vUv.y - 0.5) * 2.0);
          gl_FragColor = vec4(color, alpha * 0.5);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useFrame((state) => {
    if (!ringRef.current || !active) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    
    // Consistent rotation, no scroll dependency
    rotationRef.current += 0.002;
    ringRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.3;
    ringRef.current.rotation.y = rotationRef.current;
    ringRef.current.rotation.z = Math.cos(state.clock.elapsedTime * 0.15) * 0.2;
  });

  if (isMobile || isLowPower) return null;

  return (
    <mesh ref={ringRef} material={material} position={[viewport.width * 0.16, 0, 0]}>
      <torusGeometry args={[2.2, 0.01, 16, 100]} />
    </mesh>
  );
}

// Main 3D scene
function Scene({ active, isMobile, isLowPower }: { active: boolean; isMobile: boolean; isLowPower: boolean }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <GradientSphere isMobile={isMobile} isLowPower={isLowPower} active={active} />
      <Particles count={48} isMobile={isMobile} isLowPower={isLowPower} active={active} />
      <OrbitRing isMobile={isMobile} isLowPower={isLowPower} active={active} />
    </>
  );
}

// CSS fallback
function FallbackBackground() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 bg-[#0a0a0a]"
      initial={{ opacity: 0 }}
      animate={{ opacity: isReady ? 1 : 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-[380px] h-[380px] rounded-full"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: isReady ? 1 : 0,
            scale: isReady ? 1 : 0.8
          }}
          transition={{
            duration: 1.2,
            delay: 0.2,
            ease: [0.16, 1, 0.3, 1]
          }}
          style={{
            background: 'radial-gradient(circle at 30% 30%, #2AE7E4 0%, #4A4A9A 40%, #881078 70%, #0a0a0a 100%)',
            boxShadow: '0 0 120px rgba(42,231,228,0.5), inset -30px -30px 80px rgba(0,0,0,0.8)',
            top: '25%',
            right: '15%',
            animation: 'spherePulse 4s ease-in-out infinite, sphereFloat 6s ease-in-out infinite',
          }}
        />
        
        <motion.div
          className="absolute w-[300px] h-[300px] rounded-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: isReady ? 0.6 : 0 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          style={{
            background: 'radial-gradient(circle, rgba(136,16,120,0.6) 0%, transparent 70%)',
            filter: 'blur(40px)',
            top: '30%',
            right: '18%',
            animation: 'sphereFloat 5s ease-in-out infinite reverse',
          }}
        />
      </div>
    </motion.div>
  );
}

// Main component
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
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglFailed(true);
      }
    } catch (e) {
      setWebglFailed(true);
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (canvasRef.current) {
        const canvas = canvasRef.current.querySelector('canvas');
        if (canvas) {
          (canvas as HTMLCanvasElement).style.willChange = document.hidden ? 'auto' : 'transform';
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const shouldUseWebgl = !isMobile && !isLowPower && !prefersReducedMotion && !saveData && !lowCpu && !webglFailed;
  const isActive = active && isVisible;
  const maxDpr = 1.5;

  if (!shouldUseWebgl) {
    return <FallbackBackground />;
  }

  return (
    <motion.div
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{
        opacity: isReady ? 1 : 0,
        scale: isReady ? 1 : 0.95
      }}
      transition={{
        duration: 1.2,
        ease: [0.16, 1, 0.3, 1]
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 45 }}
        dpr={[1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, maxDpr)]}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        style={{ background: 'transparent' }}
        frameloop={isActive ? "always" : "demand"}
      >
        <Scene active={isActive} isMobile={isMobile} isLowPower={isLowPower} />
      </Canvas>
    </motion.div>
  );
}
