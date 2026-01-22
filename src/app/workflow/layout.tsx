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
  Home, 
  Save, 
  Settings,
  ChevronLeft
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function WorkflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { currentProject, saveProject } = useProjectStore();

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
    await saveProject();
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
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
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
          <main className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6 max-w-6xl mx-auto">
                {children}
              </div>
            </ScrollArea>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

