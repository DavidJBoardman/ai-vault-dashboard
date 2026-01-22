import { create } from "zustand";
import { persist } from "zustand/middleware";

// Types
export interface Point3D {
  x: number;
  y: number;
  z: number;
  r?: number;
  g?: number;
  b?: number;
  intensity?: number;
}

export interface ProjectionSettings {
  perspective: "top" | "bottom" | "north" | "south" | "east" | "west";
  resolution: number;
  sigma: number;       // Gaussian spread
  kernelSize: number;  // Kernel size
  bottomUp: boolean;   // Looking up at vault
  scale: number;
}

export interface ProjectionImages {
  colour?: string;         // Base64 colour image
  depthGrayscale?: string; // Base64 depth grayscale
  depthPlasma?: string;    // Base64 depth plasma colormap
}

export interface Segmentation {
  id: string;
  label: string;
  color: string;
  mask: string; // Base64 encoded mask
  visible: boolean;
  source: "auto" | "manual";
}

export interface IntradosLine {
  id: string;
  points: Array<{ x: number; y: number }>;
  source: "auto" | "manual";
}

export interface GeometryResult {
  classification: "starcut" | "circlecut" | "starcirclecut" | null;
  bossStones: Array<{ x: number; y: number; label: string }>;
  px: number;
  py: number;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export interface Measurement {
  id: string;
  name: string;
  arcRadius: number;
  ribLength: number;
  apexPoint: Point3D | null;
  springingPoints: Point3D[];
  timestamp: Date;
}

export interface Hypothesis {
  id: string;
  name: string;
  description: string;
  measurements: Measurement[];
  createdAt: Date;
}

export interface StepState {
  completed: boolean;
  data: any;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  currentStep: number;
  steps: Record<number, StepState>;
  
  // Step 1: E57 data
  e57Path?: string;
  pointCloudStats?: {
    pointCount: number;
    boundingBox?: { min: Point3D; max: Point3D };
  };
  
  // Step 2: Projections (Gaussian splatting)
  projections: Array<{
    id: string;
    settings: ProjectionSettings;
    images: ProjectionImages;
    metadata?: Record<string, any>;
  }>;
  
  // Step 3: Segmentations
  segmentations: Segmentation[];
  intradosLines: IntradosLine[];
  
  // Step 4: 2D Geometry
  geometryResult: GeometryResult | null;
  
  // Step 5: Reprojection selections
  reprojectionSelections: string[];
  
  // Step 6: 3D Traces
  traces3D: Array<{ id: string; path: string; aligned: boolean }>;
  
  // Step 7: Measurements
  measurements: Measurement[];
  hypotheses: Hypothesis[];
  
  // Step 8: Analysis
  chordMethodResult: {
    predictedMethod: string;
    calculations: Record<string, number>;
  } | null;
}

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: Date;
}

interface ProjectStore {
  // Current project
  currentProject: Project | null;
  
  // Recent projects
  recentProjects: RecentProject[];
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createProject: (name: string) => Promise<void>;
  loadProject: (path: string) => Promise<void>;
  saveProject: () => Promise<void>;
  closeProject: () => void;
  
  // Step navigation
  setCurrentStep: (step: number) => void;
  completeStep: (step: number, data?: any) => void;
  canAccessStep: (step: number) => boolean;
  
  // Step-specific updates
  setE57Path: (path: string) => void;
  setPointCloudStats: (stats: Project["pointCloudStats"]) => void;
  addProjection: (projection: Project["projections"][0]) => void;
  removeProjection: (id: string) => void;
  setSegmentations: (segmentations: Segmentation[]) => void;
  updateSegmentation: (id: string, updates: Partial<Segmentation>) => void;
  setIntradosLines: (lines: IntradosLine[]) => void;
  setGeometryResult: (result: GeometryResult) => void;
  setReprojectionSelections: (selections: string[]) => void;
  addTrace3D: (trace: Project["traces3D"][0]) => void;
  addMeasurement: (measurement: Measurement) => void;
  saveHypothesis: (hypothesis: Hypothesis) => void;
  setChordMethodResult: (result: Project["chordMethodResult"]) => void;
}

