import { describe, it, expect } from 'vitest'
import { parseRedditExport } from '@/lib/import/parse-reddit-export'

const REDDIT_CSV = `id,permalink,date,ip,subreddit,title,body,url
abc123,/r/webdev/comments/abc123/great_css_tips/,2024-01-15 10:30:00 UTC,,webdev,Great CSS Tips,,https://example.com/css-tips
def456,/r/javascript/comments/def456/react_19_features/,2024-02-20 08:00:00 UTC,,javascript,React 19 Features,,`

describe('parseRedditExport', () => {
  it('parses saved posts CSV', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.errors).toHaveLength(0)
    expect(result.bookmarks).toHaveLength(2)
  })
  it('uses external URL when available', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[0].url).toBe('https://example.com/css-tips')
  })
  it('falls back to reddit permalink when no external URL', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[1].url).toBe('https://www.reddit.com/r/javascript/comments/def456/react_19_features/')
  })
  it('extracts title', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[0].title).toBe('Great CSS Tips')
  })
  it('sets folder to Reddit保存', () => {
    const result = parseRedditExport(REDDIT_CSV)
    expect(result.bookmarks[0].folder).toBe('Reddit保存')
  })
  it('handles empty input', () => {
    const result = parseRedditExport('')
    expect(result.bookmarks).toHaveLength(0)
  })
})
