import { describe, it, expect, vi } from 'vitest'
import { pickCard } from './index'
import type { BoardItem } from '@/lib/storage/use-board-data'

// Mock the card components to avoid CSS import issues
vi.mock('./TweetCard', () => ({ TweetCard: 'TweetCard' }))
vi.mock('./VideoThumbCard', () => ({ VideoThumbCard: 'VideoThumbCard' }))
vi.mock('./ImageCard', () => ({ ImageCard: 'ImageCard' }))
vi.mock('./TextCard', () => ({ TextCard: 'TextCard' }))

const baseItem: BoardItem = {
  bookmarkId: 'b1',
  cardId: 'c1',
  title: 'test',
  url: 'https://example.com',
  aspectRatio: 1,
  gridIndex: 0,
  orderIndex: 0,
  sizePreset: 'S',
  isRead: false,
  isDeleted: false,
}

describe('pickCard', () => {
  it('routes tweet URL → TweetCard', () => {
    const result1 = pickCard({ ...baseItem, url: 'https://x.com/u/status/1' })
    const result2 = pickCard({ ...baseItem, url: 'https://twitter.com/u/status/1' })
    expect(result1).toBe('TweetCard')
    expect(result2).toBe('TweetCard')
  })

  it('routes YouTube → VideoThumbCard', () => {
    const result = pickCard({ ...baseItem, url: 'https://youtube.com/watch?v=abc' })
    expect(result).toBe('VideoThumbCard')
  })

  it('routes TikTok → VideoThumbCard', () => {
    const result = pickCard({ ...baseItem, url: 'https://tiktok.com/@u/video/1' })
    expect(result).toBe('VideoThumbCard')
  })

  it('routes generic with thumbnail → ImageCard', () => {
    const result = pickCard({ ...baseItem, url: 'https://example.com', thumbnail: 'x.jpg' })
    expect(result).toBe('ImageCard')
  })

  it('routes generic without thumbnail → TextCard (white card fix)', () => {
    const result = pickCard({ ...baseItem, url: 'https://r3f.maximeheckel.com/lens2' })
    expect(result).toBe('TextCard')
  })
})
