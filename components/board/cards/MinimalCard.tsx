'use client'

import type { ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import { getFaviconUrl, hostnameFromUrl } from '@/lib/embed/favicon'
import styles from './MinimalCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  /** Reports the card's actual rendered height in px to the parent layout. */
  readonly reportIntrinsicHeight?: (cardId: string, heightPx: number) => void
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly displayMode?: DisplayMode
}

// "薄い" カード — title も thumbnail もない時の 「読めるカード」 表示。
// 大 favicon + hostname を主体に、 path は控えめに添える。
// Instagram (bot 弾き) / メタタグ不在ページなどが該当。
export function MinimalCard({ item }: Props): ReactNode {
  const hostname = hostnameFromUrl(item.url)
  const favicon = hostname ? getFaviconUrl(hostname) : null
  let path = ''
  try {
    const u = new URL(item.url)
    path = u.pathname === '/' ? '' : u.pathname
  } catch { /* keep '' */ }

  return (
    <div className={styles.minimalCard}>
      {favicon && (
        <img src={favicon} alt="" className={styles.favicon} draggable={false} />
      )}
      <div className={styles.domain}>{hostname || item.url}</div>
      {path && <div className={styles.path}>{path}</div>}
    </div>
  )
}
