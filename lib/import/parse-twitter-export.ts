import type { ImportedBookmark, ParseResult } from './types'

const TWITTER_URL_REGEX = /https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/

interface TwitterJsonEntry {
  url?: string; tweet_url?: string; link?: string
  text?: string; content?: string
  created_at?: string; date?: string
}

export function parseTwitterExport(content: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []
  const trimmed = content.trim()

  // Try JSON first
  if (trimmed.startsWith('[')) {
    try {
      const entries = JSON.parse(trimmed) as TwitterJsonEntry[]
      for (const entry of entries) {
        const url = entry.url ?? entry.tweet_url ?? entry.link
        if (!url) continue
        bookmarks.push({
          url, title: entry.text ?? entry.content ?? url.split('/').pop() ?? url,
          folder: 'Xブックマーク', addedAt: entry.created_at ?? entry.date ?? undefined, source: 'twitter',
        })
      }
      return { bookmarks, errors }
    } catch {}
  }

  // CSV / URL-per-line
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
  const firstLine = lines[0]?.toLowerCase() ?? ''
  const hasHeader = firstLine.includes('url') || firstLine.includes('link')
  const startIdx = hasHeader ? 1 : 0

  for (let i = startIdx; i < lines.length; i++) {
    const match = lines[i].match(TWITTER_URL_REGEX)
    if (!match) continue
    const url = match[0]
    const parts = lines[i].split(',').map((p) => p.replace(/^"|"$/g, '').trim())
    const textPart = parts.find((p) => p && !TWITTER_URL_REGEX.test(p) && !p.match(/^\d{4}-/))
    bookmarks.push({
      url, title: textPart ?? `Tweet ${url.split('/').pop() ?? ''}`,
      folder: 'Xブックマーク', source: 'twitter',
    })
  }
  return { bookmarks, errors }
}
