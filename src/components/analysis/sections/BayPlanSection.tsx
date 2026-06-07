"use client";

import { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";
import { BayPlanSvg } from "@/components/analysis/BayPlanSvg";
import { formatMetres } from "@/lib/geometry2d/bayPlanScale";

interface Props {
  data: ReportData;
}

export const BayPlanSection = forwardRef<SVGSVGElement, Props>(function BayPlanSection(
  { data },
  ref
) {
  const { referencePoints, projectionImageDataUrl, roi, imageSize, reconstruct, inputs } = data;
  const roiMetres = inputs.roiMetres;
  const [showBackground, setShowBackground] = useState(true);
  const [showIdealised, setShowIdealised] = useState(false);

  const hasContent = referencePoints.length > 0 || reconstruct.nodes.length > 0;
  const hasIdealised = reconstruct.nodesIdeal.some((n) => n.x !== null && n.y !== null);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold">Bay plan preview</h2>
          <p className="text-sm text-muted-foreground">
            Reconstructed ribs over the projection, oriented to the saved ROI.
          </p>
        </div>
        {hasContent && (
          <div className="flex items-center gap-2 print:hidden">
            {hasIdealised && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowIdealised((v) => !v)}
              >
                {showIdealised ? "Hide idealised" : "Show idealised"}
              </Button>
            )}
            {projectionImageDataUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBackground((v) => !v)}
              >
                {showBackground ? (
                  <>
                    <EyeOff className="mr-2 h-3.5 w-3.5" /> Hide background
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-3.5 w-3.5" /> Show background
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {!hasContent ? (
        <p className="text-sm text-muted-foreground">No reference points saved yet.</p>
      ) : (
        <figure className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-black p-2">
            <BayPlanSvg
              ref={ref}
              imageDataUrl={projectionImageDataUrl}
              roi={roi}
              referencePoints={referencePoints}
              reconstructNodes={reconstruct.nodes}
              reconstructIdealNodes={reconstruct.nodesIdeal}
              reconstructEdges={reconstruct.edges}
              imageSize={imageSize}
              showBackground={showBackground}
              showIdealisedOverlay={showIdealised}
            />
          </div>
          <figcaption className="text-center text-xs text-muted-foreground">
            Bay plan · {reconstruct.nodes.length || referencePoints.length} nodes ·{" "}
            {reconstruct.edges.length} ribs
            {roiMetres && (
              <>
                {" · ROI "}
                {formatMetres(roiMetres.width)} × {formatMetres(roiMetres.height)} m
              </>
            )}
          </figcaption>
        </figure>
      )}
    </section>
  );
});
