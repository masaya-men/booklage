import type { TweetMeta } from './types'

/**
 * Twitter syndication CDN — same endpoint react-tweet uses internally.
 * No auth required, served via Cloudflare. CORS-permitted from any origin.
 */
const SYNDICATION_BASE = 'https://cdn.syndication.twimg.com/tweet-result'

/**
 * Token computation matches react-tweet's algorithm
 * (https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/fetch-tweet.ts).
 */
function computeToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, '')
}

/** Fetch tweet metadata via syndication API. Returns null on any failure. */
export async function fetchTweetMeta(id: string): Promise<TweetMeta | null> {
  if (!/^\d+$/.test(id)) return null
  const token = computeToken(id)
  const url = `${SYNDICATION_BASE}?id=${id}&token=${token}&lang=en`
  try {
    const res = await fetch(url, { method: 'GET' })
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
  mediaDetails?: Array<{ type?: string; original_info?: { width: number; height: number } }>
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
    authorName: r.user?.name ?? '',
    authorHandle: r.user?.screen_name ?? '',
  }
}
