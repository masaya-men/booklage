'use client'

import type { ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { getFaviconUrl, hostnameFromUrl } from '@/lib/embed/favicon'
import { pickTitleTypography } from '@/lib/embed/title-typography'
import styles from './TextCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly cardWidth?: number
  readonly cardHeight?: number
}

export function TextCard({ item, cardWidth = 280, cardHeight = 360 }: Props): ReactNode {
  const hostname = hostnameFromUrl(item.url)
  const faviconUrl = hostname ? getFaviconUrl(hostname) : null
  const typography = pickTitleTypography({
    title: item.title,
    cardWidth,
    cardHeight,
  })

  const titleStyle = {
    fontSize: `${typography.fontSize}px`,
    lineHeight: `${typography.lineHeight}px`,
    WebkitLineClamp: typography.maxLines,
  }

  return (
    <div className={`${styles.textCard} ${styles[typography.mode]}`}>
      {faviconUrl && typography.mode !== 'headline' && (
        <div className={styles.metaTop}>
          <img src={faviconUrl} alt="" className={styles.favicon} draggable={false} />
          <span className={styles.domain}>{hostname}</span>
        </div>
      )}

      <div className={styles.title} style={titleStyle}>
        {item.title || hostname || item.url}
      </div>

      {faviconUrl && typography.mode === 'headline' && (
        <div className={styles.metaBottom}>
          <img src={faviconUrl} alt="" className={styles.favicon} draggable={false} />
          <span className={styles.domain}>{hostname}</span>
        </div>
      )}
    </div>
  )
}
