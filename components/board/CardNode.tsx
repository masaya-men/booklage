'use client'

import type { PointerEvent, ReactNode } from 'react'
import type { CardPosition } from '@/lib/board/types'
import styles from './CardNode.module.css'

type CardNodeProps = {
  readonly id: string
  readonly position: CardPosition
  readonly title: string
  readonly thumbnailUrl?: string
  readonly children?: ReactNode
  readonly onPointerDown?: (e: PointerEvent<HTMLDivElement>, cardId: string) => void
}

export function CardNode({
  id,
  position,
  title,
  thumbnailUrl,
  children,
  onPointerDown,
}: CardNodeProps) {
  return (
    <div
      className={styles.cardNode}
      data-card-id={id}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: `${position.w}px`,
        height: `${position.h}px`,
      }}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, id) : undefined}
    >
      {children ?? (
        <>
          {thumbnailUrl && <img className={styles.thumb} src={thumbnailUrl} alt="" />}
          <div className={styles.title}>{title}</div>
        </>
      )}
    </div>
  )
}
