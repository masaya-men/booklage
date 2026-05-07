import { describe, it, expect } from 'vitest'
import { computeColumnMasonry } from './column-masonry'

describe('computeColumnMasonry', () => {
  it('returns empty result for empty cards', () => {
    const result = computeColumnMasonry({
      cards: [],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.positions).toEqual({})
    expect(result.totalHeight).toBe(0)
    expect(result.columnCount).toBeGreaterThanOrEqual(1)
  })

  it('places 3 cards side-by-side in a 3-column viewport', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1 },
        { id: 'b', aspectRatio: 1, columnSpan: 1 },
        { id: 'c', aspectRatio: 1, columnSpan: 1 },
      ],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(3)
    expect(result.positions.a.y).toBe(0)
    expect(result.positions.b.y).toBe(0)
    expect(result.positions.c.y).toBe(0)
    expect(result.positions.a.x).toBeLessThan(result.positions.b.x)
    expect(result.positions.b.x).toBeLessThan(result.positions.c.x)
  })

  it('wraps to next row after 3 cards in 3-column viewport', () => {
    const result = computeColumnMasonry({
      cards: Array.from({ length: 6 }, (_, i) => ({
        id: String(i),
        aspectRatio: 1,
        columnSpan: 1,
      })),
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    // Card 3 should land in column 0, below card 0
    expect(result.positions['3'].x).toBeCloseTo(result.positions['0'].x)
    expect(result.positions['3'].y).toBeGreaterThan(result.positions['0'].y)
  })

  it('pushes shorter columns first (masonry)', () => {
    // Card 0 is tall (aspect 0.5 → h = 2*w). Card 1 is short (aspect 2 → h = 0.5*w).
    // After placing both in cols 0 and 1, card 2 should land in col 1 (shorter).
    const result = computeColumnMasonry({
      cards: [
        { id: 'tall', aspectRatio: 0.5, columnSpan: 1 },   // tall
        { id: 'short', aspectRatio: 2, columnSpan: 1 },    // short
        { id: 'next', aspectRatio: 1, columnSpan: 1 },
      ],
      containerWidth: 520,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(2)
    // next should go below `short` (col 1), not below `tall` (col 0)
    expect(result.positions.next.x).toBeCloseTo(result.positions.short.x)
  })

  it('span=2 card occupies 2 columns', () => {
    const result = computeColumnMasonry({
      cards: [{ id: 'big', aspectRatio: 1, columnSpan: 2 }],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(3)
    // Width = 2 * columnUnit + 1 * gap
    const expectedWidth = 2 * result.columnUnit + 8
    expect(result.positions.big.w).toBeCloseTo(expectedWidth)
  })

  it('span=3 card in a 2-column viewport clamps to span=2', () => {
    const result = computeColumnMasonry({
      cards: [{ id: 'xl', aspectRatio: 1, columnSpan: 3 }],
      containerWidth: 520,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(2)
    // Width = 2 * columnUnit + gap (clamped)
    const expectedWidth = 2 * result.columnUnit + 8
    expect(result.positions.xl.w).toBeCloseTo(expectedWidth)
  })

  it('keeps order — earlier card placed first', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'first', aspectRatio: 1, columnSpan: 2 },  // span 2 at top-left
        { id: 'second', aspectRatio: 1, columnSpan: 1 }, // col 2, top
      ],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.positions.first.x).toBe(0)
    expect(result.positions.first.y).toBe(0)
    expect(result.positions.second.x).toBeGreaterThan(result.positions.first.x)
    expect(result.positions.second.y).toBe(0)
  })

  it('narrow viewport collapses to 1 column', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1 },
        { id: 'b', aspectRatio: 1, columnSpan: 1 },
      ],
      containerWidth: 200,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.columnCount).toBe(1)
    expect(result.positions.a.x).toBe(0)
    expect(result.positions.b.x).toBe(0)
    expect(result.positions.b.y).toBeGreaterThan(result.positions.a.y)
  })

  it('uses intrinsicHeight when provided, ignoring aspectRatio', () => {
    // aspectRatio 1 + width 240 would yield h = 240, but intrinsicHeight = 400 wins
    const result = computeColumnMasonry({
      cards: [
        { id: 'tweet', aspectRatio: 1, columnSpan: 1, intrinsicHeight: 400 },
      ],
      containerWidth: 800,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.positions.tweet.h).toBe(400)
  })

  it('intrinsicHeight applies per-card without affecting aspectRatio cards in the same layout', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'img', aspectRatio: 1, columnSpan: 1 },
        { id: 'tweet', aspectRatio: 1, columnSpan: 1, intrinsicHeight: 350 },
      ],
      containerWidth: 520,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.positions.img.h).toBeCloseTo(result.columnUnit)
    expect(result.positions.tweet.h).toBe(350)
  })

  it('reports totalHeight based on tallest column', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1 },   // col 0, h = columnUnit
        { id: 'b', aspectRatio: 0.5, columnSpan: 1 }, // col 1, h = 2*columnUnit
      ],
      containerWidth: 520,
      gap: 8,
      targetColumnUnit: 240,
    })
    expect(result.totalHeight).toBeCloseTo(result.positions.b.y + result.positions.b.h)
  })
})

describe('computeColumnMasonry — targetWidth', () => {
  it('uses per-card targetWidth to pick the column count, falls back to columnSpan', () => {
    const result = computeColumnMasonry({
      cards: [
        { id: 'a', aspectRatio: 1, columnSpan: 1, targetWidth: 160 },
        { id: 'b', aspectRatio: 1, columnSpan: 1, targetWidth: 160 },
      ],
      containerWidth: 1000,
      gap: 16,
      targetColumnUnit: 160,
    })
    const a = result.positions['a']
    expect(a.w).toBeGreaterThan(140)
    expect(a.w).toBeLessThan(200)
  })
})
