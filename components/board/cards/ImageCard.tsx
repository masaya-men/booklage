'use client'

import type { ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import styles from './ImageCard.module.css'

type Props = {
  readonly item: BoardItem
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
