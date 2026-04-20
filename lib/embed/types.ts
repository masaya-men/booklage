// lib/embed/types.ts

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
  readonly authorName: string
  readonly authorHandle: string
}

/** Result of TikTok oEmbed lookup (subset). */
export type TikTokMeta = {
  readonly id: string
  readonly thumbnailUrl: string
  readonly title: string
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
