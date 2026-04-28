import { forwardRef, useEffect, useState } from "react";
import type { ImageSize, ReferencePoint, RoiBox } from "@/lib/report/geometry2dReport";

interface BayPlanSvgProps {
  imageDataUrl: string | null;
  roi: RoiBox | null;
  referencePoints: ReferencePoint[];
  imageSize: ImageSize;
}

export const BayPlanSvg = forwardRef<SVGSVGElement, BayPlanSvgProps>(function BayPlanSvg(
  { imageDataUrl, roi, referencePoints, imageSize },
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

  const vbX = roi?.x ?? 0;
  const vbY = roi?.y ?? 0;
  const vbW = roi?.width ?? imgW;
  const vbH = roi?.height ?? imgH;
  const aspect = vbH > 0 ? vbW / vbH : 1;

  const radius = Math.max(vbW, vbH) * 0.012;
  const fontSize = Math.max(vbW, vbH) * 0.026;

  return (
    <svg
      ref={ref}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="mx-auto block w-full"
      style={{ aspectRatio: aspect, maxHeight: "32rem", maxWidth: `${aspect * 32}rem` }}
    >
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

      {referencePoints.map((p) => (
        <g key={p.letter}>
          <circle
            cx={p.x}
            cy={p.y}
            r={radius}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={radius * 0.25}
          />
          <text
            x={p.x + radius * 1.4}
            y={p.y - radius * 0.4}
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
