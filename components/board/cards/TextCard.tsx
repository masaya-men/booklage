'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { getFaviconUrl, hostnameFromUrl } from '@/lib/embed/favicon'
import { pickTitleTypography } from '@/lib/embed/title-typography'
import { measureTextCardAspectRatio } from '@/lib/embed/text-card-measure'
import styles from './TextCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
}

/** Strip `http(s)://` from titles that are raw URLs to prevent the protocol
 * prefix from dominating headline serif display. The hostname/path remains
 * the informative part of the text. */
function cleanTitle(title: string): string {
  if (/^https?:\/\//i.test(title)) {
    return title.replace(/^https?:\/\//i, '')
  }
  return title
}

/** Two aspect ratios are considered "effectively equal" under this threshold.
 * Prevents write loops when measurement matches the already-cached value. */
const ASPECT_EPSILON = 0.005

export function TextCard({
  item,
  cardWidth = 280,
  cardHeight = 360,
  persistMeasuredAspect,
}: Props): ReactNode {
  const hostname = hostnameFromUrl(item.url)
  const faviconUrl = hostname ? getFaviconUrl(hostname) : null
  const rawTitle = item.title || hostname || item.url
  const title = cleanTitle(rawTitle)
  const typography = pickTitleTypography({ title, cardWidth, cardHeight })

  // Measure actual rendered height with pretext so masonry can size the card
  // tall enough to show the full title without clipping. pretext is synchronous
  // (~1ms for typical titles) so we persist inline in useEffect — no need for
  // idle-callback deferral. ref-key prevents re-measurement on unrelated renders.
  const lastMeasuredKeyRef = useRef<string>('')
  useEffect(() => {
    if (!persistMeasuredAspect) return
    const key = `${cardWidth}:${typography.mode}:${typography.fontSize}:${title}`
    if (lastMeasuredKeyRef.current === key) return
    const aspect = measureTextCardAspectRatio({ title, cardWidth, typography })
    lastMeasuredKeyRef.current = key
    if (aspect == null || aspect <= 0) return
    if (Math.abs(aspect - item.aspectRatio) < ASPECT_EPSILON) return
    void persistMeasuredAspect(item.cardId, aspect)
  }, [item.cardId, item.aspectRatio, title, cardWidth, typography, persistMeasuredAspect])

  const titleStyle = {
    fontSize: `${typography.fontSize}px`,
    lineHeight: `${typography.lineHeight}px`,
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
        {title}
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
