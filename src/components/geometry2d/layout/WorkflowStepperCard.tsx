"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check, Lock } from "lucide-react";

import { Geometry2DWorkflowSection } from "@/components/geometry2d/types";

export interface WorkflowStepperItem {
  id: Geometry2DWorkflowSection;
  stepLabel: string;
  title: string;
  status: "completed" | "current" | "available" | "locked";
  lockedReason?: string;
}

interface WorkflowStepperCardProps {
  activeSection: Geometry2DWorkflowSection;
  onSectionChange: (section: Geometry2DWorkflowSection) => void;
  sections: WorkflowStepperItem[];
  onReset?: () => void;
  resetDisabled?: boolean;
}

export function WorkflowStepperCard({
  activeSection,
  onSectionChange,
  sections,
  onReset,
  resetDisabled = false,
}: WorkflowStepperCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3">
        <CardTitle className="text-sm font-medium">Workflow</CardTitle>
        {onReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={resetDisabled}
            title="Clear Step 4 results and restart this step"
            className="h-7 px-2 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Reset 2D Analysis
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-1">
        <div className="grid gap-2 xl:grid-cols-4">
          {sections.map((section) => {
            const isCurrent = activeSection === section.id;
            const isCompleted = section.status === "completed";
            const isLocked = section.status === "locked";
            const isAvailable = section.status === "available";

            return (
              <div key={section.id} className="relative">
                <Button
                  variant="outline"
                  onClick={() => onSectionChange(section.id)}
                  disabled={isLocked}
                  title={isLocked ? section.lockedReason : section.title}
                  className={cn(
                    "group h-12 w-full justify-start rounded-lg border px-3 text-left transition-all",
                    isCurrent && "border-amber-400/80 bg-amber-500 text-amber-950 hover:bg-amber-500/95 hover:text-amber-950",
                    isCompleted && !isCurrent && "border-emerald-500/45 bg-emerald-500/[0.08] text-emerald-50 hover:bg-emerald-500/[0.12]",
                    isAvailable && "border-border/90 bg-background/80 text-foreground hover:border-amber-500/35 hover:bg-muted/30",
                    isLocked && "border-border/60 bg-muted/10 text-muted-foreground opacity-70"
                  )}
                >
                  <div className="flex w-full items-center gap-3">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
                        isCurrent && "border-amber-950/20 bg-amber-50/20 text-amber-950",
                        isCompleted && !isCurrent && "border-emerald-400/35 bg-emerald-500/15 text-emerald-300",
                        isAvailable && "border-border/80 bg-muted/30 text-foreground",
                        isLocked && "border-border/70 bg-background/40 text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : isLocked ? <Lock className="h-3.5 w-3.5" /> : section.stepLabel}
                    </div>

                    <div className="min-w-0 flex-1 truncate text-sm font-medium leading-none">
                      {section.title}
                    </div>

                    <div
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        isCurrent && "bg-amber-900/70",
                        isCompleted && !isCurrent && "bg-emerald-400",
                        isAvailable && "bg-amber-400/70",
                        isLocked && "bg-border/70"
                      )}
                      aria-hidden="true"
                    />
                  </div>
                </Button>

                {section.lockedReason && isLocked && (
                  <p className="px-1 pt-1 text-[10px] text-muted-foreground/75">
                    {section.lockedReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
