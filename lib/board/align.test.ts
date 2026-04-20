import { describe, it, expect } from 'vitest'
import { alignAllToGrid, type AlignableItem } from './align'

const opts = { containerWidth: 1200, targetRowHeight: 180, gap: 4 } as const

describe('alignAllToGrid', () => {
  it('returns items with freePos filled in grid positions', () => {
    const items: AlignableItem[] = [
      { id: 'a', aspectRatio: 1, freePos: null },
      { id: 'b', aspectRatio: 1.5, freePos: null },
      { id: 'c', aspectRatio: 0.75, freePos: null },
    ]

    const out = alignAllToGrid(items, opts)

    expect(out).toHaveLength(3)
    for (const it of out) {
      expect(it.freePos).not.toBeNull()
      expect(it.freePos!.x).toBeGreaterThanOrEqual(0)
      expect(it.freePos!.y).toBeGreaterThanOrEqual(0)
      expect(it.freePos!.w).toBeGreaterThan(0)
      expect(it.freePos!.h).toBeGreaterThan(0)
    }
  })

  it('preserves item ordering', () => {
    const items: AlignableItem[] = [
      { id: 'a', aspectRatio: 1, freePos: null },
      { id: 'b', aspectRatio: 1, freePos: null },
    ]
    const out = alignAllToGrid(items, opts)
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('replaces position on existing freePos but preserves rotation / zIndex / locked / isUserResized', () => {
    const items: AlignableItem[] = [
      {
        id: 'a',
        aspectRatio: 1,
        freePos: {
          x: 999,
          y: 999,
          w: 50,
          h: 50,
          rotation: 17,
          zIndex: 9,
          locked: true,
          isUserResized: true,
        },
      },
    ]
    const out = alignAllToGrid(items, opts)
    const fp = out[0]!.freePos!
    expect(fp.x).not.toBe(999)
    expect(fp.y).not.toBe(999)
    expect(fp.rotation).toBe(17)
    expect(fp.zIndex).toBe(9)
    expect(fp.locked).toBe(true)
    expect(fp.isUserResized).toBe(true)
  })

  it('handles empty list', () => {
    expect(alignAllToGrid([], opts)).toEqual([])
  })
})
