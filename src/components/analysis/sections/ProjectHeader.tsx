"use client";

import { useEffect, useState } from "react";
import type { ReportData } from "@/lib/report/geometry2dReport";
import { getProjectPath } from "@/lib/api";

interface Props {
  data: ReportData;
}

export function ProjectHeader({ data }: Props) {
  const [projectDir, setProjectDir] = useState<string | null>(null);

  useEffect(() => {
    if (!data.projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getProjectPath(data.projectId);
        if (!cancelled && res.success && res.data) {
          setProjectDir(res.data.projectDir);
        }
      } catch {
        if (!cancelled) setProjectDir(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.projectId]);

  return (
    <header className="space-y-3 border-b border-border pb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {data.projectName || "Untitled project"}
      </h1>
      <dl className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-medium text-foreground">Project folder</dt>
          <dd className="break-all font-mono text-xs text-muted-foreground">
            {projectDir ?? "detecting…"}
          </dd>
        </div>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-medium text-foreground">Project ID</dt>
            <dd className="font-mono text-xs text-muted-foreground">{data.projectId}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-medium text-foreground">Generated</dt>
            <dd className="tabular-nums text-muted-foreground">
              {new Date(data.generatedAt).toLocaleString()}
            </dd>
          </div>
        </div>
      </dl>
    </header>
  );
}
