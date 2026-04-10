// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Axis-aligned bounding box */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Overlap calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the overlapping area (in square pixels) between two rectangles.
 * Returns 0 if they don't overlap.
 */
export function getOverlapArea(a: Rect, b: Rect): number {
  const overlapX = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  )
  const overlapY = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  )
  return overlapX * overlapY
}

/**
 * Calculate overlap as a fraction (0–1) of the smaller rectangle's area.
 * Returns 0 if no overlap, 1 if fully contained.
 */
export function getOverlapPercentage(a: Rect, b: Rect): number {
  const overlap = getOverlapArea(a, b)
  if (overlap === 0) return 0
  const smallerArea = Math.min(a.width * a.height, b.width * b.height)
  return overlap / smallerArea
}

// ---------------------------------------------------------------------------
// Position finding
// ---------------------------------------------------------------------------

/**
 * Find a position near `center` where a new card of the given size
 * doesn't overlap more than `maxOverlap` with any existing rect.
 *
 * Uses a golden-angle spiral search pattern outward from center.
 * Returns center immediately if no existing rects.
 */
export function findNonOverlappingPosition(
  existingRects: Rect[],
  newSize: { width: number; height: number },
  center: { x: number; y: number },
  maxOverlap: number,
  maxAttempts: number,
): { x: number; y: number } {
  if (existingRects.length === 0) {
    return { x: center.x, y: center.y }
  }

  const step = 60
  for (let i = 0; i < maxAttempts; i++) {
    const angle = (i * 137.5 * Math.PI) / 180
    const radius = step * Math.sqrt(i)
    const candidateX = center.x + radius * Math.cos(angle)
    const candidateY = center.y + radius * Math.sin(angle)

    const candidate: Rect = {
      x: candidateX,
      y: candidateY,
      width: newSize.width,
      height: newSize.height,
    }

    const hasExcessiveOverlap = existingRects.some(
      (r) => getOverlapPercentage(r, candidate) > maxOverlap,
    )

    if (!hasExcessiveOverlap) {
      return { x: candidateX, y: candidateY }
    }
  }

  const lastAngle = (maxAttempts * 137.5 * Math.PI) / 180
  const lastRadius = step * Math.sqrt(maxAttempts)
  return {
    x: center.x + lastRadius * Math.cos(lastAngle),
    y: center.y + lastRadius * Math.sin(lastAngle),
  }
}
