'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import type { DisplayMode } from '@/lib/board/types'
import { detectUrlType } from '@/lib/utils/url'
import { getYoutubeThumb } from '@/lib/embed/youtube-thumb'
import { fetchTikTokMeta } from '@/lib/embed/tiktok-meta'
import { fetchYoutubeOEmbed, isDegenerateYoutubeTitle } from '@/lib/embed/youtube-oembed'
import styles from './VideoThumbCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly displayMode: DisplayMode
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
  readonly cardHeight?: number
}

const ASPECT_EPSILON = 0.005

export function VideoThumbCard({ item, persistMeasuredAspect }: Props): ReactNode {
  const urlType = detectUrlType(item.url)
  const [tikTokThumb, setTikTokThumb] = useState<string | null>(null)
  const [tikTokTitle, setTikTokTitle] = useState<string | null>(null)
  const [ytTitle, setYtTitle] = useState<string | null>(null)
  const [ytLevel, setYtLevel] = useState<0 | 1 | 2 | 3>(0)
  const tikTokRequested = useRef(false)
  const ytOEmbedRequested = useRef(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // TikTok: always fetch oEmbed — we need it for both thumbnail and title.
  useEffect(() => {
    if (urlType !== 'tiktok' || tikTokRequested.current) return
    tikTokRequested.current = true
    void fetchTikTokMeta(item.url).then((meta) => {
      if (!meta) return
      if (meta.thumbnailUrl) setTikTokThumb(meta.thumbnailUrl)
      if (meta.title) setTikTokTitle(meta.title)
    })
  }, [urlType, item.url])

  // YouTube: only fetch oEmbed when the saved title is degenerate.
  // The bookmarklet stored "YouTube <videoId>" as a fallback when
  // document.title wasn't ready — oEmbed gives us the real title.
  useEffect(() => {
    if (urlType !== 'youtube' || ytOEmbedRequested.current) return
    if (!isDegenerateYoutubeTitle(item.title)) return
    ytOEmbedRequested.current = true
    void fetchYoutubeOEmbed(item.url).then((data) => {
      if (data?.title) setYtTitle(data.title)
    })
  }, [urlType, item.url, item.title])

  const thumbUrl =
    urlType === 'youtube' ? getYoutubeThumb(item.url, ytLevel) : tikTokThumb

  // Re-measure intrinsic aspect from natural width/height once the thumbnail
  // loads — corrects stale persisted aspectRatio (e.g. YouTube Shorts saved
  // as 16:9 by old defaults; the real thumb is 9:16).
  useEffect(() => {
    if (!persistMeasuredAspect || !thumbUrl) return
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
  }, [thumbUrl, item.cardId, item.aspectRatio, persistMeasuredAspect])

  const handleImgError = (): void => {
    if (urlType === 'youtube' && ytLevel < 3) {
      setYtLevel((l) => (l + 1) as 0 | 1 | 2 | 3)
    }
  }

  // Touch unused state setters so tsc doesn't warn — these will feed the
  // Lightbox's tweet-style title resolution in a follow-up pass (currently
  // the bookmarklet-saved title is used directly).
  void tikTokTitle
  void ytTitle

  return (
    <div className={styles.videoCard}>
      {thumbUrl ? (
        <img
          ref={imgRef}
          className={styles.thumb}
          src={thumbUrl}
          onError={handleImgError}
          alt=""
          draggable={false}
          loading="lazy"
        />
      ) : (
        <div className={styles.placeholder} aria-hidden="true" />
      )}
      <div className={styles.playOverlay}>
        <svg className={styles.playIcon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </div>
    </div>
  )
}
