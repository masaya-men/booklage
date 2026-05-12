import { describe, it, expect } from 'vitest'
import { pickCard, VideoThumbCard, ImageCard, TextCard, MinimalCard } from '@/components/board/cards'

const base = {
  bookmarkId: 'b',
  cardId: 'c',
  url: 'https://example.com/foo',
  aspectRatio: 1,
  gridIndex: 0,
  orderIndex: 0,
  cardWidth: 240,
  customCardWidth: false,
  isRead: false,
  isDeleted: false,
  tags: [],
  displayMode: null,
} as const

describe('pickCard', () => {
  it('returns MinimalCard when title and thumbnail are both empty', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pickCard({ ...base, title: '', thumbnail: '' } as any)).toBe(MinimalCard)
  })

  it('returns MinimalCard when title equals url and thumbnail empty', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pickCard({ ...base, title: base.url, thumbnail: '' } as any)).toBe(MinimalCard)
  })

  it('returns ImageCard when thumbnail present (even if title empty)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pickCard({ ...base, title: '', thumbnail: 'https://cdn/x.jpg' } as any)).toBe(ImageCard)
  })

  it('returns TextCard when title present but no thumbnail', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pickCard({ ...base, title: 'Hello', thumbnail: '' } as any)).toBe(TextCard)
  })

  it('returns VideoThumbCard for youtube URLs regardless of metadata', () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pickCard({ ...base, url: 'https://youtube.com/watch?v=x', title: '', thumbnail: '' } as any),
    ).toBe(VideoThumbCard)
  })

  it('returns VideoThumbCard for tiktok URLs regardless of metadata', () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pickCard({ ...base, url: 'https://www.tiktok.com/@user/video/123', title: '', thumbnail: '' } as any),
    ).toBe(VideoThumbCard)
  })

  it('returns MinimalCard when title is undefined and thumbnail undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pickCard({ ...base } as any)).toBe(MinimalCard)
  })
})
