export type Geometry2DWorkflowSection = "roi" | "nodes" | "matching" | "reconstruct";

export interface GeometryResult {
  classification: "starcut" | "circlecut" | "starcirclecut";
  bossStones: Array<{ x: number; y: number; label: string }>;
  px: number;
  py: number;
}

export interface GroupVisibilityInfo {
  visible: number;
  total: number;
  color: string;
}

export interface Geometry2DSegmentationLayerOption {
  groupId: string;
  label: string;
  color: string;
}

export interface Geometry2DReconstructLayers {
  visibleSegmentationGroups: string[];
  showBaseImage: boolean;
  showROI: boolean;
  showNodes: boolean;
  showReconstructedRibs: boolean;
}

export type Geometry2DReconstructOverlayKey =
  | "showBaseImage"
  | "showROI"
  | "showNodes"
  | "showReconstructedRibs";

export const DEFAULT_RECONSTRUCT_LAYERS: Geometry2DReconstructLayers = {
  visibleSegmentationGroups: [],
  showBaseImage: true,
  showROI: false,
  showNodes: true,
  showReconstructedRibs: true,
};

export const RECONSTRUCTION_OVERLAY_OPTIONS: Array<{
  key: Geometry2DReconstructOverlayKey;
  label: string;
}> = [
  { key: "showBaseImage", label: "Projection" },
  { key: "showROI", label: "ROI" },
  { key: "showNodes", label: "Nodes" },
  { key: "showReconstructedRibs", label: "Reconstructed Ribs" },
];
