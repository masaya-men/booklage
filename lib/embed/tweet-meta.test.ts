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
      photos: [{ url: 'x', width: 1200, height: 675 }],
      mediaDetails: [],
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasPhoto).toBe(true)
    expect(meta?.photoAspectRatio).toBeCloseTo(1200 / 675, 2)
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
