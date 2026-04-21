import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchYoutubeOEmbed, isDegenerateYoutubeTitle } from './youtube-oembed'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('isDegenerateYoutubeTitle', () => {
  it('flags empty string', () => {
    expect(isDegenerateYoutubeTitle('')).toBe(true)
  })

  it('flags "YouTube <id>" bookmarklet fallback pattern', () => {
    expect(isDegenerateYoutubeTitle('YouTube EqAj1FkV6jM')).toBe(true)
    expect(isDegenerateYoutubeTitle('YouTube dQw4w9WgXcQ')).toBe(true)
  })

  it('flags raw URL titles', () => {
    expect(isDegenerateYoutubeTitle('https://youtube.com/watch?v=abc')).toBe(true)
  })

  it('flags bare "YouTube"', () => {
    expect(isDegenerateYoutubeTitle('YouTube')).toBe(true)
  })

  it('does NOT flag real titles', () => {
    expect(isDegenerateYoutubeTitle('How to make a collage')).toBe(false)
    expect(isDegenerateYoutubeTitle('究極の腕立て')).toBe(false)
  })
})

describe('fetchYoutubeOEmbed', () => {
  it('returns title + author on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Real Title', author_name: 'Creator' }),
    }))
    const result = await fetchYoutubeOEmbed('https://www.youtube.com/watch?v=abc')
    expect(result?.title).toBe('Real Title')
    expect(result?.authorName).toBe('Creator')
  })

  it('returns null on 404 (deleted / private)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const result = await fetchYoutubeOEmbed('https://www.youtube.com/watch?v=xxx')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    const result = await fetchYoutubeOEmbed('https://www.youtube.com/watch?v=abc')
    expect(result).toBeNull()
  })
})
