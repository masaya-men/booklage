/**
 * Discrete card-size levels exposed to users via the SIZE picker.
 * Each level maps to a fixed column count; the masonry distributes
 * `containerWidth` evenly across that column count, so cards always
 * fill the full width regardless of viewport.
 *
 * Convention: smaller level number = more columns = denser / smaller cards.
 * Level 5 = biggest cards, level 1 = densest grid.
 */

export type SizeLevel = 1 | 2 | 3 | 4 | 5

export const SIZE_LEVELS: ReadonlyArray<SizeLevel> = [1, 2, 3, 4, 5]

export const DEFAULT_SIZE_LEVEL: SizeLevel = 3

const LEVEL_TO_COLUMNS: Readonly<Record<SizeLevel, number>> = {
  1: 7,
  2: 6,
  3: 5,
  4: 4,
  5: 3,
}

export function sizeLevelToColumnCount(level: SizeLevel): number {
  return LEVEL_TO_COLUMNS[level]
}

/**
 * Compute the `targetColumnUnit` to feed into computeColumnMasonry so that
 * the masonry derives exactly `desiredColumnCount` columns at the given
 * container width. The masonry uses
 *   columnCount = floor((container + gap) / (target + gap))
 * so we pick a target slightly below container/N to land on N consistently.
 */
export function targetColumnUnitForCount(
  containerWidth: number,
  gap: number,
  desiredColumnCount: number,
): number {
  if (containerWidth <= 0 || desiredColumnCount <= 0) return 1
  // Center of the band that produces `desiredColumnCount`:
  //   floor((W+G)/(target+G)) === N
  // ⇔ (W+G)/(N+1) < target+G ≤ (W+G)/N
  // Pick the upper bound minus a hair so the floor lands on N.
  const upper = (containerWidth + gap) / desiredColumnCount - gap
  return Math.max(1, upper - 1)
}

export function clampSizeLevel(value: number): SizeLevel {
  if (!Number.isFinite(value)) return DEFAULT_SIZE_LEVEL
  const rounded = Math.round(value)
  if (rounded < 1) return 1
  if (rounded > 5) return 5
  return rounded as SizeLevel
}
