/* eslint-disable react/no-unknown-property */
import * as THREE from 'three/webgpu';
import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export function Orb() {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const shellRef = useRef<THREE.Mesh>(null!);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    
    // Rotate entire group slowly
    groupRef.current.rotation.y += delta * 0.15;
    groupRef.current.rotation.x += delta * 0.1;

    // Pulsate the core
    const scale = 1 + Math.sin(time * 3) * 0.04;
    coreRef.current.scale.set(scale, scale, scale);
    
    // Rotate shell independently for dynamic layered effect
    shellRef.current.rotation.y -= delta * 0.4;
    shellRef.current.rotation.z += delta * 0.2;
  });

  return (
    <group ref={groupRef}>
      {/* Inner Energy Core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhysicalMaterial 
          color="#3b82f6" 
          emissive="#2563eb"
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Outer Glass Shell */}
      <mesh ref={shellRef}>
        <sphereGeometry args={[1.35, 64, 64]} />
        <meshPhysicalMaterial 
          color="#ffffff"
          transmission={1}
          opacity={1}
          transparent
          roughness={0.05}
          ior={1.6}
          thickness={0.8}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>
    </group>
  );
}

export default function OrbScene() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 4.5);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={2.5} />
      <pointLight position={[-10, -10, -5]} color="#a855f7" intensity={3} />
      <pointLight position={[10, -10, -5]} color="#3b82f6" intensity={2} />
      <Orb />
    </>
  );
}
