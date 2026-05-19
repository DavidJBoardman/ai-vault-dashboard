import { forwardRef, useEffect, useState } from "react";
import type {
  ImageSize,
  ReconstructEdge,
  ReconstructIdealNode,
  ReconstructNode,
  ReferencePoint,
  RoiBox,
} from "@/lib/report/geometry2dReport";

interface BayPlanSvgProps {
  imageDataUrl: string | null;
  roi: RoiBox | null;
  referencePoints: ReferencePoint[];
  reconstructNodes: ReconstructNode[];
  reconstructIdealNodes: ReconstructIdealNode[];
  reconstructEdges: ReconstructEdge[];
  imageSize: ImageSize;
  showBackground: boolean;
  showIdealisedOverlay: boolean;
}

function idealPosition(
  index: number,
  measured: ReconstructNode[],
  ideal: ReconstructIdealNode[]
): { x: number; y: number; label: string } | null {
  const measuredNode = measured[index];
  const idealNode = ideal[index];
  if (idealNode && idealNode.x !== null && idealNode.y !== null) {
    return { x: idealNode.x, y: idealNode.y, label: idealNode.label || measuredNode?.label || "" };
  }
  if (measuredNode) {
    return { x: measuredNode.x, y: measuredNode.y, label: measuredNode.label };
  }
  return null;
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

const VIEWBOX_MARGIN = 1.15;

export const BayPlanSvg = forwardRef<SVGSVGElement, BayPlanSvgProps>(function BayPlanSvg(
  {
    imageDataUrl,
    roi,
    referencePoints,
    reconstructNodes,
    reconstructIdealNodes,
    reconstructEdges,
    imageSize,
    showBackground,
    showIdealisedOverlay,
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

  const vbW = (roi?.width ?? imgW) * VIEWBOX_MARGIN;
  const vbH = (roi?.height ?? imgH) * VIEWBOX_MARGIN;
  const bbox = {
    x: cx - vbW / 2,
    y: cy - vbH / 2,
    width: vbW,
    height: vbH,
  };
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

        {useReconstruct && showIdealisedOverlay && reconstructIdealNodes.length > 0 && (
          <g opacity={0.85}>
            {reconstructEdges.map((edge, i) => {
              const a = idealPosition(edge.a, reconstructNodes, reconstructIdealNodes);
              const b = idealPosition(edge.b, reconstructNodes, reconstructIdealNodes);
              if (!a || !b) return null;
              return (
                <line
                  key={`ideal-edge-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#a855f7"
                  strokeWidth={edgeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${edgeWidth * 4} ${edgeWidth * 3}`}
                />
              );
            })}
            {reconstructIdealNodes.map((_, i) => {
              const pos = idealPosition(i, reconstructNodes, reconstructIdealNodes);
              if (!pos) return null;
              return (
                <circle
                  key={`ideal-node-${i}`}
                  cx={pos.x}
                  cy={pos.y}
                  r={radius * 0.75}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth={radius * 0.3}
                />
              );
            })}
          </g>
        )}

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
