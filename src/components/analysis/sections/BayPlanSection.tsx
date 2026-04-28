import { forwardRef } from "react";
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

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">Bay plan preview</h2>
        <p className="text-sm text-muted-foreground">
          Projection clipped to the ROI with reference points labelled in save order.
        </p>
      </div>

      {referencePoints.length === 0 && reconstruct.nodes.length === 0 ? (
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
