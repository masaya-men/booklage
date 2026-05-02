/** Supported URL types for bookmark categorization */
export type UrlType = 'tweet' | 'youtube' | 'tiktok' | 'instagram' | 'website'

/**
 * Validates whether the input string is a valid HTTP or HTTPS URL.
 * @param input - The string to validate
 * @returns true if the input is a valid http/https URL
 */
export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Detects the type of a URL based on its hostname.
 * @param url - The URL string to classify
 * @returns The detected UrlType
 */
export function detectUrlType(url: string): UrlType {
  const lower = url.toLowerCase()
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'tweet'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube'
  if (lower.includes('tiktok.com')) return 'tiktok'
  if (lower.includes('instagram.com')) return 'instagram'
  return 'website'
}

/**
 * Extracts the tweet/post ID from a Twitter/X URL.
 * @param url - The Twitter or X URL
 * @returns The numeric tweet ID string, or null if not found
 */
export function extractTweetId(url: string): string | null {
  const match = url.match(/status\/(\d+)/)
  return match?.[1] ?? null
}

/**
 * Extracts the YouTube video ID from a URL.
 * Supports youtube.com/watch?v=, youtu.be/, and youtube.com/embed/ formats.
 * @param url - The YouTube URL
 * @returns The 11-character video ID, or null if not found
 */
export function extractYoutubeId(url: string): string | null {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return watchMatch[1]
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch) return embedMatch[1]
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shortsMatch) return shortsMatch[1]
  return null
}

/** Returns true if the URL is a YouTube Shorts (vertical 9:16) URL. */
export function isYoutubeShorts(url: string): boolean {
  return /youtube\.com\/shorts\//.test(url)
}

/**
 * Extracts the numeric video ID from a TikTok URL.
 * Supports tiktok.com/@username/video/{id} format.
 * @param url - The TikTok URL
 * @returns The numeric video ID string, or null if not found
 */
export function extractTikTokVideoId(url: string): string | null {
  const match = url.match(/\/video\/(\d+)/)
  return match?.[1] ?? null
}

/**
 * Extracts the shortcode from an Instagram URL.
 * Supports /p/{shortcode}/, /reel/{shortcode}/, /tv/{shortcode}/.
 * @param url - The Instagram URL
 * @returns The alphanumeric shortcode, or null if not found
 */
export function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)
  return match?.[1] ?? null
}

/**
 * Extracts the first HTTP/HTTPS URL from a text string.
 * Used by Web Share Target to extract URLs from shared text.
 * @param text - The text to search for URLs
 * @returns The first URL found, or null if none
 */
export function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/)
  return match ? match[0] : null
}

/**
 * Returns true when the given thumbnail URL looks like X (Twitter)'s default
 * OGP placeholder ("SEE WHAT'S HAPPENING" image and friends served from
 * abs.twimg.com), or is empty.
 *
 * Why this matters: X is a SPA and does not put per-tweet og:image into the
 * static <head>, so the bookmarklet's document scrape ends up grabbing X's
 * generic OGP fallback (or nothing). All tweet bookmarks therefore look
 * identical until we backfill the real photo URL via the syndication API.
 *
 * @param thumbnail - The thumbnail URL to inspect (may be undefined/empty)
 * @returns true when treatment as "no real image yet, please backfill"
 */
export function isXDefaultThumbnail(thumbnail: string | undefined | null): boolean {
  if (!thumbnail) return true
  return /(^|\/\/|\.)abs\.twimg\.com\//.test(thumbnail)
}
