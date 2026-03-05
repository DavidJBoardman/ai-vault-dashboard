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
  Building2,
  ChevronRight,
  Upload,
  Loader2,
  Trash2,
  CheckCircle
} from "lucide-react";
import { useProjectStore } from "@/lib/store";
import { 
  listProjects, 
  loadProject as loadProjectApi, 
  deleteProject,
  checkBackendHealth 
} from "@/lib/api";

// Saved project type
interface SavedProjectInfo {
  id: string;
  name: string;
  updatedAt: string;
  segmentationCount: number;
}

export default function HomePage() {
  const router = useRouter();
  const { createProject, loadProjectFromData } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  
  // Saved projects state
  const [savedProjects, setSavedProjects] = useState<SavedProjectInfo[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);

  // Check backend and fetch saved projects on mount
  useEffect(() => {
    const init = async () => {
      try {
        const isHealthy = await checkBackendHealth();
        setBackendOnline(isHealthy);
        
        if (isHealthy) {
          setIsLoadingProjects(true);
          const response = await listProjects();
          if (response.success && response.data) {
            setSavedProjects(response.data.projects);
          }
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
      } finally {
        setIsLoadingProjects(false);
      }
    };
    
    init();
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    router.push("/workflow/step-1-upload");
  };

  // Load a saved project
  const handleLoadProject = async (projectId: string) => {
    setIsLoadingProject(true);
    setSelectedProjectId(projectId);
    
    try {
      const response = await loadProjectApi(projectId);
      
      if (response.success && response.data?.project) {
        const projectData = response.data.project;
        
        // Pass through full backend payload so persisted workflow state is restored.
        loadProjectFromData(projectData);

        // Resume from the saved workflow step when available.
        const stepRouteMap: Record<number, string> = {
          1: "/workflow/step-1-upload",
          2: "/workflow/step-2-projection",
          3: "/workflow/step-3-segmentation",
          4: "/workflow/step-4-geometry-2d",
          5: "/workflow/step-5-reprojection",
          6: "/workflow/step-6-traces",
          7: "/workflow/step-7-measurements",
          8: "/workflow/step-8-analysis",
        };
        const savedStep = projectData.currentStep;
        const savedRoute = typeof savedStep === "number" ? stepRouteMap[savedStep] : undefined;
        if (savedRoute) {
          router.push(savedRoute);
        } else if (projectData.segmentations?.length > 0) {
          router.push("/workflow/step-4-geometry-2d");
        } else if (projectData.projections?.length > 0) {
          router.push("/workflow/step-3-segmentation");
        } else {
          router.push("/workflow/step-2-projection");
        }
      } else {
        console.error("Failed to load project:", response.error);
        alert(`Failed to load project: ${response.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error loading project:", error);
      alert("Failed to load project. Please try again.");
    } finally {
      setIsLoadingProject(false);
      setSelectedProjectId(null);
    }
  };

  // Delete a saved project
  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeletingProject(true);
    
    try {
      const response = await deleteProject(projectId);
      
      if (response.success) {
        setSavedProjects(prev => prev.filter(p => p.id !== projectId));
        setDeleteConfirmId(null);
      } else {
        console.error("Failed to delete project:", response.error);
        alert(`Failed to delete project: ${response.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project. Please try again.");
    } finally {
      setIsDeletingProject(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown date";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
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
              className="border-2 border-dashed animate-fade-in"
              style={{ animationDelay: "150ms" }}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto p-4 rounded-full bg-accent/10 mb-2">
                  <FolderOpen className="w-8 h-8 text-accent" />
                </div>
                <CardTitle className="font-display">Open Project</CardTitle>
                <CardDescription>
                  Continue working on an existing project
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProjects ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading projects...</span>
                  </div>
                ) : !backendOnline ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Backend offline - Start the server to load saved projects
                  </p>
                ) : savedProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No saved projects yet
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {savedProjects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer group"
                        onClick={() => handleLoadProject(project.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{project.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(project.updatedAt)} • {project.segmentationCount} masks
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {isLoadingProject && selectedProjectId === project.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : deleteConfirmId === project.id ? (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleDeleteProject(project.id, e)}
                                disabled={isDeletingProject}
                              >
                                {isDeletingProject ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(null);
                                }}
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(project.id);
                                }}
                                title="Delete project"
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
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
