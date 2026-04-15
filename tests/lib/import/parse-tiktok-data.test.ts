import { describe, it, expect } from 'vitest'
import { parseTiktokData } from '@/lib/import/parse-tiktok-data'

const TIKTOK_JSON = JSON.stringify({
  Activity: {
    'Favorite Videos': {
      FavoriteVideoList: [
        { Date: '2024-01-15 10:30:00', Link: 'https://www.tiktok.com/@user1/video/111' },
        { Date: '2024-02-20 08:00:00', Link: 'https://www.tiktok.com/@user2/video/222' },
      ],
    },
    'Like List': {
      ItemFavoriteList: [
        { Date: '2024-03-01 12:00:00', Link: 'https://www.tiktok.com/@user3/video/333' },
      ],
    },
  },
})

describe('parseTiktokData', () => {
  it('parses favorite videos', () => {
    const result = parseTiktokData(TIKTOK_JSON)
    const favorites = result.bookmarks.filter((b) => b.folder === 'TikTok お気に入り')
    expect(favorites).toHaveLength(2)
    expect(favorites[0].url).toBe('https://www.tiktok.com/@user1/video/111')
    expect(favorites[0].source).toBe('tiktok')
  })
  it('parses liked videos', () => {
    const result = parseTiktokData(TIKTOK_JSON)
    const likes = result.bookmarks.filter((b) => b.folder === 'TikTok いいね')
    expect(likes).toHaveLength(1)
  })
  it('converts date to ISO format', () => {
    const result = parseTiktokData(TIKTOK_JSON)
    expect(result.bookmarks[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
  it('handles missing sections gracefully', () => {
    const partial = JSON.stringify({ Activity: {} })
    const result = parseTiktokData(partial)
    expect(result.bookmarks).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
  it('reports error for invalid JSON', () => {
    const result = parseTiktokData('not json')
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
