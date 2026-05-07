import { describe, it, expect } from 'vitest'
import { pickCard, VideoThumbCard, ImageCard, TextCard } from './index'
import type { BoardItem } from '@/lib/storage/use-board-data'

// vi.mock with primitive-string named exports stopped applying after the
// vitest 4.x upgrade — pickCard returned the real component function, not
// the mocked string, and `expect(result).toBe('VideoThumbCard')` failed.
// Compare component identities directly instead. CSS module imports inside
// the component files are handled by vite's default CSS-module proxy in
// the test env, so we can import the real components here without the
// mock-based CSS workaround that the original test setup needed.

const baseItem: BoardItem = {
  bookmarkId: 'b1',
  cardId: 'c1',
  title: 'test',
  url: 'https://example.com',
  aspectRatio: 1,
  gridIndex: 0,
  orderIndex: 0,
  cardWidth: 240,
  isRead: false,
  isDeleted: false,
  tags: [],
  displayMode: null,
}

describe('pickCard', () => {
  it('routes YouTube → VideoThumbCard', () => {
    const result = pickCard({ ...baseItem, url: 'https://youtube.com/watch?v=abc' })
    expect(result).toBe(VideoThumbCard)
  })

  it('routes TikTok → VideoThumbCard', () => {
    const result = pickCard({ ...baseItem, url: 'https://tiktok.com/@u/video/1' })
    expect(result).toBe(VideoThumbCard)
  })

  it('routes tweet with thumbnail → ImageCard', () => {
    const r1 = pickCard({ ...baseItem, url: 'https://x.com/u/status/1', thumbnail: 'tweet.jpg' })
    const r2 = pickCard({ ...baseItem, url: 'https://twitter.com/u/status/1', thumbnail: 'tweet.jpg' })
    expect(r1).toBe(ImageCard)
    expect(r2).toBe(ImageCard)
  })

  it('routes tweet without thumbnail → TextCard', () => {
    const result = pickCard({ ...baseItem, url: 'https://x.com/u/status/1' })
    expect(result).toBe(TextCard)
  })

  it('routes generic with thumbnail → ImageCard', () => {
    const result = pickCard({ ...baseItem, url: 'https://example.com', thumbnail: 'x.jpg' })
    expect(result).toBe(ImageCard)
  })

  it('routes generic without thumbnail → TextCard (white card fix)', () => {
    const result = pickCard({ ...baseItem, url: 'https://r3f.maximeheckel.com/lens2' })
    expect(result).toBe(TextCard)
  })
})
