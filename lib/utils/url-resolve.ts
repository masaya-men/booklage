// Separated from url.ts because this helper is imported by OGP scrapers
// that run in non-browser contexts (Cloudflare Worker, bookmarklet IIFE).
// Mirror copies exist in functions/api/ogp.ts (Worker — no @/ import)
// and the inline IIFE in lib/utils/bookmarklet.ts — keep in sync.

// Returns '' on empty / unparseable input — caller decides the fallback.
export function resolveMaybeRelative(href: string, baseUrl: string): string {
  if (!href) return ''
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
