'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { detectUrlType } from '@/lib/utils/url'
import { getYoutubeThumb } from '@/lib/embed/youtube-thumb'
import { fetchTikTokMeta } from '@/lib/embed/tiktok-meta'
import styles from './VideoThumbCard.module.css'

type Props = {
  readonly item: BoardItem
}

export function VideoThumbCard({ item }: Props): ReactNode {
  const urlType = detectUrlType(item.url)
  const [tikTokThumb, setTikTokThumb] = useState<string | null>(null)
  const [ytLevel, setYtLevel] = useState<0 | 1 | 2 | 3>(0)
  const tikTokRequested = useRef(false)

  useEffect(() => {
    if (urlType !== 'tiktok' || tikTokRequested.current) return
    tikTokRequested.current = true
    fetchTikTokMeta(item.url).then((meta) => {
      if (meta?.thumbnailUrl) setTikTokThumb(meta.thumbnailUrl)
    })
  }, [urlType, item.url])

  const thumbUrl =
    urlType === 'youtube' ? getYoutubeThumb(item.url, ytLevel) : tikTokThumb

  const handleImgError = (): void => {
    if (urlType === 'youtube' && ytLevel < 3) {
      setYtLevel((l) => (l + 1) as 0 | 1 | 2 | 3)
    }
  }

  return (
    <div className={styles.videoCard}>
      {thumbUrl ? (
        <img
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
      <div className={styles.titleBar}>{item.title}</div>
    </div>
  )
}
