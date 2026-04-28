import { forwardRef, useEffect, useState } from "react";
import type {
  ImageSize,
  ReconstructEdge,
  ReconstructNode,
  ReferencePoint,
  RoiBox,
} from "@/lib/report/geometry2dReport";

interface BayPlanSvgProps {
  imageDataUrl: string | null;
  roi: RoiBox | null;
  referencePoints: ReferencePoint[];
  reconstructNodes: ReconstructNode[];
  reconstructEdges: ReconstructEdge[];
  imageSize: ImageSize;
  showBackground: boolean;
}

const EDGE_CONSTRAINT = "#0ea5e9";
const EDGE_AUTO = "#f59e0b";
const EDGE_MANUAL = "#facc15";
const NODE_FILL = "#ffffff";
const NODE_STROKE = "#0ea5e9";

function nodeForEdgeIndex(
  nodes: ReconstructNode[],
  index: number
): ReconstructNode | undefined {
  if (index >= 0 && index < nodes.length) return nodes[index];
  return nodes.find((n) => n.id === String(index));
}

function rotatedImageBbox(
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  rotationDeg: number,
): { x: number; y: number; width: number; height: number } {
  const theta = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const corners = [
    [0, 0],
    [imgW, 0],
    [imgW, imgH],
    [0, imgH],
  ].map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  });
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const BayPlanSvg = forwardRef<SVGSVGElement, BayPlanSvgProps>(function BayPlanSvg(
  {
    imageDataUrl,
    roi,
    referencePoints,
    reconstructNodes,
    reconstructEdges,
    imageSize,
    showBackground,
  },
  ref
) {
  const [natural, setNatural] = useState<ImageSize | null>(null);

  useEffect(() => {
    if (!imageDataUrl) {
      setNatural(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setNatural(null);
    };
    img.src = imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [imageDataUrl]);

  const imgW = natural?.width ?? imageSize.width;
  const imgH = natural?.height ?? imageSize.height;

  const cx = roi ? roi.x + roi.width / 2 : imgW / 2;
  const cy = roi ? roi.y + roi.height / 2 : imgH / 2;
  const rotation = roi?.rotation ?? 0;

  const bbox = rotatedImageBbox(imgW, imgH, cx, cy, rotation);
  const aspect = bbox.height > 0 ? bbox.width / bbox.height : 1;

  const refScale = Math.max(bbox.width, bbox.height);
  const radius = refScale * 0.012;
  const fontSize = refScale * 0.026;
  const edgeWidth = refScale * 0.004;

  const useReconstruct = reconstructNodes.length > 0;
  const points: Array<{ x: number; y: number; label: string }> = useReconstruct
    ? reconstructNodes.map((n) => ({ x: n.x, y: n.y, label: n.label }))
    : referencePoints.map((p) => ({ x: p.x, y: p.y, label: p.letter }));

  return (
    <svg
      ref={ref}
      viewBox={`${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="mx-auto block w-full"
      style={{ aspectRatio: aspect, maxHeight: "32rem", maxWidth: `${aspect * 32}rem` }}
    >
      <g transform={`rotate(${-rotation} ${cx} ${cy})`}>
        {showBackground && imageDataUrl && (
          <image
            href={imageDataUrl}
            x={0}
            y={0}
            width={imgW}
            height={imgH}
            preserveAspectRatio="none"
          />
        )}

        {useReconstruct &&
          reconstructEdges.map((edge, i) => {
            const a = nodeForEdgeIndex(reconstructNodes, edge.a);
            const b = nodeForEdgeIndex(reconstructNodes, edge.b);
            if (!a || !b) return null;
            const stroke = edge.isManual
              ? EDGE_MANUAL
              : edge.isConstraint
                ? EDGE_CONSTRAINT
                : EDGE_AUTO;
            return (
              <line
                key={`edge-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeWidth={edgeWidth}
                strokeLinecap="round"
                opacity={0.85}
              />
            );
          })}

        {points.map((p, i) => (
          <g key={`node-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={radius}
              fill={NODE_FILL}
              stroke={NODE_STROKE}
              strokeWidth={radius * 0.35}
            />
            <text
              x={p.x + radius * 1.4}
              y={p.y - radius * 0.4}
              fontSize={fontSize}
              fontWeight={700}
              fontFamily="Georgia, serif"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={fontSize * 0.18}
              paintOrder="stroke"
            >
              {p.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
});
