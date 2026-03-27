import React from 'react';
import * as THREE from 'three';

export default function HouseFloor({ width = 478, height = 353 }) {
  const wallHeight = 200; // Height of walls in cm
  const wallThickness = 15; // Thickness of walls
  
  return (
    <>
      {/* Floor */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.6} metalness={0} />
      </mesh>

      {/* Dark border outline */}
      <lineSegments position={[0, 1, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={8}
            array={new Float32Array([
              -width / 2, 0, -height / 2,
              width / 2, 0, -height / 2,
              width / 2, 0, -height / 2,
              width / 2, 0, height / 2,
              width / 2, 0, height / 2,
              -width / 2, 0, height / 2,
              -width / 2, 0, height / 2,
              -width / 2, 0, -height / 2
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#1a1a1a" linewidth={4} />
      </lineSegments>

      {/* Walls - All four sides */}
      {/* Front wall (negative Z) */}
      <mesh position={[0, wallHeight / 2, -height / 2]}>
        <boxGeometry args={[width, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#dcdcdc" roughness={0.5} />
      </mesh>

      {/* Back wall (positive Z) */}
      <mesh position={[0, wallHeight / 2, height / 2]}>
        <boxGeometry args={[width, wallHeight, wallThickness]} />
        <meshStandardMaterial color="#dcdcdc" roughness={0.5} />
      </mesh>

      {/* Left wall (negative X) */}
      <mesh position={[-width / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, height]} />
        <meshStandardMaterial color="#e5e5e5" roughness={0.5} />
      </mesh>

      {/* Right wall (positive X) */}
      <mesh position={[width / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, height]} />
        <meshStandardMaterial color="#e5e5e5" roughness={0.5} />
      </mesh>

      {/* Corner markers - more visible */}
      {[
        [-width / 2, 5, -height / 2],
        [width / 2, 5, -height / 2],
        [width / 2, 5, height / 2],
        [-width / 2, 5, height / 2]
      ].map((pos, i) => (
        <mesh key={`corner-${i}`} position={pos}>
          <sphereGeometry args={[15, 16, 16]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
      ))}

      {/* Center point - large and bright */}
      <mesh position={[0, 5, 0]}>
        <sphereGeometry args={[12, 16, 16]} />
        <meshBasicMaterial color="#00ff00" />
      </mesh>

      {/* Grid helper on floor */}
      <gridHelper 
        args={[width * 1.5, 20, '#444444', '#666666']}
        position={[0, 0.1, 0]}
      />
    </>
  );
}
