"use client";

import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Grid, Stats } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Home,
  Box,
  Maximize,
  Move3D
} from "lucide-react";

interface Point {
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
  intensity?: number;
}

interface PointCloudViewerProps {
  points: Point[];
  colorMode?: "rgb" | "intensity" | "height" | "uniform";
  pointSize?: number;
  className?: string;
  showGrid?: boolean;
  showBoundingBox?: boolean;
  showStats?: boolean;
}

function PointCloud({ 
  points, 
  colorMode = "rgb", 
  pointSize = 0.01 
}: { 
  points: Point[]; 
  colorMode: string; 
  pointSize: number 
}) {
  const meshRef = useRef<THREE.Points>(null);
  
  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    
    // Calculate height range for height-based coloring
    let minZ = Infinity, maxZ = -Infinity;
    points.forEach(p => {
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    const zRange = maxZ - minZ || 1;
    
    points.forEach((point, i) => {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.z; // Swap Y and Z for correct up orientation
      positions[i * 3 + 2] = point.y;
      
      if (colorMode === "rgb" && point.r !== undefined) {
        colors[i * 3] = point.r / 255;
        colors[i * 3 + 1] = (point.g ?? 0) / 255;
        colors[i * 3 + 2] = (point.b ?? 0) / 255;
      } else if (colorMode === "intensity" && point.intensity !== undefined) {
        const intensity = point.intensity;
        colors[i * 3] = intensity;
        colors[i * 3 + 1] = intensity;
        colors[i * 3 + 2] = intensity;
      } else if (colorMode === "height") {
        const normalized = (point.z - minZ) / zRange;
        // Use a warm color gradient (gold to deep red/burgundy)
        const hue = 0.08 - normalized * 0.08; // From gold to deep orange/red
        const saturation = 0.7 + normalized * 0.2;
        const lightness = 0.5 - normalized * 0.2;
        
        // HSL to RGB conversion
        const hsl2rgb = (h: number, s: number, l: number) => {
          const c = (1 - Math.abs(2 * l - 1)) * s;
          const x = c * (1 - Math.abs((h * 6) % 2 - 1));
          const m = l - c / 2;
          let r = 0, g = 0, b = 0;
          if (h < 1/6) { r = c; g = x; b = 0; }
          else if (h < 2/6) { r = x; g = c; b = 0; }
          else if (h < 3/6) { r = 0; g = c; b = x; }
          else if (h < 4/6) { r = 0; g = x; b = c; }
          else if (h < 5/6) { r = x; g = 0; b = c; }
          else { r = c; g = 0; b = x; }
          return [r + m, g + m, b + m];
        };
        
        const [r, g, b] = hsl2rgb(hue, saturation, lightness);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      } else {
        // Uniform color (vault stone color)
        colors[i * 3] = 0.69;
        colors[i * 3 + 1] = 0.58;
        colors[i * 3 + 2] = 0.42;
      }
    });
    
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeBoundingSphere();
    
    return geom;
  }, [points, colorMode]);
  
  return (
    <points ref={meshRef} geometry={geometry}>
      <pointsMaterial
        size={pointSize}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.95}
      />
    </points>
  );
}

function BoundingBox({ points }: { points: Point[] }) {
  const { min, max, center, size } = useMemo(() => {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    
    points.forEach(p => {
      if (p.x < min.x) min.x = p.x;
      if (p.y < min.y) min.y = p.y;
      if (p.z < min.z) min.z = p.z;
      if (p.x > max.x) max.x = p.x;
      if (p.y > max.y) max.y = p.y;
      if (p.z > max.z) max.z = p.z;
    });
    
    const center = {
      x: (min.x + max.x) / 2,
      y: (min.z + max.z) / 2, // Swap Y/Z
      z: (min.y + max.y) / 2,
    };
    
    const size = {
      x: max.x - min.x,
      y: max.z - min.z, // Swap Y/Z
      z: max.y - min.y,
    };
    
    return { min, max, center, size };
  }, [points]);
  
  return (
    <group position={[center.x, center.y, center.z]}>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
        <lineBasicMaterial color="#C9A227" opacity={0.6} transparent linewidth={2} />
      </lineSegments>
    </group>
  );
}

interface CameraControllerProps {
  center: { x: number; y: number; z: number };
  distance: number;
  resetKey: number;
}

function CameraController({ center, distance, resetKey }: CameraControllerProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const initializedRef = useRef(false);
  
  // Only reset camera on explicit reset (resetKey change) or initial mount
  useEffect(() => {
    if (!initializedRef.current || resetKey > 0) {
      if (controlsRef.current) {
        controlsRef.current.target.set(center.x, center.y, center.z);
      }
      
      // Reset camera position
      camera.position.set(
        center.x + distance * 0.7,
        center.y + distance * 0.5,
        center.z + distance * 0.7
      );
      camera.lookAt(center.x, center.y, center.z);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      initializedRef.current = true;
    }
  }, [resetKey]); // Only depend on resetKey, not center/distance
  
  return (
    <OrbitControls
      ref={controlsRef}
      target={[center.x, center.y, center.z]}
      enableDamping={false}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      panSpeed={0.5}
      minDistance={distance * 0.1}
      maxDistance={distance * 5}
      autoRotate={false}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
    />
  );
}

