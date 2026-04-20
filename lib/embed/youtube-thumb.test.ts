import { describe, it, expect } from 'vitest'
import { getYoutubeThumb, isYoutubeShortsUrl } from './youtube-thumb'

describe('getYoutubeThumb', () => {
  it('returns maxresdefault URL at level 0', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(getYoutubeThumb(url, 0)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg')
  })

  it('falls back through hqdefault → mqdefault → 0', () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ'
    expect(getYoutubeThumb(url, 1)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(getYoutubeThumb(url, 2)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
    expect(getYoutubeThumb(url, 3)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/0.jpg')
  })

  it('returns null for invalid YouTube URL', () => {
    expect(getYoutubeThumb('https://example.com/foo', 0)).toBeNull()
  })

  it('isYoutubeShortsUrl detects shorts path', () => {
    expect(isYoutubeShortsUrl('https://www.youtube.com/shorts/abc123')).toBe(true)
    expect(isYoutubeShortsUrl('https://www.youtube.com/watch?v=abc123')).toBe(false)
  })
})
