'use client'

import type { ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import styles from './ImageCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly displayMode: DisplayMode
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
  readonly cardHeight?: number
}

export function ImageCard({ item }: Props): ReactNode {
  return (
    <div className={styles.imageCard}>
      {item.thumbnail && (
        <img
          className={styles.thumb}
          src={item.thumbnail}
          alt=""
          draggable={false}
          loading="lazy"
        />
      )}
      <div className={styles.title}>{item.title}</div>
    </div>
  )
}
