import { describe, it, expect } from 'vitest'
import { computeSkylineLayout, type SkylineCard } from './skyline-layout'

describe('computeSkylineLayout', () => {
  it('returns empty result for empty cards', () => {
    const result = computeSkylineLayout({ cards: [], containerWidth: 800, gap: 18 })
    expect(result.positions).toEqual({})
    expect(result.totalHeight).toBe(0)
    expect(result.totalWidth).toBe(800)
  })

  it('places a single card at the top-left corner', () => {
    const result = computeSkylineLayout({
      cards: [{ id: 'a', width: 240, height: 240 }],
      containerWidth: 800,
      gap: 18,
    })
    expect(result.positions.a).toEqual({ x: 0, y: 0, w: 240, h: 240 })
    expect(result.totalHeight).toBe(240)
  })

  it('places three uniform cards side-by-side, gap respected', () => {
    const cards: SkylineCard[] = [
      { id: 'a', width: 240, height: 240 },
      { id: 'b', width: 240, height: 240 },
      { id: 'c', width: 240, height: 240 },
    ]
    const result = computeSkylineLayout({ cards, containerWidth: 800, gap: 18 })
    expect(result.positions.a.x).toBe(0)
    expect(result.positions.b.x).toBeGreaterThanOrEqual(240 + 18)
    expect(result.positions.c.x).toBeGreaterThanOrEqual(result.positions.b.x + 240 + 18)
    expect(result.positions.a.y).toBe(0)
    expect(result.positions.b.y).toBe(0)
    expect(result.positions.c.y).toBe(0)
  })

  it('wraps to the next row when the next card does not fit on the right', () => {
    // Container 800, three 240-wide cards span 0..240, 258..498, 516..756.
    // Right edge after card 3 = 756, gap = 18 → next start at 774. Card 4
    // width 240 needs up to 1014 — does not fit on this row, so wraps.
    const cards: SkylineCard[] = [
      { id: 'a', width: 240, height: 240 },
      { id: 'b', width: 240, height: 240 },
      { id: 'c', width: 240, height: 240 },
      { id: 'd', width: 240, height: 240 },
    ]
    const result = computeSkylineLayout({ cards, containerWidth: 800, gap: 18 })
    expect(result.positions.d.x).toBe(0)
    expect(result.positions.d.y).toBe(240 + 18)
  })

  it('fills the lowest available row first (Pinterest-style packing)', () => {
    // Card a is tall (h=400), card b is short (h=120). Card c should go
    // below b (lower bottom edge), not below a.
    const cards: SkylineCard[] = [
      { id: 'a', width: 240, height: 400 },
      { id: 'b', width: 240, height: 120 },
      { id: 'c', width: 240, height: 200 },
    ]
    const result = computeSkylineLayout({ cards, containerWidth: 540, gap: 18 })
    // a lives in the left strip, b in the right strip. Container 540
    // accommodates 2 240-wide strips with 18 gap (240+18+240=498 ≤ 540).
    expect(result.positions.c.x).toBeCloseTo(result.positions.b.x)
    expect(result.positions.c.y).toBeGreaterThan(result.positions.b.y)
    // Confirm c is positioned below b's bottom edge (b.y + b.h + gap)
    expect(result.positions.c.y).toBeCloseTo(result.positions.b.y + 120 + 18)
  })

  it('honors free per-card widths — cards can be any pixel width', () => {
    const cards: SkylineCard[] = [
      { id: 'wide', width: 400, height: 400 },
      { id: 'narrow', width: 120, height: 120 },
    ]
    const result = computeSkylineLayout({ cards, containerWidth: 800, gap: 18 })
    expect(result.positions.wide.w).toBe(400)
    expect(result.positions.narrow.w).toBe(120)
    // narrow sits to the right of wide on the same row
    expect(result.positions.narrow.x).toBeGreaterThanOrEqual(400 + 18)
    expect(result.positions.narrow.y).toBe(0)
  })

  it('clamps card width to container when too wide', () => {
    const result = computeSkylineLayout({
      cards: [{ id: 'huge', width: 2000, height: 2000 }],
      containerWidth: 600,
      gap: 18,
    })
    expect(result.positions.huge.w).toBe(600)
  })

  it('preserves input order — earlier cards placed first', () => {
    const result = computeSkylineLayout({
      cards: [
        { id: 'first', width: 240, height: 240 },
        { id: 'second', width: 240, height: 240 },
      ],
      containerWidth: 800,
      gap: 18,
    })
    expect(result.positions.first.x).toBe(0)
    expect(result.positions.first.y).toBe(0)
    expect(result.positions.second.x).toBeGreaterThan(result.positions.first.x)
  })

  it('cards never overlap', () => {
    // Mixed widths and heights stress the algorithm
    const widths = [200, 350, 180, 240, 300, 160, 420, 220, 280, 200]
    const cards: SkylineCard[] = widths.map((w, i) => ({
      id: `c${i}`,
      width: w,
      height: w * (0.6 + (i % 3) * 0.3), // 0.6/0.9/1.2 aspect mix
    }))
    const result = computeSkylineLayout({ cards, containerWidth: 1000, gap: 18 })
    // Verify no two card rectangles overlap
    const ids = Object.keys(result.positions)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = result.positions[ids[i]]
        const b = result.positions[ids[j]]
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('respects the gap between adjacent cards horizontally', () => {
    const cards: SkylineCard[] = [
      { id: 'a', width: 200, height: 200 },
      { id: 'b', width: 200, height: 200 },
    ]
    const result = computeSkylineLayout({ cards, containerWidth: 800, gap: 18 })
    const a = result.positions.a
    const b = result.positions.b
    // b.x should be >= a.x + a.w + gap
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w + 18)
  })

  it('respects the gap between rows vertically', () => {
    const cards: SkylineCard[] = [
      { id: 'a', width: 600, height: 200 },
      { id: 'b', width: 600, height: 200 },
    ]
    const result = computeSkylineLayout({ cards, containerWidth: 700, gap: 18 })
    expect(result.positions.b.y).toBeCloseTo(200 + 18)
  })

  it('reports totalHeight from the lowest visible card bottom', () => {
    const cards: SkylineCard[] = [
      { id: 'a', width: 240, height: 100 },
      { id: 'b', width: 240, height: 400 },
    ]
    const result = computeSkylineLayout({ cards, containerWidth: 540, gap: 18 })
    expect(result.totalHeight).toBeCloseTo(400)
  })

  it('handles a card whose width exactly equals container width', () => {
    const result = computeSkylineLayout({
      cards: [
        { id: 'full', width: 800, height: 200 },
        { id: 'next', width: 240, height: 240 },
      ],
      containerWidth: 800,
      gap: 18,
    })
    expect(result.positions.full).toEqual({ x: 0, y: 0, w: 800, h: 200 })
    // next must start below the full-width card (gap respected)
    expect(result.positions.next.y).toBeCloseTo(200 + 18)
    expect(result.positions.next.x).toBe(0)
  })
})
