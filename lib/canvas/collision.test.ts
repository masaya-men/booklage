import { describe, it, expect } from 'vitest'
import {
  getOverlapArea,
  getOverlapPercentage,
  findNonOverlappingPosition,
  type Rect,
} from './collision'

describe('getOverlapArea', () => {
  it('returns 0 for non-overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 200, y: 200, width: 100, height: 100 }
    expect(getOverlapArea(a, b)).toBe(0)
  })

  it('returns correct area for partially overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 50, y: 50, width: 100, height: 100 }
    expect(getOverlapArea(a, b)).toBe(2500)
  })

  it('returns full area for identical rects', () => {
    const a: Rect = { x: 10, y: 10, width: 50, height: 50 }
    expect(getOverlapArea(a, a)).toBe(2500)
  })

  it('returns correct area when one rect is inside another', () => {
    const outer: Rect = { x: 0, y: 0, width: 200, height: 200 }
    const inner: Rect = { x: 50, y: 50, width: 50, height: 50 }
    expect(getOverlapArea(outer, inner)).toBe(2500)
  })
})

describe('getOverlapPercentage', () => {
  it('returns 0 for non-overlapping rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 200, y: 0, width: 100, height: 100 }
    expect(getOverlapPercentage(a, b)).toBe(0)
  })

  it('returns 1 for identical rects', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    expect(getOverlapPercentage(a, a)).toBe(1)
  })

  it('returns correct percentage for partial overlap', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const b: Rect = { x: 50, y: 0, width: 100, height: 100 }
    expect(getOverlapPercentage(a, b)).toBe(0.5)
  })
})

describe('findNonOverlappingPosition', () => {
  it('returns center when no existing rects', () => {
    const pos = findNonOverlappingPosition(
      [],
      { width: 100, height: 100 },
      { x: 500, y: 500 },
      0.5,
      10,
    )
    expect(pos.x).toBe(500)
    expect(pos.y).toBe(500)
  })

  it('avoids overlapping with existing rect', () => {
    const existing: Rect[] = [{ x: 500, y: 500, width: 240, height: 160 }]
    const pos = findNonOverlappingPosition(
      existing,
      { width: 240, height: 160 },
      { x: 500, y: 500 },
      0.5,
      10,
    )
    const newRect: Rect = { x: pos.x, y: pos.y, width: 240, height: 160 }
    const overlap = getOverlapPercentage(existing[0], newRect)
    expect(overlap).toBeLessThan(0.5)
  })
})
