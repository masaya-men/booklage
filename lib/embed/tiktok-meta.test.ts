import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTikTokMeta } from './tiktok-meta'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('fetchTikTokMeta', () => {
  it('parses thumbnail and title from oEmbed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        thumbnail_url: 'https://p16.tiktok.com/abc.jpg',
        title: 'Cool video',
      }),
    }))
    const meta = await fetchTikTokMeta('https://www.tiktok.com/@user/video/12345')
    expect(meta?.thumbnailUrl).toBe('https://p16.tiktok.com/abc.jpg')
    expect(meta?.title).toBe('Cool video')
  })

  it('returns null on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const meta = await fetchTikTokMeta('https://www.tiktok.com/@user/video/12345')
    expect(meta).toBeNull()
  })

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const meta = await fetchTikTokMeta('https://www.tiktok.com/@user/video/12345')
    expect(meta).toBeNull()
  })
})
