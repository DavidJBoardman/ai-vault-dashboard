"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileText, Printer, RefreshCw } from "lucide-react";

interface EvidenceReportPanelProps {
  lastGeneratedAt?: string;
  reportHtmlPath?: string;
  reportJsonPath?: string;
  reportHtml?: string;
  isLoadingState: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onDownloadHtml: () => void;
  onExportPdf: () => void;
}

export function EvidenceReportPanel({
  lastGeneratedAt,
  reportHtmlPath,
  reportJsonPath,
  reportHtml,
  isLoadingState,
  isGenerating,
  onGenerate,
  onDownloadHtml,
  onExportPdf,
}: EvidenceReportPanelProps) {
  const canExport = !!reportHtml;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Evidence Report & Export</CardTitle>
          <CardDescription className="text-xs">
            Generate an evidence pack for Steps 4.1 to 4.5, then export as HTML or print to PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <Button className="w-full gap-2" onClick={onGenerate} disabled={isLoadingState || isGenerating}>
            {isGenerating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {isGenerating ? "Generating Report..." : "Generate Report"}
          </Button>

          <Button variant="outline" className="w-full gap-2" onClick={onDownloadHtml} disabled={!canExport}>
            <Download className="h-4 w-4" />
            Download HTML
          </Button>

          <Button variant="outline" className="w-full gap-2" onClick={onExportPdf} disabled={!canExport}>
            <Printer className="h-4 w-4" />
            Export PDF (Client Print)
          </Button>

          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <p>Last generated: {lastGeneratedAt ? new Date(lastGeneratedAt).toLocaleString() : "Not generated yet"}</p>
            <p>HTML: {reportHtmlPath || "Not available"}</p>
            <p>JSON: {reportJsonPath || "Not available"}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
