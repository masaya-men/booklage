/**
 * YouTube oEmbed API client.
 * Fetches authoritative video title when the locally stored title is
 * degenerate (empty, just the video ID, or a URL string). CORS-enabled
 * from any origin — no auth, no key.
 * See https://oembed.com/#section7.1 for the API spec.
 */

const OEMBED_BASE = 'https://www.youtube.com/oembed'
const TIMEOUT_MS = 4000

export type YoutubeOEmbed = {
  readonly title: string
  readonly authorName: string
}

/** True when the stored title is unhelpful and we should try oEmbed. */
export function isDegenerateYoutubeTitle(title: string): boolean {
  if (!title) return true
  // "YouTube <videoId>" (our bookmarklet fallback when document.title wasn't ready)
  if (/^YouTube\s+[A-Za-z0-9_-]{6,15}$/.test(title)) return true
  // The raw URL itself
  if (/^https?:\/\//.test(title)) return true
  // Just "YouTube" alone
  if (title.trim() === 'YouTube') return true
  return false
}

/**
 * Fetch video title via YouTube oEmbed API. Returns null on any failure
 * (private / deleted video, timeout, network error).
 */
export async function fetchYoutubeOEmbed(videoUrl: string): Promise<YoutubeOEmbed | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(
      `${OEMBED_BASE}?url=${encodeURIComponent(videoUrl)}&format=json`,
      { signal: controller.signal },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; author_name?: string }
    if (!data.title) return null
    return {
      title: data.title,
      authorName: data.author_name ?? '',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
