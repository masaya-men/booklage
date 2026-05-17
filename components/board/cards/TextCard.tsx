'use client'

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import { getFaviconUrl, hostnameFromUrl } from '@/lib/embed/favicon'
import { pickTitleTypography } from '@/lib/embed/title-typography'
import { measureTextCardLayout } from '@/lib/embed/text-card-measure'
import { pickTextCardColor } from '@/lib/embed/text-card-color'
import { cleanTitle } from '@/lib/embed/clean-title'
import styles from './TextCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly reportIntrinsicHeight?: (cardId: string, heightPx: number) => void
  readonly displayMode: DisplayMode
  /** Session 36: Lightbox の `.media` (LargeTextCardScaler) では URL 行を非表示にして
   *  title だけが伸び伸び拡大される (= session 35 で確定した「テキストカードがそのまま拡大」
   *  の核心仕様)。 board の通常描画では omitMeta は付けない。
   *  なお swap 時の title font ジャンプ対策として、 アニメ clone 側でも metaTop/
   *  metaBottom 要素を DOM strip して同じ layout を作る (= wrapCloneWithScaleHost)。 */
  readonly omitMeta?: boolean
}

/** Two aspect ratios are considered "effectively equal" under this threshold.
 * Prevents write loops when measurement matches the already-cached value. */
const ASPECT_EPSILON = 0.005

export function TextCard({
  item,
  cardWidth = 280,
  cardHeight = 360,
  persistMeasuredAspect,
  reportIntrinsicHeight,
  omitMeta = false,
}: Props): ReactNode {
  const hostname = hostnameFromUrl(item.url)
  const faviconUrl = hostname ? getFaviconUrl(hostname) : null
  const rawTitle = item.title || hostname || item.url
  const title = cleanTitle(rawTitle, item.url)
  const typography = pickTitleTypography({ title, cardWidth, cardHeight })

  // Deterministic color variant from cardId. Locked at card creation time —
  // the same cardId always resolves to the same variant across sessions.
  const colorVariant = useMemo(() => pickTextCardColor(item.cardId), [item.cardId])

  // Resolve the visible line count via pretext measurement. When the title's
  // natural height would exceed the 9:16 ceiling, `maxLines` is clamped and
  // `clamped` flips to true — the title then renders with -webkit-line-clamp
  // ellipsis truncation. pretext is synchronous (~1ms typical) so we run it
  // during render and treat the SSR null branch as "use typography defaults."
  const layoutResult = measureTextCardLayout({ title, cardWidth, typography })
  const displayMaxLines = layoutResult?.maxLines ?? typography.maxLines

  const lastMeasuredKeyRef = useRef<string>('')
  useEffect(() => {
    if (!persistMeasuredAspect && !reportIntrinsicHeight) return
    if (!layoutResult) return
    const key = `${cardWidth}:${typography.mode}:${typography.fontSize}:${title}`
    if (lastMeasuredKeyRef.current === key) return
    lastMeasuredKeyRef.current = key
    const aspect = layoutResult.aspectRatio
    if (aspect <= 0) return
    reportIntrinsicHeight?.(item.bookmarkId, cardWidth / aspect)
    if (Math.abs(aspect - item.aspectRatio) < ASPECT_EPSILON) return
    void persistMeasuredAspect?.(item.cardId, aspect)
  }, [item.cardId, item.bookmarkId, item.aspectRatio, title, cardWidth, typography, layoutResult, persistMeasuredAspect, reportIntrinsicHeight])

  const titleStyle: CSSProperties = {
    fontSize: `${typography.fontSize}px`,
    lineHeight: `${typography.lineHeight}px`,
    WebkitLineClamp: displayMaxLines,
  }

  return (
    <div className={`${styles.textCard} ${styles[typography.mode]} ${styles[colorVariant]}`}>
      {faviconUrl && typography.mode !== 'headline' && !omitMeta && (
        <div className={styles.metaTop}>
          <img src={faviconUrl} alt="" className={styles.favicon} draggable={false} />
          <span className={styles.domain}>{hostname}</span>
        </div>
      )}

      <div className={styles.title} style={titleStyle}>
        {title}
      </div>

      {faviconUrl && typography.mode === 'headline' && !omitMeta && (
        <div className={styles.metaBottom}>
          <img src={faviconUrl} alt="" className={styles.favicon} draggable={false} />
          <span className={styles.domain}>{hostname}</span>
        </div>
      )}
    </div>
  )
}
