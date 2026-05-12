import { describe, it, expect } from 'vitest'
import { parseTweetData } from '@/lib/embed/tweet-meta'

describe('parseTweetData — mediaSlots (mix tweet)', () => {
  it('builds mediaSlots [video, photo, photo] from mixed mediaDetails', () => {
    const raw = {
      id_str: '1842217368673759498',
      text: 'video + 2 photos',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/poster.jpg',
          original_info: { width: 1280, height: 720 },
          video_info: {
            aspect_ratio: [16, 9],
            variants: [
              { content_type: 'video/mp4', bitrate: 320000, url: 'https://v/low.mp4' },
              { content_type: 'video/mp4', bitrate: 2176000, url: 'https://v/high.mp4' },
            ],
          },
        },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/a.jpg', original_info: { width: 800, height: 600 } },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/b.jpg', original_info: { width: 800, height: 600 } },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta).not.toBeNull()
    expect(meta?.mediaSlots).toEqual([
      { type: 'video', url: 'https://pbs.twimg.com/poster.jpg', videoUrl: 'https://v/high.mp4', aspect: 1280 / 720 },
      { type: 'photo', url: 'https://pbs.twimg.com/a.jpg' },
      { type: 'photo', url: 'https://pbs.twimg.com/b.jpg' },
    ])
  })

  it('derives legacy fields from mediaSlots — mix tweet', () => {
    const raw = {
      id_str: '1842217368673759498',
      text: 'mix',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/poster.jpg',
          original_info: { width: 1280, height: 720 },
          video_info: {
            aspect_ratio: [16, 9],
            variants: [{ content_type: 'video/mp4', bitrate: 2176000, url: 'https://v/high.mp4' }],
          },
        },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/a.jpg' },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.hasPhoto).toBe(true)
    expect(meta?.videoUrl).toBe('https://v/high.mp4')
    expect(meta?.videoPosterUrl).toBe('https://pbs.twimg.com/poster.jpg')
    expect(meta?.videoAspectRatio).toBeCloseTo(16 / 9)
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/a.jpg')
    expect(meta?.photoUrls).toEqual(['https://pbs.twimg.com/a.jpg'])
  })

  it('falls back to legacy `photos` array when mediaDetails is absent (older syndication response)', () => {
    const raw = {
      id_str: '999',
      text: 'photo only — legacy shape',
      photos: [
        { url: 'https://pbs.twimg.com/x.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/y.jpg', width: 800, height: 600 },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([
      { type: 'photo', url: 'https://pbs.twimg.com/x.jpg' },
      { type: 'photo', url: 'https://pbs.twimg.com/y.jpg' },
    ])
    expect(meta?.photoUrls).toEqual(['https://pbs.twimg.com/x.jpg', 'https://pbs.twimg.com/y.jpg'])
  })

  it('single video tweet → mediaSlots length 1 [video]', () => {
    const raw = {
      id_str: '111',
      text: 'video only',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/vp.jpg',
          original_info: { width: 720, height: 1280 },
          video_info: {
            aspect_ratio: [9, 16],
            variants: [{ content_type: 'video/mp4', bitrate: 1500000, url: 'https://v/v.mp4' }],
          },
        },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([
      { type: 'video', url: 'https://pbs.twimg.com/vp.jpg', videoUrl: 'https://v/v.mp4', aspect: 720 / 1280 },
    ])
    expect(meta?.hasPhoto).toBe(false)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.photoUrl).toBeUndefined()
    expect(meta?.photoUrls).toEqual([])
  })

  it('text-only tweet → mediaSlots empty', () => {
    const raw = { id_str: '222', text: 'just text', user: { name: 'A', screen_name: 'a' } }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([])
    expect(meta?.hasPhoto).toBe(false)
    expect(meta?.hasVideo).toBe(false)
  })

  it('skips video with no playable mp4 variant (silent drop, never emits broken slot)', () => {
    const raw = {
      id_str: '333',
      text: 'broken video',
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/poster.jpg',
          video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://v/x.m3u8' }] },
        },
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/a.jpg' },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toEqual([{ type: 'photo', url: 'https://pbs.twimg.com/a.jpg' }])
    // Silent-drop locks in: hasVideo = false even when raw mediaDetails had a
    // video entry, because the slot itself was dropped (no playable mp4).
    expect(meta?.hasVideo).toBe(false)
    expect(meta?.hasPhoto).toBe(true)
  })
})
