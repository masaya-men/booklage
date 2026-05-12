import { describe, it, expect } from 'vitest'
import { parseTweetData } from '@/lib/embed/tweet-meta'

describe('parseTweetData — photoUrls', () => {
  it('returns photoUrls for 4-photo tweet, photoUrl[0] for backwards compat', () => {
    const raw = {
      id_str: '123',
      text: 'four photos',
      photos: [
        { url: 'https://pbs.twimg.com/a.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/b.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/c.jpg', width: 800, height: 600 },
        { url: 'https://pbs.twimg.com/d.jpg', width: 800, height: 600 },
      ],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta).not.toBeNull()
    expect(meta?.photoUrls).toEqual([
      'https://pbs.twimg.com/a.jpg',
      'https://pbs.twimg.com/b.jpg',
      'https://pbs.twimg.com/c.jpg',
      'https://pbs.twimg.com/d.jpg',
    ])
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/a.jpg')
    expect(meta?.hasPhoto).toBe(true)
  })

  it('returns empty photoUrls array for text-only tweet', () => {
    const raw = { id_str: '456', text: 'just text', user: { name: 'A', screen_name: 'a' } }
    const meta = parseTweetData(raw)
    expect(meta?.photoUrls).toEqual([])
    expect(meta?.photoUrl).toBeUndefined()
    expect(meta?.hasPhoto).toBe(false)
  })

  it('returns single-element photoUrls for 1-photo tweet', () => {
    const raw = {
      id_str: '789',
      text: 'one photo',
      photos: [{ url: 'https://pbs.twimg.com/single.jpg', width: 800, height: 600 }],
      user: { name: 'A', screen_name: 'a' },
    }
    const meta = parseTweetData(raw)
    expect(meta?.photoUrls).toEqual(['https://pbs.twimg.com/single.jpg'])
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/single.jpg')
  })

  it('returns null for invalid input', () => {
    expect(parseTweetData(null)).toBeNull()
    expect(parseTweetData({})).toBeNull()
  })
})
