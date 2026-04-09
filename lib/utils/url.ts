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
