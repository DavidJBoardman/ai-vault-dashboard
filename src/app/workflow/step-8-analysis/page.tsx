"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StepActions, StepHeader } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectStore } from "@/lib/store";
import {
  getStep7bSummary,
  type Step7bBossSummaryRow,
  type Step7bRibSummaryRow,
  type Step7bSummarySnapshot,
} from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import {
  Box,
  CheckCircle,
  ChevronLeft,
  Circle,
  Download,
  Grid3X3,
  Home,
  Loader2,
  RefreshCw,
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

function MetricCard(props: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
}) {
  const { title, value, description, icon: Icon } = props;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Step8AnalysisPage() {
  const router = useRouter();
  const { currentProject, completeStep } = useProjectStore();

  const [reloadNonce, setReloadNonce] = useState(0);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarySnapshot, setSummarySnapshot] = useState<Step7bSummarySnapshot | null>(null);
  const [exportingRibs, setExportingRibs] = useState(false);
  const [exportingBosses, setExportingBosses] = useState(false);

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
  }, [currentProject?.id, reloadNonce]);

  const totalSegmentations = currentProject?.segmentations.length || 0;
  const totalProjections = currentProject?.projections.length || 0;
  const totalMeasurements = currentProject?.measurements.length || 0;
  const totalHypotheses = currentProject?.hypotheses.length || 0;
  const totalPointCount = currentProject?.pointCloudStats?.pointCount || 0;
  const totalIntradosLines = currentProject?.intradosLines.length || 0;
  const totalReprojectionSelections = currentProject?.reprojectionSelections.length || 0;

  const ribRows = summarySnapshot?.ribs ?? [];
  const bossRows = summarySnapshot?.bosses ?? [];

  const ribStats = useMemo(
    () =>
      summarySnapshot?.ribStats ?? {
        groupedRows: 0,
        averageRadius: null,
        averageFitError: null,
      },
    [summarySnapshot],
  );

  const bossStats = useMemo(
    () =>
      summarySnapshot?.bossStats ?? {
        bossesWithHeights: 0,
        averageHeight: null,
      },
    [summarySnapshot],
  );

  const handleRefreshSummary = () => {
    setReloadNonce((value) => value + 1);
  };

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

        <Card>
          <CardContent className="py-10 text-center">
            <Circle className="mx-auto h-12 w-12 text-muted-foreground/60" />
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
          <TabsTrigger value="2d" className="gap-2">
            <Grid3X3 className="h-4 w-4" />
            2D
          </TabsTrigger>
          <TabsTrigger value="3d" className="gap-2">
            <Box className="h-4 w-4" />
            3D
          </TabsTrigger>
        </TabsList>

        <TabsContent value="2d" />

        <TabsContent value="3d" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Point Count"
              value={formatNumber(totalPointCount)}
              description="Loaded from Step 1"
              icon={Box}
            />
            <MetricCard
              title="Intrados Lines"
              value={String(totalIntradosLines)}
              description="Tracked in Step 6"
              icon={Circle}
            />
            <MetricCard
              title="Measurements"
              value={String(totalMeasurements)}
              description="Saved in Step 7"
              icon={Table}
            />
            <MetricCard
              title="Hypotheses"
              value={String(totalHypotheses)}
              description="Grouped measurement sets"
              icon={CheckCircle}
            />
          </div>

          <Card>
            <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="font-display">Step 7 Data Summary</CardTitle>
                <CardDescription>
                  Loaded from saved Step 7B summary data under the project measurements folder.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleRefreshSummary}
                  disabled={isSummaryLoading}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isSummaryLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
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
                  title="Boss Heights"
                  value={`${bossStats.bossesWithHeights}/${bossRows.length}`}
                  description={
                    bossStats.averageHeight == null
                      ? "No saved apex height data"
                      : `avg ${formatMeters(bossStats.averageHeight, 2)}`
                  }
                  icon={Box}
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
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 text-right font-medium">Ribs</th>
                          <th className="px-3 py-2 text-right font-medium">Arc Radius</th>
                          <th className="px-3 py-2 text-right font-medium">Length</th>
                          <th className="px-3 py-2 text-right font-medium">Impost Distance</th>
                          <th className="px-3 py-2 text-right font-medium">Span</th>
                          <th className="px-3 py-2 text-right font-medium">Apex Height</th>
                          <th className="px-3 py-2 text-right font-medium">Fit Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ribRows.map((row: Step7bRibSummaryRow, index) => (
                          <tr key={row.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                            <td className="px-3 py-2 font-medium">{row.name}</td>
                            <td className="px-3 py-2 text-muted-foreground uppercase tracking-wide">{row.source}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.ribCount}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.arcRadiusText}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.lengthText}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.impostDistanceText}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.spanText}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.apexHeightText}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.fitErrorText}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium">Boss Stone</th>
                          <th className="px-3 py-2 font-medium">Group</th>
                          <th className="px-3 py-2 text-right font-medium">Height From Impost</th>
                          <th className="px-3 py-2 text-right font-medium">Connected Ribs</th>
                          <th className="px-3 py-2 text-right font-medium">Apex Pairs</th>
                          <th className="px-3 py-2 text-right font-medium">X</th>
                          <th className="px-3 py-2 text-right font-medium">Y</th>
                          <th className="px-3 py-2 text-right font-medium">Z</th>
                          <th className="px-3 py-2 text-right font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bossRows.map((row: Step7bBossSummaryRow, index) => (
                          <tr key={row.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                            <td className="px-3 py-2 font-medium">{row.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.groupId}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.heightFromImpostText}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.connectedRibCount}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{row.apexPairCount}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{formatMetric(row.x, 3)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{formatMetric(row.y, 3)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{formatMetric(row.z, 3)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground uppercase tracking-wide">{row.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                    No saved boss summary rows are available.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Point Cloud and Traces</CardTitle>
              <CardDescription>3D context pulled from Steps 1, 5, and 6</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 font-medium">Point cloud points</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatNumber(totalPointCount)}</td>
                    </tr>
                    <tr className="bg-muted/30">
                      <td className="px-3 py-2 font-medium">Reprojection selections</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{totalReprojectionSelections}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Intrados lines</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{totalIntradosLines}</td>
                    </tr>
                    <tr className="bg-muted/30">
                      <td className="px-3 py-2 font-medium">Summary trace source</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{summarySnapshot?.activeTraceSource ?? "n/a"}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Saved trace summary</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{summarySnapshot?.activeTraceSummary ?? "n/a"}</td>
                    </tr>
                    <tr className="bg-muted/30">
                      <td className="px-3 py-2 font-medium">Imported 3D traces</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{currentProject.traces3D.length}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Bounding box available</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {currentProject.pointCloudStats?.boundingBox ? "yes" : "no"}
                      </td>
                    </tr>
                  </tbody>
                </table>
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

