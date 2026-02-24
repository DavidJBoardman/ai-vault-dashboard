"use client";

import { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, RefreshCw } from "lucide-react";

import { Segmentation } from "@/lib/store";
import { IntradosLine } from "@/lib/api";
import { toImageSrc } from "@/lib/utils";

type ImageViewType = "colour" | "depthGrayscale" | "depthPlasma";

interface ROIState {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface ProjectionCanvasProps {
  selectedProjection: { settings?: { perspective?: string; resolution?: number } } | null;
  selectedImageType: ImageViewType;
  onImageTypeChange: (type: ImageViewType) => void;
  currentImage: string | undefined | null;
  canvasRef: RefObject<HTMLDivElement>;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp: React.MouseEventHandler<HTMLDivElement>;
  showMaskOverlay: boolean;
  visibleMasks: Segmentation[];
  overlayOpacity: number;
  showROI: boolean;
  roi: ROIState;
  originalRoi?: ROIState | null;
  correctedRoi?: ROIState | null;
  showOriginalOverlay?: boolean;
  showUpdatedOverlay?: boolean;
  showIntrados: boolean;
  intradosLines: IntradosLine[];
  isAnalysing: boolean;
}

export function ProjectionCanvas({
  selectedProjection,
  selectedImageType,
  onImageTypeChange,
  currentImage,
  canvasRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  showMaskOverlay,
  visibleMasks,
  overlayOpacity,
  showROI,
  roi,
  originalRoi,
  correctedRoi,
  showOriginalOverlay,
  showUpdatedOverlay,
  showIntrados,
  intradosLines,
  isAnalysing,
}: ProjectionCanvasProps) {
  const showOriginalComparison = !!(showOriginalOverlay && originalRoi);
  const showUpdatedComparison = !!(showUpdatedOverlay && correctedRoi);
  const showComparisonLegend = showOriginalComparison || showUpdatedComparison;
  const showAnyRoiLayer = showROI || showOriginalComparison || showUpdatedComparison;

  const renderRoiOutline = (
    value: ROIState,
    stroke: string,
    strokeDasharray = "1 0.5",
    strokeWidth = "0.3",
    withGlow = false,
    fill = "none",
    markerColor?: string
  ) => (
    <g transform={`rotate(${value.rotation} ${value.x * 100} ${value.y * 100})`}>
      {withGlow && (
        <rect
          x={(value.x - value.width / 2) * 100}
          y={(value.y - value.height / 2) * 100}
          width={value.width * 100}
          height={value.height * 100}
          fill="none"
          stroke={stroke}
          strokeWidth="0.9"
          opacity="0.3"
        />
      )}
      <rect
        x={(value.x - value.width / 2) * 100}
        y={(value.y - value.height / 2) * 100}
        width={value.width * 100}
        height={value.height * 100}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />
      {markerColor && (
        <>
          <rect
            x={(value.x - value.width / 2) * 100 - 0.55}
            y={(value.y - value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
          <rect
            x={(value.x + value.width / 2) * 100 - 0.55}
            y={(value.y - value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
          <rect
            x={(value.x + value.width / 2) * 100 - 0.55}
            y={(value.y + value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
          <rect
            x={(value.x - value.width / 2) * 100 - 0.55}
            y={(value.y + value.height / 2) * 100 - 0.55}
            width="1.1"
            height="1.1"
            fill={markerColor}
            stroke="white"
            strokeWidth="0.25"
          />
        </>
      )}
    </g>
  );

  return (
    <div className="lg:col-span-6">
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display">Projection Preview</CardTitle>
              <CardDescription>
                {selectedProjection?.settings?.perspective || "bottom"} view • {selectedProjection?.settings?.resolution || 2048}px
              </CardDescription>
            </div>

            <div className="flex gap-1">
              {(["colour", "depthGrayscale", "depthPlasma"] as ImageViewType[]).map((type) => (
                <Button
                  key={type}
                  variant={selectedImageType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => onImageTypeChange(type)}
                  className="h-7 text-xs"
                >
                  {type === "colour" ? "RGB" : type === "depthGrayscale" ? "Depth" : "Plasma"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={canvasRef}
            className="relative aspect-square bg-muted/30 rounded-lg overflow-hidden cursor-crosshair"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {currentImage ? (
              <img
                src={toImageSrc(currentImage)}
                alt="Projection"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No projection image available</p>
                </div>
              </div>
            )}

            {showMaskOverlay &&
              visibleMasks.map((mask) => (
                <img
                  key={mask.id}
                  src={toImageSrc(mask.mask)}
                  alt={mask.label}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ opacity: overlayOpacity }}
                />
              ))}

            {showAnyRoiLayer && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {showOriginalComparison && originalRoi && renderRoiOutline(originalRoi, "#00e5ff", "0.9 0.7", "0.28", true)}
                {showUpdatedComparison && correctedRoi && (
                  renderRoiOutline(correctedRoi, "#ff2f2f", "none", "0.52", true, "rgba(255,47,47,0.12)", "#ff2f2f")
                )}
                {showComparisonLegend && (
                  <>
                    <g transform="translate(3,3)">
                      <rect x="0" y="0" width="22" height={showOriginalComparison && showUpdatedComparison ? "7.6" : "4.6"} rx="1.2" fill="rgba(0,0,0,0.55)" />
                      {showOriginalComparison && (
                        <>
                          <line x1="1.2" y1="2.4" x2="4.3" y2="2.4" stroke="#00e5ff" strokeWidth="0.45" strokeDasharray="0.9 0.7" />
                          <text x="5.1" y="2.8" fill="#f3f4f6" fontSize="1.65">
                            Original
                          </text>
                        </>
                      )}
                      {showUpdatedComparison && (
                        <>
                          <line
                            x1="1.2"
                            y1={showOriginalComparison ? "5.4" : "2.4"}
                            x2="4.3"
                            y2={showOriginalComparison ? "5.4" : "2.4"}
                            stroke="#ff2f2f"
                            strokeWidth="0.65"
                          />
                          <text x="5.1" y={showOriginalComparison ? "5.8" : "2.8"} fill="#f3f4f6" fontSize="1.65">
                            Updated
                          </text>
                        </>
                      )}
                    </g>
                  </>
                )}
                {showROI && (
                  <g transform={`rotate(${roi.rotation} ${roi.x * 100} ${roi.y * 100})`}>
                    <rect
                      x={(roi.x - roi.width / 2) * 100}
                      y={(roi.y - roi.height / 2) * 100}
                      width={roi.width * 100}
                      height={roi.height * 100}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="0.3"
                      strokeDasharray="1 0.5"
                      className="pointer-events-auto cursor-move"
                    />

                    {[
                      [roi.x - roi.width / 2, roi.y - roi.height / 2, "nw"],
                      [roi.x + roi.width / 2, roi.y - roi.height / 2, "ne"],
                      [roi.x + roi.width / 2, roi.y + roi.height / 2, "se"],
                      [roi.x - roi.width / 2, roi.y + roi.height / 2, "sw"],
                    ].map(([x, y, handle]) => (
                      <circle
                        key={handle as string}
                        cx={(x as number) * 100}
                        cy={(y as number) * 100}
                        r="1.2"
                        fill="hsl(var(--primary))"
                        stroke="white"
                        strokeWidth="0.3"
                        className="pointer-events-auto cursor-nwse-resize"
                      />
                    ))}

                    <line
                      x1={roi.x * 100}
                      y1={(roi.y - roi.height / 2) * 100}
                      x2={roi.x * 100}
                      y2={(roi.y - roi.height / 2 - 0.05) * 100}
                      stroke="hsl(var(--primary))"
                      strokeWidth="0.2"
                    />
                    <circle
                      cx={roi.x * 100}
                      cy={(roi.y - roi.height / 2 - 0.05) * 100}
                      r="1"
                      fill="hsl(var(--accent))"
                      stroke="white"
                      strokeWidth="0.3"
                      className="pointer-events-auto cursor-grab"
                    />

                    <circle
                      cx={roi.x * 100}
                      cy={roi.y * 100}
                      r="0.8"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="0.2"
                    />
                  </g>
                )}
              </svg>
            )}

            {showIntrados && intradosLines.length > 0 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${selectedProjection?.settings?.resolution || 2048} ${selectedProjection?.settings?.resolution || 2048}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {intradosLines.map((line) => {
                  if (line.points2d.length < 2) return null;

                  const pathData = line.points2d.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`).join(" ");

                  return (
                    <g key={line.id}>
                      <path
                        d={pathData}
                        fill="none"
                        stroke="black"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.3"
                      />
                      <path
                        d={pathData}
                        fill="none"
                        stroke={line.color}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx={line.points2d[0][0]} cy={line.points2d[0][1]} r="5" fill={line.color} stroke="white" strokeWidth="2" />
                      <circle
                        cx={line.points2d[line.points2d.length - 1][0]}
                        cy={line.points2d[line.points2d.length - 1][1]}
                        r="5"
                        fill={line.color}
                        stroke="white"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
              </svg>
            )}

            {isAnalysing && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">Analysing geometry...</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
