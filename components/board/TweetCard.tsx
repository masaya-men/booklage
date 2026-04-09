'use client'

import { Tweet } from 'react-tweet'
import styles from './TweetCard.module.css'

/** Props for the TweetCard component */
type TweetCardProps = {
  /** The numeric tweet/post ID */
  tweetId: string
  /** Inline styles for positioning, rotation, etc. */
  style?: React.CSSProperties
}

/**
 * Renders an embedded tweet using react-tweet.
 * Wrapped in a floating card with hover effects.
 */
export function TweetCard({ tweetId, style }: TweetCardProps): React.ReactElement {
  return (
    <div className={styles.card} style={style}>
      <Tweet id={tweetId} />
    </div>
  )
}
