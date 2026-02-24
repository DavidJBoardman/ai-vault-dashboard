export type Geometry2DWorkflowSection = "roi" | "template" | "reconstruct" | "export";

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
