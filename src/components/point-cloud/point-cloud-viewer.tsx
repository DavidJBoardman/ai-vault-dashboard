"use client";

import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Grid, Stats, Html } from "@react-three/drei";
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

export interface Line3D {
  id: string;
  label: string;
  color: string;
  points: Array<{ x: number; y: number; z: number }>;
  // Optional: For rendering true mathematical arcs
  arc?: {
    center: { x: number; y: number; z: number };
    radius: number;
    startAngle: number;
    endAngle: number;
    // Basis vectors for the arc plane
    u: { x: number; y: number; z: number };
    v: { x: number; y: number; z: number };
  };
}

export interface ExclusionBoxProps {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  enabled: boolean;
}

export interface RibLabel {
  id: string;
  label: string;
  /** Data-space coordinates — Y/Z will be swapped to match the viewer's orientation */
  position: { x: number; y: number; z: number };
}

export interface BossStoneMarker {
  id: string;
  label: string;
  groupId: string;
  color: string;
  /** Real-world X coordinate (data space, same convention as point cloud) */
  x: number;
  y: number;
  z: number;
}

interface PointCloudViewerProps {
  points: Point[];
  lines?: Line3D[];
  showLines?: boolean;
  colorMode?: "rgb" | "intensity" | "height" | "uniform";
  pointSize?: number;
  lineWidth?: number;
  className?: string;
  showGrid?: boolean;
  showBoundingBox?: boolean;
  showStats?: boolean;
  // Exclusion visualization
  floorPlaneZ?: number;
  showFloorPlane?: boolean;
  exclusionBox?: ExclusionBoxProps;
  showExclusionBox?: boolean;
  ribLabels?: RibLabel[];
  selectedLabelId?: string | null;
  selectedLabelIds?: string[];
  onLabelClick?: (id: string) => void;
  onLineClick?: (ribId: string) => void;
  /** Full rib paths used for click hit-areas (one tube per rib, not per segment) */
  ribPaths?: Array<{ id: string; points: Array<{ x: number; y: number; z: number }> }>;
  /** 3D sphere markers for boss stones / keystones (purely visual, for orientation) */
  bossStoneMarkers?: BossStoneMarker[];
  showBossStones?: boolean;
  /** When false, hides only the text labels; spheres remain visible */
  showBossStoneLabels?: boolean;
  selectedBossStoneId?: string | null;
  onBossStoneClick?: (id: string) => void;
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

function Lines3D({ lines, lineWidth = 0.03 }: { lines: Line3D[]; lineWidth?: number }) {
  const getTubeSegments = (pointCount: number, maxSegments: number = 128) =>
    Math.min(maxSegments, Math.max(8, pointCount * 2));

  return (
    <group>
      {lines.map((line) => {
        if (line.points.length < 2) return null;
        
        // Parse hex color to THREE.Color
        const color = new THREE.Color(line.color);
        const sphereRadius = lineWidth * 2;
        
        // If arc parameters are provided, render a true mathematical arc
        if (line.arc) {
          const { center, radius, startAngle, endAngle, u, v } = line.arc;
          
          // Create a parametric curve for the arc
          class ArcCurve extends THREE.Curve<THREE.Vector3> {
            center: { x: number; y: number; z: number };
            radius: number;
            startAngle: number;
            endAngle: number;
            u: { x: number; y: number; z: number };
            v: { x: number; y: number; z: number };

            constructor(
              center: { x: number; y: number; z: number },
              radius: number,
              startAngle: number,
              endAngle: number,
              u: { x: number; y: number; z: number },
              v: { x: number; y: number; z: number }
            ) {
              super();
              this.center = center;
              this.radius = radius;
              this.startAngle = startAngle;
              this.endAngle = endAngle;
              this.u = u;
              this.v = v;
            }

            getPoint(t: number): THREE.Vector3 {
              let sweep = this.endAngle - this.startAngle;
              const twoPi = Math.PI * 2;

              // Keep traced direction, but guard against accidental multi-turn spans.
              if (!Number.isFinite(sweep)) {
                sweep = 0;
              } else if (Math.abs(sweep) > twoPi) {
                sweep = sweep % twoPi;
              }

              const angle = this.startAngle + t * sweep;
              const x = this.center.x + this.radius * (Math.cos(angle) * this.u.x + Math.sin(angle) * this.v.x);
              const y = this.center.y + this.radius * (Math.cos(angle) * this.u.y + Math.sin(angle) * this.v.y);
              const z = this.center.z + this.radius * (Math.cos(angle) * this.u.z + Math.sin(angle) * this.v.z);
              return new THREE.Vector3(x, z, y); // Swap Y/Z for orientation
            }
          }
          
          const arcCurve = new ArcCurve(center, radius, startAngle, endAngle, u, v);
          
          return (
            <group key={line.id}>
              {/* Main arc tube */}
              <mesh>
                <tubeGeometry args={[arcCurve, 64, lineWidth, 8, false]} />
                <meshBasicMaterial color={color} />
              </mesh>
              {/* Glow effect */}
              <mesh>
                <tubeGeometry args={[arcCurve, 64, lineWidth * 1.5, 8, false]} />
                <meshBasicMaterial color={color} transparent opacity={0.3} />
              </mesh>
              {/* Start sphere */}
              <mesh position={[line.points[0].x, line.points[0].z, line.points[0].y]}>
                <sphereGeometry args={[sphereRadius, 16, 16]} />
                <meshBasicMaterial color={color} />
              </mesh>
              {/* End sphere */}
              <mesh position={[
                line.points[line.points.length - 1].x,
                line.points[line.points.length - 1].z,
                line.points[line.points.length - 1].y
              ]}>
                <sphereGeometry args={[sphereRadius, 16, 16]} />
                <meshBasicMaterial color={color} />
              </mesh>
            </group>
          );
        }
        
        // Fallback: use CatmullRomCurve3 for regular line rendering
        const points: THREE.Vector3[] = line.points.map(
          (p) => new THREE.Vector3(p.x, p.z, p.y) // Swap Y/Z for correct orientation
        );
        const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
        const segments = getTubeSegments(line.points.length);

        return (
          <group key={line.id}>
            {/* Main line using tube geometry for thickness */}
            <mesh>
              <tubeGeometry args={[curve, segments, lineWidth, 8, false]} />
              <meshBasicMaterial color={color} />
            </mesh>
            {/* Glow/highlight effect */}
            <mesh>
              <tubeGeometry args={[curve, segments, lineWidth * 1.5, 8, false]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} />
            </mesh>
            {/* Start sphere */}
            <mesh position={[line.points[0].x, line.points[0].z, line.points[0].y]}>
              <sphereGeometry args={[sphereRadius, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
            {/* End sphere */}
            <mesh position={[
              line.points[line.points.length - 1].x,
              line.points[line.points.length - 1].z,
              line.points[line.points.length - 1].y
            ]}>
              <sphereGeometry args={[sphereRadius, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * One invisible wide tube per rib — the only raycasting targets for click/hover.
 * Keeps raycasting cost at O(ribs) instead of O(ribs × segments).
 */
function RibHitAreas({
  ribPaths,
  lineWidth,
  onLineClick,
}: {
  ribPaths: Array<{ id: string; points: Array<{ x: number; y: number; z: number }> }>;
  lineWidth: number;
  onLineClick?: (ribId: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const getTubeSegments = (pointCount: number, maxSegments: number = 96) =>
    Math.min(maxSegments, Math.max(8, pointCount * 2));

  return (
    <group>
      {ribPaths.map((rib) => {
        if (rib.points.length < 2) return null;
        const pts = rib.points.map((p) => new THREE.Vector3(p.x, p.z, p.y));
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
        const segs = getTubeSegments(rib.points.length);
        const isHovered = hoveredId === rib.id;
        return (
          <mesh
            key={rib.id}
            onClick={(e) => { e.stopPropagation(); onLineClick?.(rib.id); }}
            onPointerOver={(e) => { e.stopPropagation(); setHoveredId(rib.id); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { setHoveredId(null); document.body.style.cursor = "default"; }}
          >
            <tubeGeometry args={[curve, segs, lineWidth * 6, 6, false]} />
            <meshBasicMaterial
              transparent
              opacity={isHovered ? 0.18 : 0}
              color="#ffffff"
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
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

function FloorPlane({ 
  z, 
  size = 50,
  center = { x: 0, y: 0 }
}: { 
  z: number; 
  size?: number;
  center?: { x: number; y: number };
}) {
  // Note: Y and Z are swapped in the viewer, so floor plane at Z becomes Y position
  return (
    <group position={[center.x, z, center.y]}>
      {/* Main semi-transparent plane - more visible */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial 
          color="#ff3333" 
          transparent 
          opacity={0.25} 
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Grid pattern for visibility */}
      <gridHelper 
        args={[size, 10, "#ff0000", "#ff4444"]} 
        position={[0, 0.01, 0]}
      />
      
      {/* Edge highlight ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[size / 2 - 0.5, size / 2, 64]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Center crosshair for reference */}
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[size * 0.02, 0.05, size]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[size, 0.05, size * 0.02]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.5} />
      </mesh>
      
      {/* "FLOOR" indicator pillars at corners */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx * size * 0.45, 0.5, dz * size * 0.45]}>
          <cylinderGeometry args={[0.1, 0.1, 1, 8]} />
          <meshBasicMaterial color="#ff0000" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function ExclusionBoxVisual({ 
  box 
}: { 
  box: ExclusionBoxProps;
}) {
  const center = useMemo(() => ({
    x: (box.minX + box.maxX) / 2,
    y: (box.minZ + box.maxZ) / 2, // Swap Y/Z
    z: (box.minY + box.maxY) / 2,
  }), [box]);
  
  const size = useMemo(() => ({
    x: Math.max(0.1, box.maxX - box.minX),
    y: Math.max(0.1, box.maxZ - box.minZ), // Swap Y/Z
    z: Math.max(0.1, box.maxY - box.minY),
  }), [box]);
  
  if (!box.enabled) return null;
  
  return (
    <group position={[center.x, center.y, center.z]}>
      {/* Semi-transparent box - more visible */}
      <mesh>
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshBasicMaterial 
          color="#ff0000" 
          transparent 
          opacity={0.15}
        />
      </mesh>
      
      {/* Wireframe edges - thicker appearance */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
        <lineBasicMaterial color="#ff0000" opacity={1} transparent={false} />
      </lineSegments>
      
      {/* Corner spheres for visibility */}
      {[
        [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
        [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1]
      ].map(([dx, dy, dz], i) => (
        <mesh key={i} position={[dx * size.x / 2, dy * size.y / 2, dz * size.z / 2]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
      ))}
      
      {/* Face X markers */}
      <mesh position={[size.x / 2, 0, 0]}>
        <boxGeometry args={[0.02, size.y * 0.8, size.z * 0.8]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.3} />
      </mesh>
      <mesh position={[-size.x / 2, 0, 0]}>
        <boxGeometry args={[0.02, size.y * 0.8, size.z * 0.8]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function BossStoneMarkers3D({
  markers,
  sphereRadius,
  showLabels = true,
  selectedId,
  onBossStoneClick,
}: {
  markers: BossStoneMarker[];
  sphereRadius: number;
  showLabels?: boolean;
  selectedId?: string | null;
  onBossStoneClick?: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {markers.map((marker) => {
        // Y↔Z swap — same convention applied throughout the viewer
        const threePos: [number, number, number] = [marker.x, marker.z, marker.y];
        const isSelected = selectedId === marker.id;
        const isHovered = hoveredId === marker.id;
        const color = isSelected ? "#88CCFF" : "#4488FF";
        const radius = isSelected || isHovered ? sphereRadius * 1.2 : sphereRadius;
        const labelPos: [number, number, number] = [marker.x, marker.z + radius * 2.5, marker.y];

        return (
          <group key={marker.id}>
            <mesh
              position={threePos}
              onClick={(e) => { e.stopPropagation(); onBossStoneClick?.(marker.id); }}
              onPointerOver={(e) => { e.stopPropagation(); setHoveredId(marker.id); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { setHoveredId(null); document.body.style.cursor = "default"; }}
            >
              <sphereGeometry args={[radius, 16, 12]} />
              <meshBasicMaterial color={color} transparent opacity={isSelected ? 1.0 : isHovered ? 0.95 : 0.9} />
            </mesh>
            {showLabels && <Html
              position={labelPos}
              center
              distanceFactor={8}
              zIndexRange={[90, 0]}
            >
              <div
                onClick={() => onBossStoneClick?.(marker.id)}
                onMouseEnter={() => setHoveredId(marker.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: "2px 6px",
                  borderRadius: "9999px",
                  fontSize: "10px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  cursor: "pointer",
                  background: isSelected ? "rgba(68,136,255,0.2)" : "rgba(10,15,26,0.8)",
                  color: "#f0f0f0",
                  border: `1px solid ${color}`,
                }}
              >
                {marker.label}
              </div>
            </Html>}
          </group>
        );
      })}
    </>
  );
}

function RibLabelsOverlay({
  labels,
  selectedIds,
  onLabelClick,
}: {
  labels: RibLabel[];
  selectedIds?: string[];
  onLabelClick?: (id: string) => void;
}) {
  const selectedIdSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  return (
    <>
      {labels.map((label) => {
        const isSelected = selectedIdSet.has(label.id);
        return (
          <Html
            key={label.id}
            position={[label.position.x, label.position.z, label.position.y]}
            center
            distanceFactor={8}
            zIndexRange={[100, 0]}
          >
            <div
              onClick={() => onLabelClick?.(label.id)}
              style={{
                cursor: "pointer",
                padding: "2px 8px",
                borderRadius: "9999px",
                fontSize: "11px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                userSelect: "none",
                background: isSelected
                  ? "rgba(255,255,255,0.95)"
                  : "rgba(10,15,26,0.75)",
                color: isSelected ? "#0a0f1a" : "#e2e8f0",
                border: isSelected
                  ? "1.5px solid rgba(255,255,255,1)"
                  : "1px solid rgba(255,255,255,0.25)",
                boxShadow: isSelected
                  ? "0 0 0 3px rgba(255,255,255,0.2)"
                  : "none",
                transition: "all 0.15s ease",
              }}
            >
              {label.label}
            </div>
          </Html>
        );
      })}
    </>
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
  lines = [],
  showLines = true,
  colorMode = "height",
  pointSize = 0.02,
  lineWidth = 0.03,
  className = "",
  showGrid = true,
  showBoundingBox = true,
  showStats = false,
  floorPlaneZ,
  showFloorPlane = false,
  exclusionBox,
  showExclusionBox = false,
  ribLabels,
  selectedLabelId,
  selectedLabelIds,
  onLabelClick,
  onLineClick,
  ribPaths,
  bossStoneMarkers,
  showBossStones = true,
  showBossStoneLabels = true,
  selectedBossStoneId,
  onBossStoneClick,
}: PointCloudViewerProps) {
  const [localColorMode, setLocalColorMode] = useState(colorMode);
  const [localPointSize, setLocalPointSize] = useState(pointSize);
  const [resetKey, setResetKey] = useState(0);
  const resolvedSelectedLabelIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedLabelId) {
      ids.add(selectedLabelId);
    }
    selectedLabelIds?.forEach((id) => {
      if (id) {
        ids.add(id);
      }
    });
    return Array.from(ids);
  }, [selectedLabelId, selectedLabelIds]);
  
  // Calculate center for camera target
  const { center, cameraDistance, gridPos, minZ, bossStoneRadius } = useMemo(() => {
    if (points.length === 0) {
      return { 
        center: { x: 0, y: 0, z: 0 }, 
        cameraDistance: 10,
        gridPos: { x: 0, y: 0, z: 0 },
        minZ: 0,
        bossStoneRadius: 0.2,
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
    const diagonal = Math.sqrt(rangeX ** 2 + rangeY ** 2 + rangeZ ** 2);
    
    return {
      center,
      cameraDistance: maxRange * 1.5,
      gridPos: { x: center.x, y: minZ - 0.1, z: center.z },
      minZ,
      bossStoneRadius: Math.max(diagonal / 60, 0.05),
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
        
        {showLines && lines.length > 0 && <Lines3D lines={lines} lineWidth={lineWidth} />}

        {ribPaths && ribPaths.length > 0 && onLineClick && (
          <RibHitAreas ribPaths={ribPaths} lineWidth={lineWidth} onLineClick={onLineClick} />
        )}
        
        {showFloorPlane && floorPlaneZ !== undefined && (
          <FloorPlane 
            z={floorPlaneZ} 
            size={cameraDistance * 1.5} 
            center={{ x: center.x, y: center.z }}
          />
        )}
        
        {showExclusionBox && exclusionBox && (
          <ExclusionBoxVisual box={exclusionBox} />
        )}

        {ribLabels && ribLabels.length > 0 && (
          <RibLabelsOverlay
            labels={ribLabels}
            selectedIds={resolvedSelectedLabelIds}
            onLabelClick={onLabelClick}
          />
        )}

        {bossStoneMarkers && bossStoneMarkers.length > 0 && (
          <BossStoneMarkers3D
            markers={bossStoneMarkers}
            sphereRadius={bossStoneRadius}
            showLabels={showBossStoneLabels}
            selectedId={selectedBossStoneId}
            onBossStoneClick={onBossStoneClick}
          />
        )}
        
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
      
      {/* Top bar */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-center">
        {/* Reset button */}
        <Button
          variant="secondary"
          size="icon"
          className="h-7 w-7 bg-background/80 backdrop-blur-sm"
          onClick={handleReset}
          title="Reset camera"
        >
          <Home className="w-3.5 h-3.5" />
        </Button>
        
        {/* Stats overlay */}
        <div className="bg-background/80 backdrop-blur-sm rounded px-2 py-1">
          <p className="text-[10px] text-muted-foreground">
            {points.length.toLocaleString()} pts
          </p>
        </div>
      </div>
      
      {/* Controls Overlay - stacked layout to avoid overlap */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-2 pointer-events-none">
        {/* Navigation hint - top of bottom controls */}
        <div className="flex justify-center pointer-events-none">
          <div className="bg-background/60 backdrop-blur-sm rounded px-2 py-1">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Move3D className="w-3 h-3" />
              Drag to rotate • Scroll to zoom • Shift+drag to pan
            </p>
          </div>
        </div>
        
        {/* Controls row */}
        <div className="flex items-center justify-between gap-2 pointer-events-auto">
          {/* Color mode buttons */}
          <div className="flex gap-0.5 bg-background/80 backdrop-blur-sm rounded-lg p-0.5">
            {(["height", "rgb", "intensity"] as const).map((mode) => (
              <Button
                key={mode}
                variant={localColorMode === mode ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px] capitalize"
                onClick={() => setLocalColorMode(mode)}
              >
                {mode === "intensity" ? "int" : mode}
              </Button>
            ))}
          </div>
          
          {/* Point size slider */}
          <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg px-2 py-1">
            <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Size</Label>
            <Slider
              value={[localPointSize * 100]}
              onValueChange={([v]) => setLocalPointSize(v / 100)}
              min={1}
              max={15}
              step={0.5}
              className="w-16"
            />
          </div>
        </div>
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
