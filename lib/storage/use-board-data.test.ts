import { describe, it, expect } from 'vitest'
import { computeAspectRatio } from './use-board-data'
import type { BookmarkRecord, CardRecord } from './indexeddb'

const baseBookmark: BookmarkRecord = {
  id: 'b1',
  url: 'https://example.com/article',
  title: 'Article',
  description: '',
  thumbnail: '',
  favicon: '',
  siteName: 'Example',
  type: 'website',
  savedAt: '2026-04-19T00:00:00Z',
  folderId: 'root',
  ogpStatus: 'fetched',
  tags: ['root'],
}

const baseCard: CardRecord = {
  id: 'c1',
  bookmarkId: 'b1',
  folderId: 'root',
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  zIndex: 0,
  gridIndex: 0,
  isManuallyPlaced: false,
  width: 240,
  height: 320,
}

describe('computeAspectRatio priority chain', () => {
  it('priority 1: user-resized card returns width/height', () => {
    const c: CardRecord = { ...baseCard, width: 400, height: 200, isUserResized: true, aspectRatio: 0.5 }
    expect(computeAspectRatio(baseBookmark, c)).toBe(2)
  })

  it('priority 1 skipped when width/height are zero → falls to cached ratio', () => {
    const c: CardRecord = { ...baseCard, width: 0, height: 0, isUserResized: true, aspectRatio: 1.5 }
    expect(computeAspectRatio(baseBookmark, c)).toBe(1.5)
  })

  it('priority 2: cached aspectRatio wins when not user-resized', () => {
    const c: CardRecord = { ...baseCard, width: 100, height: 100, isUserResized: false, aspectRatio: 1.77 }
    expect(computeAspectRatio(baseBookmark, c)).toBe(1.77)
  })

  it('priority 3: falls back to estimator when no card record', () => {
    const ratio = computeAspectRatio(baseBookmark, undefined)
    expect(typeof ratio).toBe('number')
    expect(ratio).toBeGreaterThan(0)
  })

  it('priority 3: YouTube URL estimates 16:9 when no cached ratio', () => {
    const youtubeBookmark: BookmarkRecord = {
      ...baseBookmark,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      type: 'youtube',
    }
    const c: CardRecord = { ...baseCard, isUserResized: false, aspectRatio: 0 }
    expect(computeAspectRatio(youtubeBookmark, c)).toBeCloseTo(16 / 9, 2)
  })
})
