"use client";

import { useRouter } from "next/navigation";
import { StepActions, StepHeader } from "@/components/workflow/step-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";
import {
  Box,
  CheckCircle,
  ChevronLeft,
  Circle,
  Grid3X3,
  Home,
  Table,
  type LucideIcon,
} from "lucide-react";

function formatDateTime(value: unknown): string {
  if (!value) return "n/a";
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "n/a";
  return parsed.toLocaleString();
}

function formatMetric(value: number | undefined | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
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

  const totalSegmentations = currentProject?.segmentations.length || 0;
  const visibleSegmentations = currentProject?.segmentations.filter((segmentation) => segmentation.visible).length || 0;
  const totalProjections = currentProject?.projections.length || 0;
  const totalMeasurements = currentProject?.measurements.length || 0;
  const totalHypotheses = currentProject?.hypotheses.length || 0;
  const totalPointCount = currentProject?.pointCloudStats?.pointCount || 0;
  const totalIntradosLines = currentProject?.intradosLines.length || 0;
  const totalReprojectionSelections = currentProject?.reprojectionSelections.length || 0;

  const chordMethodResult = currentProject?.chordMethodResult;

  const handleFinish = () => {
    completeStep(8, {
      viewedAt: new Date().toISOString(),
      summary: {
        projections: totalProjections,
        segmentations: totalSegmentations,
        measurements: totalMeasurements,
        hypotheses: totalHypotheses,
        chordMethod: chordMethodResult?.predictedMethod || null,
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

          <div className="grid gap-6 lg:grid-cols-2">
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

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Chord Method Result</CardTitle>
                <CardDescription>Saved Step 8 method prediction, if available</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {chordMethodResult ? (
                  <>
                    <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Predicted method</p>
                      <p className="mt-1 text-lg font-semibold text-primary">{chordMethodResult.predictedMethod}</p>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-left">
                          <tr>
                            <th className="px-3 py-2 font-medium">Calculation</th>
                            <th className="px-3 py-2 text-right font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(chordMethodResult.calculations).map(([key, value], index) => (
                            <tr key={key} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                              <td className="px-3 py-2 font-medium">{key}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{formatMetric(value, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No chord-method result is saved for this project.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Per-Rib Measurements</CardTitle>
              <CardDescription>Arc metrics captured in Step 7</CardDescription>
            </CardHeader>
            <CardContent>
              {currentProject.measurements.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Rib</th>
                        <th className="px-3 py-2 text-right font-medium">Arc Radius</th>
                        <th className="px-3 py-2 text-right font-medium">Rib Length</th>
                        <th className="px-3 py-2 text-right font-medium">Apex</th>
                        <th className="px-3 py-2 text-right font-medium">Springings</th>
                        <th className="px-3 py-2 text-right font-medium">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentProject.measurements.map((measurement, index) => (
                        <tr key={measurement.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                          <td className="px-3 py-2 font-medium">{measurement.name || measurement.id}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {formatMetric(measurement.arcRadius, 4)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {formatMetric(measurement.ribLength, 4)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {measurement.apexPoint ? "available" : "n/a"}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {measurement.springingPoints.length}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {formatDateTime(measurement.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No measurements are available.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Hypotheses</CardTitle>
              <CardDescription>Saved grouped measurement interpretations</CardDescription>
            </CardHeader>
            <CardContent>
              {currentProject.hypotheses.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 text-right font-medium">Measurements</th>
                        <th className="px-3 py-2 text-right font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentProject.hypotheses.map((hypothesis, index) => (
                        <tr key={hypothesis.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                          <td className="px-3 py-2 font-medium">{hypothesis.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{hypothesis.description || "-"}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{hypothesis.measurements.length}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{formatDateTime(hypothesis.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No hypotheses are saved.</div>
              )}
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
