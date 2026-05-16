import type { TweetMeta, MediaSlot } from './types'

/**
 * AllMarks's CORS-friendly proxy for `cdn.syndication.twimg.com`.
 *
 * Why we proxy: Twitter's syndication CDN responds with
 * `Access-Control-Allow-Origin: https://platform.twitter.com`, so any
 * direct browser fetch from `booklage.pages.dev` is blocked. The Cloudflare
 * Pages Function at `functions/api/tweet-meta.ts` relays the request
 * server-to-server (where CORS doesn't apply) and adds a permissive
 * Access-Control-Allow-Origin on the way back. Token computation lives in
 * the proxy so it can never leak / get scraped from the static bundle.
 */
const PROXY_ENDPOINT = '/api/tweet-meta'

/** Fetch tweet metadata via the AllMarks proxy. Returns null on any failure. */
export async function fetchTweetMeta(id: string): Promise<TweetMeta | null> {
  if (!/^\d+$/.test(id)) return null
  try {
    const res = await fetch(`${PROXY_ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'GET',
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return parseTweetData(data)
  } catch {
    return null
  }
}

type VideoVariant = {
  bitrate?: number
  content_type?: string
  url?: string
}

type SyndicationRaw = {
  id_str?: string
  text?: string
  full_text?: string
  created_at?: string
  user?: {
    name?: string
    screen_name?: string
    profile_image_url_https?: string
  }
  photos?: Array<{ url: string; width: number; height: number }>
  mediaDetails?: Array<{
    type?: string
    media_url_https?: string
    original_info?: { width: number; height: number }
    video_info?: {
      aspect_ratio?: [number, number]
      variants?: VideoVariant[]
    }
  }>
  video?: { aspect_ratio?: [number, number] }
  quoted_tweet?: unknown
  card?: { name?: string }
}

/** Pick the highest-bitrate mp4 variant from the syndication response. */
function pickBestMp4(variants: VideoVariant[] | undefined): string | undefined {
  if (!variants) return undefined
  const mp4s = variants.filter((v) => v.content_type === 'video/mp4' && v.url)
  if (mp4s.length === 0) return undefined
  mp4s.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
  return mp4s[0]?.url
}

/** Parse raw syndication response. Exposed for testing. */
export function parseTweetData(raw: unknown): TweetMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as SyndicationRaw
  if (!r.id_str || (!r.text && !r.full_text)) return null

  const text = r.full_text ?? r.text ?? ''
  const isPoll = r.card?.name?.includes('poll') ?? false

  // Build mediaSlots from mediaDetails (the canonical API order). When
  // mediaDetails is absent (older syndication payload shape), fall back to
  // the simpler `photos` array.
  const mediaSlots: MediaSlot[] = []
  if (r.mediaDetails && r.mediaDetails.length > 0) {
    for (const m of r.mediaDetails) {
      if (m.type === 'video') {
        const videoUrl = pickBestMp4(m.video_info?.variants)
        if (!videoUrl || !m.media_url_https) continue  // silent drop — see test
        const aspect = m.original_info
          ? m.original_info.width / m.original_info.height
          : undefined
        mediaSlots.push({
          type: 'video',
          url: m.media_url_https,
          videoUrl,
          aspect,
        })
      } else if (m.type === 'photo' && m.media_url_https) {
        mediaSlots.push({ type: 'photo', url: m.media_url_https })
      }
      // Unknown types silently skipped.
    }
  } else if (r.photos && r.photos.length > 0) {
    for (const p of r.photos) {
      mediaSlots.push({ type: 'photo', url: p.url })
    }
  }

  // Derived legacy fields — kept for backward compatibility with existing
  // callers (ImageCard / Lightbox / BoardRoot backfill). To be deprecated in
  // a later cleanup spec once all reads migrate to mediaSlots.
  const firstPhoto = mediaSlots.find((s) => s.type === 'photo')
  const firstVideo = mediaSlots.find((s) => s.type === 'video')
  const photoUrls = mediaSlots.filter((s) => s.type === 'photo').map((s) => s.url)

  // photoAspectRatio: keep using `photos[0].width/height` if available, else
  // omit. parseTweetData's older callers used this as a thumbnail aspect
  // hint and we can keep that intact without taxing the mediaSlots design.
  const photoAspect = r.photos?.[0]
    ? r.photos[0].width / r.photos[0].height
    : undefined

  return {
    id: r.id_str,
    text,
    hasPhoto: Boolean(firstPhoto),
    hasVideo: Boolean(firstVideo),
    hasPoll: isPoll,
    hasQuotedTweet: Boolean(r.quoted_tweet),
    photoAspectRatio: photoAspect,
    videoAspectRatio: firstVideo?.aspect,
    photoUrl: firstPhoto?.url,
    photoUrls,
    videoPosterUrl: firstVideo?.url,
    videoUrl: firstVideo?.videoUrl,
    authorName: r.user?.name ?? '',
    authorHandle: r.user?.screen_name ?? '',
    authorAvatar: r.user?.profile_image_url_https,
    createdAt: r.created_at,
    mediaSlots,
  }
}
