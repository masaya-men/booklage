import type { TikTokMeta, TikTokPlayback } from './types'

const OEMBED_BASE = 'https://www.tiktok.com/oembed'
const TIMEOUT_MS = 3000
const PLAYBACK_TIMEOUT_MS = 7000

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

/** Fetch a playable TikTok mp4 URL by hitting our server-side scrape
 *  endpoint. Returns null on any failure (TikTok WAF challenge, missing
 *  rehydration script, JSON shape change, network timeout, etc.) so the
 *  caller can fall through to the iframe fallback without surfacing the
 *  failure mode to the user. The caller MUST stream the returned playAddr
 *  through `/api/tiktok-video?url=<encoded>` rather than feeding it into a
 *  `<video src>` directly — the CDN rejects requests whose Referer is
 *  not tiktok.com. */
export async function fetchTikTokPlayback(
  url: string,
): Promise<TikTokPlayback | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PLAYBACK_TIMEOUT_MS)
  try {
    const res = await fetch(
      `/api/tiktok-meta?url=${encodeURIComponent(url)}`,
      { signal: controller.signal },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      playAddr?: string
      cover?: string
      duration?: number
      width?: number
      height?: number
    }
    if (!data.playAddr) return null
    return {
      playAddr: data.playAddr,
      cover: data.cover ?? '',
      duration: data.duration ?? 0,
      width: data.width ?? 0,
      height: data.height ?? 0,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
