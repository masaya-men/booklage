import type { TweetMeta } from './types'

/** Fixed chrome heights in react-tweet rendering (calibrated empirically). */
const CHROME = {
  HEADER_PX: 52,           // avatar + name + handle + date
  FOOTER_PX: 30,           // action bar (reply/retweet/like)
  PADDING_PX: 16,          // top + bottom inner padding
  QUOTED_TWEET_PX: 140,    // embedded quote tweet box
  POLL_PX: 120,            // poll display
} as const

/** Minimum text content height (even for empty tweets). */
const MIN_TEXT_HEIGHT_PX = 140

/** Approximate text height: chars per line × line count × line height. */
function approximateTextHeight(text: string, cardWidth: number): number {
  // react-tweet uses ~15px font with ~24px line-height (including inter-line spacing)
  const lineHeight = 24
  const charsPerLine = Math.max(1, Math.floor((cardWidth - 32) / 6.0))  // ~6px avg char width
  const lines = Math.max(1, Math.ceil(Math.max(text.length, 1) / charsPerLine))
  const textHeight = lines * lineHeight
  return Math.max(textHeight, MIN_TEXT_HEIGHT_PX)  // minimum to ensure short tweets aren't too wide
}

/**
 * Predicts the aspect ratio (width / height) for a tweet card.
 * Used BEFORE rendering react-tweet so masonry can place the card at the
 * correct size, eliminating reflow flicker.
 */
export function predictTweetAspectRatio(meta: TweetMeta, cardWidth: number): number {
  let height = CHROME.HEADER_PX + CHROME.FOOTER_PX + CHROME.PADDING_PX

  height += approximateTextHeight(meta.text, cardWidth)

  if (meta.hasPhoto) {
    const photoRatio = meta.photoAspectRatio ?? 16 / 9
    height += cardWidth / photoRatio
  }

  if (meta.hasVideo) {
    const videoRatio = meta.videoAspectRatio ?? 16 / 9
    height += cardWidth / videoRatio
  }

  if (meta.hasQuotedTweet) {
    height += CHROME.QUOTED_TWEET_PX
  }

  if (meta.hasPoll) {
    height += CHROME.POLL_PX
  }

  return cardWidth / height
}
