import type { TweetMeta } from './types'

/**
 * Booklage's CORS-friendly proxy for `cdn.syndication.twimg.com`.
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

/** Fetch tweet metadata via the Booklage proxy. Returns null on any failure. */
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

type SyndicationRaw = {
  id_str?: string
  text?: string
  full_text?: string
  user?: { name?: string; screen_name?: string }
  photos?: Array<{ url: string; width: number; height: number }>
  mediaDetails?: Array<{
    type?: string
    media_url_https?: string
    original_info?: { width: number; height: number }
  }>
  video?: { aspect_ratio?: [number, number] }
  quoted_tweet?: unknown
  card?: { name?: string }
}

/** Parse raw syndication response. Exposed for testing. */
export function parseTweetData(raw: unknown): TweetMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as SyndicationRaw
  if (!r.id_str || (!r.text && !r.full_text)) return null

  const text = r.full_text ?? r.text ?? ''
  const photo = r.photos?.[0]
  const video = r.mediaDetails?.find((m) => m.type === 'video')
  const isPoll = r.card?.name?.includes('poll') ?? false

  return {
    id: r.id_str,
    text,
    hasPhoto: Boolean(photo),
    hasVideo: Boolean(video),
    hasPoll: isPoll,
    hasQuotedTweet: Boolean(r.quoted_tweet),
    photoAspectRatio: photo ? photo.width / photo.height : undefined,
    videoAspectRatio: video?.original_info
      ? video.original_info.width / video.original_info.height
      : undefined,
    photoUrl: photo?.url,
    videoPosterUrl: video?.media_url_https,
    authorName: r.user?.name ?? '',
    authorHandle: r.user?.screen_name ?? '',
  }
}
