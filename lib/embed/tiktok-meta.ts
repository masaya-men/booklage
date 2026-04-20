import type { TikTokMeta } from './types'

const OEMBED_BASE = 'https://www.tiktok.com/oembed'
const TIMEOUT_MS = 3000

/** Extract video ID from TikTok URL. */
function extractTikTokId(url: string): string | null {
  const match = url.match(/\/video\/(\d+)/)
  return match?.[1] ?? null
}

/** Fetch TikTok video metadata via official oEmbed API. */
export async function fetchTikTokMeta(url: string): Promise<TikTokMeta | null> {
  const id = extractTikTokId(url)
  if (!id) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${OEMBED_BASE}?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { thumbnail_url?: string; title?: string }
    if (!data.thumbnail_url) return null
    return {
      id,
      thumbnailUrl: data.thumbnail_url,
      title: data.title ?? '',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
