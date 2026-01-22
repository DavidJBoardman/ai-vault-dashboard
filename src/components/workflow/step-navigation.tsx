"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/store";
import { 
  Upload, 
  Layers, 
  Scan, 
  Shapes, 
  RotateCcw, 
  Spline,
  Ruler,
  Circle,
  Check,
  Lock
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const steps = [
  { id: 1, name: "Upload", path: "/workflow/step-1-upload", icon: Upload, description: "Upload E57 scan" },
  { id: 2, name: "Projection", path: "/workflow/step-2-projection", icon: Layers, description: "3D to 2D projection" },
  { id: 3, name: "Segmentation", path: "/workflow/step-3-segmentation", icon: Scan, description: "SAM3 segmentation" },
  { id: 4, name: "2D Geometry", path: "/workflow/step-4-geometry-2d", icon: Shapes, description: "Vault classification" },
  { id: 5, name: "Reprojection", path: "/workflow/step-5-reprojection", icon: RotateCcw, description: "Back to 3D" },
  { id: 6, name: "Traces", path: "/workflow/step-6-traces", icon: Spline, description: "Intrados lines" },
  { id: 7, name: "Measurements", path: "/workflow/step-7-measurements", icon: Ruler, description: "Arc & radius" },
  { id: 8, name: "Analysis", path: "/workflow/step-8-analysis", icon: Circle, description: "Chord method" },
];

export function StepNavigation() {
  const pathname = usePathname();
  const { currentProject, canAccessStep } = useProjectStore();
  
  const getCurrentStepIndex = () => {
    const index = steps.findIndex(step => pathname.startsWith(step.path));
    return index >= 0 ? index : 0;
  };
  
  const currentStepIndex = getCurrentStepIndex();

  return (
    <TooltipProvider>
      <nav className="flex flex-col gap-1 p-2">
        {steps.map((step, index) => {
          const isActive = pathname.startsWith(step.path);
          const isCompleted = currentProject?.steps[step.id]?.completed || false;
          const isAccessible = canAccessStep(step.id);
          const Icon = step.icon;
          
          return (
            <Tooltip key={step.id} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={isAccessible ? step.path : "#"}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                    "group relative",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : isAccessible
                        ? "hover:bg-muted text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/50 cursor-not-allowed",
                    isCompleted && !isActive && "text-green-500"
                  )}
                  onClick={(e) => !isAccessible && e.preventDefault()}
                >
                  {/* Step number / status indicator */}
                  <div className={cn(
                    "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : isCompleted 
                        ? "bg-green-500/20 text-green-500"
                        : isAccessible
                          ? "bg-muted-foreground/20"
                          : "bg-muted/50"
                  )}>
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : !isAccessible ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      step.id
                    )}
                  </div>
                  
                  {/* Step name */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      isActive && "text-primary"
                    )}>
                      {step.name}
                    </p>
                  </div>
                  
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{step.name}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}

export function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

export function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 pt-6 mt-6 border-t border-border">
      {children}
    </div>
  );
}

