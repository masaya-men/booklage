import { describe, it, expect, vi } from 'vitest'
import { backfillTweetMeta } from '@/lib/board/tweet-backfill'
import type { TweetMeta } from '@/lib/embed/types'

const meta = (overrides: Partial<TweetMeta> = {}): TweetMeta => ({
  id: '1',
  text: 't',
  hasPhoto: false,
  hasVideo: false,
  hasPoll: false,
  hasQuotedTweet: false,
  authorName: '',
  authorHandle: '',
  photoUrls: [],
  mediaSlots: [],
  ...overrides,
})

describe('backfillTweetMeta', () => {
  it('persists thumbnail + hasVideo + mediaSlots for a mix tweet', async () => {
    const persistThumbnail = vi.fn().mockResolvedValue(undefined)
    const persistVideoFlag = vi.fn().mockResolvedValue(undefined)
    const persistMediaSlots = vi.fn().mockResolvedValue(undefined)
    const fetchMeta = vi.fn().mockResolvedValue(meta({
      hasPhoto: true,
      hasVideo: true,
      photoUrl: 'https://p/a.jpg',
      videoPosterUrl: 'https://p/poster.jpg',
      mediaSlots: [
        { type: 'video', url: 'https://p/poster.jpg', videoUrl: 'https://v/v.mp4', aspect: 1.77 },
        { type: 'photo', url: 'https://p/a.jpg' },
      ],
    }))

    await backfillTweetMeta(
      { bookmarkId: 'b1', tweetId: '1' },
      new AbortController().signal,
      { fetchMeta, persistThumbnail, persistVideoFlag, persistMediaSlots },
    )

    expect(fetchMeta).toHaveBeenCalledWith('1')
    expect(persistThumbnail).toHaveBeenCalledWith('b1', 'https://p/poster.jpg', true)
    expect(persistVideoFlag).toHaveBeenCalledWith('b1', true)
    expect(persistMediaSlots).toHaveBeenCalledWith('b1', [
      { type: 'video', url: 'https://p/poster.jpg', videoUrl: 'https://v/v.mp4', aspect: 1.77 },
      { type: 'photo', url: 'https://p/a.jpg' },
    ])
  })

  it('skips mediaSlots write when slots array is empty', async () => {
    const persistMediaSlots = vi.fn().mockResolvedValue(undefined)
    const persistThumbnail = vi.fn().mockResolvedValue(undefined)
    const persistVideoFlag = vi.fn().mockResolvedValue(undefined)
    const fetchMeta = vi.fn().mockResolvedValue(meta({
      photoUrl: 'https://p/a.jpg',
      mediaSlots: [],
    }))

    await backfillTweetMeta(
      { bookmarkId: 'b2', tweetId: '2' },
      new AbortController().signal,
      { fetchMeta, persistThumbnail, persistVideoFlag, persistMediaSlots },
    )

    expect(persistMediaSlots).not.toHaveBeenCalled()
    expect(persistThumbnail).toHaveBeenCalled()  // thumbnail still backfilled
  })

  it('returns silently when fetchMeta returns null (failed fetch)', async () => {
    const persistThumbnail = vi.fn()
    const persistVideoFlag = vi.fn()
    const persistMediaSlots = vi.fn()
    const fetchMeta = vi.fn().mockResolvedValue(null)

    await backfillTweetMeta(
      { bookmarkId: 'b3', tweetId: '3' },
      new AbortController().signal,
      { fetchMeta, persistThumbnail, persistVideoFlag, persistMediaSlots },
    )

    expect(persistThumbnail).not.toHaveBeenCalled()
    expect(persistVideoFlag).not.toHaveBeenCalled()
    expect(persistMediaSlots).not.toHaveBeenCalled()
  })

  it('honors signal.aborted — skips persist calls if cancelled before fetch resolves', async () => {
    const persistThumbnail = vi.fn()
    const controller = new AbortController()
    const fetchMeta = vi.fn().mockImplementation(async () => {
      controller.abort()
      return meta({ photoUrl: 'https://p/a.jpg', mediaSlots: [{ type: 'photo', url: 'https://p/a.jpg' }] })
    })

    await backfillTweetMeta(
      { bookmarkId: 'b4', tweetId: '4' },
      controller.signal,
      {
        fetchMeta,
        persistThumbnail,
        persistVideoFlag: vi.fn(),
        persistMediaSlots: vi.fn(),
      },
    )

    expect(persistThumbnail).not.toHaveBeenCalled()
  })

  it('swallows fetch exceptions (does not throw to queue)', async () => {
    const fetchMeta = vi.fn().mockRejectedValue(new Error('network'))
    await expect(
      backfillTweetMeta(
        { bookmarkId: 'b5', tweetId: '5' },
        new AbortController().signal,
        {
          fetchMeta,
          persistThumbnail: vi.fn(),
          persistVideoFlag: vi.fn(),
          persistMediaSlots: vi.fn(),
        },
      ),
    ).resolves.toBeUndefined()
  })
})
