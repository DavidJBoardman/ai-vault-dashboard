interface SegmentationLike {
  label?: string;
  groupId?: string;
}

export function getSegmentationGroupId(segmentation: SegmentationLike): string {
  const explicitGroup = segmentation.groupId?.trim();
  if (explicitGroup) return explicitGroup;

  const label = segmentation.label || "";
  const withoutNumericSuffix = label.replace(/\s*#?\d+$/, "").trim();
  const withoutLetterSuffix = withoutNumericSuffix.replace(/\s+[A-Z][a-z]?$/, "").trim();
  const groupId = withoutLetterSuffix.toLowerCase().replace(/\s+/g, "_");
  return groupId || "unknown";
}

export function filterSegmentationsByGroupIds<T extends SegmentationLike>(
  segmentations: T[],
  groupIds: string[]
): T[] {
  if (groupIds.length === 0) return [];
  const visibleGroupIds = new Set(groupIds);
  return segmentations.filter((segmentation) => visibleGroupIds.has(getSegmentationGroupId(segmentation)));
}
