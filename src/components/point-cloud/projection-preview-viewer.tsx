"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";

interface Point {
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
}

type Perspective = "top" | "bottom" | "north" | "south" | "east" | "west" | "custom";

interface ProjectionPreviewViewerProps {
  points: Point[];
  perspective: Perspective;
  customAngle?: { theta: number; phi: number };
  className?: string;
  onAngleChange?: (theta: number, phi: number) => void;
}

// Projection direction vectors for each perspective
const PROJECTION_DIRECTIONS: Record<Perspective, THREE.Vector3> = {
  top: new THREE.Vector3(0, -1, 0),
  bottom: new THREE.Vector3(0, 1, 0),
  north: new THREE.Vector3(0, 0, -1),
  south: new THREE.Vector3(0, 0, 1),
  east: new THREE.Vector3(1, 0, 0),
  west: new THREE.Vector3(-1, 0, 0),
  custom: new THREE.Vector3(0, -1, 0),
};

function PointCloud({ points }: { points: Point[] }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    
    let minZ = Infinity, maxZ = -Infinity;
    points.forEach(p => {
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    const zRange = maxZ - minZ || 1;
    
    points.forEach((point, i) => {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.z; // Swap Y and Z
      positions[i * 3 + 2] = point.y;
      
      // Use height-based coloring with muted colors
      const normalized = (point.z - minZ) / zRange;
      colors[i * 3] = 0.4 + normalized * 0.3;
      colors[i * 3 + 1] = 0.35 + normalized * 0.2;
      colors[i * 3 + 2] = 0.3 + normalized * 0.1;
    });
    
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeBoundingSphere();
    
    return geom;
  }, [points]);
  
  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={0.015}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.7}
      />
    </points>
  );
}

function ProjectionPlane({ 
  perspective, 
  center, 
  size,
  customAngle 
}: { 
  perspective: Perspective; 
  center: THREE.Vector3;
  size: number;
  customAngle?: { theta: number; phi: number };
}) {
  const planeRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.ArrowHelper>(null);
  
  const { rotation, position, direction } = useMemo(() => {
    let rotation = new THREE.Euler();
    let position = center.clone();
    let direction = PROJECTION_DIRECTIONS[perspective].clone();
    
    const offset = size * 0.8;
    
    switch (perspective) {
      case "top":
        rotation.set(0, 0, 0);
        position.y = center.y + offset;
        direction.set(0, -1, 0);
        break;
      case "bottom":
        rotation.set(Math.PI, 0, 0);
        position.y = center.y - offset;
        direction.set(0, 1, 0);
        break;
      case "north":
        rotation.set(Math.PI / 2, 0, 0);
        position.z = center.z - offset;
        direction.set(0, 0, 1);
        break;
      case "south":
        rotation.set(-Math.PI / 2, 0, 0);
        position.z = center.z + offset;
        direction.set(0, 0, -1);
        break;
      case "east":
        rotation.set(0, 0, Math.PI / 2);
        position.x = center.x + offset;
        direction.set(-1, 0, 0);
        break;
      case "west":
        rotation.set(0, 0, -Math.PI / 2);
        position.x = center.x - offset;
        direction.set(1, 0, 0);
        break;
      case "custom":
        if (customAngle) {
          const theta = customAngle.theta;
          const phi = customAngle.phi;
          rotation.set(phi, theta, 0);
          position.x = center.x + offset * Math.sin(phi) * Math.cos(theta);
          position.y = center.y + offset * Math.cos(phi);
          position.z = center.z + offset * Math.sin(phi) * Math.sin(theta);
          direction.set(
            -Math.sin(phi) * Math.cos(theta),
            -Math.cos(phi),
            -Math.sin(phi) * Math.sin(theta)
          );
        }
        break;
    }
    
    return { rotation, position, direction };
  }, [perspective, center, size, customAngle]);
  
  return (
    <group>
      {/* Projection plane */}
      <mesh ref={planeRef} position={position} rotation={rotation}>
        <planeGeometry args={[size * 1.2, size * 1.2]} />
        <meshBasicMaterial 
          color="#C9A227" 
          transparent 
          opacity={0.15} 
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Plane border */}
      <mesh position={position} rotation={rotation}>
        <ringGeometry args={[size * 0.58, size * 0.6, 64]} />
        <meshBasicMaterial color="#C9A227" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Projection direction arrow */}
      <arrowHelper
        args={[
          direction,
          position,
          size * 0.5,
          0xC9A227,
          size * 0.15,
          size * 0.1
        ]}
      />
      
      {/* View frustum lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([
              // Corner rays from plane to center
              position.x - size * 0.5, position.y, position.z - size * 0.5,
              center.x, center.y, center.z,
              position.x + size * 0.5, position.y, position.z - size * 0.5,
              center.x, center.y, center.z,
              position.x - size * 0.5, position.y, position.z + size * 0.5,
              center.x, center.y, center.z,
              position.x + size * 0.5, position.y, position.z + size * 0.5,
              center.x, center.y, center.z,
            ])}
            count={8}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#C9A227" transparent opacity={0.3} />
      </lineSegments>
      
      {/* Label */}
      <Html position={[position.x, position.y + size * 0.15, position.z]} center>
        <div className="bg-background/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium capitalize whitespace-nowrap">
          {perspective} View
        </div>
      </Html>
    </group>
  );
}

