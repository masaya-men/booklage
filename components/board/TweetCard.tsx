'use client'

import styles from './TweetCard.module.css'

/** Props for the TweetCard component */
type TweetCardProps = {
  /** The numeric tweet/post ID */
  tweetId: string
  /** Inline styles for positioning, rotation, etc. */
  style?: React.CSSProperties
}

/**
 * Renders an embedded tweet using Twitter's iframe embed.
 * This allows full interactivity including video playback.
 * widgets.js is sandboxed inside the iframe (doesn't affect main page).
 * The drag handle at the top lets users move the card without interfering with the iframe.
 */
export function TweetCard({ tweetId, style }: TweetCardProps): React.ReactElement {
  return (
    <div className={styles.card} style={style}>
      <div className={styles.dragHandle}>⋮⋮</div>
      <iframe
        className={styles.iframe}
        src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&dnt=true`}
        title={`Tweet ${tweetId}`}
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}
