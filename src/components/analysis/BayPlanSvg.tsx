import { forwardRef } from "react";
import type { ReferencePoint, RoiBox } from "@/lib/report/geometry2dReport";

interface BayPlanSvgProps {
  imageDataUrl: string | null;
  roi: RoiBox | null;
  referencePoints: ReferencePoint[];
}

export const BayPlanSvg = forwardRef<SVGSVGElement, BayPlanSvgProps>(function BayPlanSvg(
  { imageDataUrl, roi, referencePoints },
  ref
) {
  // The store persists ROI and reference points in normalised (0-1) UV space.
  // The viewBox is set to the ROI rectangle so the SVG crops the projection.
  const vbX = roi?.x ?? 0;
  const vbY = roi?.y ?? 0;
  const vbW = roi?.width ?? 1;
  const vbH = roi?.height ?? 1;
  const aspect = vbH > 0 ? vbW / vbH : 1;

  const radius = Math.max(vbW, vbH) * 0.014;
  const fontSize = Math.max(vbW, vbH) * 0.04;

  return (
    <svg
      ref={ref}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="block w-full"
      style={{ aspectRatio: aspect, maxHeight: "70vh" }}
    >
      {imageDataUrl ? (
        <image href={imageDataUrl} x={0} y={0} width={1} height={1} preserveAspectRatio="none" />
      ) : (
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#f4f4f5" />
      )}

      {roi && (
        <rect
          x={vbX}
          y={vbY}
          width={vbW}
          height={vbH}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={radius * 0.18}
          strokeDasharray={`${radius * 0.5} ${radius * 0.4}`}
          opacity={0.7}
        />
      )}

      {referencePoints.map((p) => (
        <g key={p.letter}>
          <circle
            cx={p.u}
            cy={p.v}
            r={radius}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={radius * 0.25}
          />
          <text
            x={p.u + radius * 1.6}
            y={p.v - radius * 0.3}
            fontSize={fontSize}
            fontWeight={700}
            fontFamily="Georgia, serif"
            fill="#111827"
            stroke="#ffffff"
            strokeWidth={fontSize * 0.18}
            paintOrder="stroke"
          >
            {p.letter}
          </text>
        </g>
      ))}
    </svg>
  );
});
