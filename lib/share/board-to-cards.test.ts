// lib/share/board-to-cards.test.ts
import { describe, it, expect } from 'vitest'
import { boardItemsToShareCards, filterByViewport } from './board-to-cards'

const sampleItem = (overrides: Partial<{ bookmarkId: string; url: string; type: string; title: string; thumbnail: string; sizePreset: 'S' | 'M' | 'L' }>) => ({
  bookmarkId: overrides.bookmarkId ?? 'b1',
  url: overrides.url ?? 'https://example.com',
  title: overrides.title ?? 't',
  description: '',
  thumbnail: overrides.thumbnail ?? '',
  type: (overrides.type ?? 'website') as 'website' | 'tweet' | 'youtube' | 'tiktok' | 'instagram',
  sizePreset: (overrides.sizePreset ?? 'S') as 'S' | 'M' | 'L',
  aspectRatio: 1,
  isDeleted: false,
  hasVideo: false,
  tags: [] as string[],
})

describe('boardItemsToShareCards', () => {
  it('maps board items to ShareCard payload with normalized 0..1 coords', () => {
    const items = [sampleItem({ bookmarkId: 'a' })]
    const positions = { a: { x: 100, y: 200, w: 150, h: 150 } }
    const frameSize = { width: 1000, height: 1000 }
    const cards = boardItemsToShareCards(items, positions, frameSize)
    expect(cards).toHaveLength(1)
    expect(cards[0].u).toBe('https://example.com')
    expect(cards[0].x).toBeCloseTo(0.1, 2)
    expect(cards[0].y).toBeCloseTo(0.2, 2)
    expect(cards[0].w).toBeCloseTo(0.15, 2)
    expect(cards[0].h).toBeCloseTo(0.15, 2)
  })
})

describe('filterByViewport', () => {
  it('keeps only items overlapping the viewport rectangle', () => {
    const items = [
      sampleItem({ bookmarkId: 'visible' }),
      sampleItem({ bookmarkId: 'offscreen' }),
    ]
    const positions = {
      visible:   { x: 100, y: 100, w: 50, h: 50 },
      offscreen: { x: 5000, y: 5000, w: 50, h: 50 },
    }
    const viewport = { x: 0, y: 0, w: 800, h: 600 }
    const out = filterByViewport(items, positions, viewport)
    expect(out.map((i) => i.bookmarkId)).toEqual(['visible'])
  })
})
