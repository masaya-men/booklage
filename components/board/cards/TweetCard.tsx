'use client'

import { Tweet } from 'react-tweet'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { extractTweetId } from '@/lib/utils/url'
import { TextCard } from './TextCard'
import styles from './TweetCard.module.css'

type Props = {
  readonly item: BoardItem
  readonly persistMeasuredAspect?: (cardId: string, aspectRatio: number) => Promise<void>
  readonly cardWidth?: number
}

// Persist when measured article height differs from the height implied by
// the current aspectRatio by more than this many pixels. Avoids write loops
// from sub-pixel fluctuation while still catching real layout changes
// (image/video loading, quoted tweet expansion).
const MEASUREMENT_EPSILON_PX = 4

export function TweetCard({ item, persistMeasuredAspect, cardWidth = 280 }: Props): ReactNode {
  const tweetId = extractTweetId(item.url)
  const hostRef = useRef<HTMLDivElement>(null)
  const [errored] = useState(false)

  // Measure the actual rendered <article> after react-tweet finishes loading
  // and on any subsequent resize (media load, quoted tweet expansion).
  // Heuristic prediction was removed — it was inaccurate for CJK text,
  // image-bearing tweets, and tweets with quotes. Real DOM measurement always
  // gives the correct height; masonry reflows when persistMeasuredAspect runs.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !tweetId || !persistMeasuredAspect) return

    let lastReportedH = 0
    let currentObserver: ResizeObserver | null = null

    const reportHeight = (): void => {
      const article = host.querySelector('article')
      if (!article) return
      const h = article.offsetHeight
      if (h < 60) return // react-tweet skeleton — wait for real content
      if (Math.abs(h - lastReportedH) < MEASUREMENT_EPSILON_PX) return
      lastReportedH = h
      void persistMeasuredAspect(item.cardId, cardWidth / h)
    }

    const attachToArticle = (article: Element): void => {
      currentObserver = new ResizeObserver(reportHeight)
      currentObserver.observe(article)
      reportHeight()
    }

    // Watch for <article> to appear (react-tweet renders it asynchronously
    // after fetching tweet data from cdn.syndication.twimg.com).
    const mo = new MutationObserver(() => {
      if (currentObserver) return
      const article = host.querySelector('article')
      if (article) attachToArticle(article)
    })
    mo.observe(host, { childList: true, subtree: true })

    // If article is already present (warm cache or re-render), attach immediately.
    const existing = host.querySelector('article')
    if (existing) attachToArticle(existing)

    return (): void => {
      mo.disconnect()
      currentObserver?.disconnect()
    }
  }, [tweetId, item.cardId, persistMeasuredAspect, cardWidth])

  if (!tweetId || errored) {
    return (
      <TextCard
        item={{ ...item, title: item.title || 'このツイートは表示できません' }}
        cardWidth={cardWidth}
        persistMeasuredAspect={persistMeasuredAspect}
      />
    )
  }

  return (
    <div ref={hostRef} className={styles.tweetCard} data-theme="light">
      <Tweet id={tweetId} />
    </div>
  )
}
