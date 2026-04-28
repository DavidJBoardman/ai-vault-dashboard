"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useProjectStore } from "@/lib/store";
import { getCutTypologyCsv } from "@/lib/api/geometry2d";
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
  const [busy, setBusy] = useState<"none" | "bundle">("none");
  const bayPlanSvgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await getCutTypologyCsv(project.id);
        if (cancelled) return;
        if (response.success && response.data) {
          setCutTypology({
            columns: response.data.columns ?? [],
            rows: response.data.rows ?? [],
          });
        } else {
          setCutTypology({ columns: [], rows: [] });
        }
      } catch {
        if (!cancelled) setCutTypology({ columns: [], rows: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  const data = useMemo<ReportData | null>(
    () => selectReportData(project, cutTypology),
    [project, cutTypology]
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
