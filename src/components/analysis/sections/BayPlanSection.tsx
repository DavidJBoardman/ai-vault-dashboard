"use client";

import { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";
import { BayPlanSvg } from "@/components/analysis/BayPlanSvg";

interface Props {
  data: ReportData;
}

export const BayPlanSection = forwardRef<SVGSVGElement, Props>(function BayPlanSection(
  { data },
  ref
) {
  const { referencePoints, projectionImageDataUrl, roi, imageSize, reconstruct } = data;
  const [showBackground, setShowBackground] = useState(true);

  const hasContent = referencePoints.length > 0 || reconstruct.nodes.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold">Bay plan preview</h2>
          <p className="text-sm text-muted-foreground">
            Reconstructed ribs over the projection, oriented to the saved ROI.
          </p>
        </div>
        {hasContent && projectionImageDataUrl && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBackground((v) => !v)}
            className="print:hidden"
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
              reconstructEdges={reconstruct.edges}
              imageSize={imageSize}
              showBackground={showBackground}
            />
          </div>
          <figcaption className="text-center text-xs text-muted-foreground">
            Bay plan · {reconstruct.nodes.length || referencePoints.length} nodes ·{" "}
            {reconstruct.edges.length} ribs
          </figcaption>
        </figure>
      )}
    </section>
  );
});
