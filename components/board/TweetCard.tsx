'use client'

import { useState } from 'react'
import styles from './TweetCard.module.css'

/** Props for the TweetCard component */
type TweetCardProps = {
  /** The numeric tweet/post ID */
  tweetId: string
  /** Inline styles for positioning, rotation, etc. */
  style?: React.CSSProperties
  /** Card width in pixels */
  width?: number
  /** Card height in pixels */
  height?: number
}

/**
 * Renders a tweet card with iframe embed.
 *
 * The iframe loads immediately so the tweet content is always visible.
 * By default pointer-events are disabled on the iframe — this allows:
 * - 3D tilt tracking (mousemove reaches the parent)
 * - Dragging from anywhere on the card
 *
 * Clicking the overlay activates the iframe for full interaction
 * (video playback, links, etc.). A drag handle appears at the top.
 */
export function TweetCard({ tweetId, style, width, height }: TweetCardProps): React.ReactElement {
  const [active, setActive] = useState(false)

  const cardStyle: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { ['--card-width' as string]: `${width}px` } : {}),
    ...(height !== undefined ? { ['--card-height' as string]: `${height}px` } : {}),
  }

  return (
    <div className={styles.card} style={cardStyle}>
      {active && <div className={styles.dragHandle}>⋮⋮</div>}
      <div className={styles.iframeWrapper}>
        <iframe
          className={styles.iframe}
          style={{ pointerEvents: active ? 'auto' : 'none' }}
          src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&dnt=true`}
          title={`Tweet ${tweetId}`}
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
        {!active && (
          <div className={styles.activateOverlay} onClick={() => setActive(true)}>
            <div className={styles.activateHint}>クリックで操作可能に</div>
          </div>
        )}
      </div>
    </div>
  )
}
