export interface Geometry2DProjectionLike {
  id: string;
  name?: string;
  previewImage?: string;
  settings?: {
    resolution?: number;
  };
  images?: {
    colour?: string;
    depthGrayscale?: string;
    depthPlasma?: string;
  };
}

interface Geometry2DProjectLike {
  selectedProjectionId?: string | null;
  projections?: Geometry2DProjectionLike[];
  steps?: Record<number | string, { data?: unknown } | undefined>;
}

interface Geometry2DPersistedProjection {
  projectionId?: string | null;
}

function getGeometry2DData(project: Geometry2DProjectLike | null | undefined): Geometry2DPersistedProjection {
  const step4Data = project?.steps?.[4]?.data ?? project?.steps?.["4"]?.data;
  if (!step4Data || typeof step4Data !== "object") return {};
  const geometry2d = (step4Data as { geometry2d?: unknown }).geometry2d;
  return geometry2d && typeof geometry2d === "object"
    ? (geometry2d as Geometry2DPersistedProjection)
    : {};
}

function getStep3ProjectionId(project: Geometry2DProjectLike | null | undefined): string | null {
  const step3Data = project?.steps?.[3]?.data ?? project?.steps?.["3"]?.data;
  if (!step3Data || typeof step3Data !== "object") return null;
  const selectedProjectionId = (step3Data as { selectedProjectionId?: unknown }).selectedProjectionId;
  return typeof selectedProjectionId === "string" && selectedProjectionId ? selectedProjectionId : null;
}

export function resolveGeometry2DProjection(options: {
  project: Geometry2DProjectLike | null | undefined;
  preferStep4Projection?: boolean;
}): Geometry2DProjectionLike | null {
  const { project, preferStep4Projection = false } = options;
  const projections = project?.projections ?? [];
  if (projections.length === 0) return null;

  const geometry2d = getGeometry2DData(project);
  const candidateIds = [
    preferStep4Projection ? geometry2d.projectionId : null,
    project?.selectedProjectionId,
    getStep3ProjectionId(project),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const id of candidateIds) {
    const projection = projections.find((item) => item.id === id);
    if (projection) return projection;
  }

  return projections[0] ?? null;
}

export function buildGeometry2DProjectionSnapshot(
  projection: Geometry2DProjectionLike | null | undefined
): {
  projectionId?: string;
  projectionName?: string;
  projectionResolution?: number;
} {
  if (!projection) return {};
  return {
    projectionId: projection.id,
    projectionName: projection.name,
    projectionResolution: projection.settings?.resolution,
  };
}
