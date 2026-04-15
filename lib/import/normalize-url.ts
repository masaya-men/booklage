/**
 * Normalizes a URL for deduplication:
 * - http → https
 * - remove www. prefix from hostname
 * - remove trailing slash (root path only)
 * - lowercase hostname
 *
 * @param raw - The raw URL string to normalize
 * @returns The normalized URL string, or the original string if it is not a valid URL
 */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.protocol = 'https:'
    url.hostname = url.hostname.replace(/^www\./, '')
    let result = url.toString()
    if (result.endsWith('/') && url.pathname === '/') {
      result = result.slice(0, -1)
    }
    return result
  } catch {
    return raw
  }
}
