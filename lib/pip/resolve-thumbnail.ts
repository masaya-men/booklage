import type { BookmarkRecord } from '@/lib/storage/indexeddb'
import { detectUrlType, extractTweetId, isXDefaultThumbnail } from '@/lib/utils/url'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { fetchTikTokMeta } from '@/lib/embed/tiktok-meta'
import { getYoutubeThumb } from '@/lib/embed/youtube-thumb'

/**
 * Resolve a renderable thumbnail URL for a bookmark in the PiP companion.
 *
 * Mirrors the board's per-source backfill: when the bookmarklet's og:image
 * scrape fails (Twitter/TikTok SPAs return generic placeholders) we hit the
 * same syndication / oEmbed / CDN endpoints the board uses so the PiP card
 * shows the same image the board would.
 *
 * Strategy:
 *  1. Trust an existing non-degenerate thumbnail (the bookmarklet got a real
 *     og:image — Apple, news pages, etc.).
 *  2. For tweet/youtube/tiktok, hit the source-specific resolver.
 *  3. Otherwise fall back to whatever (possibly empty) thumbnail we had.
 *
 * Returns the empty string when no usable thumbnail is available — PipCard
 * already handles that fallback chain (favicon → generic placeholder).
 */
export async function resolveThumbnail(bookmark: BookmarkRecord): Promise<string> {
  const existing = bookmark.thumbnail ?? ''

  // Per-source resolution. We always try the source even when an existing
  // thumbnail is present for tweets, because X's default OG image is
  // detectable but other syndication-better thumbnails should still win.
  const type = detectUrlType(bookmark.url)

  if (type === 'tweet') {
    if (existing && !isXDefaultThumbnail(existing)) return existing
    const id = extractTweetId(bookmark.url)
    if (!id) return existing
    const meta = await fetchTweetMeta(id)
    if (!meta) return existing
    return meta.photoUrl ?? meta.videoPosterUrl ?? existing
  }

  if (type === 'youtube') {
    // Pure synchronous URL derivation — i.ytimg.com is CORS-friendly and
    // PipCard already falls through onError, so giving the maxres URL is
    // safe even when the video has no maxres thumbnail.
    const cdn = getYoutubeThumb(bookmark.url, 0)
    if (cdn) return cdn
    return existing
  }

  if (type === 'tiktok') {
    if (existing) return existing
    const meta = await fetchTikTokMeta(bookmark.url)
    if (!meta) return existing
    return meta.thumbnailUrl
  }

  // Instagram + general websites: rely on whatever the bookmarklet's
  // og:image scrape produced. Backfilling these via /api/oembed is possible
  // but rarely improves outcomes — skip for now.
  return existing
}
