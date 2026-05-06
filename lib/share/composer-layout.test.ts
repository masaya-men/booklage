// lib/share/composer-layout.test.ts
import { describe, it, expect } from 'vitest'
import { composeShareLayout } from './composer-layout'

const item = (id: string, opts: Partial<{ aspectRatio: number; sizePreset: 'S' | 'M' | 'L' }> = {}) => ({
  bookmarkId: id,
  url: `https://example.com/${id}`,
  title: `t-${id}`,
  description: '',
  thumbnail: '',
  type: 'website' as const,
  sizePreset: opts.sizePreset ?? ('S' as const),
  aspectRatio: opts.aspectRatio ?? 1,
})

describe('composeShareLayout', () => {
  it('produces normalized 0..1 coords for 3 simple cards in free aspect', () => {
    const items = [item('a'), item('b'), item('c')]
    const result = composeShareLayout({
      items,
      order: ['a', 'b', 'c'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(result.cards).toHaveLength(3)
    expect(result.didShrink).toBe(false)
    expect(result.shrinkScale).toBe(1)
    expect(result.frameSize).toEqual({ width: 1080, height: 720 })
    for (const c of result.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })
})
