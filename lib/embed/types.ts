// lib/embed/types.ts

/** A single addressable piece of media inside a post (X tweet / Bluesky / etc).
 *  Tweets surface a video first then photos; Bluesky surfaces up to 4 photos.
 *  Order matches the upstream API response and is the canonical board / Lightbox
 *  carousel order. */
export type MediaSlot = {
  readonly type: 'video' | 'photo'
  /** photo: the image URL. video: the poster (still frame) URL. */
  readonly url: string
  /** Defined only when type === 'video'. Highest-bitrate mp4 stream URL ready
   *  to feed into a `<video src>`. */
  readonly videoUrl?: string
  /** Defined only when type === 'video'. Natural width / height of the video
   *  (used by TweetVideoPlayer to letterbox-free fit). */
  readonly aspect?: number
}

/** Twitter syndication API response (subset we use). */
export type TweetMeta = {
  readonly id: string
  readonly text: string
  readonly hasPhoto: boolean
  readonly hasVideo: boolean
  readonly hasPoll: boolean
  readonly hasQuotedTweet: boolean
  readonly photoAspectRatio?: number  // width / height
  readonly videoAspectRatio?: number
  /** Direct photo URL (first photo if multiple). Used to populate the
   *  bookmark thumbnail when the bookmarklet couldn't grab og:image from X
   *  (which is the common case — X is a SPA and og:image is not in
   *  the static <head>). */
  readonly photoUrl?: string
  /** All photo URLs for multi-image tweets (X allows up to 4). photoUrls[0]
   *  always equals photoUrl when present. Empty array for text-only or
   *  video-only tweets. Persisted to IDB.photos for board-side hover swap.
   *  (I-07) */
  readonly photoUrls?: readonly string[]
  /** Video poster image URL (still frame). Same purpose as photoUrl but for
   *  video tweets. Falls back to a representative frame from mediaDetails. */
  readonly videoPosterUrl?: string
  /** Highest-bitrate mp4 variant from the syndication response, ready to feed
   *  into a `<video src>`. Undefined for photo-only / text-only tweets. */
  readonly videoUrl?: string
  /** Author profile image (small avatar). Used for the right-column header. */
  readonly authorAvatar?: string
  readonly authorName: string
  readonly authorHandle: string
  /** v13: 統一 media 配列。 mediaDetails 順序通りで video / photo を含む。 photoUrl /
   *  photoUrls / videoUrl 等は本 field からの派生で計算され、 後方互換のため引き続き
   *  公開される (数ヶ月後別 spec で deprecate)。 mix tweet では length > 1 かつ
   *  type='video' と type='photo' が混在する。 */
  readonly mediaSlots?: readonly MediaSlot[]
  /** Tweet creation timestamp in ISO 8601 (e.g. "2026-05-02T22:07:00Z"). */
  readonly createdAt?: string
}

/** Result of TikTok oEmbed lookup (subset). */
export type TikTokMeta = {
  readonly id: string
  readonly thumbnailUrl: string
  readonly title: string
}

/** Playback metadata extracted from TikTok's __UNIVERSAL_DATA_FOR_REHYDRATION__
 *  blob via our server-side scrape (`functions/api/tiktok-meta.ts`). Contains
 *  the playable mp4 URL — feed it through `/api/tiktok-video?url=...&c=...`
 *  to satisfy TikTok's CDN Referer + Cookie checks. `cookieString` carries
 *  the session cookies (notably tt_chain_token) that TikTok set during the
 *  scrape; without it the CDN returns 403 even with the right Referer. */
export type TikTokPlayback = {
  readonly playAddr: string
  readonly cover: string
  readonly duration: number
  readonly width: number
  readonly height: number
  readonly cookieString: string
}

/** Title typography auto-mode pick. */
export type TitleMode = 'headline' | 'editorial' | 'index'

export type TitleTypographyResult = {
  readonly mode: TitleMode
  readonly fontSize: number    // px
  readonly lineHeight: number  // px
  readonly maxLines: number
}

/** Output of measurement persisted to IDB. */
export type MeasuredAspect = {
  readonly cardId: string
  readonly aspectRatio: number
  readonly source: 'tweet-measured' | 'image-intrinsic' | 'video-known' | 'text-typography'
}
