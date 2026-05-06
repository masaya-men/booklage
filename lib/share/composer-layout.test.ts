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
    expect(result.frameSize.width).toBe(1080)
    expect(result.frameSize.height).toBeGreaterThan(0)
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
      item('l', { sizePreset: 'S' }),
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
    expect(lCard.s).toBe('L')
    expect(sCard.s).toBe('S')
  })

  it('free aspect: frame height grows with content (no shrink)', () => {
    const items = makeItems(50)
    const result = composeShareLayout({
      items,
      order: items.map((it) => it.bookmarkId),
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(result.didShrink).toBe(false)
    expect(result.shrinkScale).toBe(1)
    expect(result.frameSize.width).toBe(1080)
    // 50 cards in a 1080-wide frame should produce a tall frame.
    expect(result.frameSize.height).toBeGreaterThan(720)
    for (const c of result.cards) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001)
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001)
    }
  })

  it('preset aspects: frame fits the ratio inside viewport, cards may overflow', () => {
    const items = makeItems(50)
    const result = composeShareLayout({
      items,
      order: items.map((it) => it.bookmarkId),
      sizeOverrides: new Map(),
      aspect: '9:16',
      viewport: { width: 1080, height: 720 },
    })
    // 9:16 fits to 405x720 inside 1080x720
    expect(result.frameSize.width).toBe(405)
    expect(result.frameSize.height).toBe(720)
    expect(result.didShrink).toBe(false)
    expect(result.shrinkScale).toBe(1)
  })

  it('emits cardIds aligned 1-to-1 with cards (handles duplicate URLs)', () => {
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

  it('cards start at the top of the frame (no center offset)', () => {
    const items = makeItems(5, 'y')
    const result = composeShareLayout({
      items,
      order: items.map((it) => it.bookmarkId),
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    const minY = Math.min(...result.cards.map((c) => c.y))
    expect(minY).toBeLessThan(0.05)
    expect(minY).toBeGreaterThanOrEqual(0)
  })

  it('every card carries its aspectRatio (a) for receiver re-layout', () => {
    const items = [
      item('a', { aspectRatio: 1.5 }),
      item('b', { aspectRatio: 0.7 }),
    ]
    const result = composeShareLayout({
      items,
      order: ['a', 'b'],
      sizeOverrides: new Map(),
      aspect: 'free',
      viewport: { width: 1080, height: 720 },
    })
    expect(result.cards[0].a).toBe(1.5)
    expect(result.cards[1].a).toBe(0.7)
  })
})