const initialProject = (): Project => ({
  id: crypto.randomUUID(),
  name: "",
  path: "",
  createdAt: new Date(),
  updatedAt: new Date(),
  currentStep: 1,
  steps: {},
  projections: [],
  segmentations: [],
  intradosLines: [],
  geometryResult: null,
  reprojectionSelections: [],
  traces3D: [],
  measurements: [],
  hypotheses: [],
  chordMethodResult: null,
});

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      currentProject: null,
      recentProjects: [],
      isLoading: false,
      error: null,

      createProject: async (name: string) => {
        const project = initialProject();
        project.name = name;
        
        set({
          currentProject: project,
          isLoading: false,
          error: null,
        });
      },

      loadProject: async (path: string) => {
        set({ isLoading: true, error: null });
        try {
          // In a real implementation, this would load from file
          const project = initialProject();
          project.path = path;
          project.name = path.split("/").pop()?.replace(".vault", "") || "Untitled";
          
          // Update recent projects
          const recentProjects = get().recentProjects.filter((p) => p.path !== path);
          recentProjects.unshift({
            name: project.name,
            path,
            lastOpened: new Date(),
          });
          
          set({
            currentProject: project,
            recentProjects: recentProjects.slice(0, 10),
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Failed to load project",
            isLoading: false,
          });
        }
      },

      saveProject: async () => {
        const { currentProject } = get();
        if (!currentProject) return;
        
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, updatedAt: new Date() }
            : null,
        }));
      },

      closeProject: () => {
        set({ currentProject: null });
      },

      setCurrentStep: (step: number) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, currentStep: step }
            : null,
        }));
      },

      completeStep: (step: number, data?: any) => {
        set((state) => {
          if (!state.currentProject) return state;
          return {
            currentProject: {
              ...state.currentProject,
              steps: {
                ...state.currentProject.steps,
                [step]: { completed: true, data },
              },
            },
          };
        });
      },

      canAccessStep: (step: number) => {
        const { currentProject } = get();
        if (!currentProject) return false;
        if (step === 1) return true;
        
        // Check if previous step is completed
        const prevStep = currentProject.steps[step - 1];
        return prevStep?.completed || false;
      },

      setE57Path: (path: string) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, e57Path: path }
            : null,
        }));
      },

      setPointCloudStats: (stats) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, pointCloudStats: stats }
            : null,
        }));
      },

      addProjection: (projection) => {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                projections: [...state.currentProject.projections, projection],
              }
            : null,
        }));
      },

      removeProjection: (id: string) => {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                projections: state.currentProject.projections.filter((p) => p.id !== id),
              }
            : null,
        }));
      },

      setSegmentations: (segmentations) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, segmentations }
            : null,
        }));
      },

      updateSegmentation: (id, updates) => {
        set((state) => {
          if (!state.currentProject) return state;
          return {
            currentProject: {
              ...state.currentProject,
              segmentations: state.currentProject.segmentations.map((s) =>
                s.id === id ? { ...s, ...updates } : s
              ),
            },
          };
        });
      },

      setIntradosLines: (lines) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, intradosLines: lines }
            : null,
        }));
      },

      setGeometryResult: (result) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, geometryResult: result }
            : null,
        }));
      },

      setReprojectionSelections: (selections) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, reprojectionSelections: selections }
            : null,
        }));
      },

      addTrace3D: (trace) => {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                traces3D: [...state.currentProject.traces3D, trace],
              }
            : null,
        }));
      },

      addMeasurement: (measurement) => {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                measurements: [...state.currentProject.measurements, measurement],
              }
            : null,
        }));
      },

      saveHypothesis: (hypothesis) => {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                hypotheses: [...state.currentProject.hypotheses, hypothesis],
              }
            : null,
        }));
      },

      setChordMethodResult: (result) => {
        set((state) => ({
          currentProject: state.currentProject
            ? { ...state.currentProject, chordMethodResult: result }
            : null,
        }));
      },
    }),
    {
      name: "vault-analyzer-storage",
      partialize: (state) => ({
        recentProjects: state.recentProjects,
      }),
    }
  )
);

