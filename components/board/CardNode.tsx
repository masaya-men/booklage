'use client'

import type { PointerEvent, ReactNode } from 'react'
import styles from './CardNode.module.css'

type CardNodeProps = {
  readonly id: string
  readonly title: string
  readonly thumbnailUrl?: string
  readonly children?: ReactNode
  /** Rotation in degrees applied to the inner card surface (free mode). */
  readonly rotation?: number
  /** When true, renders a glassy lock chip in the top-right corner. */
  readonly locked?: boolean
  /** When true, renders the AllMarks-violet selection outline + glow halo. */
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
            {thumbnailUrl && <img className={styles.thumb} src={thumbnailUrl} alt="" draggable={false} />}
            <div className={styles.title}>{title}</div>
          </>
        )}
        {locked && (
          <div className={styles.lockChip} role="img" aria-label="ロック中">
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
