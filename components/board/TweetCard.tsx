'use client'

import { useState } from 'react'
import styles from './TweetCard.module.css'

/** Props for the TweetCard component */
type TweetCardProps = {
  /** The numeric tweet/post ID */
  tweetId: string
  /** Inline styles for positioning, rotation, etc. */
  style?: React.CSSProperties
}

/**
 * Renders a tweet card.
 * Shows a lightweight placeholder by default — supports 3D tilt.
 * On click, loads the full Twitter iframe embed with video playback.
 */
export function TweetCard({ tweetId, style }: TweetCardProps): React.ReactElement {
  const [loaded, setLoaded] = useState(false)

  if (!loaded) {
    return (
      <div className={styles.card} style={style}>
        <div className={styles.placeholder} onClick={() => setLoaded(true)}>
          <span className={styles.xLogo}>𝕏</span>
          <span className={styles.loadText}>クリックでツイートを読み込む</span>
          <span className={styles.tweetId}>ID: {tweetId}</span>
        </div>
      </div>
    )
  }

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
