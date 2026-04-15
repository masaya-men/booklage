'use client'

import { useState } from 'react'
import styles from './VideoEmbed.module.css'

/** Props for the VideoEmbed component */
type VideoEmbedProps = {
  /** YouTube video ID */
  videoId: string
  /** Card title for fallback */
  title: string
  /** Inline styles for positioning, rotation, etc. */
  style?: React.CSSProperties
  /** Card width in pixels */
  width?: number
}

/**
 * Renders a YouTube video card.
 *
 * The iframe loads immediately so content is always visible.
 * Uses CSS aspect-ratio: 16/9 for the iframe wrapper so the card
 * responds correctly to --card-width changes during resize.
 *
 * Clicking the ▶ overlay activates the iframe for video playback.
 * A drag handle appears at the top so the card can still be moved.
 */
export function VideoEmbed({ videoId, title, style, width }: VideoEmbedProps): React.ReactElement {
  const [active, setActive] = useState(false)

  const cardStyle: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { ['--card-width' as string]: `${width}px` } : {}),
  }

  return (
    <div className={styles.card} style={cardStyle}>
      {active && <div className={styles.dragHandle}>⋮⋮</div>}
      <div className={styles.iframeWrapper}>
        <iframe
          className={styles.iframe}
          style={{ pointerEvents: active ? 'auto' : 'none' }}
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {!active && (
          <div className={styles.activateOverlay} onClick={() => setActive(true)}>
            <div className={styles.playButton}>▶</div>
          </div>
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{title}</span>
      </div>
    </div>
  )
}
