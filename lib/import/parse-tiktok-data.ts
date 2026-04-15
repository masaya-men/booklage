import type { ImportedBookmark, ParseResult } from './types'

interface TiktokVideoEntry {
  Date?: string
  Link?: string
}

interface TiktokData {
  Activity?: {
    'Favorite Videos'?: { FavoriteVideoList?: TiktokVideoEntry[] }
    'Like List'?: { ItemFavoriteList?: TiktokVideoEntry[] }
  }
}

function parseTiktokDate(dateStr: string): string {
  return new Date(dateStr.replace(' ', 'T') + 'Z').toISOString()
}

/**
 * Parse TikTok data download JSON (user_data.json).
 * Extracts Favorite Videos and Like List.
 */
export function parseTiktokData(jsonStr: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []

  let data: TiktokData
  try {
    data = JSON.parse(jsonStr) as TiktokData
  } catch (e) {
    return { bookmarks, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] }
  }

  const activity = data.Activity
  if (!activity) return { bookmarks, errors }

  const favorites = activity['Favorite Videos']?.FavoriteVideoList ?? []
  for (const entry of favorites) {
    if (!entry.Link) continue
    bookmarks.push({
      url: entry.Link,
      title: `TikTok ${entry.Link.split('/').pop() ?? ''}`,
      folder: 'TikTok お気に入り',
      addedAt: entry.Date ? parseTiktokDate(entry.Date) : undefined,
      source: 'tiktok',
    })
  }

  const likes = activity['Like List']?.ItemFavoriteList ?? []
  for (const entry of likes) {
    if (!entry.Link) continue
    bookmarks.push({
      url: entry.Link,
      title: `TikTok ${entry.Link.split('/').pop() ?? ''}`,
      folder: 'TikTok いいね',
      addedAt: entry.Date ? parseTiktokDate(entry.Date) : undefined,
      source: 'tiktok',
    })
  }

  return { bookmarks, errors }
}
