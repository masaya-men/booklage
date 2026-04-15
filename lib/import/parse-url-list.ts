import type { ImportedBookmark, ParseResult } from './types'
import { isValidUrl } from '@/lib/utils/url'

/**
 * Parses a newline-separated list of URLs into ImportedBookmark objects.
 * Empty lines and invalid URLs are skipped.
 * Only http/https URLs are accepted (ftp:// etc. are rejected).
 * @param text - Raw text input with one URL per line
 * @returns ParseResult with bookmarks array and errors array
 */
export function parseUrlList(text: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (!isValidUrl(line)) continue

    let hostname = ''
    try {
      hostname = new URL(line).hostname
    } catch {
      // hostname remains empty — use the raw line as fallback title
    }

    bookmarks.push({
      url: line,
      title: hostname || line,
      source: 'url-list',
    })
  }

  return { bookmarks, errors }
}
