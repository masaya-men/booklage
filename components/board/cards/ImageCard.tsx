'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import type { MediaSlot } from '@/lib/embed/types'
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
  const cardRef = useRef<HTMLDivElement>(null)
  // I-07: lazy-preload all photos on first hover. After the user enters
  // the card once, subsequent swaps hit the browser HTTP cache instantly.
  // Eager preload at board mount is intentionally avoided to protect PiP
  // and Lightbox bandwidth.
  const preloadedRef = useRef<boolean>(false)
  const [imageIdx, setImageIdx] = useState<number>(0)

  const urlType = detectUrlType(item.url)
  // Instagram-reel-only treatment: soften the JPEG-baked play icon that
  // Instagram bakes into the og:image so it doesn't visually compete with
  // the rest of the board. The tint stays even though the play overlay
  // was removed in v59 — IG's printed icon is part of the image pixels
  // and would otherwise stick out as the only "loud" element on a clean
  // board. The hover-revealed MediaTypeIndicator (in CardsLayer) is
  // what tells the user "this is a video"; the tint just neutralises
  // the rogue printed icon underneath.
  const isReel = urlType === 'instagram' && isInstagramReel(item.url)

  // I-07 + mix-tweet: prefer mediaSlots[] (v13) when present; fall back to
  // photos[] (v12 legacy records) by widening each URL into a synthetic
  // photo slot. Single-element / undefined results suppress dots + hover
  // swap (= 既存挙動).
  const slots: readonly MediaSlot[] = item.mediaSlots
    ?? (item.photos ?? []).map((url): MediaSlot => ({ type: 'photo', url }))
  const hasMultiple = slots.length > 1
  const displayedSrc = hasMultiple ? slots[imageIdx].url : item.thumbnail

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      if (!hasMultiple) return
      if (!preloadedRef.current) {
        // Lazy preload slots[1..N-1].url. slots[0] is already in the DOM <img>.
        // For video slots this preloads the poster image; the mp4 itself is
        // only fetched when the user opens the Lightbox and clicks play.
        for (let i = 1; i < slots.length; i++) {
          const img = new Image()
          img.src = slots[i].url
        }
        preloadedRef.current = true
      }
      const el = cardRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return
      const raw = (e.clientX - rect.left) / rect.width
      const ratio = raw < 0 ? 0 : raw > 1 ? 1 : raw
      const rawIdx = Math.floor(ratio * slots.length)
      const idx = rawIdx >= slots.length ? slots.length - 1 : rawIdx < 0 ? 0 : rawIdx
      setImageIdx((prev) => (prev === idx ? prev : idx))
    },
    [hasMultiple, slots],
  )

  const handlePointerLeave = useCallback((): void => {
    setImageIdx((prev) => (prev === 0 ? prev : 0))
  }, [])

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
    <div
      ref={cardRef}
      className={styles.imageCard}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {displayedSrc && (
        <img
          ref={imgRef}
          className={thumbClass}
          src={displayedSrc}
          alt={item.title}
          draggable={false}
          loading="lazy"
        />
      )}
      {/* Reel-only tint dims the area where IG's printed play icon usually
          sits, neutralising it without adding our own loud overlay. */}
      {isReel && <div className={styles.tintInstagramReel} aria-hidden="true" />}
      {hasMultiple && (
        <div className={styles.multiImageDots} aria-hidden="true">
          {slots.map((s, i) => (
            <span
              key={i}
              data-testid="multi-image-dot"
              data-active={i === imageIdx ? 'true' : 'false'}
              data-slot-type={s.type}
              className={styles.multiImageDot}
            />
          ))}
        </div>
      )}
    </div>
  )
}
