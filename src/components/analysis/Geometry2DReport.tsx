"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useProjectStore } from "@/lib/store";
import { getCutTypologyCsv } from "@/lib/api/geometry2d";
import {
  buildBundleZip,
  selectReportData,
  type CutTypologyData,
  type ReportData,
} from "@/lib/report/geometry2dReport";
import { rasteriseSvgElement } from "@/lib/report/rasteriseBayPlan";
import { exportReportPdf } from "@/lib/report/exportPdf";
import { ProjectHeader } from "./sections/ProjectHeader";
import { ProjectInputsSection } from "./sections/ProjectInputsSection";
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

function buildSelfContainedHtml(reportRootHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c))}</title>
<style>
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; color: #111; }
  h1, h2 { font-family: Georgia, "Times New Roman", serif; }
  h1 { font-size: 1.875rem; margin: 0 0 .5rem; }
  h2 { font-size: 1.25rem; margin: 1.5rem 0 .5rem; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { padding: .5rem .75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
  th { background: #f4f4f5; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafafa; }
  td { font-variant-numeric: tabular-nums; }
  figure { margin: 0; }
  figcaption { text-align: center; font-size: .75rem; color: #6b7280; margin-top: .5rem; }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: .75rem; color: #6b7280; text-align: center; }
  .screen-only { display: none; }
  .print-only { display: table-row; }
</style>
</head>
<body>${reportRootHtml}</body>
</html>`;
}

export function Geometry2DReport() {
  const project = useProjectStore((s) => s.currentProject);
  const [cutTypology, setCutTypology] = useState<CutTypologyData | null>(null);
  const [busy, setBusy] = useState<"none" | "bundle" | "pdf">("none");
  const reportRef = useRef<HTMLDivElement>(null);
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
    if (!reportRef.current) return;
    setBusy("bundle");
    try {
      const reportRootHtml = reportRef.current.outerHTML;
      const html = buildSelfContainedHtml(
        reportRootHtml,
        `${data.projectName} — 2D report`
      );
      let bayPlanPng: Blob | null = null;
      if (bayPlanSvgRef.current) {
        try {
          bayPlanPng = await rasteriseSvgElement(bayPlanSvgRef.current);
        } catch (err) {
          console.warn("Failed to rasterise bay plan:", err);
        }
      }
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

  const handlePdf = async () => {
    setBusy("pdf");
    try {
      const date = new Date().toISOString().slice(0, 10);
      await exportReportPdf(`${slugify(data.projectName)}-2d-report-${date}`);
    } catch (err) {
      toast({
        title: "PDF export failed",
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
        <Button variant="outline" onClick={handlePdf} disabled={busy !== "none"}>
          {busy === "pdf" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          Download PDF
        </Button>
      </div>

      <article
        id="geometry2d-report"
        ref={reportRef}
        className={`${styles.report} space-y-10 rounded-lg border bg-background p-8`}
      >
        <ProjectHeader data={data} />
        <ProjectInputsSection data={data} />
        <BayProportionSection data={data} />
        <CutTypologySection data={data} />
        <BayPlanSection ref={bayPlanSvgRef} data={data} />
        <ReportFooter generatedAt={data.generatedAt} />
      </article>
    </div>
  );
}
