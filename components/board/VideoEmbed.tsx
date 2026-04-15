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
 * Shows a thumbnail by default — lightweight, supports 3D tilt.
 * On click, swaps to an iframe player with autoplay.
 */
export function VideoEmbed({ videoId, title, style, width }: VideoEmbedProps): React.ReactElement {
  const [playing, setPlaying] = useState(false)
  const cardWidth = width ?? 240
  const iframeHeight = Math.round(cardWidth * 9 / 16)
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`

  if (!playing) {
    return (
      <div className={styles.card} style={style}>
        <div
          className={styles.thumbnailWrapper}
          style={{ height: iframeHeight }}
          onClick={() => setPlaying(true)}
        >
          <img className={styles.thumbnail} src={thumbnailUrl} alt={title} loading="lazy" />
          <div className={styles.playOverlay}>
            <div className={styles.playButton}>▶</div>
          </div>
        </div>
        <div className={styles.info}>
          <span className={styles.title}>{title}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.card} style={style}>
      <div className={styles.dragHandle}>⋮⋮</div>
      <div className={styles.iframeWrapper} style={{ height: iframeHeight }}>
        <iframe
          className={styles.iframe}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{title}</span>
      </div>
    </div>
  )
}
