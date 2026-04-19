import { describe, it, expect } from 'vitest'
import { computeAutoLayout } from '../../lib/board/auto-layout'
import type { LayoutInput } from '../../lib/board/types'

const baseInput = (overrides: Partial<LayoutInput> = {}): LayoutInput => ({
  cards: [],
  viewportWidth: 1200,
  targetRowHeight: 180,
  gap: 4,
  direction: 'vertical',
  ...overrides,
})

describe('computeAutoLayout', () => {
  it('returns empty positions for empty cards', () => {
    const res = computeAutoLayout(baseInput())
    expect(res.positions).toEqual({})
    expect(res.totalHeight).toBe(0)
  })

  it('places single card at target row height with width = aspect * height', () => {
    const res = computeAutoLayout(
      baseInput({
        cards: [{ id: 'a', aspectRatio: 1.5 }],
      }),
    )
    expect(res.positions.a.h).toBe(180)
    expect(res.positions.a.w).toBe(180 * 1.5)
    expect(res.positions.a.x).toBeGreaterThanOrEqual(0)
    expect(res.positions.a.y).toBe(0)
  })

  it('justifies a row to viewportWidth when cards exceed it', () => {
    const res = computeAutoLayout(
      baseInput({
        viewportWidth: 1000,
        cards: [
          { id: 'a', aspectRatio: 2 },
          { id: 'b', aspectRatio: 2 },
          { id: 'c', aspectRatio: 2 },
        ],
      }),
    )
    const totalW = res.positions.a.w + res.positions.b.w + res.positions.c.w
    const gaps = 4 * 2
    const margins = 16 * 2
    expect(totalW + gaps + margins).toBeCloseTo(1000, 0)
  })

  it('leaves last row left-aligned when it cannot fill viewport', () => {
    const res = computeAutoLayout(
      baseInput({
        viewportWidth: 1200,
        cards: [
          { id: 'a', aspectRatio: 1 },
          { id: 'b', aspectRatio: 1 },
          { id: 'c', aspectRatio: 1 },
        ],
      }),
    )
    expect(res.positions.c.h).toBe(180)
    expect(res.positions.c.w).toBe(180)
  })

  it('handles tall aspect ratio (0.5)', () => {
    const res = computeAutoLayout(
      baseInput({
        cards: [{ id: 'a', aspectRatio: 0.5 }],
      }),
    )
    expect(res.positions.a.w).toBe(180 * 0.5)
    expect(res.positions.a.h).toBe(180)
  })

  it('respects userOverridePos — card not placed by auto layout', () => {
    const override = { x: 300, y: 500, w: 200, h: 150 }
    const res = computeAutoLayout(
      baseInput({
        cards: [{ id: 'a', aspectRatio: 1, userOverridePos: override }],
      }),
    )
    expect(res.positions.a).toEqual(override)
  })

  it('computes totalHeight as sum of row heights including final row', () => {
    const res = computeAutoLayout(
      baseInput({
        viewportWidth: 1000,
        cards: [
          { id: 'a', aspectRatio: 2 },
          { id: 'b', aspectRatio: 2 },
          { id: 'c', aspectRatio: 2 },
          { id: 'd', aspectRatio: 1 },
        ],
      }),
    )
    expect(res.totalHeight).toBeGreaterThan(300)
  })

  it('completes 1000 cards layout under 16ms', () => {
    const cards = Array.from({ length: 1000 }, (_, i) => ({
      id: `card-${i}`,
      aspectRatio: 0.5 + Math.random() * 2.5,
    }))
    const start = performance.now()
    computeAutoLayout(baseInput({ cards }))
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(16)
  })
})
