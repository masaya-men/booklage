'use client'

import { useEffect, useRef, type ReactNode } from 'react'
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

const ASPECT_EPSILON = 0.005

export function ImageCard({ item, persistMeasuredAspect }: Props): ReactNode {
  const imgRef = useRef<HTMLImageElement>(null)

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

  return (
    <div className={styles.imageCard}>
      {item.thumbnail && (
        <img
          ref={imgRef}
          className={styles.thumb}
          src={item.thumbnail}
          alt=""
          draggable={false}
          loading="lazy"
        />
      )}
    </div>
  )
}
