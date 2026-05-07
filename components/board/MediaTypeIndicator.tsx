'use client'

import type { ReactElement } from 'react'
import styles from './MediaTypeIndicator.module.css'

export type MediaType = 'video' | 'photo'

type Props = {
  /** null hides the indicator entirely (e.g. text-only cards — the type
   *  is already obvious from the card content, no badge needed). */
  readonly type: MediaType | null
  readonly visible: boolean
}

/**
 * Tiny media-type pill rendered on the card on hover. Tells
 * the user at a glance whether the card under their cursor is video or
 * photo — useful both as a content cue and (later) when filter / multi-
 * playback features need to disambiguate. We INTENTIONALLY don't render
 * a play overlay on the card thumbnail itself anymore (every card looking
 * like a play button felt cheap); the indicator only appears on hover so
 * it never competes with the visual itself.
 */
export function MediaTypeIndicator({ type, visible }: Props): ReactElement | null {
  if (type === null) return null
  return (
    <div
      className={styles.indicator}
      data-visible={visible}
      aria-label={type === 'video' ? 'video' : 'photo'}
    >
      {type === 'video' ? <VideoIcon /> : <PhotoIcon />}
    </div>
  )
}

/** Filmstrip icon — reads as "video" without the play-button shape that
 *  we explicitly removed from the card thumbnails. */
function VideoIcon(): ReactElement {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h2M3 15h2M19 9h2M19 15h2" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Image / photo frame icon (mountain peak + sun) — universally read
 *  as "still image" across most icon sets. */
function PhotoIcon(): ReactElement {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <path d="M21 16l-5-5-7 7" />
    </svg>
  )
}
