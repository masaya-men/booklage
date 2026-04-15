import { describe, it, expect } from 'vitest'
import { parseInstagramExport } from '@/lib/import/parse-instagram-export'

const INSTAGRAM_JSON = JSON.stringify([
  { url: 'https://www.instagram.com/p/abc123/', title: 'Cool photo', date: '2024-01-15' },
  { url: 'https://www.instagram.com/reel/def456/', title: 'Fun reel' },
])
const INSTAGRAM_CSV = `"url","caption","date"
"https://www.instagram.com/p/ghi789/","Nice post","2024-03-01"
"https://www.instagram.com/p/jkl012/","Another one","2024-03-02"`
const URL_LIST = `https://www.instagram.com/p/mno345/
https://www.instagram.com/reel/pqr678/`

describe('parseInstagramExport', () => {
  it('parses JSON array', () => {
    const result = parseInstagramExport(INSTAGRAM_JSON)
    expect(result.bookmarks).toHaveLength(2)
    expect(result.bookmarks[0].url).toBe('https://www.instagram.com/p/abc123/')
    expect(result.bookmarks[0].folder).toBe('Instagram保存')
    expect(result.bookmarks[0].source).toBe('instagram')
  })
  it('parses CSV', () => {
    const result = parseInstagramExport(INSTAGRAM_CSV)
    expect(result.bookmarks).toHaveLength(2)
  })
  it('parses URL-per-line', () => {
    const result = parseInstagramExport(URL_LIST)
    expect(result.bookmarks).toHaveLength(2)
  })
  it('handles empty input', () => {
    const result = parseInstagramExport('')
    expect(result.bookmarks).toHaveLength(0)
  })
})