function CameraController({ 
  center, 
  distance 
}: { 
  center: THREE.Vector3;
  distance: number;
}) {
  const controlsRef = useRef<any>(null);
  
  return (
    <OrbitControls
      ref={controlsRef}
      target={[center.x, center.y, center.z]}
      enableDamping
      dampingFactor={0.05}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      panSpeed={0.5}
      minDistance={distance * 0.3}
      maxDistance={distance * 4}
    />
  );
}

export function ProjectionPreviewViewer({
  points,
  perspective,
  customAngle,
  className = "",
  onAngleChange,
}: ProjectionPreviewViewerProps) {
  
  const { center, cameraDistance } = useMemo(() => {
    if (points.length === 0) {
      return { 
        center: new THREE.Vector3(0, 0, 0), 
        cameraDistance: 10
      };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minZ + maxZ) / 2,
      (minY + maxY) / 2
    );
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;
    const maxRange = Math.max(rangeX, rangeY, rangeZ);
    
    return {
      center,
      cameraDistance: maxRange * 1.8,
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className={`bg-muted/30 rounded-lg flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground">No point cloud data loaded</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Canvas
        className="rounded-lg"
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#0a0f1a"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.4} />
        
        <PerspectiveCamera
          makeDefault
          position={[
            center.x + cameraDistance * 0.6,
            center.y + cameraDistance * 0.8,
            center.z + cameraDistance * 0.6
          ]}
          fov={50}
          near={0.1}
          far={cameraDistance * 20}
        />
        
        <PointCloud points={points} />
        
        <ProjectionPlane 
          perspective={perspective}
          center={center}
          size={cameraDistance * 0.6}
          customAngle={customAngle}
        />
        
        <Grid
          args={[100, 100]}
          position={[center.x, center.y - cameraDistance * 0.4, center.z]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#1a2744"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#2a3a5a"
          fadeDistance={50}
          fadeStrength={1}
          infiniteGrid
        />
        
        <CameraController center={center} distance={cameraDistance} />
      </Canvas>
      
      {/* Legend */}
      <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#C9A227]" />
          <span className="text-xs text-muted-foreground">Projection Plane</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#C9A227]" />
          <span className="text-xs text-muted-foreground">View Direction</span>
        </div>
      </div>
      
      {/* Stats */}
      <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {points.length.toLocaleString()} points
        </p>
      </div>
    </div>
  );
}

