"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";
import type { ReportData } from "@/lib/report/geometry2dReport";
import { useProjectStore } from "@/lib/store";

interface Props {
  data: ReportData;
}

export function ProjectHeader({ data }: Props) {
  const setProjectLocation = useProjectStore((s) => s.setProjectLocation);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.projectLocation);

  const save = () => {
    setProjectLocation(draft.trim());
    setEditing(false);
  };

  const cancel = () => {
    setDraft(data.projectLocation);
    setEditing(false);
  };

  return (
    <header className="space-y-3 border-b border-border pb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {data.projectName || "Untitled project"}
      </h1>
      <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-medium text-foreground">Location</dt>
          <dd className="text-muted-foreground">
            {editing ? (
              <span className="inline-flex items-center gap-1">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-7 w-64"
                  placeholder="e.g., Durham Cathedral, UK"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                    if (e.key === "Escape") cancel();
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={save}
                  aria-label="Save location"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={cancel}
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                {data.projectLocation || (
                  <em className="text-muted-foreground/70">not set</em>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 print:hidden"
                  onClick={() => setEditing(true)}
                  aria-label="Edit location"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-medium text-foreground">Projection</dt>
          <dd className="text-muted-foreground">{data.projectionName || "n/a"}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-medium text-foreground">Generated</dt>
          <dd className="tabular-nums text-muted-foreground">
            {new Date(data.generatedAt).toLocaleString()}
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-medium text-foreground">Project ID</dt>
          <dd className="font-mono text-xs text-muted-foreground">{data.projectId}</dd>
        </div>
      </dl>
    </header>
  );
}
