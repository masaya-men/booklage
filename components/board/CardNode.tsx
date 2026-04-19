'use client'

import type { PointerEvent, ReactNode } from 'react'
import type { CardPosition } from '@/lib/board/types'
import styles from './CardNode.module.css'

type CardNodeProps = {
  readonly id: string
  /**
   * Layout position. Currently retained for API compatibility with callers,
   * but the outer element fills its parent (the CardsLayer wrapper owns
   * absolute positioning + width/height + GSAP transforms). Only `w`/`h`
   * are read in fallback rendering paths if needed in the future.
   */
  readonly position: CardPosition
  readonly title: string
  readonly thumbnailUrl?: string
  readonly children?: ReactNode
  /** Rotation in degrees applied to the inner card surface (free mode). */
  readonly rotation?: number
  /** When true, renders a glassy lock chip in the top-right corner. */
  readonly locked?: boolean
  /** When true, renders the Booklage-violet selection outline + glow halo. */
  readonly selected?: boolean
  readonly onPointerDown?: (e: PointerEvent<HTMLDivElement>, cardId: string) => void
}

export function CardNode({
  id,
  title,
  thumbnailUrl,
  children,
  rotation,
  locked,
  selected,
  onPointerDown,
}: CardNodeProps): ReactNode {
  const innerClassName = [
    styles.inner,
    selected ? styles.selected : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={styles.cardNode}
      data-card-id={id}
      onPointerDown={onPointerDown ? (e): void => onPointerDown(e, id) : undefined}
    >
      <div
        className={innerClassName}
        style={{ transform: `rotate(${rotation ?? 0}deg)` }}
      >
        {children ?? (
          <>
            {thumbnailUrl && <img className={styles.thumb} src={thumbnailUrl} alt="" />}
            <div className={styles.title}>{title}</div>
          </>
        )}
        {locked && (
          <div className={styles.lockChip} aria-label="locked">
            <svg
              className={styles.lockIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
