import type { ImportedBookmark, ParseResult } from './types'

/**
 * Parse Google Takeout YouTube playlist CSV.
 * Format: first line is playlist name, then header row, then empty rows, then video entries.
 * Each video entry: "videoId,timestamp"
 */
export function parseYoutubeTakeout(csv: string, fileName: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []
  try {
    const lines = csv.split('\n').map((l) => l.trim())
    if (lines.length < 2) return { bookmarks, errors }
    const playlistName = lines[0]
    const isLiked = fileName.toLowerCase().includes('liked')
    const folderName = isLiked ? 'YouTube 高評価' : `YouTube ${playlistName}`
    const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/

    for (const line of lines) {
      if (!line || line.startsWith('"') || line.includes('Last Updated')) continue
      const commaIdx = line.indexOf(',')
      if (commaIdx === -1) continue
      const videoId = line.slice(0, commaIdx).trim()
      const timestamp = line.slice(commaIdx + 1).trim()
      if (!videoIdRegex.test(videoId)) continue
      bookmarks.push({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: `YouTube ${videoId}`,
        folder: folderName,
        addedAt: timestamp || undefined,
        source: 'youtube',
      })
    }
  } catch (e) {
    errors.push(`Failed to parse YouTube Takeout: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { bookmarks, errors }
}
