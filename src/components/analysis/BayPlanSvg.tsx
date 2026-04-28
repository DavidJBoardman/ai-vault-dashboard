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
  const byId = nodes.find((n) => n.id === String(index));
  return byId;
}

export const BayPlanSvg = forwardRef<SVGSVGElement, BayPlanSvgProps>(function BayPlanSvg(
  {
    imageDataUrl,
    roi,
    referencePoints,
    reconstructNodes,
    reconstructEdges,
    imageSize,
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
  const vbX = roi?.x ?? 0;
  const vbY = roi?.y ?? 0;
  const vbW = roi?.width ?? imgW;
  const vbH = roi?.height ?? imgH;
  const rotation = roi?.rotation ?? 0;
  const aspect = vbH > 0 ? vbW / vbH : 1;

  const radius = Math.max(vbW, vbH) * 0.012;
  const fontSize = Math.max(vbW, vbH) * 0.026;
  const edgeWidth = Math.max(vbW, vbH) * 0.004;

  const useReconstruct = reconstructNodes.length > 0;
  const nodes = useReconstruct ? reconstructNodes : null;
  const points: Array<{ x: number; y: number; label: string }> = useReconstruct
    ? reconstructNodes.map((n) => ({ x: n.x, y: n.y, label: n.label }))
    : referencePoints.map((p) => ({ x: p.x, y: p.y, label: p.letter }));

  return (
    <svg
      ref={ref}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="mx-auto block w-full"
      style={{ aspectRatio: aspect, maxHeight: "32rem", maxWidth: `${aspect * 32}rem` }}
    >
      <g transform={`rotate(${-rotation} ${cx} ${cy})`}>
        {imageDataUrl ? (
          <image
            href={imageDataUrl}
            x={0}
            y={0}
            width={imgW}
            height={imgH}
            preserveAspectRatio="none"
          />
        ) : (
          <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#f4f4f5" />
        )}

        {nodes &&
          reconstructEdges.map((edge, i) => {
            const a = nodeForEdgeIndex(nodes, edge.a);
            const b = nodeForEdgeIndex(nodes, edge.b);
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
