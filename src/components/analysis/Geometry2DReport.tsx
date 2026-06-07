"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useProjectStore } from "@/lib/store";
import { getCutTypologyCsv } from "@/lib/api/geometry2d";
import { getProjectionImage } from "@/lib/api";
import { resolveGeometry2DProjection } from "@/lib/geometry2d/projectionSelection";
import { toImageSrc } from "@/lib/utils";
import {
  buildBundleZip,
  selectReportData,
  type CutTypologyData,
  type ReportData,
} from "@/lib/report/geometry2dReport";
import { buildReportHtml } from "@/lib/report/buildReportHtml";
import { rasteriseSvgElement } from "@/lib/report/rasteriseBayPlan";
import { ProjectHeader } from "./sections/ProjectHeader";
import { BayProportionSection } from "./sections/BayProportionSection";
import { CutTypologySection } from "./sections/CutTypologySection";
import { BayPlanSection } from "./sections/BayPlanSection";
import { ReportFooter } from "./sections/ReportFooter";
import styles from "./report.module.css";

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Geometry2DReport() {
  const project = useProjectStore((s) => s.currentProject);
  const [cutTypology, setCutTypology] = useState<CutTypologyData | null>(null);
  const [cutTypologyFetchedAt, setCutTypologyFetchedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"none" | "bundle">("none");
  // Projection background fetched as a base64 data URL. A self-contained data
  // URL renders on-screen and also survives the SVG-to-PNG rasterisation used by
  // the bundle export (backend URLs are blocked when an SVG loads as an image).
  const [projectionImageDataUrl, setProjectionImageDataUrl] = useState<string | null>(null);
  const bayPlanSvgRef = useRef<SVGSVGElement>(null);

  const matchingLastRunAt = (project?.steps?.[4]?.data as
    | { geometry2d?: { matching?: { lastRunAt?: string | null } } }
    | undefined)?.geometry2d?.matching?.lastRunAt ?? null;

  const cutTypologyStale = (() => {
    if (!matchingLastRunAt || !cutTypologyFetchedAt) return false;
    const lastRunMs = Date.parse(matchingLastRunAt);
    const fetchedMs = Date.parse(cutTypologyFetchedAt);
    if (!Number.isFinite(lastRunMs) || !Number.isFinite(fetchedMs)) return false;
    return lastRunMs > fetchedMs;
  })();

  useEffect(() => {
    if (!project?.id) return;
    const step4ProjectionId = (project.steps?.[4]?.data as
      | { geometry2d?: { projectionId?: string } }
      | undefined)?.geometry2d?.projectionId;
    let cancelled = false;
    void (async () => {
      try {
        const response = await getCutTypologyCsv(project.id, step4ProjectionId);
        if (cancelled) return;
        if (response.success && response.data) {
          setCutTypology({
            columns: response.data.columns ?? [],
            rows: response.data.rows ?? [],
          });
          setCutTypologyFetchedAt(new Date().toISOString());
        } else {
          setCutTypology({ columns: [], rows: [] });
          setCutTypologyFetchedAt(new Date().toISOString());
        }
      } catch {
        if (!cancelled) {
          setCutTypology({ columns: [], rows: [] });
          setCutTypologyFetchedAt(new Date().toISOString());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.steps]);

  useEffect(() => {
    const projection = resolveGeometry2DProjection({ project, preferStep4Projection: true });
    if (!projection?.id) {
      setProjectionImageDataUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const base64 = await getProjectionImage(projection.id, "colour");
        if (!cancelled) setProjectionImageDataUrl(base64 ? toImageSrc(base64) : null);
      } catch {
        if (!cancelled) setProjectionImageDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  const data = useMemo<ReportData | null>(
    () => selectReportData(project, cutTypology, { projectionImageDataUrl }),
    [project, cutTypology, projectionImageDataUrl]
  );

  if (!data) {
    return <p className="text-sm text-muted-foreground">No project loaded.</p>;
  }

  const handleBundle = async () => {
    setBusy("bundle");
    try {
      let bayPlanPng: Blob | null = null;
      if (bayPlanSvgRef.current) {
        try {
          bayPlanPng = await rasteriseSvgElement(bayPlanSvgRef.current);
        } catch (err) {
          console.warn("Failed to rasterise bay plan:", err);
        }
      }
      const html = buildReportHtml(data, bayPlanPng ? "bay-plan.png" : null);
      const zip = await buildBundleZip({ reportHtml: html, bayPlanPng, data });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(zip, `${slugify(data.projectName)}-2d-report-${date}.zip`);
      toast({
        title: "Bundle exported",
        description: "Saved to your default downloads folder.",
      });
    } catch (err) {
      toast({
        title: "Bundle export failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy("none");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={handleBundle} disabled={busy !== "none"}>
          {busy === "bundle" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download Bundle (.zip)
        </Button>
      </div>

      {cutTypologyStale && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">
          Step 4C was re-run after this report loaded. Refresh the page to pull the updated cut-typology evidence.
        </div>
      )}

      <article
        id="geometry2d-report"
        className={`${styles.report} space-y-10 rounded-lg border bg-background p-8`}
      >
        <ProjectHeader data={data} />
        <BayPlanSection ref={bayPlanSvgRef} data={data} />
        <BayProportionSection data={data} />
        <CutTypologySection data={data} />
        <ReportFooter generatedAt={data.generatedAt} />
      </article>
    </div>
  );
}
