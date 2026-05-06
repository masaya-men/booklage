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

const makeItems = (n: number, prefix = 'x'): ReturnType<typeof item>[] => {
  const out: ReturnType<typeof item>[] = []
  for (let i = 0; i < n; i++) out.push(item(`${prefix}${i}`))
  return out
}

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
    // didShrink is false because masonry was upscaled or unchanged, not shrunk.
    expect(result.didShrink).toBe(false)
    // shrinkScale ≥ 1 — auto-fit may upscale to fill the frame vertically.
    expect(result.shrinkScale).toBeGreaterThanOrEqual(1)
    expect(result.frameSize).toEqual({ width: 1080, height: 720 })
    for (const c of result.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })

  it('respects given cardOrder when all ids are known', () => {
    const items = [item('a'), item('b'), item('c')]
    const r1 = composeShareLayout({
      items,
      order: ['c', 'a', 'b'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(r1.cards.map((c) => c.u)).toEqual([
      'https://example.com/c',
      'https://example.com/a',
      'https://example.com/b',
    ])
  })

  it('drops unknown ids in order and appends missing items at tail in original sequence', () => {
    const items = [item('a'), item('b'), item('c')]
    const r2 = composeShareLayout({
      items,
      order: ['zzz', 'b'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(r2.cards.map((c) => c.u)).toEqual([
      'https://example.com/b',
      'https://example.com/a',
      'https://example.com/c',
    ])
  })

  it('applies sizeOverrides — L spans more columns than S', () => {
    const items = [
      item('s', { sizePreset: 'S' }),
      item('l', { sizePreset: 'S' }), // base S, but override to L
    ]
    const overrides = new Map<string, 'S' | 'M' | 'L'>([['l', 'L']])
    const result = composeShareLayout({
      items,
      order: ['s', 'l'],
      sizeOverrides: overrides,
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    const sCard = result.cards.find((c) => c.u.endsWith('/s'))
    const lCard = result.cards.find((c) => c.u.endsWith('/l'))
    expect(sCard).toBeDefined()
    expect(lCard).toBeDefined()
    if (!sCard || !lCard) return
    expect(lCard.w).toBeGreaterThan(sCard.w)
    expect(lCard.s).toBe('L')   // echoed
    expect(sCard.s).toBe('S')
  })

  it('auto-shrinks when content overflows frame height; all cards fit within 0..1', () => {
    const items = makeItems(50)
    const result = composeShareLayout({
      items,
      order: items.map((it) => it.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '9:16',
      viewport: { width: 1080, height: 720 },
    })
    expect(result.didShrink).toBe(true)
    expect(result.shrinkScale).toBeLessThan(1)
    expect(result.shrinkScale).toBeGreaterThan(0)
    for (const c of result.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })

  it('vertically centers when scaled content height < frame height', () => {
    const items = [item('only', { sizePreset: 'S', aspectRatio: 1 })]
    const result = composeShareLayout({
      items,
      order: ['only'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    const c = result.cards[0]
    // The card should sit roughly in vertical middle (top y > 0.2 since the
    // card itself is small relative to the 720px frame).
    expect(c.y).toBeGreaterThan(0.2)
    // And there should be roughly equal slack above and below.
    const aboveSlack = c.y
    const belowSlack = 1 - (c.y + c.h)
    expect(Math.abs(aboveSlack - belowSlack)).toBeLessThan(0.01)
  })

  it('emits cardIds aligned 1-to-1 with cards (handles duplicate URLs)', () => {
    // Two distinct bookmarks share the same URL.
    const items = [
      { ...item('one'), url: 'https://shared.example.com' },
      { ...item('two'), url: 'https://shared.example.com' },
    ]
    const result = composeShareLayout({
      items,
      order: ['one', 'two'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(result.cards).toHaveLength(2)
    expect(result.cardIds).toEqual(['one', 'two'])
  })

  it('does not over-center when content already fills the frame', () => {
    const items = makeItems(50, 'y')
    const result = composeShareLayout({
      items,
      order: items.map((it) => it.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '9:16',
      viewport: { width: 1080, height: 720 },
    })
    // After auto-shrink content fills the frame; first card top should be ~0.
    const minY = Math.min(...result.cards.map((c) => c.y))
    expect(minY).toBeLessThan(0.01)
  })
})
