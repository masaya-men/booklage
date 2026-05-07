import { describe, it, expect } from 'vitest'
import {
  SIZE_LEVELS,
  DEFAULT_SIZE_LEVEL,
  sizeLevelToColumnCount,
  targetColumnUnitForCount,
  clampSizeLevel,
} from './size-levels'

describe('size-levels', () => {
  it('exports 5 levels with default 3', () => {
    expect(SIZE_LEVELS).toEqual([1, 2, 3, 4, 5])
    expect(DEFAULT_SIZE_LEVEL).toBe(3)
  })

  it('maps level 1..5 to descending column counts (denser → bigger)', () => {
    expect(sizeLevelToColumnCount(1)).toBe(7)
    expect(sizeLevelToColumnCount(2)).toBe(6)
    expect(sizeLevelToColumnCount(3)).toBe(5)
    expect(sizeLevelToColumnCount(4)).toBe(4)
    expect(sizeLevelToColumnCount(5)).toBe(3)
  })

  it('targetColumnUnitForCount produces a value that yields the desired count', () => {
    const containerWidth = 1500
    const gap = 18
    for (const level of SIZE_LEVELS) {
      const desired = sizeLevelToColumnCount(level)
      const target = targetColumnUnitForCount(containerWidth, gap, desired)
      const derived = Math.floor((containerWidth + gap) / (target + gap))
      expect(derived).toBe(desired)
    }
  })

  it('clampSizeLevel rounds and clamps to 1..5', () => {
    expect(clampSizeLevel(0)).toBe(1)
    expect(clampSizeLevel(2.4)).toBe(2)
    expect(clampSizeLevel(2.6)).toBe(3)
    expect(clampSizeLevel(99)).toBe(5)
    expect(clampSizeLevel(NaN)).toBe(DEFAULT_SIZE_LEVEL)
  })
})
