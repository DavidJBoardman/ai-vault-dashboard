"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StepNavigation } from "@/components/workflow/step-navigation";
import { useProjectStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2,
  Save,
  ChevronLeft
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";

export default function WorkflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { currentProject, saveProject } = useProjectStore();
  const { toast } = useToast();

  // Redirect to home if no project is loaded
  useEffect(() => {
    if (!currentProject) {
      router.push("/");
    }
  }, [currentProject, router]);

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await saveProject();
      toast({
        title: "Project saved",
        description: `${currentProject.name || "Untitled Project"} saved successfully.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save project.",
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="h-14 border-b border-border/40 bg-card/50 backdrop-blur-sm flex items-center px-4 gap-4">
          {/* Logo and Home */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="p-1.5 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
          </Link>
          
          <div className="h-6 w-px bg-border" />
          
          {/* Project Name */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-sm font-medium truncate">
              {currentProject.name || "Untitled Project"}
            </h1>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleSave}>
                  <Save className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save Project</TooltipContent>
            </Tooltip>
          </div>
        </header>
        
        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Sidebar */}
          <aside className="w-56 border-r border-border/40 bg-card/30 flex flex-col">
            <ScrollArea className="flex-1">
              <StepNavigation />
            </ScrollArea>
            
            {/* Footer */}
            <div className="p-4 border-t border-border/40">
              <Link href="/">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <ChevronLeft className="w-4 h-4" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </aside>
          
          {/* Main Content Area */}
          {/* Native overflow-y-auto (rather than Radix ScrollArea) so that
              `position: sticky` inside the page works — Radix wraps its
              viewport content in a display:table element which breaks sticky. */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

