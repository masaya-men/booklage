import { describe, it, expect } from 'vitest'
import { parseUrlList } from '@/lib/import/parse-url-list'

describe('parseUrlList', () => {
  it('parses newline-separated URLs', () => {
    const input = `https://example.com\nhttps://github.com\nhttps://youtube.com/watch?v=abc`
    const result = parseUrlList(input)
    expect(result.bookmarks).toHaveLength(3)
    expect(result.bookmarks[0].url).toBe('https://example.com')
    expect(result.bookmarks[0].source).toBe('url-list')
  })
  it('skips empty lines', () => {
    const result = parseUrlList(`https://a.com\n\nhttps://b.com\n  \nhttps://c.com`)
    expect(result.bookmarks).toHaveLength(3)
  })
  it('skips invalid URLs', () => {
    const result = parseUrlList(`https://valid.com\nnot a url\nftp://invalid.com\nhttps://also-valid.com`)
    expect(result.bookmarks).toHaveLength(2)
  })
  it('uses URL hostname as title', () => {
    const result = parseUrlList('https://www.example.com/page')
    expect(result.bookmarks[0].title).toBe('www.example.com')
  })
  it('handles empty input', () => {
    expect(parseUrlList('').bookmarks).toHaveLength(0)
  })
})
