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
 * By default pointer-events are disabled on the iframe — this allows:
 * - 3D tilt tracking (mousemove reaches the parent)
 * - Dragging from anywhere on the card
 *
 * Clicking the ▶ overlay activates the iframe for video playback.
 * A drag handle appears at the top so the card can still be moved.
 */
export function VideoEmbed({ videoId, title, style, width }: VideoEmbedProps): React.ReactElement {
  const [active, setActive] = useState(false)
  const cardWidth = width ?? 240
  const iframeHeight = Math.round(cardWidth * 9 / 16)

  return (
    <div className={styles.card} style={style}>
      {active && <div className={styles.dragHandle}>⋮⋮</div>}
      <div className={styles.iframeWrapper} style={{ height: iframeHeight }}>
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
