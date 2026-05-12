/**
 * Resolve a possibly-relative URL against a base URL.
 *
 * - Absolute http(s) URL → returned as-is.
 * - Protocol-relative (//cdn.example.com/...) → prefixed with https:.
 * - Root-relative (/foo/bar) or path-relative (foo.jpg) → resolved via
 *   the URL constructor against baseUrl.
 * - Empty input or unparseable → empty string (caller decides fallback).
 *
 * Used by all OGP scrapers (Worker, extension, bookmarklet, inline copy)
 * for og:image / twitter:image / favicon so relative paths in 3rd-party
 * pages become loadable absolute URLs in our IndexedDB.
 */
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
