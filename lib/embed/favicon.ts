/** Google's free s2 favicon service (no auth, no rate limit). */
const S2_BASE = 'https://www.google.com/s2/favicons'

/** Build favicon URL from hostname. */
export function getFaviconUrl(hostname: string, size: 32 | 64 | 128 = 64): string {
  return `${S2_BASE}?domain=${encodeURIComponent(hostname)}&sz=${size}`
}

/** Extract hostname from URL safely (returns '' on invalid input). */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
