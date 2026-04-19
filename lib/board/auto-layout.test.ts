import { describe, it, expect } from 'vitest'
import { computeAutoLayout, computeGridLayoutWithVirtualInsert } from './auto-layout'
import type { LayoutCard } from './types'

const mkCard = (id: string, ar: number): LayoutCard => ({ id, aspectRatio: ar })

describe('computeAutoLayout', () => {
  it('returns empty positions for empty cards', () => {
    const result = computeAutoLayout({
      cards: [],
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
    })
    expect(result.positions).toEqual({})
    expect(result.totalHeight).toBe(0)
  })

  it('places a single card', () => {
    const cards = [mkCard('a', 1)]
    const result = computeAutoLayout({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
    })
    expect(result.positions.a).toBeDefined()
    expect(result.positions.a.y).toBe(0)
  })

  it('places multiple cards in a row', () => {
    const cards = [mkCard('a', 1), mkCard('b', 1), mkCard('c', 1)]
    const result = computeAutoLayout({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
    })
    expect(result.positions.a.y).toBe(result.positions.b.y)
    expect(result.positions.b.y).toBe(result.positions.c.y)
    expect(result.positions.a.x).toBeLessThan(result.positions.b.x)
    expect(result.positions.b.x).toBeLessThan(result.positions.c.x)
  })

  it('wraps to next row when needed', () => {
    const cards = Array.from({ length: 10 }, (_, i) => mkCard(String(i), 1.5))
    const result = computeAutoLayout({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
    })
    expect(result.positions['0'].y).toBeLessThan(result.positions['9'].y)
  })
})

describe('computeGridLayoutWithVirtualInsert', () => {
  it('places dragged card at virtualIndex position without changing others order', () => {
    const cards = [mkCard('a', 1), mkCard('b', 1), mkCard('c', 1), mkCard('d', 1)]
    const result = computeGridLayoutWithVirtualInsert({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
      draggedCardId: 'c',
      virtualIndex: 1,  // insert c between a and b
    })
    // Expected visual order: a, c, b, d → so c should be between a and b horizontally
    expect(result.positions.c.x).toBeGreaterThan(result.positions.a.x)
    expect(result.positions.c.x).toBeLessThan(result.positions.b.x)
  })

  it('handles virtualIndex at end', () => {
    const cards = [mkCard('a', 1), mkCard('b', 1), mkCard('c', 1)]
    const result = computeGridLayoutWithVirtualInsert({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
      draggedCardId: 'a',
      virtualIndex: 2,
    })
    // a should be at the end
    expect(result.positions.a.x).toBeGreaterThan(result.positions.c.x)
  })

  it('clamps virtualIndex to valid range', () => {
    const cards = [mkCard('a', 1), mkCard('b', 1), mkCard('c', 1)]
    const result = computeGridLayoutWithVirtualInsert({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
      draggedCardId: 'a',
      virtualIndex: 100,  // way out of range
    })
    // Should clamp to 2 (end)
    expect(result.positions.a.x).toBeGreaterThan(result.positions.c.x)
  })

  it('handles negative virtualIndex', () => {
    const cards = [mkCard('a', 1), mkCard('b', 1), mkCard('c', 1)]
    const result = computeGridLayoutWithVirtualInsert({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
      draggedCardId: 'c',
      virtualIndex: -5,  // negative
    })
    // Should clamp to 0 (beginning)
    expect(result.positions.c.x).toBeLessThan(result.positions.a.x)
  })

  it('returns original layout if draggedCardId not found', () => {
    const cards = [mkCard('a', 1), mkCard('b', 1)]
    const result = computeGridLayoutWithVirtualInsert({
      cards,
      viewportWidth: 800,
      targetRowHeight: 180,
      gap: 4,
      direction: 'vertical',
      draggedCardId: 'nonexistent',
      virtualIndex: 0,
    })
    // Should behave like computeAutoLayout
    expect(result.positions.a).toBeDefined()
    expect(result.positions.b).toBeDefined()
  })
})
