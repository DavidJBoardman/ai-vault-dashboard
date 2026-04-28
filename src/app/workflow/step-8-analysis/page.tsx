"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StepActions, StepHeader } from "@/components/workflow/step-navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Geometry2DReport } from "@/components/analysis/Geometry2DReport";
import { useProjectStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  getStep7bSummary,
  type Step7bBossSummaryRow,
  type Step7bRibSummaryRow,
  type Step7bSummarySnapshot,
} from "@/lib/api";
import {
  Box,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Circle,
  Download,
  Grid3X3,
  Home,
  Loader2,
  Table,
  type LucideIcon,
} from "lucide-react";

function formatMetric(value: number | undefined | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

function formatMeters(value: number, digits = 2): string {
  return `${value.toFixed(digits)}m`;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const TABLE_PREVIEW_ROWS = 5;
const TABLE_COLLAPSED_MAX_HEIGHT_PX = 252;
const TABLE_EXPANDED_MAX_HEIGHT_PX = 560;

function renderTableValue(value: string) {
  if (value.trim().toUpperCase() === "N/A") {
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        N/A
      </span>
    );
  }
  return value;
}

function MetricCard(props: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  className?: string;
  valueClassName?: string;
}) {
  const { title, value, description, icon: Icon, className, valueClassName } = props;
  return (
    <Card className={cn("border-amber-500", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className={cn("mt-1 text-2xl font-semibold", valueClassName)}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <Icon className="h-5 w-5 text-amber-500" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Step8AnalysisPage() {
  const router = useRouter();
  const { currentProject, completeStep } = useProjectStore();

  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarySnapshot, setSummarySnapshot] = useState<Step7bSummarySnapshot | null>(null);
  const [exportingRibs, setExportingRibs] = useState(false);
  const [exportingBosses, setExportingBosses] = useState(false);
  const [isRibSummaryExpanded, setIsRibSummaryExpanded] = useState(false);
  const [isBossSummaryExpanded, setIsBossSummaryExpanded] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadSummary = async () => {
      if (!currentProject?.id) {
        setSummarySnapshot(null);
        setSummaryError(null);
        return;
      }

      setIsSummaryLoading(true);
      setSummaryError(null);

      try {
        const response = await getStep7bSummary(currentProject.id);
        if (!isActive) return;

        if (response.success && response.data) {
          setSummarySnapshot(response.data);
          setSummaryError(null);
        } else {
          setSummarySnapshot(null);
          setSummaryError(response.error ?? "Step 7B summary is not saved yet. Return to Step 7 and continue.");
        }
      } catch (err) {
        if (!isActive) return;
        console.error("Error loading persisted Step 7B summary:", err);
        setSummarySnapshot(null);
        setSummaryError("Unable to load Step 7B summary.");
      } finally {
        if (isActive) {
          setIsSummaryLoading(false);
        }
      }
    };

    void loadSummary();

    return () => {
      isActive = false;
    };
  }, [currentProject?.id]);

  const totalSegmentations = currentProject?.segmentations.length || 0;
  const totalProjections = currentProject?.projections.length || 0;
  const totalMeasurements = currentProject?.measurements.length || 0;
  const totalHypotheses = currentProject?.hypotheses.length || 0;

  const ribRows = summarySnapshot?.ribs ?? [];
  const bossRows = summarySnapshot?.bosses ?? [];
  const visibleRibRows = isRibSummaryExpanded ? ribRows : ribRows.slice(0, TABLE_PREVIEW_ROWS);
  const visibleBossRows = isBossSummaryExpanded ? bossRows : bossRows.slice(0, TABLE_PREVIEW_ROWS);

  const ribStats = useMemo(
    () =>
      summarySnapshot?.ribStats ?? {
        groupedRows: 0,
        averageRadius: null,
        averageFitError: null,
      },
    [summarySnapshot],
  );

  const ribAverages = useMemo(() => {
    const lengths = ribRows.map((row) => row.length).filter(isFiniteNumber);
    const impostDistances = ribRows.map((row) => row.impostDistance).filter(isFiniteNumber);
    const spans = ribRows.map((row) => row.span).filter(isFiniteNumber);
    const apexHeights = ribRows.map((row) => row.apexHeight).filter(isFiniteNumber);

    return {
      averageLength: averageOrNull(lengths),
      averageImpostDistance: averageOrNull(impostDistances),
      averageSpan: averageOrNull(spans),
      averageApexHeight: averageOrNull(apexHeights),
    };
  }, [ribRows]);

  const handleDownloadRibSummary = () => {
    if (ribRows.length === 0) return;
    setExportingRibs(true);
    try {
      const rows: string[] = [];
      rows.push(["Name", "ArcRadius", "Length", "ImpostDistance", "Span", "ApexHeight", "FitError"].join(","));

      ribRows.forEach((row) => {
        rows.push(
          [
            toCsvCell(row.name),
            toCsvCell(row.arcRadiusText),
            toCsvCell(row.lengthText),
            toCsvCell(row.impostDistanceText),
            toCsvCell(row.spanText),
            toCsvCell(row.apexHeightText),
            toCsvCell(row.fitErrorText),
          ].join(","),
        );
      });

      downloadCsv(`ribs_export_${Date.now()}.csv`, rows.join("\n"));
    } finally {
      setExportingRibs(false);
    }
  };

  const handleDownloadBossSummary = () => {
    if (bossRows.length === 0) return;
    setExportingBosses(true);
    try {
      const rows: string[] = [];
      rows.push(["BossStone", "HeightFromImpost"].join(","));
      bossRows.forEach((row) => {
        rows.push([toCsvCell(row.name), toCsvCell(row.heightFromImpostText)].join(","));
      });
      downloadCsv(`boss_stones_export_${Date.now()}.csv`, rows.join("\n"));
    } finally {
      setExportingBosses(false);
    }
  };

  const handleFinish = () => {
    completeStep(8, {
      viewedAt: new Date().toISOString(),
      summary: {
        projections: totalProjections,
        segmentations: totalSegmentations,
        measurements: totalMeasurements,
        hypotheses: totalHypotheses,
        chordMethod: null,
      },
    });
    router.push("/");
  };

  if (!currentProject) {
    return (
      <div className="space-y-6">
        <StepHeader
          title="Workflow Results Summary"
          description="No project is loaded. Open a project to view 2D and 3D result summaries."
        />

        <Card className="border-amber-500">
          <CardContent className="py-10 text-center">
            <Circle className="mx-auto h-12 w-12 text-amber-500/70" />
            <p className="mt-3 text-sm text-muted-foreground">No active project data available.</p>
          </CardContent>
        </Card>

        <StepActions>
          <Button onClick={() => router.push("/")} className="gap-2">
            <Home className="h-4 w-4" />
            Return Home
          </Button>
        </StepActions>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepHeader
        title="Workflow Results Summary"
        description="Review saved outputs from the 2D and 3D workflow stages"
      />

      <Tabs defaultValue="2d" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="2d" className="gap-2 group">
            <Grid3X3 className="h-4 w-4 text-muted-foreground group-data-[state=active]:text-amber-500" />
            2D
          </TabsTrigger>
          <TabsTrigger value="3d" className="gap-2 group">
            <Box className="h-4 w-4 text-muted-foreground group-data-[state=active]:text-amber-500" />
            3D
          </TabsTrigger>
        </TabsList>

        <TabsContent value="2d" className="space-y-6">
          <Geometry2DReport />
        </TabsContent>

        <TabsContent value="3d" className="space-y-6">
          <Card>
            <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="font-display">Data Summary</CardTitle>
                <CardDescription>
                  Loaded from saved Step 7B summary data under the project measurements folder.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownloadRibSummary}
                  disabled={ribRows.length === 0 || exportingRibs}
                  className="gap-2"
                >
                  {exportingRibs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download Ribs CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadBossSummary}
                  disabled={bossRows.length === 0 || exportingBosses}
                  className="gap-2"
                >
                  {exportingBosses ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download Boss CSV
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Rib Rows"
                  value={String(ribRows.length)}
                  description={`${ribStats.groupedRows} grouped rows`}
                  icon={Table}
                  className="bg-amber-500/5 shadow-sm"
                  valueClassName="text-3xl leading-none"
                />
                <MetricCard
                  title="Bosses"
                  value={String(bossRows.length)}
                  description="Saved boss rows"
                  icon={Box}
                  className="bg-amber-500/5 shadow-sm"
                  valueClassName="text-3xl leading-none"
                />
                <MetricCard
                  title="Avg Arc Radius"
                  value={ribStats.averageRadius == null ? "n/a" : formatMeters(ribStats.averageRadius, 2)}
                  description={summarySnapshot?.activeTraceSummary ?? "No saved Step 7 trace summary"}
                  icon={Circle}
                />
                <MetricCard
                  title="Avg Fit Error"
                  value={ribStats.averageFitError == null ? "n/a" : formatMeters(ribStats.averageFitError, 4)}
                  description="From saved Step 7B rib rows"
                  icon={CheckCircle}
                />
                <MetricCard
                  title="Avg Length"
                  value={ribAverages.averageLength == null ? "n/a" : formatMeters(ribAverages.averageLength, 2)}
                  description="Across saved rib rows"
                  icon={Table}
                />
                <MetricCard
                  title="Avg Impost Distance"
                  value={
                    ribAverages.averageImpostDistance == null
                      ? "n/a"
                      : formatMeters(ribAverages.averageImpostDistance, 2)
                  }
                  description="Across saved rib rows"
                  icon={Circle}
                />
                <MetricCard
                  title="Avg Span"
                  value={ribAverages.averageSpan == null ? "n/a" : formatMeters(ribAverages.averageSpan, 2)}
                  description="Across saved rib rows"
                  icon={Box}
                />
                <MetricCard
                  title="Avg Apex Height"
                  value={ribAverages.averageApexHeight == null ? "n/a" : formatMeters(ribAverages.averageApexHeight, 2)}
                  description="Across saved rib rows"
                  icon={CheckCircle}
                />
              </div>

              {isSummaryLoading && (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading saved Step 7B summary...
                  </div>
                </div>
              )}

              {summaryError && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  {summaryError}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Rib Summary</h3>
                {ribRows.length > 0 ? (
                  <div className="space-y-2">
                    <div
                      className="relative isolate overflow-auto rounded-lg border transition-[max-height] duration-300 ease-in-out"
                      style={{
                        maxHeight: isRibSummaryExpanded
                          ? `${TABLE_EXPANDED_MAX_HEIGHT_PX}px`
                          : `${TABLE_COLLAPSED_MAX_HEIGHT_PX}px`,
                      }}
                    >
                      <table className="w-full text-sm">
                        <thead className="bg-background text-left text-foreground">
                          <tr>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Name</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Source</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Ribs</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Arc Radius</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Length</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Impost Distance</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Span</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Apex Height</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Fit Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ribRows.map((row: Step7bRibSummaryRow, index) => (
                            <tr
                              key={row.id}
                              className={cn(
                                index % 2 === 0 ? "bg-muted/20" : "",
                                "hover:bg-amber-500/5 transition-colors",
                              )}
                            >
                              <td className="px-3 py-2 font-medium">{row.name}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 uppercase tracking-wide">
                                  {row.source}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{row.ribCount}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{renderTableValue(row.arcRadiusText)}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{renderTableValue(row.lengthText)}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{renderTableValue(row.impostDistanceText)}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{renderTableValue(row.spanText)}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{renderTableValue(row.apexHeightText)}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{renderTableValue(row.fitErrorText)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {ribRows.length > TABLE_PREVIEW_ROWS && (
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="group gap-1"
                          onClick={() => setIsRibSummaryExpanded((value) => !value)}
                        >
                          <span className={cn("transition-transform duration-300", isRibSummaryExpanded ? "rotate-180" : "rotate-0")}>
                            <ChevronDown className="h-4 w-4 text-amber-500" />
                          </span>
                          {isRibSummaryExpanded
                            ? `Collapse to first ${TABLE_PREVIEW_ROWS} rows`
                            : `Show ${ribRows.length - TABLE_PREVIEW_ROWS} more rows`}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                    No saved rib summary rows are available.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Boss Stone Summary</h3>
                {bossRows.length > 0 ? (
                  <div className="space-y-2">
                    <div
                      className="relative isolate overflow-auto rounded-lg border transition-[max-height] duration-300 ease-in-out"
                      style={{
                        maxHeight: isBossSummaryExpanded
                          ? `${TABLE_EXPANDED_MAX_HEIGHT_PX}px`
                          : `${TABLE_COLLAPSED_MAX_HEIGHT_PX}px`,
                      }}
                    >
                      <table className="w-full text-sm">
                        <thead className="bg-background text-left text-foreground">
                          <tr>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Boss Stone</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Group</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Height From Impost</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Connected Ribs</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Apex Pairs</th>
                            <th className="sticky top-0 z-20 bg-background px-3 py-2 text-right font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bossRows.map((row: Step7bBossSummaryRow, index) => (
                            <tr
                              key={row.id}
                              className={cn(
                                index % 2 === 0 ? "bg-muted/20" : "",
                                "hover:bg-amber-500/5 transition-colors",
                              )}
                            >
                              <td className="px-3 py-2 font-medium">{row.name}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                                  {row.groupId}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{renderTableValue(row.heightFromImpostText)}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{row.connectedRibCount}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{row.apexPairCount}</td>
                              <td className="px-3 py-2 text-right">
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 uppercase tracking-wide">
                                  {row.source}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {bossRows.length > TABLE_PREVIEW_ROWS && (
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="group gap-1"
                          onClick={() => setIsBossSummaryExpanded((value) => !value)}
                        >
                          <span className={cn("transition-transform duration-300", isBossSummaryExpanded ? "rotate-180" : "rotate-0")}>
                            <ChevronDown className="h-4 w-4 text-amber-500" />
                          </span>
                          {isBossSummaryExpanded
                            ? `Collapse to first ${TABLE_PREVIEW_ROWS} rows`
                            : `Show ${bossRows.length - TABLE_PREVIEW_ROWS} more rows`}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                    No saved boss summary rows are available.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StepActions>
        <Button variant="outline" onClick={() => router.push("/workflow/step-7-measurements")} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back to Measurements
        </Button>
        <Button onClick={handleFinish} className="gap-2">
          <Home className="h-4 w-4" />
          Complete & Return Home
        </Button>
      </StepActions>
    </div>
  );
}

