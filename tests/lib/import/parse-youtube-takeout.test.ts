// tests/lib/import/parse-youtube-takeout.test.ts
import { describe, it, expect } from 'vitest'
import { parseYoutubeTakeout } from '@/lib/import/parse-youtube-takeout'

const LIKED_CSV = `Liked videos
Last Updated,Video Id,Time Added
""
""
""

dQw4w9WgXcQ,2024-01-15T10:30:00Z
abc123def45,2024-02-20T08:00:00Z`

const PLAYLIST_CSV = `My Cool Playlist
Last Updated,Video Id,Time Added
""
""
""

xyzABC12345,2024-03-01T12:00:00Z`

describe('parseYoutubeTakeout', () => {
  it('parses liked videos CSV', () => {
    const result = parseYoutubeTakeout(LIKED_CSV, 'Liked videos.csv')
    expect(result.errors).toHaveLength(0)
    expect(result.bookmarks).toHaveLength(2)
    expect(result.bookmarks[0]).toMatchObject({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'YouTube dQw4w9WgXcQ',
      folder: 'YouTube 高評価',
      source: 'youtube',
    })
  })
  it('uses playlist name as folder name', () => {
    const result = parseYoutubeTakeout(PLAYLIST_CSV, 'My Cool Playlist.csv')
    expect(result.bookmarks[0].folder).toBe('YouTube My Cool Playlist')
  })
  it('extracts addedAt timestamp', () => {
    const result = parseYoutubeTakeout(LIKED_CSV, 'Liked videos.csv')
    expect(result.bookmarks[0].addedAt).toBe('2024-01-15T10:30:00Z')
  })
  it('skips empty lines and header rows', () => {
    const result = parseYoutubeTakeout(LIKED_CSV, 'Liked videos.csv')
    expect(result.bookmarks).toHaveLength(2)
  })
  it('returns empty for invalid content', () => {
    const result = parseYoutubeTakeout('random text', 'file.csv')
    expect(result.bookmarks).toHaveLength(0)
  })
})
