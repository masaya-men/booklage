import type { ImportedBookmark, ParseResult } from './types'

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

export function parseRedditExport(csv: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []
  try {
    const lines = csv.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return { bookmarks, errors }
    const headers = parseCSVLine(lines[0])
    const permalinkIdx = headers.indexOf('permalink')
    const dateIdx = headers.indexOf('date')
    const titleIdx = headers.indexOf('title')
    const urlIdx = headers.indexOf('url')
    if (permalinkIdx === -1) return { bookmarks, errors: ['Missing permalink column'] }

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i])
      const permalink = fields[permalinkIdx]?.trim()
      if (!permalink) continue
      const externalUrl = urlIdx >= 0 ? fields[urlIdx]?.trim() : ''
      const url = externalUrl || `https://www.reddit.com${permalink}`
      const title = titleIdx >= 0 ? fields[titleIdx]?.trim() ?? url : url
      const dateStr = dateIdx >= 0 ? fields[dateIdx]?.trim() : ''
      let addedAt: string | undefined
      if (dateStr) { try { addedAt = new Date(dateStr).toISOString() } catch {} }
      bookmarks.push({ url, title, folder: 'Reddit保存', addedAt, source: 'reddit' })
    }
  } catch (e) {
    errors.push(`Failed to parse Reddit export: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { bookmarks, errors }
}
