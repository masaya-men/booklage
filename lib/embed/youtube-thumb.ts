import { extractYoutubeId } from '@/lib/utils/url'

/** Thumbnail quality levels in fallback order. */
const THUMB_VARIANTS = ['maxresdefault', 'hqdefault', 'mqdefault', '0'] as const

/**
 * Returns YouTube thumbnail URL at the given fallback level.
 * @param url - YouTube watch / short / shorts URL
 * @param level - 0 = maxres (best), 1 = hq, 2 = mq, 3 = 0.jpg (always exists)
 * @returns Thumbnail URL, or null if URL is not a valid YouTube link
 */
export function getYoutubeThumb(url: string, level: 0 | 1 | 2 | 3): string | null {
  const id = extractYoutubeId(url)
  if (!id) return null
  return `https://i.ytimg.com/vi/${id}/${THUMB_VARIANTS[level]}.jpg`
}

/** True if URL is a YouTube Shorts link (vertical video). */
export function isYoutubeShortsUrl(url: string): boolean {
  return /youtube\.com\/shorts\//i.test(url)
}
