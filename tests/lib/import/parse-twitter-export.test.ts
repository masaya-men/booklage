import { describe, it, expect } from 'vitest'
import { parseTwitterExport } from '@/lib/import/parse-twitter-export'

const TWITTER_CSV = `"url","text","created_at","author"
"https://x.com/user1/status/111","Hello world","2024-01-15T10:30:00Z","user1"
"https://x.com/user2/status/222","Good morning","2024-02-20T08:00:00Z","user2"`

const TWITTER_JSON = JSON.stringify([
  { url: 'https://twitter.com/user3/status/333', text: 'Tweet text', created_at: '2024-03-01' },
  { url: 'https://x.com/user4/status/444', text: 'Another tweet' },
])

const MINIMAL_CSV = `https://x.com/user5/status/555
https://x.com/user6/status/666`

describe('parseTwitterExport', () => {
  it('parses CSV with headers', () => {
    const result = parseTwitterExport(TWITTER_CSV)
    expect(result.bookmarks).toHaveLength(2)
    expect(result.bookmarks[0].url).toBe('https://x.com/user1/status/111')
    expect(result.bookmarks[0].source).toBe('twitter')
    expect(result.bookmarks[0].folder).toBe('Xブックマーク')
  })
  it('parses JSON array', () => {
    const result = parseTwitterExport(TWITTER_JSON)
    expect(result.bookmarks).toHaveLength(2)
    expect(result.bookmarks[0].url).toBe('https://twitter.com/user3/status/333')
  })
  it('parses minimal URL-per-line format', () => {
    const result = parseTwitterExport(MINIMAL_CSV)
    expect(result.bookmarks).toHaveLength(2)
  })
  it('extracts title from text field', () => {
    const result = parseTwitterExport(TWITTER_CSV)
    expect(result.bookmarks[0].title).toBe('Hello world')
  })
  it('returns empty for non-matching content', () => {
    const result = parseTwitterExport('random nonsense')
    expect(result.bookmarks).toHaveLength(0)
  })
})
