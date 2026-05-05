'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import { detectUrlType, isInstagramReel } from '@/lib/utils/url'
import styles from './ImageCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly displayMode: DisplayMode
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
  readonly cardHeight?: number
}

const ASPECT_EPSILON = 0.005

export function ImageCard({ item, persistMeasuredAspect }: Props): ReactNode {
  const imgRef = useRef<HTMLImageElement>(null)
  const urlType = detectUrlType(item.url)
  // Show a small play badge when this image card actually wraps a video
  // source. Two confirmed-video signals:
  //   - Instagram /reel/ or /tv/ — the URL alone is enough; /p/ is left
  //     out because it can be a still photo.
  //   - X tweet with hasVideo=true (set by the syndication backfill).
  // For YouTube/TikTok the play badge lives on VideoThumbCard, not here.
  const isReel = urlType === 'instagram' && isInstagramReel(item.url)
  const isTweetVideo = urlType === 'tweet' && item.hasVideo === true
  const showPlayBadge = isReel || isTweetVideo

  // Re-measure intrinsic aspect from natural width/height once the thumbnail
  // loads. This corrects stale aspectRatio values written by previous
  // implementations (e.g. tweets that were saved by the old TweetCard with
  // its react-tweet height measurement, then later re-routed here as plain
  // images — the persisted aspect no longer matches the actual og:image).
  useEffect(() => {
    if (!persistMeasuredAspect || !item.thumbnail) return
    const img = imgRef.current
    if (!img) return
    const measure = (): void => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w <= 0 || h <= 0) return
      const aspect = w / h
      if (Math.abs(aspect - item.aspectRatio) < ASPECT_EPSILON) return
      void persistMeasuredAspect(item.cardId, aspect)
    }
    if (img.complete && img.naturalWidth > 0) {
      measure()
      return undefined
    }
    img.addEventListener('load', measure)
    return (): void => img.removeEventListener('load', measure)
  }, [item.cardId, item.aspectRatio, item.thumbnail, persistMeasuredAspect])

  const thumbClass = isReel
    ? `${styles.thumb} ${styles.thumbInstagramReel}`
    : styles.thumb

  return (
    <div className={styles.imageCard}>
      {item.thumbnail && (
        <img
          ref={imgRef}
          className={thumbClass}
          src={item.thumbnail}
          alt=""
          draggable={false}
          loading="lazy"
        />
      )}
      {/* Reel-specific tint dims the center where IG's printed play icon
          usually sits, so our own .playBadge below reads as the dominant
          affordance instead of competing with IG's branded one. */}
      {isReel && <div className={styles.tintInstagramReel} aria-hidden="true" />}
      {showPlayBadge && (
        <div className={styles.playBadge} aria-hidden="true">
          <svg className={styles.playBadgeIcon} viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  )
}
