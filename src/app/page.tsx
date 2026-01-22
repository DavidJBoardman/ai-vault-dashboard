"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  FolderOpen, 
  Plus, 
  Clock, 
  Building2,
  ChevronRight,
  Upload
} from "lucide-react";
import { useProjectStore } from "@/lib/store";

export default function HomePage() {
  const router = useRouter();
  const { recentProjects, createProject, loadProject } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    router.push("/workflow/step-1-upload");
  };

  const handleOpenProject = async () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const result = await window.electronAPI.openFile({
        filters: [{ name: "Vault Projects", extensions: ["vault"] }],
      });
      if (!result.canceled && result.filePaths[0]) {
        await loadProject(result.filePaths[0]);
        router.push("/workflow/step-1-upload");
      }
    }
  };

  const handleRecentProject = async (projectPath: string) => {
    await loadProject(projectPath);
    router.push("/workflow/step-1-upload");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Vault Analyser
              </h1>
              <p className="text-xs text-muted-foreground">
                Medieval Architecture Analysis Platform
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12 animate-fade-in" style={{ animationDelay: "0ms" }}>
            <h2 className="font-display text-4xl font-bold mb-4 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Analyse Medieval Vault Architecture
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload 3D point cloud scans, segment architectural features, and perform 
              geometric analysis on historical vault structures.
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* New Project Card */}
            <Card 
              className="border-2 border-dashed hover:border-primary/50 transition-colors cursor-pointer group animate-fade-in"
              style={{ animationDelay: "100ms" }}
              onClick={() => setShowNewProject(true)}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors mb-2">
                  <Plus className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="font-display">New Project</CardTitle>
                <CardDescription>
                  Start a new vault analysis from scratch
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Open Project Card */}
            <Card 
              className="border-2 border-dashed hover:border-primary/50 transition-colors cursor-pointer group animate-fade-in"
              style={{ animationDelay: "150ms" }}
              onClick={handleOpenProject}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto p-4 rounded-full bg-accent/10 group-hover:bg-accent/20 transition-colors mb-2">
                  <FolderOpen className="w-8 h-8 text-accent" />
                </div>
                <CardTitle className="font-display">Open Project</CardTitle>
                <CardDescription>
                  Continue working on an existing project
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* New Project Form */}
          {showNewProject && (
            <Card className="mb-12 animate-fade-in">
              <CardHeader>
                <CardTitle className="font-display">Create New Project</CardTitle>
                <CardDescription>
                  Enter a name for your new vault analysis project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label htmlFor="project-name" className="sr-only">
                      Project Name
                    </Label>
                    <Input
                      id="project-name"
                      placeholder="e.g., Durham Cathedral Vault Study"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                      autoFocus
                    />
                  </div>
                  <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                    <Upload className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                  <Button variant="outline" onClick={() => setShowNewProject(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-display text-lg font-medium">Recent Projects</h3>
              </div>
              <div className="space-y-2">
                {recentProjects.map((project, index) => (
                  <Card 
                    key={project.path}
                    className="hover:bg-card/80 transition-colors cursor-pointer group"
                    onClick={() => handleRecentProject(project.path)}
                  >
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Last opened: {new Date(project.lastOpened).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Quick Start Guide */}
          <Card className="mt-12 bg-secondary/30 animate-fade-in" style={{ animationDelay: "250ms" }}>
            <CardHeader>
              <CardTitle className="font-display text-lg">Quick Start Guide</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</span>
                  <div>
                    <p className="font-medium">Upload E57 Scan</p>
                    <p className="text-muted-foreground">Import your 3D point cloud</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">2</span>
                  <div>
                    <p className="font-medium">Project to 2D</p>
                    <p className="text-muted-foreground">Generate scaled images</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">3</span>
                  <div>
                    <p className="font-medium">Segment Features</p>
                    <p className="text-muted-foreground">Identify ribs and intrados</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">4</span>
                  <div>
                    <p className="font-medium">Analyse Geometry</p>
                    <p className="text-muted-foreground">Measure and classify</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-4">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>Vault Analyser v1.0.0 • Medieval Architecture Analysis Platform</p>
        </div>
      </footer>
    </div>
  );
}

