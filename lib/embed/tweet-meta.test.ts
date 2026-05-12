import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTweetMeta, parseTweetData } from './tweet-meta'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('parseTweetData', () => {
  it('extracts text and author from valid response', () => {
    const raw = {
      id_str: '1',
      text: 'hello world',
      user: { name: 'Alice', screen_name: 'alice' },
      photos: [],
      mediaDetails: [],
    }
    const meta = parseTweetData(raw)
    expect(meta?.text).toBe('hello world')
    expect(meta?.authorName).toBe('Alice')
    expect(meta?.authorHandle).toBe('alice')
  })

  it('detects hasPhoto when photos array present', () => {
    const raw = {
      id_str: '1',
      text: 'pic',
      user: { name: 'A', screen_name: 'a' },
      photos: [{ url: 'https://pbs.twimg.com/media/X.jpg', width: 1200, height: 675 }],
      mediaDetails: [],
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasPhoto).toBe(true)
    expect(meta?.photoAspectRatio).toBeCloseTo(1200 / 675, 2)
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/media/X.jpg')
  })

  it('extracts videoPosterUrl from mediaDetails', () => {
    const raw = {
      id_str: '1',
      text: 'video',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [{
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/media/poster.jpg',
        original_info: { width: 1080, height: 1920 },
        video_info: {
          variants: [{ content_type: 'video/mp4', bitrate: 1500000, url: 'https://video.twimg.com/v.mp4' }],
        },
      }],
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.videoPosterUrl).toBe('https://pbs.twimg.com/media/poster.jpg')
    expect(meta?.videoAspectRatio).toBeCloseTo(1080 / 1920, 3)
  })

  it('extracts highest-bitrate mp4 videoUrl from video_info variants', () => {
    const raw = {
      id_str: '1',
      text: 'video with playable mp4',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [{
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/media/poster.jpg',
        original_info: { width: 1280, height: 720 },
        video_info: {
          variants: [
            { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
            { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/low.mp4' },
            { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/high.mp4' },
          ],
        },
      }],
    }
    const meta = parseTweetData(raw)
    expect(meta?.videoUrl).toBe('https://video.twimg.com/high.mp4')
  })

  it('leaves videoUrl undefined when no mp4 variant exists', () => {
    const raw = {
      id_str: '1',
      text: 'm3u8 only',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [{
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/media/poster.jpg',
        video_info: {
          variants: [
            { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
          ],
        },
      }],
    }
    const meta = parseTweetData(raw)
    expect(meta?.videoUrl).toBeUndefined()
  })

  it('extracts authorAvatar and createdAt when present', () => {
    const raw = {
      id_str: '1',
      text: 'hi',
      created_at: '2026-05-02T22:07:00.000Z',
      user: {
        name: 'A',
        screen_name: 'a',
        profile_image_url_https: 'https://pbs.twimg.com/profile_images/x_normal.jpg',
      },
      photos: [],
      mediaDetails: [],
    }
    const meta = parseTweetData(raw)
    expect(meta?.authorAvatar).toBe('https://pbs.twimg.com/profile_images/x_normal.jpg')
    expect(meta?.createdAt).toBe('2026-05-02T22:07:00.000Z')
  })

  it('returns null for malformed input', () => {
    expect(parseTweetData(null)).toBeNull()
    expect(parseTweetData({})).toBeNull()
  })
})

describe('fetchTweetMeta', () => {
  it('returns null when tweet is deleted (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const result = await fetchTweetMeta('999')
    expect(result).toBeNull()
  })
})
