'use client'

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
 * Renders a YouTube video embed inside a card.
 * Uses youtube-nocookie.com for privacy (no tracking cookies).
 * The iframe captures its own pointer events, so the video controls
 * work even inside a GSAP Draggable wrapper.
 */
export function VideoEmbed({ videoId, title, style, width }: VideoEmbedProps): React.ReactElement {
  const cardWidth = width ?? 240
  const iframeHeight = Math.round(cardWidth * 9 / 16)

  return (
    <div className={styles.card} style={style}>
      <div className={styles.dragHandle}>⋮⋮</div>
      <div className={styles.iframeWrapper} style={{ height: iframeHeight }}>
        <iframe
          className={styles.iframe}
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
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
