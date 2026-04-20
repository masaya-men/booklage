'use client'

import { Tweet } from 'react-tweet'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { extractTweetId } from '@/lib/utils/url'
import { fetchTweetMeta } from '@/lib/embed/tweet-meta'
import { predictTweetAspectRatio } from '@/lib/embed/predict-tweet-height'
import { scheduleMeasurement } from '@/lib/embed/measurements-cache'
import { TextCard } from './TextCard'
import styles from './TweetCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
}

export function TweetCard({ item, persistMeasuredAspect, cardWidth = 280 }: Props): ReactNode {
  const tweetId = extractTweetId(item.url)
  const [errored, setErrored] = useState(false)
  const cachedRef = useRef<boolean>(item.aspectRatio > 0 && item.aspectRatio !== 0.75)

  useEffect(() => {
    if (!tweetId || cachedRef.current || !persistMeasuredAspect) return
    scheduleMeasurement(
      item.cardId,
      async () => {
        const meta = await fetchTweetMeta(tweetId)
        if (!meta) {
          setErrored(true)
          return null
        }
        return predictTweetAspectRatio(meta, cardWidth)
      },
      persistMeasuredAspect,
    )
  }, [tweetId, item.cardId, persistMeasuredAspect, cardWidth])

  if (!tweetId || errored) {
    return <TextCard item={{ ...item, title: item.title || 'このツイートは表示できません' }} />
  }

  return (
    <div className={styles.tweetCard} data-theme="light">
      <Tweet id={tweetId} />
    </div>
  )
}
