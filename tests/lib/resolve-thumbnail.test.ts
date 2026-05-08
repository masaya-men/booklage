import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveThumbnail } from '@/lib/pip/resolve-thumbnail'
import type { BookmarkRecord } from '@/lib/storage/indexeddb'

vi.mock('@/lib/embed/tweet-meta', () => ({
  fetchTweetMeta: vi.fn(),
}))
vi.mock('@/lib/embed/tiktok-meta', () => ({
  fetchTikTokMeta: vi.fn(),
}))

import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { fetchTikTokMeta } from '@/lib/embed/tiktok-meta'

const fetchTweetMetaMock = vi.mocked(fetchTweetMeta)
const fetchTikTokMetaMock = vi.mocked(fetchTikTokMeta)

function makeBookmark(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id: 'b1',
    url: 'https://example.com',
    title: 't',
    description: '',
    thumbnail: '',
    favicon: '',
    siteName: '',
    type: 'website',
    savedAt: new Date().toISOString(),
    ogpStatus: 'fetched',
    tags: [],
    ...overrides,
  }
}

describe('resolveThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the existing thumbnail for a generic website', async () => {
    const bm = makeBookmark({
      url: 'https://www.apple.com',
      thumbnail: 'https://www.apple.com/og-image.png',
    })
    expect(await resolveThumbnail(bm)).toBe('https://www.apple.com/og-image.png')
    expect(fetchTweetMetaMock).not.toHaveBeenCalled()
    expect(fetchTikTokMetaMock).not.toHaveBeenCalled()
  })

  it('returns empty string for a generic website without og:image', async () => {
    const bm = makeBookmark({ url: 'https://example.com', thumbnail: '' })
    expect(await resolveThumbnail(bm)).toBe('')
  })

  it('derives a YouTube thumbnail synchronously from the video id', async () => {
    const bm = makeBookmark({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail: '',
      type: 'youtube',
    })
    const out = await resolveThumbnail(bm)
    expect(out).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg')
    expect(fetchTweetMetaMock).not.toHaveBeenCalled()
  })

  it('keeps an existing valid tweet thumbnail without calling syndication', async () => {
    const bm = makeBookmark({
      url: 'https://x.com/user/status/123',
      thumbnail: 'https://pbs.twimg.com/media/photo.jpg',
      type: 'tweet',
    })
    expect(await resolveThumbnail(bm)).toBe('https://pbs.twimg.com/media/photo.jpg')
    expect(fetchTweetMetaMock).not.toHaveBeenCalled()
  })

  it('backfills X-default thumbnails via syndication photoUrl', async () => {
    fetchTweetMetaMock.mockResolvedValueOnce({
      id: '123',
      text: 't',
      hasPhoto: true,
      hasVideo: false,
      hasPoll: false,
      hasQuotedTweet: false,
      photoUrl: 'https://pbs.twimg.com/media/real.jpg',
      authorName: '',
      authorHandle: '',
    })
    const bm = makeBookmark({
      url: 'https://x.com/user/status/123',
      thumbnail: 'https://abs.twimg.com/default.png',
      type: 'tweet',
    })
    expect(await resolveThumbnail(bm)).toBe('https://pbs.twimg.com/media/real.jpg')
    expect(fetchTweetMetaMock).toHaveBeenCalledWith('123')
  })

  it('falls back to videoPosterUrl for video tweets without photos', async () => {
    fetchTweetMetaMock.mockResolvedValueOnce({
      id: '456',
      text: 't',
      hasPhoto: false,
      hasVideo: true,
      hasPoll: false,
      hasQuotedTweet: false,
      videoPosterUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg',
      authorName: '',
      authorHandle: '',
    })
    const bm = makeBookmark({
      url: 'https://twitter.com/user/status/456',
      thumbnail: '',
      type: 'tweet',
    })
    expect(await resolveThumbnail(bm)).toBe(
      'https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg',
    )
  })

  it('returns existing thumbnail when tweet syndication fails', async () => {
    fetchTweetMetaMock.mockResolvedValueOnce(null)
    const bm = makeBookmark({
      url: 'https://x.com/user/status/789',
      thumbnail: 'https://abs.twimg.com/default.png',
      type: 'tweet',
    })
    expect(await resolveThumbnail(bm)).toBe('https://abs.twimg.com/default.png')
  })

  it('fetches TikTok oEmbed thumbnail when none persisted yet', async () => {
    fetchTikTokMetaMock.mockResolvedValueOnce({
      id: '111',
      thumbnailUrl: 'https://p16.tiktok.com/cover.jpg',
      title: '',
    })
    const bm = makeBookmark({
      url: 'https://www.tiktok.com/@user/video/111',
      thumbnail: '',
      type: 'tiktok',
    })
    expect(await resolveThumbnail(bm)).toBe('https://p16.tiktok.com/cover.jpg')
    expect(fetchTikTokMetaMock).toHaveBeenCalledWith(
      'https://www.tiktok.com/@user/video/111',
    )
  })

  it('skips the TikTok oEmbed call when a thumbnail is already cached', async () => {
    const bm = makeBookmark({
      url: 'https://www.tiktok.com/@user/video/222',
      thumbnail: 'https://cached.example/cover.jpg',
      type: 'tiktok',
    })
    expect(await resolveThumbnail(bm)).toBe('https://cached.example/cover.jpg')
    expect(fetchTikTokMetaMock).not.toHaveBeenCalled()
  })

  it('returns the existing Instagram og:image without an extra fetch', async () => {
    const bm = makeBookmark({
      url: 'https://www.instagram.com/p/abc/',
      thumbnail: 'https://scontent.cdninstagram.com/img.jpg',
      type: 'instagram',
    })
    expect(await resolveThumbnail(bm)).toBe(
      'https://scontent.cdninstagram.com/img.jpg',
    )
    expect(fetchTweetMetaMock).not.toHaveBeenCalled()
    expect(fetchTikTokMetaMock).not.toHaveBeenCalled()
  })
})