export function PointCloudViewer({
  points,
  colorMode = "height",
  pointSize = 0.02,
  className = "",
  showGrid = true,
  showBoundingBox = true,
  showStats = false,
}: PointCloudViewerProps) {
  const [localColorMode, setLocalColorMode] = useState(colorMode);
  const [localPointSize, setLocalPointSize] = useState(pointSize);
  const [resetKey, setResetKey] = useState(0);
  
  // Calculate center for camera target
  const { center, cameraDistance, gridPos, minZ } = useMemo(() => {
    if (points.length === 0) {
      return { 
        center: { x: 0, y: 0, z: 0 }, 
        cameraDistance: 10,
        gridPos: { x: 0, y: 0, z: 0 },
        minZ: 0
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
    
    // Center in swapped coordinate system (Y and Z swapped)
    const center = {
      x: (minX + maxX) / 2,
      y: (minZ + maxZ) / 2, // Z becomes Y
      z: (minY + maxY) / 2, // Y becomes Z
    };
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;
    const maxRange = Math.max(rangeX, rangeY, rangeZ);
    
    return {
      center,
      cameraDistance: maxRange * 1.5,
      gridPos: { x: center.x, y: minZ - 0.1, z: center.z },
      minZ
    };
  }, [points]);

  const handleReset = useCallback(() => {
    setResetKey(k => k + 1);
  }, []);

  if (points.length === 0) {
    return (
      <div className={`bg-muted/30 rounded-lg flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground">No point cloud data</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ minHeight: 300 }}>
      <Canvas
        className="point-cloud-canvas rounded-lg absolute inset-0"
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <color attach="background" args={["#0a0f1a"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.4} />
        
        <PerspectiveCamera
          makeDefault
          position={[
            center.x + cameraDistance * 0.7,
            center.y + cameraDistance * 0.5,
            center.z + cameraDistance * 0.7
          ]}
          fov={50}
          near={0.1}
          far={cameraDistance * 20}
        />
        
        <PointCloud 
          points={points} 
          colorMode={localColorMode} 
          pointSize={localPointSize} 
        />
        
        {showBoundingBox && <BoundingBox points={points} />}
        
        {showGrid && (
          <Grid
            args={[50, 50]}
            position={[gridPos.x, gridPos.y, gridPos.z]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#1a2744"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#2a3a5a"
            fadeDistance={30}
            fadeStrength={1}
          />
        )}
        
        <CameraController center={center} distance={cameraDistance} resetKey={resetKey} />
        
        {showStats && <Stats />}
      </Canvas>
      
      {/* Top right: Stats overlay */}
      <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 space-y-1">
        <p className="text-xs text-muted-foreground">
          {points.length.toLocaleString()} points
        </p>
      </div>
      
      {/* Top left: Reset button */}
      <div className="absolute top-4 left-4">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
          onClick={handleReset}
          title="Reset camera"
        >
          <Home className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Controls Overlay */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        {/* Color mode buttons */}
        <div className="flex gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1">
          {(["height", "rgb", "intensity", "uniform"] as const).map((mode) => (
            <Button
              key={mode}
              variant={localColorMode === mode ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs capitalize"
              onClick={() => setLocalColorMode(mode)}
            >
              {mode}
            </Button>
          ))}
        </div>
        
        {/* Point size slider */}
        <div className="flex items-center gap-3 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Point Size</Label>
          <Slider
            value={[localPointSize * 100]}
            onValueChange={([v]) => setLocalPointSize(v / 100)}
            min={1}
            max={15}
            step={0.5}
            className="w-24"
          />
        </div>
      </div>
      
      {/* Navigation hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/60 backdrop-blur-sm rounded-lg px-3 py-1.5 pointer-events-none">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Move3D className="w-3 h-3" />
          Drag to rotate • Scroll to zoom • Shift+drag to pan
        </p>
      </div>
    </div>
  );
}

// Demo/placeholder point cloud for testing
export function generateDemoPointCloud(count: number = 10000): Point[] {
  const points: Point[] = [];
  
  // Generate a dome-like structure (simplified vault)
  const surfacePoints = Math.floor(count * 0.85);
  const ribPoints = count - surfacePoints;
  
  // Main dome surface
  for (let i = 0; i < surfacePoints; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI / 2.2;
    const r = 5 + (Math.random() - 0.5) * 0.15;
    
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    
    points.push({
      x,
      y,
      z,
      r: 139 + Math.floor(Math.random() * 30),
      g: 115 + Math.floor(Math.random() * 25),
      b: 85 + Math.floor(Math.random() * 20),
      intensity: 0.5 + Math.random() * 0.4,
    });
  }
  
  // Add vault ribs
  const ribAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const pointsPerRib = Math.floor(ribPoints / ribAngles.length);
  
  ribAngles.forEach(angleDeg => {
    const angle = angleDeg * Math.PI / 180;
    
    for (let i = 0; i < pointsPerRib; i++) {
      const t = Math.random() * Math.PI / 2;
      const r = 5.08 + (Math.random() - 0.5) * 0.04;
      
      // Rib width variation
      const widthOffset = (Math.random() - 0.5) * 0.15;
      const perpAngle = angle + Math.PI / 2;
      
      const x = r * Math.sin(t) * Math.cos(angle) + widthOffset * Math.cos(perpAngle);
      const y = r * Math.sin(t) * Math.sin(angle) + widthOffset * Math.sin(perpAngle);
      const z = r * Math.cos(t);
      
      points.push({
        x,
        y,
        z,
        r: 170 + Math.floor(Math.random() * 15),
        g: 140 + Math.floor(Math.random() * 15),
        b: 110 + Math.floor(Math.random() * 15),
        intensity: 0.8 + Math.random() * 0.15,
      });
    }
  });
  
  return points;
}
