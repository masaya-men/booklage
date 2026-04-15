import type { ImportedBookmark, ParseResult } from './types'

const INSTAGRAM_URL_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[\w-]+\/?/

interface InstagramJsonEntry {
  url?: string
  link?: string
  title?: string
  caption?: string
  date?: string
  timestamp?: string
}

/**
 * Parses Instagram export data in JSON, CSV, or URL-per-line format.
 * @param content - Raw string content from an Instagram export file
 * @returns ParseResult with bookmarks and any non-fatal errors
 */
export function parseInstagramExport(content: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []
  const trimmed = content.trim()
  if (!trimmed) return { bookmarks, errors }

  // JSON array format
  if (trimmed.startsWith('[')) {
    try {
      const entries = JSON.parse(trimmed) as InstagramJsonEntry[]
      for (const entry of entries) {
        const url = entry.url ?? entry.link
        if (!url) continue
        bookmarks.push({
          url,
          title: entry.title ?? entry.caption ?? url.split('/').filter(Boolean).pop() ?? url,
          folder: 'Instagram保存',
          addedAt: entry.date ?? entry.timestamp ?? undefined,
          source: 'instagram',
        })
      }
      return { bookmarks, errors }
    } catch {
      // fall through to line-based parsing
    }
  }

  // CSV or URL-per-line format: extract Instagram URLs from each line
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
  const firstLine = lines[0]?.toLowerCase() ?? ''
  const hasHeader = firstLine.includes('url') || firstLine.includes('link')
  const startIdx = hasHeader ? 1 : 0

  for (let i = startIdx; i < lines.length; i++) {
    const match = lines[i].match(INSTAGRAM_URL_REGEX)
    if (!match) continue
    bookmarks.push({
      url: match[0],
      title: match[0].split('/').filter(Boolean).pop() ?? match[0],
      folder: 'Instagram保存',
      source: 'instagram',
    })
  }
  return { bookmarks, errors }
}
